"""Checks on model output: filler removal, near-duplicate detection, value verification, timestamps."""
import re
import unicodedata

from .lexicon import CANONICAL

EMPTY = re.compile(r"^((none|nothing|no \w+)( (stated|mentioned|said|specified|discussed|made|given)"
                   r"( in this part| here)?)?|n/?a|not (specified|mentioned|said|stated)|unknown|-+)?\W*$", re.I)
# Sentences a model writes instead of leaving a field empty ("Patient status not fully detailed.").
FILLER = re.compile(r"[^.;]*\b(not (fully )?(detailed|specified|mentioned|discussed|said)|no (details|information)|unclear|"
                    r"discussion (revolves|about|regarding))\b[^.;]*[.;]?\s*", re.I)
# Plan items that change nothing: kept under the patient, but they are not key moments.
UNCHANGED = re.compile(r"^(continu|maintain|keep|consider|plan)\w*\b", re.I)
# Items that change the patient's care rank first among key moments.
ACTION = re.compile(r"\b(start|stop|order|plac|insert|transfus|call|consult|increas|reduc|decreas|switch|chang|"
                    r"set|adjust|introduc|discontinu|withdr)\w*", re.I)

NUMBER = re.compile(r"\d+(?:[.,]\d+)?")


def clean_item(text: str) -> str:
    """Model output with one name per drug, or "" for filler ("None", "N/A", "")."""
    text = FILLER.sub("", text).strip()
    if EMPTY.match(text):
        return ""
    for pattern, replacement in CANONICAL:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    if len(text) >= 150 and not text.endswith((".", ")")):  # probably cut by maxLength: end at a whole word
        text = text.rsplit(" ", 1)[0].rstrip(",;") + "…"
    return text[:1].upper() + text[1:]


def key_numbers(text: str) -> set:
    """Doses and lab values worth verifying: decimals and numbers with 3+ digits ("0.22", "240", "1.100")."""
    return {n.replace(",", ".") for n in NUMBER.findall(text) if ("." in n or "," in n or len(n) >= 3)}


def similar(a: str, b: str) -> bool:
    """Near-duplicate phrases ("Call urologist Butnari" / "Call the urologist Butnari")."""
    wa, wb = set(re.findall(r"\w{3,}", a.lower())), set(re.findall(r"\w{3,}", b.lower()))
    return bool(wa and wb) and len(wa & wb) / min(len(wa), len(wb)) >= 0.75


def overlaps(a: str, b: str) -> bool:
    """Looser than similar, for an AI suggestion that restates an open issue in other words."""
    wa, wb = stems(a), stems(b)
    return bool(wa and wb) and len(wa & wb) / min(len(wa), len(wb)) >= 0.5


def stems(text: str) -> set:
    """Language-independent word keys: numbers plus the first 5 letters of longer words, without diacritics.

    "noradrenaline 0.22" (English item) and "noradrenalină 0,22" (Romanian transcript) share {"norad", "0.22"}.
    """
    plain = "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))
    return ({w[:5] for w in re.findall(r"[a-z]{5,}", plain)} |
            {n.replace(",", ".") for n in NUMBER.findall(plain)})


def locate(item: str, lines: list, fallback: str) -> str:
    """Time of the transcript line that shares the most words / numbers with an extracted item."""
    keys = stems(item)
    best, best_score = fallback, 0
    for line in lines:
        score = len(keys & stems(line.split(":", 2)[-1]))  # text only, not the "[mm:ss] S2:" prefix
        if score > best_score:
            best, best_score = line[1:line.index("]")], score
    return best


def union(a: dict, b: dict) -> dict:
    """Merge a second extraction of the same chunk into the first one.

    Topics are matched by position (both samples list the patients of the chunk in order); a topic that only
    the second sample has is dropped, since its patient split cannot be trusted. List fields are united and
    near-duplicates are removed.
    """
    out = {"topics": [dict(t) for t in a["topics"]]}
    for mine, theirs in zip(out["topics"], b["topics"]):
        for field, value in theirs.items():
            if isinstance(value, list):
                mine[field] = mine[field] + [x for x in value if not any(same(x, y) for y in mine[field])]
    return out


def same(x, y) -> bool:
    text = lambda v: " ".join(str(s) for s in v.values()) if isinstance(v, dict) else str(v)  # noqa: E731
    return similar(text(x), text(y))
