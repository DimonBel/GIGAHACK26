"""Speaker turns and the clean-up of pyannote's labels (plain code, no model)."""
from dataclasses import dataclass

# Diarization can still split one person into short extra "speakers" (pyannote 3.1: 55 labels for a 60-min ICU
# round, 52 of them with < 75 s; community-1: a few). A real participant talks for longer, so in automatic mode a
# label with little talk time is merged into the speaker whose voice it resembles most (pyannote's embeddings).
MIN_SPEAKER_SECONDS = 20.0  # less talk than this (and < MIN_SPEAKER_SHARE of all speech) = a fragment
MIN_SPEAKER_SHARE = 0.015
DISTINCT_BELOW = 0.1  # a fragment this unlike every main voice (cosine) is kept as its own speaker ...
DISTINCT_MIN_SECONDS = 8.0  # ... if it talks at least this long
SAME_ABOVE = 0.85  # two main speakers whose voices are this similar are one person


@dataclass
class Turn:
    start: float  # seconds
    end: float    # seconds
    speaker: str


def _cosine(a, b) -> float:
    import numpy as np

    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    return float(np.dot(a, b) / (na * nb)) if na and nb else 0.0


def merge_fragments(turns: list, voices: dict, min_speakers: int = 1) -> list:
    """Merge labels with little talk time into the most similar main speaker (see MIN_SPEAKER_SECONDS).

    A fragment without a usable voice embedding goes to the main speaker talking closest to it in time.
    Main speakers with near-identical voices are merged as well, but never below min_speakers.
    """
    talk = {}
    for t in turns:
        talk[t.speaker] = talk.get(t.speaker, 0.0) + t.end - t.start
    total = sum(talk.values()) or 1.0
    main = [s for s, v in sorted(talk.items(), key=lambda x: -x[1])
            if v >= MIN_SPEAKER_SECONDS or v >= MIN_SPEAKER_SHARE * total]
    if not main:
        return turns
    target = {s: s for s in main}
    # Main speakers with (nearly) the same voice: the one who talks less joins the other.
    for i, s in enumerate(main):
        if len(set(target.values())) <= min_speakers:
            break
        for bigger in main[:i]:
            if target[bigger] == bigger and s in voices and bigger in voices and \
                    _cosine(voices[s], voices[bigger]) >= SAME_ABOVE:
                target[s] = bigger
                break
    kept = [s for s in main if target[s] == s]
    for s in talk:
        if s in target:
            continue
        sims = {m: _cosine(voices[s], voices[m]) for m in kept if s in voices and m in voices}
        if sims:
            best = max(sims, key=sims.get)
            if sims[best] < DISTINCT_BELOW and talk[s] >= DISTINCT_MIN_SECONDS:
                target[s] = s  # clearly another voice that says something: a real (short) participant
            else:
                target[s] = best
        else:  # no voice embedding: whoever talks closest in time
            mine = [t for t in turns if t.speaker == s]
            target[s] = min(kept, key=lambda m: min(abs((t.start + t.end) - (u.start + u.end))
                                                     for t in turns if t.speaker == m for u in mine))
    return [Turn(t.start, t.end, target[t.speaker]) for t in turns]


def renumber(turns: list) -> list:
    """SPEAKER_00, SPEAKER_07... -> SPEAKER 1, SPEAKER 2... in order of first appearance; merges adjacent turns
    of the same speaker that now touch or overlap."""
    names, out = {}, []
    for t in sorted(turns, key=lambda t: t.start):
        name = names.setdefault(t.speaker, f"SPEAKER {len(names) + 1}")
        if out and out[-1].speaker == name and t.start <= out[-1].end:
            out[-1].end = max(out[-1].end, t.end)
        else:
            out.append(Turn(t.start, t.end, name))
    return out
