"""Run whisper-cli (whisper.cpp) locally and parse its JSON output."""
import json
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

from .audio import to_wav16k

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
DEFAULT_MODEL = MODELS_DIR / "ggml-large-v3.bin"
VAD_MODEL = MODELS_DIR / "ggml-silero-v5.1.2.bin"


@dataclass
class Segment:
    start: str
    end: str
    text: str


@dataclass
class Transcript:
    language: str
    segments: list

    @property
    def text(self) -> str:
        return " ".join(s.text for s in self.segments).strip()

    def to_srt(self) -> str:
        blocks = []
        for i, s in enumerate(self.segments, 1):
            blocks.append(f"{i}\n{s.start.replace('.', ',')} --> {s.end.replace('.', ',')}\n{s.text}\n")
        return "\n".join(blocks)


def transcribe(audio: Path, model: Path = DEFAULT_MODEL, language: str = "auto",
               translate: bool = False, threads: int = 8) -> Transcript:
    """Transcribe any audio/video file (converted to 16 kHz WAV first)."""
    with tempfile.TemporaryDirectory() as tmp:
        wav = to_wav16k(Path(audio), Path(tmp) / "input.wav")
        return transcribe_wav(wav, model, language, translate, threads)


def transcribe_wav(wav: Path, model: Path = DEFAULT_MODEL, language: str = "auto",
                   translate: bool = False, threads: int = 8) -> Transcript:
    """Transcribe an already-converted 16 kHz mono WAV."""
    if shutil.which("whisper-cli") is None:
        raise RuntimeError("whisper-cli not found. Install it with: brew install whisper-cpp")
    if not model.exists():
        raise FileNotFoundError(f"Model not found: {model}")

    with tempfile.TemporaryDirectory() as tmp:
        out_base = Path(tmp) / "result"
        cmd = ["whisper-cli", "-m", str(model), "-f", str(wav), "-l", language,
               "-t", str(threads), "-oj", "-of", str(out_base), "-np",
               # Anti-hallucination: don't condition on previous text (stops repeat loops)
               # and suppress non-speech tokens.
               "-mc", "0", "-sns"]
        if VAD_MODEL.exists():
            # Skip silence/noise, where Whisper tends to hallucinate.
            cmd += ["--vad", "-vm", str(VAD_MODEL)]
        if translate:
            cmd.append("-tr")
        print("Transcribing... (segments appear as they are recognized)", file=sys.stderr)
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        last = None
        for line in proc.stdout:
            text = line.split("]", 1)[-1].strip()
            if text and text != last:
                print("  " + line.strip(), file=sys.stderr, flush=True)
            last = text or last
        if proc.wait() != 0:
            raise RuntimeError(f"whisper-cli failed with exit code {proc.returncode}")
        data = json.loads(out_base.with_suffix(".json").read_text(encoding="utf-8"))

    segments = []
    for seg in data.get("transcription", []):
        text = seg["text"].strip()
        # Drop empty segments and consecutive duplicates (a remaining hallucination pattern).
        if not text or (segments and segments[-1].text == text):
            continue
        segments.append(Segment(seg["timestamps"]["from"], seg["timestamps"]["to"], text))
    lang = data.get("result", {}).get("language", language)
    return Transcript(language=lang, segments=segments)

