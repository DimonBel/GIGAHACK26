"""Run whisper-cli (whisper.cpp) locally and parse its JSON output."""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from .audio import to_wav16k

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
DEFAULT_MODEL = MODELS_DIR / "ggml-large-v3.bin"
VAD_MODEL = MODELS_DIR / "ggml-silero-v5.1.2.bin"
# whisper-cli live output line: "[00:00:01.230 --> 00:00:04.560]   text"
LIVE_LINE = re.compile(r"\[(?P<start>[\d:.,]+) --> (?P<end>[\d:.,]+)\]\s*(?P<text>.*)")


@dataclass
class Segment:
    start: str
    end: str
    text: str


@dataclass
class Word:
    start: float  # seconds
    end: float    # seconds
    text: str


@dataclass
class Transcript:
    language: str
    segments: list
    words: list = field(default_factory=list)

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
                   translate: bool = False, threads: int = 8, on_segment=None) -> Transcript:
    """Transcribe an already-converted 16 kHz mono WAV, with word-level timestamps.

    on_segment(start_sec, end_sec, text) is called live for every recognized segment;
    by default segments are printed to stderr as progress.
    """
    if shutil.which("whisper-cli") is None:
        raise RuntimeError("whisper-cli not found. Install it with: brew install whisper-cpp")
    if not model.exists():
        raise FileNotFoundError(f"Model not found: {model}")

    with tempfile.TemporaryDirectory() as tmp:
        out_base = Path(tmp) / "result"
        # -ojf: full JSON including per-token timestamps (used for speaker alignment).
        cmd = ["whisper-cli", "-m", str(model), "-f", str(wav), "-l", language,
               "-t", str(threads), "-ojf", "-of", str(out_base), "-np",
               # Anti-hallucination: don't condition on previous text (stops repeat loops)
               # and suppress non-speech tokens.
               "-mc", "0", "-sns"]
        if VAD_MODEL.exists():
            # Skip silence/noise, where Whisper tends to hallucinate.
            cmd += ["--vad", "-vm", str(VAD_MODEL)]
        if translate:
            cmd.append("-tr")
        if on_segment is None:
            print("Transcribing... (segments appear as they are recognized)", file=sys.stderr)
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        last = None
        for line in proc.stdout:
            m = LIVE_LINE.match(line.strip())
            if not m or not m["text"] or m["text"] == last:
                continue
            last = m["text"]
            if on_segment is None:
                print("  " + line.strip(), file=sys.stderr, flush=True)
            else:
                on_segment(_seconds(m["start"]), _seconds(m["end"]), m["text"])
        if proc.wait() != 0:
            raise RuntimeError(f"whisper-cli failed with exit code {proc.returncode}")
        data = json.loads(out_base.with_suffix(".json").read_text(encoding="utf-8"))

    segments, words = [], []
    for seg in data.get("transcription", []):
        text = seg["text"].strip()
        # Drop empty segments and consecutive duplicates (a remaining hallucination pattern).
        if not text or (segments and segments[-1].text == text):
            continue
        segments.append(Segment(seg["timestamps"]["from"], seg["timestamps"]["to"], text))
        words.extend(_tokens_to_words(seg.get("tokens", []),
                                      seg["offsets"]["from"] / 1000, seg["offsets"]["to"] / 1000))
    lang = data.get("result", {}).get("language", language)
    return Transcript(language=lang, segments=segments, words=words)


def _seconds(ts: str) -> float:
    h, m, s = ts.replace(",", ".").split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def _tokens_to_words(tokens: list, seg_start: float, seg_end: float) -> list:
    """Merge whisper sub-word tokens into words. A token starting with a space begins a new word.

    With --vad, whisper.cpp maps segment times back to the original audio but leaves token times
    on the silence-removed timeline, so they drift. Rescale token times into the segment's range.
    """
    tokens = [t for t in tokens if not t["text"].startswith("[_") and t["text"].strip()]  # skip [_BEG_], [_TT_n]
    if not tokens:
        return []
    t0, t1 = tokens[0]["offsets"]["from"], tokens[-1]["offsets"]["to"]
    scale = (seg_end - seg_start) / ((t1 - t0) / 1000) if t1 > t0 else 0.0

    def remap(ms):
        return seg_start + (ms - t0) / 1000 * scale

    words = []
    for tok in tokens:
        text = tok["text"]
        start, end = remap(tok["offsets"]["from"]), remap(tok["offsets"]["to"])
        if words and not text.startswith(" "):
            words[-1].text += text
            words[-1].end = end
        else:
            words.append(Word(start, end, text.strip()))
    return words
