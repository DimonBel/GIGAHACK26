from stt.dialog import Utterance, clean_text, is_duplicate, speaker_blocks, to_srt, to_text
from stt.diarizer import Turn


def T(start, end, spk):
    return Turn(start, end, f"SPEAKER {spk}")


def spans(blocks):
    return [(round(b.start, 2), round(b.end, 2), b.speaker[-1], b.inner) for b in blocks]


def test_same_speaker_turns_with_short_pause_are_merged():
    assert spans(speaker_blocks([T(0, 2, 1), T(2.5, 4, 1), T(6, 8, 1)])) == [
        (0, 4, "1", False), (6, 8, "1", False)]


def test_interruption_splits_overlap_in_the_middle():
    assert spans(speaker_blocks([T(0, 4.4, 1), T(3.9, 6.4, 2)])) == [
        (0, 4.15, "1", False), (4.15, 6.4, "2", False)]


def test_turn_inside_long_turn_does_not_cut_it():
    # Regression: a 3.7s remark inside a long turn used to truncate the long turn.
    blocks = speaker_blocks([T(47.8, 75.3, 2), T(52.4, 56.1, 1), T(75.4, 90, 2)])
    assert spans(blocks) == [(47.8, 90, "2", False), (52.4, 56.1, "1", True)]


def test_short_remark_stays_separate_when_same_speaker_then_takes_over():
    # "Yes." inside the doctor's question, then the patient answers: "Yes." must not be lost.
    blocks = speaker_blocks([T(6.7, 9.6, 1), T(8.9, 9.4, 2), T(9.9, 13.4, 2)])
    assert spans(blocks) == [(6.7, 9.6, "1", False), (8.9, 9.4, "2", True), (9.9, 13.4, "2", False)]


def test_tiny_blocks_are_dropped():
    assert spans(speaker_blocks([T(0, 3, 1), T(5, 5.1, 2)])) == [(0, 3, "1", False)]


def test_clean_text_collapses_repetition_loops():
    assert clean_text("Viniște, viniște, viniște, viniște, viniște...") == "viniște..."
    loop = "A fost reîncărcat. A fost reîncărcat. A fost reîncărcat. A fost reîncărcat."
    assert clean_text(loop) == "A fost reîncărcat."


def test_clean_text_keeps_normal_speech():
    assert clean_text("Da, da. Bine.") == "Da, da. Bine."
    assert clean_text("80 pe 40, cu 0,22 de nor.") == "80 pe 40, cu 0,22 de nor."


def test_clean_text_removes_artifacts_and_hallucinations():
    assert clean_text("[BLANK_AUDIO]") == ""
    assert clean_text("(muzică) Da.") == "Da."
    assert clean_text("Subtitrare realizată de X") == ""
    assert clean_text("Bine ați venit!") == ""
    assert clean_text("Bine ați venit la noi, pacientul e stabil.") != ""


def test_is_duplicate():
    main = "Hemodinamic instabil, norul 0,01, două micrograme pe kilogram."
    assert is_duplicate("instabil norul 0,01 două micrograme", main)
    assert not is_duplicate("Da.", main)
    assert not is_duplicate("Să scădem și norul acum?", main)


def test_formatters():
    d = [Utterance(61.5, 62.0, "SPEAKER 1", "Salut")]
    assert to_text(d) == "[00:01:01 - 00:01:02] SPEAKER 1: Salut"
    assert "00:01:01,500 --> 00:01:02,000\nSPEAKER 1: Salut" in to_srt(d)
