"""Cut 16 kHz audio into clips and encode them as WAV bytes (what the speech-to-text engines receive)."""
import io


def wav_bytes(audio, sr: int) -> bytes:
    """int16 samples -> WAV file bytes."""
    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def split_wav(wav: bytes, max_seconds: float) -> list:
    """Split a WAV clip into WAV parts of at most max_seconds, cut at quiet moments (see split_audio)."""
    import soundfile as sf

    audio, sr = sf.read(io.BytesIO(wav), dtype="int16")
    if len(audio) <= int(max_seconds * sr):
        return [wav]
    return [wav_bytes(p, sr) for p in split_audio(audio, sr, max_seconds)]


def split_audio(audio, sr: int, max_seconds: float) -> list:
    """Split int16 samples into parts of at most max_seconds, cutting at the quietest moment near each limit."""
    import numpy as np

    limit = int(max_seconds * sr)
    parts, start = [], 0
    win = int(0.1 * sr)
    while len(audio) - start > limit:
        # search the last 5 s before the limit for the 100 ms window with the lowest energy
        lo, hi = start + limit - 5 * sr, start + limit - win
        energy = [np.abs(audio[i:i + win].astype(np.int32)).mean() for i in range(lo, hi, win // 2)]
        cut = lo + int(np.argmin(energy)) * (win // 2) + win // 2
        parts.append(audio[start:cut])
        start = cut
    parts.append(audio[start:])
    return parts
