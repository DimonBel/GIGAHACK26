"""Transcript data: words with times and languages, sentences, and their text/SRT/JSON output."""
import json
from dataclasses import dataclass, field


@dataclass
class Word:
    start: float            # seconds
    end: float
    text: str
    lang: str = ""          # ro / ru / en
    prob: float = 1.0       # Whisper's confidence (lowest of the word's tokens)
    segment_lang: str = ""  # the sentence's language ("ro" for a Russian word inside a Romanian sentence)

    def to_dict(self) -> dict:
        return {"text": self.text, "start": round(self.start, 2), "end": round(self.end, 2), "lang": self.lang}


@dataclass
class Segment:
    start: str
    end: str
    text: str
    lang: str = ""
    accent: str = ""  # English accent label ("us", "england", ...)
    words: list = field(default_factory=list)

    @property
    def tag(self) -> str:
        return language_tag(self.words, self.accent)


@dataclass
class Transcript:
    language: str  # the recording's main language
    segments: list
    words: list = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(s.text for s in self.segments).strip()

    def to_text(self) -> str:
        return "\n".join(tagged(s) for s in self.segments)

    def to_timestamps(self) -> str:
        return "\n".join(f"[{s.start} --> {s.end}] {tagged(s)}" for s in self.segments)

    def to_srt(self) -> str:
        return "\n".join(f"{i}\n{s.start.replace('.', ',')} --> {s.end.replace('.', ',')}\n{tagged(s)}\n"
                         for i, s in enumerate(self.segments, 1))

    def to_json(self) -> str:
        return json.dumps({"language": self.language, "segments": [
            {"start": s.start, "end": s.end, "language": s.lang, "accent": s.accent, "text": s.text,
             "words": [w.to_dict() for w in s.words]} for s in self.segments]}, ensure_ascii=False, indent=2)


def tagged(s: Segment) -> str:
    return f"[{s.tag}] {s.text}" if s.tag else s.text


def plain_text(words: list) -> str:
    return " ".join(w.text for w in words)


def word_languages(words: list) -> list:
    """The words' languages, most frequent first (["ro", "ru"])."""
    counts = {}
    for w in words:
        if w.lang:
            counts[w.lang] = counts.get(w.lang, 0) + 1
    return sorted(counts, key=counts.get, reverse=True)


def language_tag(words: list, accent: str = "") -> str:
    """Display tag: "ro", "ro+ru", "en, Australian"."""
    from ..speakers.accent import ACCENT_NAMES

    tag = "+".join(word_languages(words))
    if accent and tag.startswith("en"):
        tag += f", {ACCENT_NAMES.get(accent, accent)}"
    return tag


def timestamp(seconds: float, sep: str = ".") -> str:
    """"HH:MM:SS.mmm" (sep="," for SRT)."""
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"
