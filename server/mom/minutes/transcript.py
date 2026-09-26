"""Dialog transcript lines: parse the .txt written by `dialog`, and normalize lines for the LLM."""
import re
from pathlib import Path

from .lexicon import normalize

LINE = re.compile(r"\[(?P<start>[\d:]+) - (?P<end>[\d:]+)\] (?P<speaker>[^:]+): (?P<text>.*)")
SENTENCE = re.compile(r"(?<=[.?!…])\s+")


def short_time(ts: str) -> str:
    """"00:02:57" -> "02:57" (saves tokens on every line); keeps the hour when there is one."""
    return ts[3:] if ts.startswith("00:") else ts


def format_line(start: str, speaker: str, text: str):
    """Normalized "[mm:ss] S2: text" line for the LLM, or None for an obvious repetition loop."""
    words = text.split()
    if len(words) >= 4 and len(set(w.strip(",.").lower() for w in words)) / len(words) < 0.3:
        return None  # "Viniște, viniște, viniște, ..." style hallucination
    seen, kept = set(), []
    for sentence in SENTENCE.split(text):  # "Bine, când va faceți acest tratament." x5 style loop
        key = re.sub(r"\W+", " ", sentence.lower()).strip()
        if key not in seen or len(key) < 12:
            kept.append(sentence)
        seen.add(key)
    text = " ".join(kept)
    speaker = re.sub(r"SPEAKER\s*", "S", speaker.strip())
    return f"[{short_time(start)}] {speaker}: {normalize(text)}"


def parse_dialog(path: Path) -> list:
    """Normalized lines of a dialog transcript file (as written by `main.py dialog`)."""
    lines = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        m = LINE.match(raw.strip())
        line = m and format_line(m["start"], m["speaker"], m["text"])
        if line:
            lines.append(line)
    return lines


def clock(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"
