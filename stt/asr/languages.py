"""The language of every sentence of a chunk (Romanian first, Russian or English only when it's the same speech).

Whisper's language ID calls Moldovan-accented Romanian Russian, and Whisper forced into another language often
translates. So each chunk is transcribed in Romanian; another language replaces a sentence only when Whisper is
sure of it, it is real words, and it sounds like the Romanian attempt (a translation doesn't)."""
from .decode import confidence

LANGUAGES = ("ro", "ru", "en")  # auto mode: the first is the meeting's language
CONFIDENT = -0.3            # mean log-probability above which a transcript is trusted
UNSURE = -0.6               # below this for a whole chunk, Whisper's language guess is asked
SURE_RUSSIAN = 0.9          # guess at which a chunk is taken as Russian (Moldovan Romanian stays below 0.8)
MIN_ROMANIAN_WORDS = 0.55   # fewer real Romanian words: Russian heard as Latin-letter nonsense
MIN_RUSSIAN_WORDS = 0.5     # a Russian sentence must be at least this share of real Russian words
SOUNDS_ALIKE = 0.6          # nonsense and Russian sentence must sound this alike
HANDICAP = {"ro": 0.0, "ru": 0.3, "en": 0.3}  # how much more confident another language must be
MIN_RECHECK = 1.0           # shorter sentences ("Da.") keep their chunk's language


def transcribe_chunk(decode, chunk, langs: tuple, detect=None) -> list:
    """[(start, end, lang, words)] per sentence of a chunk.

    decode(chunk, lang, quick=False) transcribes it in a language; detect(chunk) is Whisper's language guess."""
    from ..text.codeswitch import romanian_word_share, russian_words_heard, sounds_alike

    def garbled(words):
        return base == "ro" and romanian_word_share(words) < MIN_ROMANIAN_WORDS

    base = langs[0]
    decodes = {base: decode(chunk, base)}
    if len(langs) == 1:
        return [(start, end, base, words) for start, end, words in decodes[base]]
    any_garbled = any(end - start >= MIN_RECHECK and garbled(words) for start, end, words in decodes[base])
    guess = detect(chunk) if detect and confidence(_words(decodes[base])) < UNSURE else {}
    sure_russian = guess.get("ru", 0.0) >= SURE_RUSSIAN
    for lang in langs[1:]:
        if (lang == "ru" and (any_garbled or sure_russian)) or (lang == "en" and guess and _sounds_english(guess)):
            decodes[lang] = decode(chunk, lang)
    # Russian words inside Romanian sentences come out in Latin letters: the chunk in Russian shows which.
    russian = _words(decodes["ru"] if "ru" in decodes else decode(chunk, "ru", quick=True)) if "ru" in langs else []
    if not decodes[base]:  # everything dropped (e.g. an invented phrase): take another language's transcript
        for lang in langs[1:]:
            words = _words(decodes.get(lang, []))
            if words and confidence(words) >= CONFIDENT and _plausible(lang, words):
                return [(start, end, lang, ws) for start, end, ws in decodes[lang]]
    pieces = []
    for start, end, words in decodes[base]:
        lang, chosen = base, words
        nonsense = garbled(words)  # wrong whatever the confidence (a model can be sure of its misspellings)
        if end - start >= MIN_RECHECK and (nonsense or confidence(words) < CONFIDENT):
            for other, segments in decodes.items():
                alt = [w for w in _words(segments) if start <= (w.start + w.end) / 2 < end]
                same_speech = other != "ru" or sure_russian or (nonsense and sounds_alike(words, alt) >= SOUNDS_ALIKE)
                to_beat = float("-inf") if nonsense and chosen is words else _adjusted(lang, confidence(chosen))
                if (other != base and same_speech and confidence(alt) >= CONFIDENT and _plausible(other, alt)
                        and _adjusted(other, confidence(alt)) > to_beat):
                    lang, chosen = other, alt
        if lang == base == "ro" and russian:
            russian_words_heard(chosen, russian)
        pieces.append((start, end, lang, chosen))
    return pieces


def _plausible(lang: str, words: list) -> bool:
    """False for Romanian speech written in Cyrillic letters by Whisper forced into Russian."""
    from ..text.codeswitch import russian_word_share

    return lang != "ru" or russian_word_share(words) >= MIN_RUSSIAN_WORDS


def _words(segments: list) -> list:
    return [w for _, _, ws in segments for w in ws]


def _adjusted(lang: str, score: float) -> float:
    return score - HANDICAP.get(lang, 0.0)


def _sounds_english(probs: dict) -> bool:
    return probs.get("en", 0.0) >= max(probs.get(lang, 0.0) for lang in LANGUAGES if lang != "en")
