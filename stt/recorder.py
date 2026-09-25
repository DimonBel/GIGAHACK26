"""Record audio from the default microphone."""
import wave
from pathlib import Path

SAMPLE_RATE = 16000


def record(seconds: float, dst: Path) -> Path:
    import sounddevice as sd  # imported lazily: only needed for recording

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
