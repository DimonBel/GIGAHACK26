"""ICD-10 (Romanian / Russian / English names) and DRG groups, loaded from data/*.tsv, with a trilingual search.

Matching folds case and diacritics (ș/ş -> s, ё -> е) and compares word stems (first STEM letters), so the same
term is found in any language and grammatical case: "insuficiență respiratorie", "insuficienta respiratorie",
"дыхательной недостаточности", "respiratory failure" -> J96.
"""
import csv
import math
import os
import re
import unicodedata
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
LANGS = ("ro", "ru", "en")
STEM = 6
WORD = re.compile(r"[^\W\d_]{3,}")
# Words of the ICD names that carry no meaning of their own.
STOP = {
    "alte", "altele", "altor", "fara", "sau", "din", "prin", "the", "and", "with", "without", "other", "unspecified",
    "nespecificat", "nespecificata", "neclasificata", "altundeva", "classified", "elsewhere", "due", "not", "prin",
    "другие", "другой", "неуточненный", "неуточненная", "неуточненное", "без", "или", "уточненные", "уточненный",
    "classificat", "specificat", "specificate", "stare", "state", "acut", "acuta", "acute", "cronic", "cronica",
}


def fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower().replace("ё", "е").replace("й", "и"))
    return "".join(c for c in text if not unicodedata.combining(c))


def stems(text: str) -> list:
    return [w[:STEM] for w in WORD.findall(fold(text)) if w not in STOP]


@lru_cache(maxsize=1)
def icd10() -> dict:
    """code -> {"code", "ro", "ru", "en"}"""
    with (DATA / "icd10.tsv").open(encoding="utf-8") as f:
        return {r["code"]: r for r in csv.DictReader(f, delimiter="\t")}


@lru_cache(maxsize=1)
def drg_groups() -> list:
    with (DATA / "drg.tsv").open(encoding="utf-8") as f:
        return [{**r, "mdc": int(r["mdc"])} for r in csv.DictReader(f, delimiter="\t")]


@lru_cache(maxsize=1)
def _index():
    """Stem -> codes (inverse index over all three languages) and each stem's inverse document frequency."""
    postings, codes = defaultdict(set), icd10()
    for code, row in codes.items():
        for lang in LANGS:
            for s in stems(row[lang]):
                postings[s].add(code)
    n = len(codes)
    return postings, {s: math.log(n / len(c)) for s, c in postings.items()}


def label(code: str, lang: str = "en") -> str:
    row = icd10().get(code) or {}
    return row.get(lang) or row.get("en") or row.get("ro") or row.get("ru") or ""


def words(text: str) -> list:
    return [w for w in WORD.findall(fold(text)) if w not in STOP]


def _same_word(query: str, word: str) -> bool:
    """Same word in another grammatical form ("недостаточности" / "недостаточность": they differ only in the last
    letters), or the query is the beginning of the word (typing "hidronefr" finds "hidronefroza")."""
    if word.startswith(query) and len(query) >= 4:
        return True
    shared = len(os.path.commonprefix([query, word]))
    return shared >= 5 and len(query) - shared <= 2 and len(word) - shared <= 3


@lru_cache(maxsize=1)
def _word_index() -> dict:
    """Whole folded word -> codes whose names (any language) contain it."""
    postings = defaultdict(set)
    for code, row in icd10().items():
        for lang in LANGS:
            for w in words(row[lang]):
                postings[w].add(code)
    return postings


def search(query: str, limit: int = 10) -> list:
    """Codes for a query in any language, or a code prefix ("I21", "j96.1"): best first."""
    q = query.strip()
    if not q:
        return []
    codes = icd10()
    if re.fullmatch(r"[A-Za-z]\d{0,2}(\.\d{0,2})?", q):
        prefix = q.upper()
        return [codes[c] for c in sorted(codes) if c.startswith(prefix)][:limit]
    postings = _word_index()
    wanted = words(q)
    if not wanted:
        return []
    hits = []  # per query word: {code: 1 for the very word, 0.5 for another form of it}
    for w in wanted:
        found = {}
        for word, in_codes in postings.items():
            if _same_word(w, word):
                weight = 1.0 if word == w else 0.5
                for code in in_codes:
                    found[code] = max(found.get(code, 0), weight)
        hits.append(found)
    # All query words must match; exact words first, then the shortest (most general) names and codes.
    common = set.intersection(*(set(h) for h in hits))

    def name_length(c):
        return min((len(words(codes[c][lang])) for lang in LANGS if codes[c][lang]), default=99)
    ranked = sorted(common, key=lambda c: (-sum(h[c] for h in hits), name_length(c), len(c), c))
    return [codes[c] for c in ranked[:limit]]


def candidates(text: str, limit: int = 30) -> list:
    """Codes whose names share the most (rare) word stems with a free text (a patient's facts, any language)."""
    postings, idf = _index()
    words = Counter(stems(text))
    scores = Counter()
    for w in words:
        for code in postings.get(w, ()):
            scores[code] += idf[w]
    codes = icd10()
    # Normalise by name length so long catch-all names do not win on sheer size.
    ranked = sorted(scores, key=lambda c: -scores[c] / math.sqrt(len(set(stems(codes[c]["en"] or codes[c]["ro"]))) or 1))
    return ranked[:limit]
