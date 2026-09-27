import threading
import time

import numpy as np
import soundfile as sf

import stt.pipeline as pipeline
from stt.asr.transcript import Segment, Transcript, Word
from stt.minutes.ollama import DEFAULT_MODEL as DEFAULT_LLM
from stt.speakers.dialog import Utterance
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


class FakeBuilder:
    """MinutesBuilder that records how it was made."""
    made, instructions = [], []

    def __init__(self, *args, instructions="", on_update=None):
        FakeBuilder.made.append(args)
        FakeBuilder.instructions.append(instructions)

    def add_line(self, line):
        pass

    def finalize(self):
        return {"title": "t"}


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
    FakeBuilder.made, FakeBuilder.instructions, labelled = [], [], []
    monkeypatch.setattr("stt.minutes.builder.MinutesBuilder", FakeBuilder)
    monkeypatch.setattr("stt.speakers.roles.label_roles",
                        lambda *args: labelled.append(args[1:]) or {"SPEAKER 1": {"role": "chair"}})

    language, dialog, minutes = pipeline.transcribe_minutes(tmp_path / "meeting.m4a", overlap=True,
                                                            minutes_language="ru", instructions="Name the beds.")

    assert [u.text for u in dialog] == ["Pacientul stabil.", "Da, bine.", "Mergem mai departe."]
    assert FakeLive.fed == [u.text for u in dialog]  # every line once, in order
    assert FakeLive.fed_during_transcription == 2  # all but the newest line before the transcript was done
    assert minutes["participants"] == {"SPEAKER 1": {"role": "chair"}}
    assert FakeBuilder.made == labelled == [("medical", DEFAULT_LLM, "ru")]  # the minutes' language
    assert FakeBuilder.instructions == ["Name the beds."]  # the template's, for the builder only


def test_the_lines_heard_are_shown_as_the_transcription_goes(monkeypatch, tmp_path):
    """Before the speakers are known every sentence is a line without a speaker; once they are, the dialog so far;
    at the end, the whole dialog."""
    def to_wav16k(src, dst, max_seconds=None):
        sf.write(str(dst), np.zeros(16000, dtype="float32"), 16000)
        return dst

    speakers_known = threading.Event()

    def diarize(wav):
        speakers_known.wait(5)
        return TURNS

    def transcribe_wav(wav, *args, on_segments=None, **kwargs):
        words = []
        for i, chunk in enumerate(CHUNKS):
            words += chunk
            on_segments([Segment("", "", "", "ro", "", chunk)])
            if i == 1:
                speakers_known.set()
                time.sleep(0.2)  # the speakers are found while the third chunk is transcribed
        return Transcript("ro", [], words)

    monkeypatch.setattr(pipeline, "to_wav16k", to_wav16k)
    monkeypatch.setattr(pipeline, "transcribe_wav", transcribe_wav)
    monkeypatch.setattr(pipeline, "diarize", diarize)
    monkeypatch.setattr("stt.speakers.accent.label_speakers", lambda *args: None)
    shown = []

    pipeline.transcribe_dialog(tmp_path / "meeting.m4a", on_live=lambda lines, speakers: shown.append(
        ([(u.speaker, u.text) for u in lines], speakers)))

    assert shown[0] == ([("", "Pacientul stabil.")], False)
    assert shown[1] == ([("", "Pacientul stabil."), ("", "Da, bine.")], False)
    whole = [("SPEAKER 1", "Pacientul stabil."), ("SPEAKER 2", "Da, bine."), ("SPEAKER 1", "Mergem mai departe.")]
    assert shown[2:] == [(whole, True), (whole, True)]  # the last chunk, then the end


def test_without_overlap_the_minutes_are_written_after_the_transcript(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(pipeline, "transcribe_dialog", lambda audio, **options: calls.append("dialog") or ("ro", ["u"]))
    monkeypatch.setattr(pipeline, "meeting_minutes",
                        lambda dialog, *args: calls.append(("minutes", *args)) or {"title": "t"})
    language, dialog, minutes = pipeline.transcribe_minutes(tmp_path / "meeting.m4a", overlap=False,
                                                            minutes_language="en", instructions="Name the beds.")
    assert calls == ["dialog", ("minutes", "medical", DEFAULT_LLM, "en", "Name the beds.", None)]
    assert minutes == {"title": "t"}
    monkeypatch.setattr(pipeline, "transcribe_dialog", lambda audio, **options: ("ro", []))
    assert pipeline.transcribe_minutes(tmp_path / "meeting.m4a", overlap=False)[2] is None  # no speech: no LLM


def test_the_minutes_language_reaches_the_builder_and_the_roles(monkeypatch, tmp_path):
    FakeBuilder.made, FakeBuilder.instructions, labelled = [], [], []
    monkeypatch.setattr("stt.minutes.builder.MinutesBuilder", FakeBuilder)
    monkeypatch.setattr("stt.speakers.roles.label_roles", lambda *args: labelled.append(args[1:]) or {})
    minutes = pipeline.meeting_minutes([Utterance(0.0, 2.0, "SPEAKER 1", "Pacientul stabil.")], "medical", "m", "ru",
                                       "Name the beds.")
    assert minutes == {"title": "t", "participants": {}}
    dialog = tmp_path / "board.txt"
    dialog.write_text("# SPEAKER 1 = conduce vizita — AI guess\n"
                      "[00:00:00 - 00:00:02] SPEAKER 1: Pacientul stabil.\n", encoding="utf-8")
    minutes = pipeline.minutes_from_file(dialog, "executive", "m", "en")
    assert minutes["participants"]["SPEAKER 1"]["role"] == "conduce vizita"
    assert FakeBuilder.made == [("medical", "m", "ru"), ("executive", "m", "en")]
    assert FakeBuilder.instructions == ["Name the beds.", ""]
    assert labelled == [("medical", "m", "ru")]
