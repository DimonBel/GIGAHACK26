"""Speech-to-text results."""
from dataclasses import dataclass, field


@dataclass
class Word:
    start: float  # seconds
    end: float    # seconds
    text: str
    first: bool = False  # first word of a Whisper segment


@dataclass
class Segment:
    start: str
    end: str
    text: str
    words: list = field(default_factory=list)


@dataclass
class Transcript:
    language: str
    segments: list

    @property
    def text(self) -> str:
        return " ".join(s.text for s in self.segments).strip()

    def to_srt(self) -> str:
        blocks = []
        for i, s in enumerate(self.segments, 1):
            blocks.append(f"{i}\n{s.start.replace('.', ',')} --> {s.end.replace('.', ',')}\n{s.text}\n")
        return "\n".join(blocks)
