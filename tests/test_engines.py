import io

import numpy as np
import soundfile as sf

from stt.engines import gemma_prompt, make_engine, split_wav


def wav(seconds, sr=16000, quiet_at=None):
    audio = (np.sin(np.arange(int(seconds * sr)) / 5) * 8000).astype(np.int16)
    if quiet_at is not None:
        a = int(quiet_at * sr)
        audio[a:a + int(0.3 * sr)] = 0
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def durations(parts):
    return [round(len(sf.read(io.BytesIO(p))[0]) / 16000, 1) for p in parts]


def test_short_clip_is_not_split():
    clip = wav(10)
    assert split_wav(clip, 28) == [clip]


def test_long_clip_is_split_at_the_quiet_moment():
    parts = split_wav(wav(40, quiet_at=25.0), 28)
    assert len(parts) == 2
    first, second = durations(parts)
    assert 25.0 <= first <= 25.4 and round(first + second, 1) == 40.0


def test_very_long_clip_gives_parts_under_the_limit():
    parts = split_wav(wav(95), 28)
    assert all(d <= 28 for d in durations(parts)) and round(sum(durations(parts))) == 95


def test_gemma_prompt_is_strict_and_names_the_language():
    p = gemma_prompt("ro", False)
    assert "verbatim in Romanian" in p and "Do not correct" in p
    assert "language that is spoken" in gemma_prompt("auto", False)
    assert "Translate" in gemma_prompt("ro", True)


def test_unknown_engine_is_rejected():
    try:
        make_engine("nope")
    except ValueError as e:
        assert "whisper" in str(e)
    else:
        raise AssertionError("expected ValueError")

