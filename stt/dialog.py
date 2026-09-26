"""Combine whisper words with speaker turns into a dialog: who said what, when, and in which language."""
import json
from collections import Counter
from dataclasses import dataclass, field

from .transcriber import language_tag, timestamp, word_languages

PAUSE_SPLIT = 2.0  # seconds of silence that start a new line even for the same speaker
CHUNK_PAUSE = 0.5  # a pause this long also ends a sentence chunk
SENTENCE_END = (".", "?", "!", "…")


@dataclass
class Utterance:
    start: float
    end: float
    speaker: str
    text: str
    words: list = field(default_factory=list)
    accent: str = ""  # English accent label, see accent.label_speakers

    @property
    def langs(self) -> list:
        return word_languages(self.words)

    @property
    def lang(self) -> str:
        """The utterance's main language ("" if its words aren't tagged)."""
        return (self.langs or [""])[0]

    @property
    def tag(self) -> str:
        return language_tag(self.words, self.accent)


def _sentence_chunks(words: list) -> list:
    """Split words into sentence-like chunks (sentence punctuation or a short pause ends a chunk)."""
    chunks = []
    for w in words:
        prev = chunks[-1][-1] if chunks else None
        if prev is None or prev.text.endswith(SENTENCE_END) or w.start - prev.end > CHUNK_PAUSE:
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
    """Assign each sentence to a speaker and merge consecutive sentences of the same speaker into utterances.

    A sentence transcribed in another language than the utterance so far starts a new line, so every line
    has one main language. A Russian word inside Romanian speech stays on its "ro+ru" line, even when
    pauses around it make it a chunk of its own."""
    dialog = []
    for chunk in _sentence_chunks(words):
        speaker = _speaker_for(chunk, turns) if turns else "SPEAKER 1"
        new_line = bool(dialog) and _spoken_in(dialog[-1].words) != _spoken_in(chunk)
        for i, w in enumerate(chunk):
            _append(dialog, w, speaker, new_line=new_line and i == 0)
    return dialog


def _spoken_in(words: list) -> str:
    """The language most of these words were transcribed in ("" if unknown)."""
    counts = Counter(w.segment_lang for w in words if w.segment_lang)
    return counts.most_common(1)[0][0] if counts else ""


def _append(dialog: list, w, speaker: str, new_line: bool = False):
    last = dialog[-1] if dialog else None
    if last and not new_line and last.speaker == speaker and w.start - last.end <= PAUSE_SPLIT:
        last.text += _join(w.text)
        last.end = max(last.end, w.end)
        last.words.append(w)
    else:
        dialog.append(Utterance(w.start, w.end, speaker, w.text, [w]))


def _join(word: str) -> str:
    # Punctuation attaches to the previous word; everything else gets a space.
    return word if word[:1] in ",.!?;:%)" else " " + word


def _who(u: Utterance) -> str:
    return f"{u.speaker} [{u.tag}]" if u.tag else u.speaker


def to_text(dialog: list) -> str:
    return "\n".join(f"[{timestamp(u.start)[:8]} - {timestamp(u.end)[:8]}] {_who(u)}: {u.text}" for u in dialog)


def to_srt(dialog: list) -> str:
    return "\n".join(
        f"{i}\n{timestamp(u.start, ',')} --> {timestamp(u.end, ',')}\n{_who(u)}: {u.text}\n"
        for i, u in enumerate(dialog, 1)
    )


def to_json(dialog: list) -> str:
    return json.dumps([{"start": round(u.start, 2), "end": round(u.end, 2), "speaker": u.speaker, "text": u.text,
                        "languages": u.langs, "accent": u.accent, "words": [w.to_dict() for w in u.words]}
                       for u in dialog], ensure_ascii=False, indent=2)
