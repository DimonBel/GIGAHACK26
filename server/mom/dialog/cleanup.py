"""Remove Whisper artifacts: tags, subtitle credits, filler phrases and repetition loops."""
import re

# Phrases Whisper invents on silence/noise (learned from subtitles), per language.
HALLUCINATIONS = [
    r"subtitr\w*", r"mulțumesc pentru vizionare", r"abona\w*", r"nu uitați să",
    r"продолжение следует", r"субтитр\w*", r"спасибо за просмотр", r"редактор субтитров",
    r"thanks? (you )?for watching", r"please subscribe",
]
_HALLUCINATION_RE = re.compile("|".join(HALLUCINATIONS), re.IGNORECASE)
# Generic phrases Whisper outputs for unclear short clips; dropped only when they are the whole text.
_FILLER_RE = re.compile(r"^(bine ați venit|bine ati venit|добро пожаловать|welcome)[.!]*$", re.IGNORECASE)



def clean_text(text: str) -> str:
    """Remove Whisper artifacts: [BLANK_AUDIO]/(music) tags, subtitle credits, and repetition loops."""
    text = re.sub(r"\[[^\]]*\]|\([^)]*\)|\*[^*]*\*", " ", text)
    if _HALLUCINATION_RE.search(text) or _FILLER_RE.match(text.strip()):
        return ""
    return collapse_repeats(" ".join(text.split()))


def collapse_repeats(text: str, min_repeats: int = 3, max_n: int = 12) -> str:
    """Collapse a phrase repeated min_repeats+ times in a row ("a b a b a b" -> "a b")."""
    words = text.split()
    key = [re.sub(r"\W", "", w.lower()) for w in words]
    out, i = [], 0
    while i < len(words):
        for n in range(1, min(max_n, len(words) - i) + 1):
            unit = key[i:i + n]
            reps = 1
            while key[i + reps * n:i + (reps + 1) * n] == unit:
                reps += 1
            if reps >= min_repeats:
                out.extend(words[i + (reps - 1) * n:i + reps * n])  # keep the last copy (has final punctuation)
                i += reps * n
                break
        else:
            out.append(words[i])
            i += 1
    return " ".join(out)


def is_duplicate(inner: str, main: str) -> bool:
    """An inner clip also contains the main speaker's voice; drop it if Whisper only heard that."""
    words = re.findall(r"\w+", inner.lower())
    main_words = set(re.findall(r"\w+", main.lower()))
    return bool(words) and sum(w in main_words for w in words) / len(words) > 0.6 and len(words) > 3
