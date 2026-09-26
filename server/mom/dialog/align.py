"""Whole-file mode: assign Whisper's words to speakers, sentence by sentence."""
from ..asr.types import Word
from .types import Utterance

PAUSE_SPLIT = 2.0  # seconds of silence that start a new line even for the same speaker
CHUNK_PAUSE = 0.5  # a pause this long also ends a sentence chunk
SENTENCE_END = (".", "?", "!", "…")


def segment_words(start: float, end: float, text: str) -> list:
    """Approximate word times for a live segment by spreading its duration by word length."""
    tokens = text.split()
    total = sum(len(t) for t in tokens) or 1
    words, t = [], start
    for tok in tokens:
        dur = (end - start) * len(tok) / total
        words.append(Word(t, t + dur, tok, first=not words))
        t += dur
    return words


def _sentence_chunks(words: list) -> list:
    """Split words into sentence-like chunks: sentence punctuation, a short pause or a new Whisper
    segment ends a chunk. (Whisper often starts a new segment where the speaker changes, even when it
    writes no punctuation, so without the segment rule an unpunctuated exchange became one long line.)"""
    chunks = []
    for w in words:
        prev = chunks[-1][-1] if chunks else None
        if (prev is None or prev.text.endswith(SENTENCE_END) or w.start - prev.end > CHUNK_PAUSE
                or getattr(w, "first", False)):
            chunks.append([w])
        else:
            chunks[-1].append(w)
    return chunks


def _speaker_for(chunk: list, turns: list) -> str:
    """Speaker whose turns overlap the chunk's words the most; if none overlaps, the nearest turn.

    Deciding per sentence (not per word) keeps speaker changes at sentence boundaries, which
    are more precise than the diarizer's turn edges.
    """
    totals = {}
    for w in chunk:
        for t in turns:
            overlap = min(w.end, t.end) - max(w.start, t.start)
            if overlap > 0:
                totals[t.speaker] = totals.get(t.speaker, 0.0) + overlap
    if totals:
        return max(totals, key=totals.get)
    mid = (chunk[0].start + chunk[-1].end) / 2
    return min(turns, key=lambda t: 0 if t.start <= mid <= t.end
               else min(abs(mid - t.start), abs(mid - t.end))).speaker


def build_dialog(words: list, turns: list) -> list:
    """Assign each sentence to a speaker and merge consecutive words of the same speaker into utterances."""
    dialog = []
    for chunk in _sentence_chunks(words):
        speaker = _speaker_for(chunk, turns) if turns else "SPEAKER 1"
        for w in chunk:
            _append(dialog, w, speaker)
    return dialog


def _append(dialog: list, w, speaker: str):
    last = dialog[-1] if dialog else None
    if last and last.speaker == speaker and w.start - last.end <= PAUSE_SPLIT:
        last.text += _join(w.text)
        last.end = max(last.end, w.end)
    else:
        dialog.append(Utterance(w.start, w.end, speaker, w.text))


def _join(word: str) -> str:
    # Punctuation attaches to the previous word; everything else gets a space.
    return word if word[:1] in ",.!?;:%)" else " " + word
