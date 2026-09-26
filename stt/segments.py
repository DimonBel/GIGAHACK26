"""Find the speech in a recording with Silero VAD (the ggml model whisper.cpp uses)."""
import re
import shutil
import subprocess
from pathlib import Path

from .transcriber import VAD_MODEL

MIN_SILENCE_MS = 250  # a pause this long ends a segment (pauses between sentences; breaths inside one are shorter)
MAX_SEGMENT_S = 15    # longer speech is cut, so one segment rarely holds two languages
# whisper-vad-speech-segments prints times in centiseconds: "Speech segment 1: start = 103.00, end = 416.00"
SEGMENT_LINE = re.compile(r"Speech segment \d+: start = ([\d.]+), end = ([\d.]+)")


def speech_segments(wav: Path, min_silence_ms: int = MIN_SILENCE_MS, max_segment_s: float = MAX_SEGMENT_S) -> list:
    """Return [(start, end)] in seconds for the speech in a 16 kHz mono WAV."""
    if shutil.which("whisper-vad-speech-segments") is None:
        raise RuntimeError("whisper-vad-speech-segments not found. Install it with: brew install whisper-cpp")
    if not VAD_MODEL.exists():
        raise FileNotFoundError(f"VAD model not found: {VAD_MODEL} (see README)")
    proc = subprocess.run(["whisper-vad-speech-segments", "-f", str(wav), "-vm", str(VAD_MODEL), "-np",
                           "-vsd", str(min_silence_ms), "-vmsd", str(max_segment_s)],
                          capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"whisper-vad-speech-segments failed with exit code {proc.returncode}")
    return parse_segments(proc.stdout)


def parse_segments(output: str) -> list:
    return [(float(start) / 100, float(end) / 100) for start, end in SEGMENT_LINE.findall(output)]
