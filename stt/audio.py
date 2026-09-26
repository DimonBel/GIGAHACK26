"""Convert any audio/video file to the 16 kHz mono WAV that whisper.cpp expects."""
import shutil
import subprocess
from pathlib import Path


def to_wav16k(src: Path, dst: Path) -> Path:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not found. Install it with: brew install ffmpeg")
    if not src.exists():
        raise FileNotFoundError(src)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "fatal", "-i", str(src),
         "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(dst)],
        check=True,
    )
    return dst


def duration(src: Path) -> float:
    """Length of an audio/video file in seconds (0 if it can't be read)."""
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)],
                         capture_output=True, text=True)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0
