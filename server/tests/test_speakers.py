import numpy as np

from mom.minutes import participants as speakers
from mom.dialog import Utterance
from mom.diarization import Turn, merge_fragments, renumber


def _voice(*values):
    return np.array(values, dtype=float)


def test_fragment_merges_into_most_similar_main_speaker():
    turns = [Turn(0, 100, "A"), Turn(100, 200, "B"), Turn(200, 203, "frag")]
    voices = {"A": _voice(1, 0), "B": _voice(0, 1), "frag": _voice(0.1, 0.9)}
    merged = renumber(merge_fragments(turns, voices))
    assert [t.speaker for t in merged] == ["SPEAKER 1", "SPEAKER 2"]  # frag joined B, then touched B's turn
    assert merged[-1].end == 203


def test_clearly_different_short_voice_is_kept():
    turns = [Turn(0, 100, "A"), Turn(100, 200, "B"), Turn(200, 212, "new")]
    voices = {"A": _voice(1, 0, 0), "B": _voice(0, 1, 0), "new": _voice(0, 0, 1)}  # unlike both: cosine 0
    merged = merge_fragments(turns, voices)
    assert {t.speaker for t in merged} == {"A", "B", "new"}  # 12 s, unlike every main voice: a real person


def test_main_speakers_with_same_voice_merge_but_not_below_min_speakers():
    turns = [Turn(0, 100, "A"), Turn(100, 150, "A2")]
    voices = {"A": _voice(1, 0), "A2": _voice(0.99, 0.05)}
    assert {t.speaker for t in merge_fragments(turns, voices)} == {"A"}
    assert {t.speaker for t in merge_fragments(turns, voices, min_speakers=2)} == {"A", "A2"}


def test_fragment_without_voice_goes_to_nearest_speaker_in_time():
    turns = [Turn(0, 100, "A"), Turn(100, 200, "B"), Turn(201, 203, "frag")]
    voices = {"A": _voice(1, 0), "B": _voice(0, 1)}
    assert merge_fragments(turns, voices)[-1].speaker == "B"


def test_renumber_by_first_appearance():
    turns = [Turn(5, 6, "SPEAKER_07"), Turn(0, 1, "SPEAKER_03"), Turn(2, 3, "SPEAKER_07")]
    assert [t.speaker for t in renumber(turns)] == ["SPEAKER 1", "SPEAKER 2", "SPEAKER 2"]


def test_label_roles_parses_llm_answer(monkeypatch):
    dialog = [Utterance(0, 40, "SPEAKER 1", "Pacientul de pe patul 9, ce avem?"),
              Utterance(40, 100, "SPEAKER 2", "Insuficiență respiratorie, saturație 92."),
              Utterance(100, 105, "SPEAKER 3", "Da.")]

    def fake_chat(model, system, user, schema, **kw):
        assert "SPEAKER 3" not in user  # short speakers are not sent to the LLM
        return {"speakers": [{"speaker": "SPEAKER 1", "role": "leads the round", "name": "none",
                              "evidence": "asks about each bed"},
                             {"speaker": "SPEAKER 2", "role": "presents patients", "name": "Daniela",
                              "evidence": "reports values"}]}, {}

    monkeypatch.setattr(speakers, "chat", fake_chat)
    roles = speakers.label_roles(dialog)
    assert roles["SPEAKER 1"]["role"] == "leads the round" and roles["SPEAKER 1"]["name"] == ""
    assert roles["SPEAKER 2"]["name"] == "Daniela"
    assert roles["SPEAKER 3"]["role"] == "speaks briefly"
    assert list(roles) == ["SPEAKER 2", "SPEAKER 1", "SPEAKER 3"]  # most talk first


def test_label_roles_without_ollama_returns_empty(monkeypatch):
    def down(*a, **kw):
        raise RuntimeError("Could not reach Ollama")

    monkeypatch.setattr(speakers, "chat", down)
    assert speakers.label_roles([Utterance(0, 60, "SPEAKER 1", "text")]) == {}


def test_legend_round_trip():
    roles = {"SPEAKER 1": {"role": "leads the round", "name": "Daniela", "evidence": "", "seconds": 90},
             "SPEAKER 2": {"role": "presents patients", "name": "", "evidence": "", "seconds": 60}}
    back = speakers.read_legend(speakers.legend(roles) + "\n\n[00:00:00 - 00:00:03] SPEAKER 1: Așa.")
    assert {s: (r["role"], r["name"]) for s, r in back.items()} == \
        {"SPEAKER 1": ("leads the round", "Daniela"), "SPEAKER 2": ("presents patients", "")}
