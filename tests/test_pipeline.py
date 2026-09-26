import time

import numpy as np
import soundfile as sf

import stt.pipeline as pipeline
from stt.asr.transcript import Segment, Transcript, Word
from stt.speakers.diarizer import Turn

# Three chunks of speech: speaker 1, then speaker 2, then speaker 1 again.
CHUNKS = [[Word(0.0, 1.0, "Pacientul"), Word(1.0, 2.0, "stabil.")],
          [Word(3.0, 4.0, "Da,"), Word(4.0, 5.0, "bine.")],
          [Word(6.0, 7.0, "Mergem"), Word(7.0, 8.0, "mai"), Word(8.0, 9.0, "departe.")]]
TURNS = [Turn(0.0, 2.5, "SPEAKER 1"), Turn(2.5, 5.5, "SPEAKER 2"), Turn(5.5, 9.5, "SPEAKER 1")]


class FakeLive:
    """LiveMinutes that records what it is fed and when."""
    fed, fed_during_transcription = [], 0

    def __init__(self, builder):
        FakeLive.fed, FakeLive.fed_during_transcription = [], 0

    def feed(self, utterance):
        FakeLive.fed.append(utterance.text)

    def finish(self):
        return {"title": "t", "summary": "s"}


def test_minutes_are_fed_while_transcribing_and_each_line_once(monkeypatch, tmp_path):
    def to_wav16k(src, dst, max_seconds=None):
        sf.write(str(dst), np.zeros(16000, dtype="float32"), 16000)
        return dst

    def transcribe_wav(wav, *args, on_segments=None, **kwargs):
        time.sleep(0.2)  # the speakers are known before the first chunk is done
        words = []
        for chunk in CHUNKS:
            words += chunk
            on_segments([Segment("", "", "", "ro", "", chunk)])
        FakeLive.fed_during_transcription = len(FakeLive.fed)
        return Transcript("ro", [], words)

    monkeypatch.setattr(pipeline, "to_wav16k", to_wav16k)
    monkeypatch.setattr(pipeline, "transcribe_wav", transcribe_wav)
    monkeypatch.setattr(pipeline, "diarize", lambda wav: TURNS)
    monkeypatch.setattr("stt.speakers.accent.label_speakers", lambda *args: None)
    monkeypatch.setattr("stt.minutes.builder.LiveMinutes", FakeLive)
    monkeypatch.setattr("stt.minutes.builder.MinutesBuilder", lambda *args: None)
    monkeypatch.setattr("stt.speakers.roles.label_roles", lambda *args: {"SPEAKER 1": {"role": "chair"}})

    language, dialog, minutes = pipeline.transcribe_minutes(tmp_path / "meeting.m4a", overlap=True)

    assert [u.text for u in dialog] == ["Pacientul stabil.", "Da, bine.", "Mergem mai departe."]
    assert FakeLive.fed == [u.text for u in dialog]  # every line once, in order
    assert FakeLive.fed_during_transcription == 2  # all but the newest line before the transcript was done
    assert minutes["participants"] == {"SPEAKER 1": {"role": "chair"}}


def test_without_overlap_the_minutes_are_written_after_the_transcript(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(pipeline, "transcribe_dialog", lambda audio, **options: calls.append("dialog") or ("ro", ["u"]))
    monkeypatch.setattr(pipeline, "meeting_minutes", lambda dialog, *args: calls.append("minutes") or {"title": "t"})
    language, dialog, minutes = pipeline.transcribe_minutes(tmp_path / "meeting.m4a", overlap=False)
    assert calls == ["dialog", "minutes"] and minutes == {"title": "t"}
    monkeypatch.setattr(pipeline, "transcribe_dialog", lambda audio, **options: ("ro", []))
    assert pipeline.transcribe_minutes(tmp_path / "meeting.m4a", overlap=False)[2] is None  # no speech: no LLM
