"""Whole-file dialog mode: whisper words are assigned to speakers per sentence."""
from stt.dialog import build_dialog, segment_words, to_text
from stt.diarizer import Turn
from stt.transcriber import Word, _tokens_to_words


def words(*items):
    return [Word(s, e, t) for s, e, t in items]


TURNS = [Turn(0.0, 3.0, "SPEAKER 1"), Turn(3.0, 6.0, "SPEAKER 2"), Turn(6.5, 9.0, "SPEAKER 1")]


def test_words_assigned_by_overlap_and_merged():
    ws = words((0.1, 0.5, "Buna"), (0.6, 1.0, "ziua,"), (3.2, 3.6, "Da"), (6.6, 7.0, "Bine"))
    d = build_dialog(ws, TURNS)
    assert [(u.speaker, u.text) for u in d] == [
        ("SPEAKER 1", "Buna ziua,"), ("SPEAKER 2", "Da"), ("SPEAKER 1", "Bine")]


def test_word_spanning_boundary_goes_to_larger_overlap():
    assert build_dialog(words((2.8, 3.5, "cuvant")), TURNS)[0].speaker == "SPEAKER 2"


def test_word_in_gap_goes_to_nearest_turn():
    assert build_dialog(words((6.3, 6.45, "aha")), TURNS)[0].speaker == "SPEAKER 1"


def test_long_pause_splits_same_speaker():
    assert len(build_dialog(words((0, 1, "unu"), (5, 6, "doi")), [Turn(0, 20, "SPEAKER 1")])) == 2


def test_no_turns_falls_back_to_single_speaker():
    assert build_dialog(words((0, 1, "salut")), [])[0].speaker == "SPEAKER 1"


def test_speaker_change_snaps_to_sentence_boundary():
    # Diarizer puts the change late (8.0s) but the sentence "We will do ECG." starts at 7.9s.
    turns = [Turn(3.8, 8.0, "SPEAKER 2"), Turn(8.0, 10.8, "SPEAKER 1")]
    ws = words((6.8, 7.4, "side."), (7.5, 7.9, "Okay."), (7.9, 8.05, "We"), (8.05, 8.2, "will"),
               (8.5, 8.9, "do"), (8.9, 10.6, "ECG."))
    d = build_dialog(ws, turns)
    assert d[-1].speaker == "SPEAKER 1" and d[-1].text == "We will do ECG."
    assert d[0].text.startswith("side.")


def test_formatter_on_whole_file_dialog():
    d = build_dialog(words((61.5, 62.0, "Salut")), [Turn(61, 63, "SPEAKER 1")])
    assert to_text(d) == "[00:01:01 - 00:01:02] SPEAKER 1: Salut"


def test_tokens_to_words_merges_subwords_and_skips_special():
    tok = lambda t, a, b: {"text": t, "offsets": {"from": a, "to": b}}
    ws = _tokens_to_words([tok("[_BEG_]", 0, 0), tok(" mio", 100, 200), tok("card", 200, 300),
                           tok(",", 300, 310), tok(" da", 400, 500), tok("[_TT_25]", 500, 500)], 0.1, 0.5)
    assert [(w.text, round(w.start, 3), round(w.end, 3)) for w in ws] == [("miocard,", 0.1, 0.31), ("da", 0.4, 0.5)]


def test_tokens_remapped_into_segment_range():
    # VAD case: tokens on a compressed timeline (1.0-2.0s) but the segment really is at 5.0-7.0s.
    tok = lambda t, a, b: {"text": t, "offsets": {"from": a, "to": b}}
    ws = _tokens_to_words([tok(" a", 1000, 1500), tok(" b", 1500, 2000)], 5.0, 7.0)
    assert [(w.start, w.end) for w in ws] == [(5.0, 6.0), (6.0, 7.0)]


def test_segment_words_spreads_time_by_length():
    ws = segment_words(10.0, 13.0, "ab abcd")
    assert [(w.text, w.start, w.end) for w in ws] == [("ab", 10.0, 11.0), ("abcd", 11.0, 13.0)]


def test_new_whisper_segment_starts_a_new_chunk_without_punctuation():
    # No punctuation, but Whisper split the text into two segments where the speaker changed.
    turns = [Turn(0, 4.1, "SPEAKER 1"), Turn(4.1, 8, "SPEAKER 2")]
    ws = [Word(0.5, 1.5, "unu", first=True), Word(1.5, 2.5, "doi"), Word(2.5, 3.5, "trei"),
          Word(3.6, 4.6, "patru", first=True), Word(4.6, 6, "cinci"), Word(6, 7.5, "sase")]
    assert [(u.speaker, u.text) for u in build_dialog(ws, turns)] == [
        ("SPEAKER 1", "unu doi trei"), ("SPEAKER 2", "patru cinci sase")]


def test_parallel_mode_holds_segments_until_speakers_are_known(monkeypatch, tmp_path):
    """Whisper finishes segments before pyannote has the turns: they are passed on later, in order, with speakers."""
    import threading

    from stt import pipeline
    from stt.transcriber import Segment, Transcript

    diarize_may_finish, seen = threading.Event(), []

    def slow_diarize(wav, **hints):
        diarize_may_finish.wait(5)
        return TURNS

    def fake_transcribe(wav, model, language, translate, beam_size=1, on_segment=None):
        on_segment(0.1, 1.0, "Buna ziua.")   # before the turns exist
        on_segment(3.2, 3.6, "Da.")
        assert seen == []                    # held back, nothing emitted without speakers
        diarize_may_finish.set()
        pipeline.time.sleep(0.2)             # let the detector thread store the turns
        on_segment(6.6, 7.0, "Bine.")
        segs = [Segment("", "", "Buna ziua.", words((0.1, 1.0, "Buna"))), Segment("", "", "Da.", words((3.2, 3.6, "Da."))),
                Segment("", "", "Bine.", words((6.6, 7.0, "Bine.")))]
        return Transcript("ro", segs)

    monkeypatch.setattr(pipeline, "to_wav16k", lambda src, dst, filters="": dst)
    monkeypatch.setattr(pipeline, "diarize", slow_diarize)
    monkeypatch.setattr(pipeline, "transcribe_wav", fake_transcribe)
    timings = {}
    dialog = pipeline.transcribe_dialog_file(tmp_path / "a.wav", live=False, on_utterance=seen.append,
                                             timings=timings)
    assert [(u.speaker, u.text) for u in seen] == [("SPEAKER 1", "Buna ziua."), ("SPEAKER 2", "Da."),
                                                   ("SPEAKER 1", "Bine.")]
    assert [u.speaker for u in dialog] == ["SPEAKER 1", "SPEAKER 2", "SPEAKER 1"]
    assert set(timings) == {"convert", "speakers", "transcribe"}
