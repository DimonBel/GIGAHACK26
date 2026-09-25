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
