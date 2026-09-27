import json

from stt.speakers.dialog import build_dialog, to_json, to_srt, to_text
from stt.speakers.diarizer import Turn
from stt.asr.transcript import Word


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


def test_language_tags_in_text_srt_and_json():
    ws = [Word(0.1, 0.5, "Pacientul,", "ro"), Word(0.6, 0.9, "короче,", "ru"), Word(1.0, 1.4, "are", "ro"),
          Word(4.0, 4.5, "Deadline", "en"), Word(4.6, 5.0, "Friday.", "en")]
    d = build_dialog(ws, [Turn(0, 2, "SPEAKER 1"), Turn(3.5, 5.5, "SPEAKER 2")])
    d[1].accent = "australia"
    assert to_text(d).splitlines() == [
        "[00:00:00 - 00:00:01] SPEAKER 1 [ro+ru]: Pacientul, короче, are",
        "[00:00:04 - 00:00:05] SPEAKER 2 [en, Australian]: Deadline Friday."]
    assert "SPEAKER 1 [ro+ru]: Pacientul, короче, are" in to_srt(d)
    first = json.loads(to_json(d))[0]
    assert first["languages"] == ["ro", "ru"]
    assert first["words"][1] == {"text": "короче,", "start": 0.6, "end": 0.9, "lang": "ru"}


def spoken(lang, *items):
    """Words transcribed in one language: (start, end, text, word language)."""
    return [Word(s, e, t, wl, segment_lang=lang) for s, e, t, wl in items]


def test_same_speaker_switching_language_starts_a_new_line():
    ws = (spoken("ro", (0.0, 0.4, "Bine,", "ro"), (0.5, 0.9, "короче,", "ru"), (1.0, 1.5, "facem.", "ro"))
          + spoken("ru", (1.6, 2.0, "Хорошо,", "ru"), (2.1, 2.6, "давайте.", "ru"))
          + spoken("en", (2.7, 3.2, "Deadline.", "en")))
    d = build_dialog(ws, [Turn(0, 4, "SPEAKER 1")])
    assert [(u.tag, u.text) for u in d] == [("ro+ru", "Bine, короче, facem."), ("ru", "Хорошо, давайте."),
                                            ("en", "Deadline.")]


def test_russian_word_between_pauses_stays_on_its_romanian_line():
    # The pauses make "давай" a chunk of its own, but it was said inside Romanian speech.
    ws = spoken("ro", (0.0, 1.0, "Analizele", "ro"), (1.1, 1.5, "sunt", "ro"), (1.6, 2.0, "gata,", "ro"),
                (2.8, 3.1, "давай", "ru"), (3.9, 4.3, "le", "ro"), (4.4, 5.0, "discutăm.", "ro"))
    d = build_dialog(ws, [Turn(0, 6, "SPEAKER 1")])
    assert [(u.tag, u.text) for u in d] == [("ro+ru", "Analizele sunt gata, давай le discutăm.")]


def test_speaker_change_snaps_to_sentence_boundary():
    # Diarizer puts the change late (8.0s) but the sentence "Okay. We will..." starts at 7.5s.
    turns = [Turn(3.8, 8.0, "SPEAKER 2"), Turn(8.0, 10.8, "SPEAKER 1")]
    ws = words((6.8, 7.4, "side."), (7.5, 7.9, "Okay."), (7.9, 8.05, "We"), (8.05, 8.2, "will"),
               (8.5, 8.9, "do"), (8.9, 10.6, "ECG."))
    d = build_dialog(ws, turns)
    # The sentence "We will do ECG." is not cut at the diarizer's late edge (8.0s, inside "We").
    assert d[-1].speaker == "SPEAKER 1" and d[-1].text == "We will do ECG."
    assert d[0].text.startswith("side.")
