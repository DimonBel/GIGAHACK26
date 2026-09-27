"""Speech segments packed into chunks of up to 28 s (Whisper's window is 30 s), pauses left out."""
from dataclasses import dataclass

MAX_CHUNK = 28.0  # seconds of speech per chunk
PAD = 0.15        # seconds of context around each segment, so first/last syllables aren't cut


@dataclass
class Chunk:
    pieces: list  # [(start, end)] of the recording, joined into one clip

    @property
    def speech(self) -> float:
        return sum(end - start for start, end in self.pieces)


def pad_segments(segments: list, pad: float = PAD) -> list:
    """Each segment with pad seconds on both sides, at most half the pause to its neighbours."""
    padded = []
    for i, (start, end) in enumerate(segments):
        before = start - segments[i - 1][1] if i else 2 * pad
        after = segments[i + 1][0] - end if i + 1 < len(segments) else 2 * pad
        padded.append((max(0.0, start - min(pad, max(0.0, before) / 2)), end + min(pad, max(0.0, after) / 2)))
    return padded


def plan_chunks(segments: list, max_chunk: float = MAX_CHUNK) -> list:
    """Group segments into chunks of at most max_chunk seconds of speech."""
    chunks = []
    for start, end in segments:
        if chunks and chunks[-1].speech + end - start <= max_chunk:
            chunks[-1].pieces.append((start, end))
        else:
            chunks.append(Chunk([(start, end)]))
    return chunks


def chunk_audio(chunk: Chunk, audio, sr: int) -> tuple:
    """(the chunk's audio joined, timeline of (clip time, recording time) where each piece starts)."""
    import numpy as np

    parts, timeline, t = [], [], 0.0
    for start, end in chunk.pieces:
        part = audio[int(start * sr):int(end * sr)]
        parts.append(part)
        timeline.append((t, start))
        t += len(part) / sr
    return np.concatenate(parts), timeline


def to_recording(segments: list, timeline: list) -> list:
    """Move segments and their words from the joined clip's time to the recording's time."""
    def move(t):
        clip_t, rec_t = max((p for p in timeline if p[0] <= t), default=timeline[0])
        return rec_t + t - clip_t

    for seg in segments:
        seg[0], seg[1] = move(seg[0]), move(seg[1])
        for w in seg[2]:
            w.start, w.end = move(w.start), move(w.end)
    return segments
