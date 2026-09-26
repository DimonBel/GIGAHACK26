"""Romanian words Whisper misheard by a letter or two ("Pocentul" -> "Pacientul", "focuta" -> "făcută",
"metrala" -> "mitrala"), corrected to the closest real word.

Only a word that is no word at all is corrected: not in wordfreq's Romanian list (also without diacritics or
inflected), not a medical term (medical_ro.txt), not Russian, English or a name. The closest word is found by
an edit distance in which vowels, and consonants that differ only in voicing (p/b, t/d, f/v...), cost less:
Whisper mixes those up far more often than other letters, so "pocentul" is closer to "pacientul" than to
"procentul". The correction must be a common word or a medical term. In doubt nothing changes: a word left
misspelled is better than a wrong one.
"""
from functools import lru_cache
from pathlib import Path

from .codeswitch import CYRILLIC, _PARTS, _is_name, _lexicon, _plain, _romanian_stems, _romanian_words, _stem

MEDICAL = Path(__file__).with_name("medical_ro.txt")
MIN_LETTERS = 6     # shorter words are too ambiguous to correct ("lecă" is Moldovan for "a bit", not "Luca")
COMMON = 3.0        # a correction must be at least this common in Romanian (Zipf scale), or a medical term
VOWELS = set("aeiouy")
# Consonants that sound alike: voicing pairs, and c/ț ("fraccia" = "fracția")
VOICING = {frozenset(p) for p in ("pb", "td", "cg", "kg", "fv", "sz", "ck", "ct")}


def correct_words(words: list) -> int:
    """Correct, in place, the words tagged Romanian that are no word; returns how many were corrected."""
    fixed = 0
    for i, w in enumerate(words):
        lead, core, trail = _PARTS.match(w.text).groups()
        if (w.lang != "ro" or len(core) < MIN_LETTERS or not core.isalpha() or CYRILLIC.search(core)
                or core.isupper() or _is_name(core, i, words) or _known(core)):
            continue
        better = closest(core)
        if better:
            w.text = lead + (better[0].upper() + better[1:] if core[0].isupper() else better) + trail
            fixed += 1
    return fixed


def closest(word: str) -> str:
    """The real word a non-word was most likely misheard from, or "" if none is close enough."""
    from rapidfuzz import process
    from rapidfuzz.distance import Levenshtein

    plain = _plain(word)
    limit = _limit(len(plain))
    vocabulary = _vocabulary()
    scored = []
    for candidate, _, _ in process.extract(plain, vocabulary.keys(), scorer=Levenshtein.distance,
                                           score_cutoff=3, limit=30):
        distance = _distance(plain, candidate)
        if distance <= limit:
            spellings, medical = vocabulary[candidate]
            zipf = max(z for _, z in spellings)
            scored.append((distance - 0.15 * zipf - (0.5 if medical else 0.0), candidate))
    if not scored:
        return ""
    scored.sort()
    if len(scored) > 1 and scored[1][0] - scored[0][0] < 0.1:  # two words about as likely: leave it
        return ""
    # Of the spellings with the same letters: the most common ("făcută", not "facuta"), then the one closest to
    # what was written ("nefrostoma" for "nevrostoma", not "nefrostomă").
    spellings = vocabulary[scored[0][1]][0]
    return min(spellings, key=lambda s: (-s[1], Levenshtein.distance(s[0], word.lower())))[0]


def _known(word: str) -> bool:
    plain = _plain(word)
    stem = _stem(plain)
    return (plain in _romanian_words() or stem in _romanian_stems() or plain in _vocabulary()
            or stem in _medical_stems() or plain in _lexicon()[2])


def _limit(letters: int) -> float:
    """How far (see _distance) a word may be from its correction: two vowels or a voicing pair and a vowel;
    in long words a bit more, but never a consonant swap in a short one ("disiunea" is not "misiunea")."""
    return min(0.9 + 0.1 * max(0, letters - 8), 1.6)


def _distance(a: str, b: str) -> float:
    """Edit distance where vowels (0.4 to swap, 0.5 to add or drop) and voicing pairs (0.6) cost less than
    other letters (1)."""
    def swap(x, y):
        if x == y:
            return 0.0
        if x in VOWELS and y in VOWELS:
            return 0.4
        return 0.6 if frozenset((x, y)) in VOICING else 1.0

    def gap(x):
        return 0.5 if x in VOWELS else 1.0

    previous = [0.0]
    for y in b:
        previous.append(previous[-1] + gap(y))
    for x in a:
        current = [previous[0] + gap(x)]
        for j, y in enumerate(b, 1):
            current.append(min(previous[j] + gap(x), current[j - 1] + gap(y), previous[j - 1] + swap(x, y)))
        previous = current
    return previous[-1]


@lru_cache(maxsize=1)
def _vocabulary() -> dict:
    """{word without diacritics: ([(spelling, Zipf frequency)], medical)} of the words a correction may be:
    common Romanian words and the medical terms."""
    from wordfreq import top_n_list, zipf_frequency

    vocabulary = {}
    for word in top_n_list("ro", 100_000):
        zipf = zipf_frequency(word, "ro")
        if zipf >= COMMON and word.isalpha():
            vocabulary.setdefault(_plain(word), ([], False))[0].append((word, zipf))
    for word in _medical():
        spellings, _ = vocabulary.get(_plain(word), ([], True))
        if word not in (s for s, _ in spellings):
            spellings = spellings + [(word, zipf_frequency(word, "ro"))]
        vocabulary[_plain(word)] = (spellings, True)
    return vocabulary


@lru_cache(maxsize=1)
def _medical() -> list:
    return [w for line in MEDICAL.read_text(encoding="utf-8").splitlines() for w in line.split("#")[0].split()]


@lru_cache(maxsize=1)
def _medical_stems() -> set:
    return {_stem(_plain(w)) for w in _medical()}
