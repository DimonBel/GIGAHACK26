"""Word-level language tags for mixed Romanian/Russian/English speech (Moldovan code-switching).

When Whisper transcribes a Romanian segment, the Russian words inserted into it come out in Latin letters,
spelled the way they sound: "pacientul, căroce, are nevoie" ("короче"). Such a word is read back into
Cyrillic with Romanian and English spelling rules; when that gives one of the Russian words Moldovans
commonly use (russianisms.txt), it is written in Cyrillic and tagged "ru".

Precision comes first: a wrongly rewritten Romanian word is worse than a Russian word left in Latin
letters. So only listed words are rewritten, and never a word that is Romanian (also without diacritics,
as Whisper sometimes writes them). Clear English words ("deadline", "meeting") are tagged "en".
Word lists and frequencies come from wordfreq, which ships its data (works offline).
"""
import re
import unicodedata
from collections import Counter
from functools import lru_cache
from pathlib import Path

LEXICON = Path(__file__).with_name("russianisms.txt")
EN_MIN = 3.0      # English words inside Romanian speech must be at least this common in English (Zipf scale)...
EN_MARGIN = 1.5   # ...and this much more common in English than in Romanian
MIN_LETTERS = 3   # shorter Latin words ("da", "nu", "in") are ambiguous: they take their sentence's language

CYRILLIC = re.compile(r"[Ѐ-ӿ]")
_PARTS = re.compile(r"^(\W*)(.*?)(\W*)$")  # leading punctuation, word, trailing punctuation
_SENTENCE_END = (".", "?", "!", "…")

# How Russian sounds get written in Latin letters: Romanian spelling ("ce"/"ci" = че/ч, "ș" = ш), English-style
# spelling ("ch", "sh", "kh"), and vowels written as heard (unstressed о -> "a"/"ă", е -> "i").
_RULES = {
    "shch": ["щ"], "sch": ["щ", "ш"], "che": ["че", "ке"], "chi": ["чи", "ки"], "ghe": ["ге"], "ghi": ["ги"],
    "ce": ["че", "це"], "ci": ["чи", "ч", "ци"], "ge": ["дже", "ге", "же"], "gi": ["джи", "ги", "жи"],
    "ch": ["ч", "х"], "sh": ["ш", "щ"], "zh": ["ж"], "kh": ["х"], "ts": ["ц"], "tz": ["ц"],
    "ya": ["я"], "yu": ["ю"], "yo": ["ё", "йо"], "ye": ["е"],
    "ia": ["я", "ия"], "iu": ["ю", "ию"], "io": ["ё", "ио"], "ie": ["е", "ие"], "ea": ["я", "е"],
    "a": ["а", "о"], "ă": ["а", "о", "е"], "â": ["ы"], "î": ["ы", "и"], "e": ["е", "э", "и"],
    "i": ["и", "й", "ь", "ы", "е"], "o": ["о", "а"], "u": ["у"], "y": ["ы", "й", "и"],
    "b": ["б"], "c": ["к", "х", "ч"], "d": ["д"], "f": ["ф"], "g": ["г"], "h": ["х"], "j": ["ж"], "k": ["к"],
    "l": ["л", "ль"], "m": ["м"], "n": ["н"], "p": ["п"], "q": ["к"], "r": ["р"], "s": ["с"], "ș": ["ш", "щ"],
    "ş": ["ш", "щ"], "t": ["т"], "ț": ["ц"], "ţ": ["ц"], "v": ["в"], "w": ["в"], "x": ["кс"], "z": ["з"],
}
_LONGEST_RULE = max(map(len, _RULES))


def tag_words(words: list, lang: str) -> str:
    """Tag each word of a sentence with its language (.lang, in place) and return the sentence's language.
    Listed Russian words spelled in Latin letters are rewritten in Cyrillic.

    lang is the language Whisper transcribed the sentence in. Cyrillic words are "ru". In Romanian a Latin
    word can become "ru" (rewritten) or "en"; in Russian, Latin words are "en" or "ro", whichever is more
    common. The sentence's language is the most common one among its clear words: Whisper transcribing
    Romanian still writes a Russian or English sentence as such. Short words and numbers ("I", "în", "80")
    follow their sentence, and so do words that are also English in an English sentence ("stupid").
    """
    from wordfreq import zipf_frequency

    tagged = []  # (word, core, clear)
    for i, w in enumerate(words):
        lead, core, trail = _PARTS.match(w.text).groups()
        w.lang, clear = lang, True
        if CYRILLIC.search(core):
            w.lang = "ru"
        elif len(core) < MIN_LETTERS or not core.isalpha():
            clear = False
        elif lang == "ru":
            w.lang = _latin_language(core)
        elif lang == "ro" and not _is_name(core, i, words):
            russian = _russian_reading(core)
            if russian:
                w.text, w.lang = lead + russian + trail, "ru"
            elif _is_english(core):
                w.lang = "en"
        tagged.append((w, core, clear))
    counts = Counter(w.lang for w, _, clear in tagged if clear)
    sentence = counts.most_common(1)[0][0] if counts else lang
    for w, core, clear in tagged:
        w.segment_lang = sentence
        if not clear or (sentence == "en" and w.lang == "ro" and zipf_frequency(core, "en") >= EN_MIN):
            w.lang = sentence
    return sentence


# Cyrillic -> Latin as a Romanian speaker would hear it, to compare how two transcripts sound.
_LATIN = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
                  ["a", "b", "v", "g", "d", "e", "io", "j", "z", "i", "i", "c", "l", "m", "n", "o", "p", "r",
                   "s", "t", "u", "f", "h", "t", "c", "s", "s", "", "i", "", "e", "iu", "ia"]))


def sounds_alike(a: list, b: list) -> float:
    """0..1: how alike two transcripts of the same speech sound, whatever their alphabet. High when one is
    the other written in the wrong language's letters ("Cărășo, davai" / "Хорошо, давай"), low when one is
    a translation of the other."""
    import difflib

    def sound(words):
        text = _plain(" ".join(w.text for w in words))
        text = "".join(_LATIN.get(ch, ch) for ch in text).replace("â", "i").replace("î", "i")
        return " ".join(re.sub(r"[^a-z]+", " ", text).split())

    return difflib.SequenceMatcher(None, sound(a), sound(b)).ratio()


RU_WORD_ZIPF = 3.0   # a Russian word replacing a Latin one must be at least this common in Russian (Zipf scale)
WORD_ALIKE = 0.7     # ...and sound this much like it (see _sounds)
SAME_TIME = 0.5      # seconds: a Russian word counts as said at the same time if its span is this close
SAME_LENGTH = 0.75   # ...and have about as many letters ("bocs" is not "боксер")


def _romanian(word: str) -> bool:
    """A Romanian word or medical term, or one misheard by a letter or two (spelling.py)."""
    from .spelling import _known, closest

    return _known(word) or bool(closest(word))


def russian_words_heard(words: list, russian: list) -> int:
    """Russian words inside Romanian speech, which Whisper wrote in Latin letters as they sound ("tak",
    "cisto"), replaced by the same words from the chunk transcribed in Russian ("так", "чисто"), when a common
    Russian word said at the same time sounds like it. Not a word that is Romanian, a medical term or a
    misheard one of those ("metrală" is "mitrală", not "металлы"), English or a name; a Russian word Moldovans
    often insert (russianisms.txt) may be Romanian too ("tak").
    Changes the words in place; returns how many were replaced."""
    from wordfreq import zipf_frequency

    replaced = 0
    for i, w in enumerate(words):
        lead, core, trail = _PARTS.match(w.text).groups()
        if len(core) < MIN_LETTERS or not core.isalpha() or CYRILLIC.search(core) or _is_name(core, i, words):
            continue
        plain = _plain(core)
        if plain in _lexicon()[2] or _is_english(core) or (not cyrillic_readings(core) and _romanian(core)):
            continue
        middle, best, score = (w.start + w.end) / 2, "", WORD_ALIKE
        for r in russian:
            candidate = _PARTS.match(r.text).group(2)
            if (r.start - SAME_TIME <= middle <= r.end + SAME_TIME and CYRILLIC.search(candidate)
                    and zipf_frequency(candidate.lower(), "ru") >= RU_WORD_ZIPF
                    and SAME_LENGTH * len(candidate) <= len(core) <= len(candidate) / SAME_LENGTH):
                alike = _sounds(plain, candidate)
                if alike >= score:
                    best, score = candidate.lower(), alike
        if best:
            w.text, w.lang = lead + (best.capitalize() if core[0].isupper() else best) + trail, "ru"
            replaced += 1
    return replaced


def _sounds(latin: str, cyrillic: str) -> float:
    """0..1: how alike a Latin-letter word and a Cyrillic one sound ("cisto" / "чисто": 1.0)."""
    import difflib

    def latinized(word):
        word = "".join(_LATIN.get(ch, ch) for ch in _plain(word))
        return word.replace("k", "c").replace("y", "i").replace("w", "v").replace("h", "")

    return difflib.SequenceMatcher(None, latinized(latin), latinized(cyrillic)).ratio()


MIN_JUDGED = 3  # fewer Latin words (3+ letters) than this say too little to call a sentence garbled
# Endings of Romanian inflected forms (articles, plurals, cases), so "dinamicul" counts through "dinamic".
_RO_ENDINGS = ("urilor", "urile", "ului", "ilor", "elor", "lor", "uri", "ul", "le", "ii", "ei", "ea", "a", "e", "i")


def romanian_word_share(words: list) -> float:
    """Share of the Latin words (3+ letters) that are Romanian (also inflected or without diacritics) or English.
    Low when Whisper, forced into Romanian, wrote Russian speech in Latin letters ("Cărășo, davaite snaceală" =
    "Хорошо, давайте сначала"); a few Russian words inside a Romanian sentence keep it high. 1.0 when there are
    too few words to judge."""
    from wordfreq import zipf_frequency

    parts = [part for w in words for part in _PARTS.match(w.text).group(2).split("-")]
    latin = [p for p in parts if len(p) >= MIN_LETTERS and p.isalpha() and not CYRILLIC.search(p)]
    if len(latin) < MIN_JUDGED:
        return 1.0
    stems = [_stem(_plain(p)) for p in latin]
    return sum(_plain(p) in _romanian_words() or stem in _romanian_stems() or zipf_frequency(p, "en") >= EN_MIN
               or zipf_frequency(stem, "en") >= EN_MIN for p, stem in zip(latin, stems)) / len(latin)


def _stem(plain: str) -> str:
    for ending in _RO_ENDINGS:
        if plain.endswith(ending) and len(plain) - len(ending) >= 4:
            return plain[:-len(ending)]
    return plain


@lru_cache(maxsize=1)
def _romanian_stems() -> set:
    return {_stem(w) for w in _romanian_words()}


def russian_word_share(words: list) -> float:
    """Share of the Cyrillic words (3+ letters) that are real Russian words. Low when Whisper, forced into
    Russian, wrote Romanian speech in Cyrillic letters ("Пой атунча сэ индик" = "Păi atunci să indic")."""
    from wordfreq import zipf_frequency

    cores = [_PARTS.match(w.text).group(2) for w in words]
    cyrillic = [core.lower() for core in cores if len(core) >= MIN_LETTERS and CYRILLIC.search(core)]
    if not cyrillic:
        return 1.0
    return sum(zipf_frequency(core, "ru") > 0 for core in cyrillic) / len(cyrillic)


def _is_name(core: str, i: int, words: list) -> bool:
    """Capitalized inside a sentence (Ivan, Popescu, ECG): a name, which keeps the segment's language."""
    return core[0].isupper() and i > 0 and not words[i - 1].text.endswith(_SENTENCE_END)


def _russian_reading(core: str) -> str:
    """The Cyrillic spelling of a listed Russian word written in Latin letters, or "" if it isn't one."""
    from wordfreq import zipf_frequency

    if len(core) < MIN_LETTERS or not core.isalpha():
        return ""
    plain = _plain(core)
    if plain in _romanian_words() or plain in _lexicon()[2] or zipf_frequency(core, "en") >= EN_MIN:
        return ""
    readings = cyrillic_readings(core)
    if not readings:
        return ""
    best = max(readings, key=lambda r: (zipf_frequency(r, "ru"), r))
    if core.isupper() and len(core) > 1:
        return best.upper()
    return best.capitalize() if core[0].isupper() else best


def cyrillic_readings(word: str) -> set:
    """Listed Russian words this Latin spelling can be read as ("caroce" -> {"короче"})."""
    spellings, prefixes, _ = _lexicon()
    word = word.lower()
    found = set()

    def walk(i, built):
        if i == len(word):
            if built in spellings:
                found.add(spellings[built])
            return
        for n in range(min(_LONGEST_RULE, len(word) - i), 0, -1):
            for cyrillic in _RULES.get(word[i:i + n], ()):
                if built + cyrillic in prefixes:  # prune: only follow spellings that can still become a listed word
                    walk(i + n, built + cyrillic)

    walk(0, "")
    return found


@lru_cache(maxsize=1)
def _lexicon():
    """From russianisms.txt: ({spelling: correct word}, {every prefix of every spelling},
    {Latin words never to rewrite, without diacritics})."""
    spellings, keep_latin = {}, set()
    for line in LEXICON.read_text(encoding="utf-8").splitlines():
        words = line.split("#")[0].split()
        if words and words[0].startswith("!"):
            keep_latin.update(_plain(w.lstrip("!")) for w in words)
            continue
        for spelling in words:
            spellings[spelling] = words[0]
    return spellings, {s[:i] for s in spellings for i in range(1, len(s) + 1)}, keep_latin


@lru_cache(maxsize=1)
def _romanian_words() -> set:
    """wordfreq's Romanian words (~43k), without diacritics."""
    from wordfreq import top_n_list

    return {_plain(w) for w in top_n_list("ro", 100_000)}


def _plain(word: str) -> str:
    """Lowercase without diacritics: "Specialiști" -> "specialisti"."""
    return "".join(c for c in unicodedata.normalize("NFD", word.lower()) if not unicodedata.combining(c))


def _is_english(core: str) -> bool:
    from wordfreq import zipf_frequency

    if len(core) < MIN_LETTERS:
        return False
    en = zipf_frequency(core, "en")
    return en >= EN_MIN and en - zipf_frequency(core, "ro") >= EN_MARGIN


def _latin_language(core: str) -> str:
    """A Latin-script word inside Russian speech: English if it is more common in English, otherwise Romanian
    (names and words unknown to both lists, like Popescu, are Romanian here, in Moldova)."""
    from wordfreq import zipf_frequency

    return "en" if zipf_frequency(core, "en") > zipf_frequency(core, "ro") else "ro"
