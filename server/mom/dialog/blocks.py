"""Per-turn mode: speaker turns -> blocks that are each transcribed on their own."""
from .types import Block

MERGE_GAP = 1.0        # join two turns of the same speaker when the pause between them is shorter
MIN_BLOCK = 0.3        # ignore blocks shorter than this (clicks, breaths)


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
