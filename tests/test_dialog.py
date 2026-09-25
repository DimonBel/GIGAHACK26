from stt.dialog import build_dialog, to_srt, to_text
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
    d = build_dialog(words((2.8, 3.5, "cuvant")), TURNS)
    assert d[0].speaker == "SPEAKER 2"


def test_word_in_gap_goes_to_nearest_turn():
    d = build_dialog(words((6.3, 6.45, "aha")), TURNS)
    assert d[0].speaker == "SPEAKER 1"


def test_long_pause_splits_same_speaker():
    turns = [Turn(0, 20, "SPEAKER 1")]
    d = build_dialog(words((0, 1, "unu"), (5, 6, "doi")), turns)
    assert len(d) == 2


def test_no_turns_falls_back_to_single_speaker():
    d = build_dialog(words((0, 1, "salut")), [])
    assert d[0].speaker == "SPEAKER 1"


def test_formatters():
    d = build_dialog(words((61.5, 62.0, "Salut")), [Turn(61, 63, "SPEAKER 1")])
    assert to_text(d) == "[00:01:01 - 00:01:02] SPEAKER 1: Salut"
    assert "00:01:01,500 --> 00:01:02,000\nSPEAKER 1: Salut" in to_srt(d)


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


def test_speaker_change_snaps_to_sentence_boundary():
    # Diarizer puts the change late (8.0s) but the sentence "Okay. We will..." starts at 7.5s.
    turns = [Turn(3.8, 8.0, "SPEAKER 2"), Turn(8.0, 10.8, "SPEAKER 1")]
    ws = words((6.8, 7.4, "side."), (7.5, 7.9, "Okay."), (7.9, 8.05, "We"), (8.05, 8.2, "will"),
               (8.5, 8.9, "do"), (8.9, 10.6, "ECG."))
    d = build_dialog(ws, turns)
    # The sentence "We will do ECG." is not cut at the diarizer's late edge (8.0s, inside "We").
    assert d[-1].speaker == "SPEAKER 1" and d[-1].text == "We will do ECG."
    assert d[0].text.startswith("side.")


def test_segment_words_spreads_time_by_length():
    from stt.dialog import segment_words
    ws = segment_words(10.0, 13.0, "ab abcd")
    assert [(w.text, w.start, w.end) for w in ws] == [("ab", 10.0, 11.0), ("abcd", 11.0, 13.0)]
