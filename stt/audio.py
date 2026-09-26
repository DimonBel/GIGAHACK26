"""Convert any audio/video file to the 16 kHz mono WAV that whisper.cpp expects."""
import shutil
import subprocess
from pathlib import Path


def to_wav16k(src: Path, dst: Path) -> Path:
    if not src.exists():
        raise FileNotFoundError(src)
    if shutil.which("ffmpeg") is None:
        return _to_wav16k_pyav(src, dst)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "fatal", "-i", str(src),
         "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(dst)],
        check=True,
    )
    return dst


def _to_wav16k_pyav(src: Path, dst: Path) -> Path:
    """Fallback when the ffmpeg binary is unavailable (e.g. blocked on Windows): decode with PyAV."""
    import wave

    try:
        import av
    except ImportError:
        raise RuntimeError("ffmpeg not found. Install it (brew install ffmpeg) or `pip install av`.")

    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
    with av.open(str(src)) as container, wave.open(str(dst), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(16000)
        stream = container.streams.audio[0]
        for packet in container.demux(stream):
            try:
                frames = packet.decode()
            except av.error.InvalidDataError:  # skip corrupt packets instead of failing the whole file
                continue
            for frame in frames:
                for chunk in resampler.resample(frame):
                    out.writeframes(chunk.to_ndarray().tobytes())
        for chunk in resampler.resample(None):
            out.writeframes(chunk.to_ndarray().tobytes())
    return dst
