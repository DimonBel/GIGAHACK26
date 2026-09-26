"""Turn speaker turns into dialog blocks (or assign whole-file words to speakers), clean Whisper
output, and format the dialog."""
import json
import re
from dataclasses import asdict, dataclass

MERGE_GAP = 1.0        # join two turns of the same speaker when the pause between them is shorter
MIN_BLOCK = 0.3        # ignore blocks shorter than this (clicks, breaths)

# Phrases Whisper invents on silence/noise (learned from subtitles), per language.
HALLUCINATIONS = [
    r"subtitr\w*", r"mulțumesc pentru vizionare", r"abona\w*", r"nu uitați să",
    r"продолжение следует", r"субтитр\w*", r"спасибо за просмотр", r"редактор субтитров",
    r"thanks? (you )?for watching", r"please subscribe",
]
_HALLUCINATION_RE = re.compile("|".join(HALLUCINATIONS), re.IGNORECASE)
# Generic phrases Whisper outputs for unclear short clips; dropped only when they are the whole text.
_FILLER_RE = re.compile(r"^(bine ați venit|bine ati venit|добро пожаловать|welcome)[.!]*$", re.IGNORECASE)


@dataclass
class Block:
    start: float
    end: float
    speaker: str
    inner: bool = False  # lies inside another speaker's (longer) turn


@dataclass
class Utterance:
    start: float
    end: float
    speaker: str
    text: str


def speaker_blocks(turns: list) -> list:
    """Make blocks (one per speaker turn) that can each be transcribed separately.

    - consecutive turns of the same speaker with a short pause are merged
    - a turn fully inside another speaker's turn (e.g. "Da." while the other one talks) becomes its
      own "inner" block, and the long turn is kept whole so its sentences aren't cut
    - when an interruption overlaps the end of the previous turn, the boundary is put in the
      middle of the overlap
    """
    blocks = []
    for t in sorted(turns, key=lambda t: t.start):
        b = Block(t.start, t.end, t.speaker)
        main = next((x for x in reversed(blocks) if not x.inner), None)
        last = blocks[-1] if blocks else None
        if main and main.speaker == b.speaker and last and last.inner and b.start - main.end <= MERGE_GAP:
            last = main  # the main speaker continues after the other one's short remark
        if (last and last.speaker == b.speaker and b.start - last.end <= MERGE_GAP
                and not (last.inner and b.end > main.end)):  # an inner remark never grows past the main turn
            last.end = max(last.end, b.end)
            continue
        if main and b.start < main.end:
            if b.end <= main.end:
                b.inner = True
            else:
                main.end = b.start = (b.start + main.end) / 2
        blocks.append(b)
    return [b for b in blocks if b.end - b.start >= MIN_BLOCK]


def clean_text(text: str) -> str:
    """Remove Whisper artifacts: [BLANK_AUDIO]/(music) tags, subtitle credits, and repetition loops."""
    text = re.sub(r"\[[^\]]*\]|\([^)]*\)|\*[^*]*\*", " ", text)
    if _HALLUCINATION_RE.search(text) or _FILLER_RE.match(text.strip()):
        return ""
    return collapse_repeats(" ".join(text.split()))


def collapse_repeats(text: str, min_repeats: int = 3, max_n: int = 12) -> str:
    """Collapse a phrase repeated min_repeats+ times in a row ("a b a b a b" -> "a b")."""
    words = text.split()
    key = [re.sub(r"\W", "", w.lower()) for w in words]
    out, i = [], 0
    while i < len(words):
        for n in range(1, min(max_n, len(words) - i) + 1):
            unit = key[i:i + n]
            reps = 1
            while key[i + reps * n:i + (reps + 1) * n] == unit:
                reps += 1
            if reps >= min_repeats:
                out.extend(words[i + (reps - 1) * n:i + reps * n])  # keep the last copy (has final punctuation)
                i += reps * n
                break
        else:
            out.append(words[i])
            i += 1
    return " ".join(out)


def is_duplicate(inner: str, main: str) -> bool:
    """An inner clip also contains the main speaker's voice; drop it if Whisper only heard that."""
    words = re.findall(r"\w+", inner.lower())
    main_words = set(re.findall(r"\w+", main.lower()))
    return bool(words) and sum(w in main_words for w in words) / len(words) > 0.6 and len(words) > 3


# --- Whole-file mode: assign Whisper's words to speakers -------------------------------------------

PAUSE_SPLIT = 2.0  # seconds of silence that start a new line even for the same speaker
CHUNK_PAUSE = 0.5  # a pause this long also ends a sentence chunk
SENTENCE_END = (".", "?", "!", "…")


def segment_words(start: float, end: float, text: str) -> list:
    """Approximate word times for a live segment by spreading its duration by word length."""
    from .transcriber import Word

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


def _ts(seconds: float, sep: str = ".") -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def to_text(dialog: list) -> str:
    return "\n".join(f"[{_ts(u.start)[:8]} - {_ts(u.end)[:8]}] {u.speaker}: {u.text}" for u in dialog)


def to_srt(dialog: list) -> str:
    return "\n".join(
        f"{i}\n{_ts(u.start, ',')} --> {_ts(u.end, ',')}\n{u.speaker}: {u.text}\n"
        for i, u in enumerate(dialog, 1)
    )


def to_json(dialog: list) -> str:
    return json.dumps([asdict(u) for u in dialog], ensure_ascii=False, indent=2)
