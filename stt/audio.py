"""Convert any audio/video file to the 16 kHz mono WAV that whisper.cpp expects."""
import shutil
import subprocess
from pathlib import Path


# Optional cleanup of far-field meeting audio, done in the same ffmpeg pass as the conversion:
#   highpass   removes rumble (air conditioning, table knocks, handling noise) below speech
#   dynaudnorm evens out distant / quiet speakers and loud close ones (helps Whisper and voice embeddings)
#   afftdn     light stationary noise reduction (strong denoising is known to hurt Whisper)
CLEAN_FILTERS = {
    "none": "",
    "highpass": "highpass=f=80",
    "norm": "highpass=f=80,dynaudnorm=f=150:g=15",
    "denoise": "highpass=f=80,afftdn=nf=-25,dynaudnorm=f=150:g=15",
}


def to_wav16k(src: Path, dst: Path, filters: str = "") -> Path:
    """16 kHz mono WAV; filters: optional ffmpeg audio filter chain applied in the same pass (see CLEAN_FILTERS)."""
    if not src.exists():
        raise FileNotFoundError(src)
    if shutil.which("ffmpeg") is None:
        return _to_wav16k_pyav(src, dst)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "fatal", "-i", str(src), *(["-af", filters] if filters else []),
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


def duration(src: Path) -> float:
    """Length of an audio/video file in seconds (0 if it can't be read)."""
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)],
                         capture_output=True, text=True)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0
