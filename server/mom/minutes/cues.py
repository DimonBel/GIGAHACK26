"""Where one patient / agenda item ends: code, not the model, owns topic identity."""
import re

from .lexicon import NUMBER_WORDS, WORD_TO_NUMBER

_NUM = r"\d{1,2}|" + "|".join(sorted(WORD_TO_NUMBER, key=len, reverse=True))

# A sentence that names another bed / room starts a new patient. Code, not the model, owns patient identity:
# the chunk is cut there and the patient is named from the cue. ASR mangles "patul 9" into "pipatu nouă",
# "apatul, nouă" or "patru opt", hence the loose prefix and suffix.
# Beds and rooms only name topics at a ward round: in other meetings "box" or "admission" are ordinary words.
MEDICAL_CUES = [
    (re.compile(rf"\b\w{{0,2}}pat(?:ul|u|ului|ru)?\b[\s,.]+(?:de\s+|nr\.?\s*)?(?P<n>{_NUM})\b", re.I), "Bed {n}"),
    (re.compile(rf"\b(?:койк\w*|палат\w*)\s+(?:№\s*)?(?P<n>{_NUM})\b", re.I), "Bed {n}"),
    (re.compile(r"\bbox\w*", re.I), "Box"),
    (re.compile(r"\b(?:primir\w*|internăr\w*|admissions?)\b", re.I), "Expected admissions"),
]
AGENDA_CUES = [
    (re.compile(rf"\b(?:punctul|item|пункт\w*)\s+(?:nr\.?\s*|№\s*)?(?P<n>{_NUM})\b", re.I), "Item {n}"),
]
NAME_CUES = MEDICAL_CUES + AGENDA_CUES
# Weaker hints of a new topic: only used to prefer a cut there once a chunk is long; the chunk still continues
# the current patient ("pacientul" is also said mid-discussion).
TOPIC_CUE = re.compile(r"\b(pacient\w*|salonul|următor\w*|пациент\w*|больн\w*|следующ\w*|next patient|"
                       r"agenda item)\b", re.IGNORECASE)

CHUNK_MIN_WORDS = 220  # cut at the next weak cue once a chunk has this many words
CHUNK_MAX_WORDS = 420  # hard cut
TOPIC_MIN_WORDS = 25   # below this, a named cue renames the chunk instead of cutting (e.g. "Așa." + "patul 8")


def cue_name(sentence: str, meeting_type: str = "medical"):
    """Name of the bed / room / item a sentence moves to ("da pacientul de pipatu nouă" -> "Bed 9"), or None.
    Beds and rooms count at medical meetings only, agenda items at the others."""
    for pattern, name in (MEDICAL_CUES if meeting_type == "medical" else AGENDA_CUES):
        m = pattern.search(sentence)
        if m:
            n = m.groupdict().get("n")
            return name.format(n=WORD_TO_NUMBER.get(n.lower(), n) if n else "")
    return None


def bed_number(name: str) -> str:
    """Bed number in a topic name ("Bed 9" -> "9"), or "" if there is none."""
    digits = re.findall(r"\d+", name)
    return digits[0] if digits else ""


def number_said(number: str, text: str) -> bool:
    words = NUMBER_WORDS.get(number)
    pattern = rf"\b{number}\b" + (rf"|\b({words})\b" if words else "")
    return re.search(pattern, text, re.IGNORECASE) is not None
