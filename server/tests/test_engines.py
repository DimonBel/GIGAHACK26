import io

import numpy as np
import soundfile as sf

from mom.asr.engines import make_engine
from mom.asr.gemma import gemma_prompt
from mom.asr.language import choose_language, main_language
from mom.audio.clips import split_audio, split_wav


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


def test_split_audio_keeps_every_sample():
    audio = sf.read(io.BytesIO(wav(95)), dtype="int16")[0]
    parts = split_audio(audio, 16000, 28)
    assert all(len(p) <= 28 * 16000 for p in parts)
    assert np.array_equal(np.concatenate(parts), audio)


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



def test_main_language_sums_probabilities_over_pieces():
    pieces = [{"ru": 0.54, "ro": 0.12}, {"ro": 0.91, "ru": 0.01}, {"ro": 0.55, "ru": 0.17}]
    assert main_language(pieces) == "ro"
    assert main_language([{"ru": 0.9}, {"ru": 0.6, "ro": 0.3}]) == "ru"


def test_piece_switches_language_only_when_confident():
    assert choose_language({"ru": 0.96, "ro": 0.01}, "ro") == "ru"
    assert choose_language({"ru": 0.54, "en": 0.14, "ro": 0.12}, "ro") == "ro"
    assert choose_language({"pl": 0.5, "ro": 0.3}, "ro") == "ro"  # only ro/ru/en are allowed
    assert choose_language({"en": 0.85}, "ro") == "en"
