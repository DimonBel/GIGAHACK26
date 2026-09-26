"""Automatic language choice for recordings that mix Romanian, Russian and English (Moldovan speech is Romanian)."""
LANGUAGES = ("ro", "ru", "en")
SWITCH_CONFIDENCE = 0.8  # a piece may differ from the recording's main language only when this sure


def main_language(probabilities: list) -> str:
    """The recording's main language: the one of LANGUAGES with the highest total probability over all pieces."""
    return max(LANGUAGES, key=lambda lang: sum(p.get(lang, 0.0) for p in probabilities))


def choose_language(probs: dict, main: str) -> str:
    """Language for one piece: its detected language if Whisper is confident, otherwise the main language.

    Whisper's detection on a single piece is unreliable for Moldovan speech (Romanian pieces are often
    guessed as Russian with ~50% probability), so weak guesses fall back to the recording's language."""
    lang = max(LANGUAGES, key=lambda l: probs.get(l, 0.0))
    return lang if probs.get(lang, 0.0) >= SWITCH_CONFIDENCE else main
