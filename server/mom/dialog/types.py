"""Dialog data: speaker blocks to transcribe, and the resulting utterances."""
from dataclasses import dataclass


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
