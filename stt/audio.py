"""Audio in and out: any file to 16 kHz mono WAV (ffmpeg), WAV bytes, microphone recording."""
import io
import shutil
import subprocess
import wave
from pathlib import Path

SAMPLE_RATE = 16000


def to_wav16k(src: Path, dst: Path, max_seconds: float = None) -> Path:
    """Convert any audio/video file to 16 kHz mono 16-bit WAV (only its first max_seconds, if given)."""
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not found. Install it with: brew install ffmpeg")
    if not Path(src).is_file():
        raise FileNotFoundError(src)
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-loglevel", "fatal", "-protocol_whitelist", "file", "-i", str(src),
                    *(["-t", str(max_seconds)] if max_seconds else []),
                    "-ar", str(SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s16le", str(dst)], check=True)
    return dst


def wav_bytes(audio, sr: int = SAMPLE_RATE) -> bytes:
    """Float samples as 16-bit WAV file bytes."""
    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def record(seconds: float, dst: Path) -> Path:
    """Record from the default microphone into a 16 kHz mono WAV."""
    import sounddevice as sd

    print(f"Recording for {seconds:g}s... speak now")
    audio = sd.rec(int(seconds * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1, dtype="int16")
    sd.wait()
    with wave.open(str(dst), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SAMPLE_RATE)
        f.writeframes(audio.tobytes())
    print("Recording finished.")
    return dst
