"""Minutes of Meeting from a dialog with a small local LLM (teammate's design, minutes-gemma3 branch).

  1. map: the transcript is cut where the speakers move to another bed / patient / agenda item; each part's
     facts are extracted by the LLM (JSON schema), filed per patient.
  2. merge: code joins the parts (same patient -> one entry, duplicates dropped, unverified numbers flagged).
  3. finalize: key moments are picked in code; one short LLM call writes the title and summary.
Everything is written in the language chosen for the minutes (MINUTES_LANGUAGES), what code adds (WORDS) too."""
import json
import queue
import re
import sys
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .ollama import DEFAULT_MODEL, chat

MEETING_TYPES = ("medical", "executive", "administrative")
MINUTES_LANGUAGES = {"ro": "Romanian", "ru": "Russian", "en": "English"}  # code -> name in the prompts
# What code writes into the minutes itself, per language of the minutes.
WORDS = {
    "en": {"bed": "Bed {n}", "box": "Box", "admissions": "Expected admissions", "item": "Item {n}",
           "patient": "Patient {n}", "icu_team": "ICU team", "team": "Team", "no_deadline": "Not specified",
           "unverified": "⚠ unverified: {values}",
           "not_found": "value(s) {values} not found in the transcript: {text}"},
    "ro": {"bed": "Patul {n}", "box": "Boxa", "admissions": "Internări așteptate", "item": "Punctul {n}",
           "patient": "Pacientul {n}", "icu_team": "Echipa ATI", "team": "Echipa", "no_deadline": "Nespecificat",
           "unverified": "⚠ de verificat: {values}",
           "not_found": "valori negăsite în transcriere: {values} — {text}"},
    "ru": {"bed": "Койка {n}", "box": "Бокс", "admissions": "Ожидаемые поступления", "item": "Пункт {n}",
           "patient": "Пациент {n}", "icu_team": "Команда ОРИТ", "team": "Команда", "no_deadline": "Не указан",
           "unverified": "⚠ не проверено: {values}",
           "not_found": "значения, не найденные в транскрипте: {values} — {text}"},
}
LINE = re.compile(r"\[(?P<start>[\d:]+) - (?P<end>[\d:]+)\] (?P<speaker>[^:\[]+?)(?: \[[^\]]*\])?: (?P<text>.*)")

# Spoken numbers (Romanian, Russian), used to read and to verify bed numbers.
NUMBER_WORDS = {
    "1": "unu|unul|una|один", "2": "doi|două|doua|два", "3": "trei|три", "4": "patru|четыре",
    "5": "cinci|пять", "6": "șase|sase|шесть", "7": "șapte|sapte|семь", "8": "opt|восемь",
    "9": "nouă|noua|девять", "10": "zece|десять", "11": "unsprezece", "12": "doisprezece",
    "13": "treisprezece", "14": "paisprezece", "15": "cincisprezece", "16": "șaisprezece",
    "17": "șaptesprezece", "18": "optsprezece", "19": "nouăsprezece", "20": "douăzeci",
}
WORD_TO_NUMBER = {w: n for n, words in NUMBER_WORDS.items() for w in words.split("|")}
_NUM = r"\d{1,2}|" + "|".join(sorted(WORD_TO_NUMBER, key=len, reverse=True))

# A sentence that names another bed / room starts a new patient. Code, not the model, owns patient identity:
# the chunk is cut there and the patient is named from the cue (WORDS). ASR mangles "patul 9" into "pipatu nouă",
# "apatul, nouă" or "patru opt", hence the loose prefix and suffix.
NAME_CUES = [
    (re.compile(rf"\b\w{{0,2}}pat(?:ul|u|ului|ru)?\b[\s,.]+(?:de\s+|nr\.?\s*)?(?P<n>{_NUM})\b", re.I), "bed"),
    (re.compile(rf"\b(?:койк\w*|палат\w*)\s+(?:№\s*)?(?P<n>{_NUM})\b", re.I), "bed"),
    (re.compile(r"\bbox\w*", re.I), "box"),
    (re.compile(r"\b(?:primir\w*|internăr\w*|admissions?)\b", re.I), "admissions"),
    (re.compile(rf"\b(?:punctul|item)\s+(?P<n>{_NUM})\b", re.I), "item"),
]
# Weaker hints of a new topic: only used to prefer a cut there once a chunk is long; the chunk still continues
# the current patient ("pacientul" is also said mid-discussion).
TOPIC_CUE = re.compile(r"\b(pacient\w*|salonul|următor\w*|пациент\w*|больн\w*|следующ\w*|next patient|"
                       r"agenda item)\b", re.IGNORECASE)
CHUNK_MIN_WORDS = 220  # cut at the next weak cue once a chunk has this many words
CHUNK_MAX_WORDS = 420  # hard cut
TOPIC_MIN_WORDS = 25   # below this, a named cue renames the chunk instead of cutting (e.g. "Așa." + "patul 8")
SENTENCE = re.compile(r"(?<=[.?!…])\s+")

_STR = {"type": "string"}


def _text(max_len):
    # Enforced by Ollama's grammar: stops a small model that loops inside one string ("status": "... ... ...")
    # from burning the whole token budget and ending in invalid JSON. Generous, so normal answers are not cut.
    return {"type": "string", "maxLength": max_len}


def _strs(max_items=None, min_items=0, max_len=None):
    return _bounded({"type": "array", "items": _text(max_len) if max_len else _STR}, max_items, min_items)


def _objs(max_items=None, min_items=0, **props):
    items = {"type": "object", "properties": props, "required": list(props)}
    return _bounded({"type": "array", "items": items}, max_items, min_items)


def _bounded(schema, max_items, min_items):
    # Ollama turns the schema into a grammar, so these bounds are enforced - and they cap output tokens.
    if max_items:
        schema["maxItems"] = max_items
    if min_items:
        schema["minItems"] = min_items
    return schema


# Every fact is filed under its patient / agenda item, so nothing is written twice (the old schema had a plan
# per topic plus global decision / action lists that repeated it) and code knows whose each item is.
# No "time" fields: code finds each item's transcript line (_locate), and every generated token costs time.
CHUNK_SCHEMA = {
    "type": "object",
    "properties": {
        "topics": _objs(max_items=3, min_items=1, name=_text(40), status=_text(300),
                        findings=_strs(7, max_len=160), decisions=_strs(6, max_len=160),
                        tasks=_objs(max_items=4, task=_text(160), owner=_text(60), deadline=_text(40),
                                    priority={"type": "string", "enum": ["high", "medium", "low"]}),
                        open=_strs(2, max_len=160)),
    },
    "required": ["topics"],
}

FINAL_SCHEMA = {
    "type": "object",
    "properties": {
        "title": _text(80),
        "summary": _text(600),
    },
    "required": ["title", "summary"],
}

# Known ASR errors and ICU slang, fixed in the transcript before any LLM call: small models copy misspelled
# drug names instead of correcting them, and confuse abbreviations ("nor" 0.22 vs "DOB" 4) with each other.
MEDICAL_LEXICON = [
    (r"\bnorodrenal\w*", "noradrenalină"),
    (r"\b(di)?nor(ul|ului|u|i)?\b", "noradrenalină"),
    (r"\bdob(-ul|ul|u)?\b", "dobutamină"),
    (r"\bm[ie]rop[ie]n[ae]m\w*", "meropenem"),
    (r"\bamica?cin\w*", "amikacină"),
    (r"\b[bf]uconazol\w*", "fluconazol"),
    (r"\bclepsiell\w*|\bklepsiel\w*", "Klebsiella"),
    (r"\bne(p|f)r[ao]st[oa](m|r)\w*", "nefrostomă"),
    (r"\bhidronifer\w*|\bhidronefr\w*", "hidronefroză"),
    (r"\btrombopro(f|fl)\w*", "tromboprofilaxie (thromboprophylaxis)"),
    (r"\bantiagreg\w*", "antiagregante (antiplatelets)"),
    (r"\btrombe?aspira\w*", "tromboaspirație"),
    (r"\btrivascular\w*", "trivascular (boală coronariană trivasculară)"),
    (r"\bmitrala (trei|3)\b", "insuficiență mitrală gradul 3"),
    (r"\bdiacar[bp]\w*", "Diacarb (acetazolamidă)"),
    (r"\bforxiga\b", "Forxiga (dapagliflozin)"),
    (r"\btr[aâ]ns ?(s?u|e?s?o)?f[aă]g[ei]an\w*|\btrans ?duracec\w*", "ecografie transesofagiană (ETE)"),
    (r"\btr[aâ]ns ?t[uo]racic\w*", "ecografie transtoracică (ETT)"),
    (r"\bi?endocardi\w*\s+te\s+ie?rnu\s+ved\w*", "endocardită nu se vede (no endocarditis)"),
    (r"\bi?endocardi(?!t[ăa] nu se vede|tis\b)\w*", "endocardită"),
    (r"\b(pune\w*) (o )?arti?er[aăe]\w*", r"\1 linie arterială"),
    (r"\beco\b", "ecocardiografie"),
    (r"\bEKS\b", "EKS (pacemaker)"),
    (r"\bpea?cemaker\w*", "pacemaker"),
    (r"\bcre?t[ie]nin\w*", "creatinină"),
    (r"\buria\b", "uree"),
    (r"\bde oameni\b", "µmol/l"),  # "200 de micromoli" heard as "200 de oameni"
    (r"\bclerus\w*", "clearance"),
    (r"\blictizi\w*", "atelectazie"),
    (r"\b(en)?cefalopat\w*", "encefalopatie"),
    (r"\bechilibr\w*", "gazometrie"),
    (r"\bvolemnic\b", "volemic"),
    (r"\bg[aâ]nd de s[aâ]nge\b", "concentrat eritrocitar (transfuzie)"),
    (r"\bdremul\b", "drenul"),
    (r"\bm[âa]șc[ăa]\b", "mască"),
    (r"\bne ?invaziv\w*", "ventilație neinvazivă"),
    (r"\btensiun\w*", "tensiunea arterială"),
    (r"\b(\d{2,3})%? pe (\d{2,3})\b%?", r"\1/\2"),  # "80 pe 40", "80% pe 40%" -> "80/40"
    (r"\balcalotic\w*", "alcaloză metabolică"),
    (r"\bcuiepidur\w*", "cu epidurală"),
]

GLOSSARY = """The transcript is noisy speech recognition of Romanian (with Russian and Latin medical terms); \
speaker labels may be wrong. "gol" means the ventricles are empty (hypovolemia), not low ejection fraction. \
"secundare" nodules means metastases. "scan" means CT scan. "stent"/"stentare" with "hidronefroză" means a \
ureteral stent. "ruptura de cordaj" = chordae tendineae rupture. "reanimare" = ICU. "boxa" = isolation room. \
"suport presor" = vasopressors. "descărcat volemic" = fluid removed with diuretics. "am scos" = stopped, \
"am introdus" = started."""

CHUNK_SYSTEM = """You extract facts for the Minutes of a {meeting_type} meeting at Medpark hospital (Moldova) \
from one part of the transcript. Translate everything into {language}; write short phrases.

""" + GLOSSARY + """

topics: {topics_hint} For each:
- name: the bed / room exactly as said (e.g. "{name_example}"), or "" if not said.
- status: {status_hint}
- findings: {findings_hint}
- decisions: what was decided or done in this meeting: {decisions_hint}
- tasks: what must still be done, asked, awaited or watched, saying exactly what (e.g. "Watch for delirium", \
"Ask Matei about the BiPAP mask"). owner = the named person or specialist who must act, only if said in \
this part (e.g. "urologist Butnari"), else "". deadline only if said (e.g. "this evening"), else "". \
priority: high = patient safety / urgent, medium = today, low = other.
- open: unresolved questions.
Use only what is said in this part. Never invent values, names, owners or deadlines. Keep doses and lab \
values exact. Leave out words you cannot understand instead of copying or guessing them. Empty lists are fine."""

HINTS = {
    "medical": dict(
        topics_hint="one entry per patient discussed in this part, in order. Start a new entry only when the "
                    "speakers clearly move to another bed / patient.",
        status_hint="diagnosis, history and current state (therapy running with doses, consciousness), at "
                    "most 30 words; lab / imaging values go in findings, not here. For a topic that is not a "
                    "patient (e.g. expected admissions): what was said.",
        findings_hint="every vital sign (blood pressure, SpO2, heart rate), lab value, blood gas, imaging, "
                      "echocardiography or culture result mentioned, with exact values and trend (e.g. "
                      "\"creatinine 240 µmol/l, was 90\").",
        decisions_hint="the treatment plan: drugs started, stopped, changed (with the dose) or continued, "
                       "procedures, lines, scans, transfusions, consults ordered."),
    "executive": dict(
        topics_hint="one entry per agenda item, in order.",
        status_hint="where it stands, with key figures, at most 35 words.",
        findings_hint="every figure, result or fact reported.",
        decisions_hint="what was approved, rejected or changed."),
    "administrative": dict(
        topics_hint="one entry per agenda item, in order.",
        status_hint="where it stands, at most 35 words.",
        findings_hint="every figure, result or fact reported.",
        decisions_hint="what was approved, rejected or changed."),
}

FINAL_SYSTEM = """You write the header of the Minutes of a {meeting_type} meeting at Medpark hospital, in \
{language}, from the facts already extracted below. Use only these facts.
- title: short, specific.
- summary: 2-3 sentences for a reader who missed the meeting: who was discussed and the main decisions.
Never add details that are not in the facts (no age, sex, diagnoses or numbers of your own)."""

# Appended to both system prompts: the instructions of the meeting type's template, set by the hospital's admin.
HOSPITAL_INSTRUCTIONS = "\n\nAdditional instructions from the hospital: {}"

# Small models translate the same drug differently from chunk to chunk; one name per drug lets duplicates merge.
CANONICAL = [
    (r"\bnorepinephrine\b", "noradrenaline"),
    (r"\bnoradrenalin(?!e)\b", "noradrenaline"),
    (r"\bnorepinefrin", "noradrenalin"),  # Romanian, the ending stays: "norepinefrina" -> "noradrenalina"
    (r"\bнор[эе]пинефрин", "норадреналин"),  # Russian, the ending stays
]
# The patterns below read the model's output in English, Romanian (ț/ș with a comma or a cedilla) or Russian.
EMPTY = re.compile(r"^(none|n/?a|nothing|not (specified|mentioned|said|stated)|unknown|-+|"
                   r"nimic|niciun\w*|ne(specificat|precizat|cunoscut|men[țţt]ionat)\w*|"
                   r"nu (este|a fost|s-a|se) (specific|preciz|men[țţt]ion)\w*|nu (este cazul|se aplic[ăa])|"
                   r"нет( данных)?|ничего|н/?[ад]|неизвестн\w*|не (указ|упом|уточн|сообщ)\w*)?\W*$", re.I)
# Sentences a model writes instead of leaving a field empty ("Patient status not fully detailed.").
FILLER = re.compile(r"[^.;]*\b(not (fully )?(detailed|specified|mentioned|discussed|said)|no (details|information)|unclear|"
                    r"discussion (revolves|about|regarding)|"
                    r"nu (a fost |au fost |este |sunt |s-a |se )?(complet )?"
                    r"(detaliat|specificat|men[țţt]ionat|discutat|precizat)\w*|"
                    r"f[ăa]r[ăa] (detalii|informa[țţt]ii)|neclar\w*|discu[țţt]ia (despre|privind|se refer[ăa])|"
                    r"не (был[аио]? )?(полностью )?(детализир|указ|упом|обсужд|уточн)\w*|"
                    r"нет (данных|информации|подробностей|сведений)|неясн\w*|"
                    r"обсуждение (касается|касалось|было посвящено))\b[^.;]*[.;]?\s*", re.I)
# Plan items that change nothing: kept under the patient, but they are not key moments.
UNCHANGED = re.compile(r"^(se )?(continu|maintain|keep|consider|plan|men[țţt]in|p[ăa]str|"
                       r"продолж|сохран|оставить|оставл|рассмотр|план)\w*\b", re.I)
# Items that change the patient's care rank first among key moments.
ACTION = re.compile(r"\b(start|stop|order|plac|insert|transfus|call|consult|increas|reduc|decreas|switch|chang|"
                    r"set|adjust|introduc|discontinu|withdr|"
                    r"[îi]ncep|[îi]ni[țţt]i|opr|sist[aă]|suspend|[îi]ntrerup|comand|solicit|transfuz|chem[aăe]|"
                    r"cre[sșş]t|cresc|sc[aă]d|schimb|ajust|trec[ei]|administr|plas|mont|"
                    r"нача[лт]|начин|назнач|отмен|останов|прекрат|введ|ввест|ввод|перелив|трансфуз|вызв|вызов|"
                    r"консульт|увелич|повыс|уменьш|сниз|смен|замен|перевод|перевест|корректир|скорректир|коррекц|"
                    r"постав|установ)\w*", re.I)
MAX_IN_FLIGHT = 2  # chunks sent to Ollama at once: 1.4x faster on an M4 with OLLAMA_NUM_PARALLEL=2, 4 is slower


def normalize(text: str) -> str:
    for pattern, replacement in MEDICAL_LEXICON:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


def _clean(text: str) -> str:
    """Model output with one name per drug, or "" for filler ("None", "N/A", "")."""
    text = FILLER.sub("", text).strip()
    if EMPTY.match(text):
        return ""
    for pattern, replacement in CANONICAL:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    if len(text) >= 150 and not text.endswith((".", ")")):  # probably cut by maxLength: end at a whole word
        text = text.rsplit(" ", 1)[0].rstrip(",;") + "…"
    return text[:1].upper() + text[1:]


def _short_time(ts: str) -> str:
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
    return f"[{_short_time(start)}] {speaker}: {normalize(text)}"


def dialog_lines(dialog: list) -> list:
    """Normalized "[mm:ss] S2: text" lines for dialog utterances."""
    return [line for u in dialog if (line := format_line(_clock(u.start), u.speaker, u.text))]


def parse_dialog(path: Path) -> list:
    """Normalized lines of a dialog transcript file (as written by `main.py dialog`)."""
    lines = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        m = LINE.match(raw.strip())
        line = m and format_line(m["start"], m["speaker"], m["text"])
        if line:
            lines.append(line)
    return lines


def _cue_name(sentence: str, language: str):
    """Name of the bed / room / item a sentence moves to, in the minutes' language ("da pacientul de pipatu nouă"
    -> "Bed 9", "Patul 9", "Койка 9"), or None."""
    for pattern, word in NAME_CUES:
        m = pattern.search(sentence)
        if m:
            n = m.groupdict().get("n")
            return WORDS[language][word].format(n=WORD_TO_NUMBER.get(n.lower(), n) if n else "")
    return None


def _bed(name: str) -> str:
    """Bed number in a topic name ("Bed 9" -> "9"), or "" if there is none."""
    digits = re.findall(r"\d+", name)
    return digits[0] if digits else ""


def _number_said(number: str, text: str) -> bool:
    words = NUMBER_WORDS.get(number)
    pattern = rf"\b{number}\b" + (rf"|\b({words})\b" if words else "")
    return re.search(pattern, text, re.IGNORECASE) is not None


NUMBER = re.compile(r"\d+(?:[.,]\d+)?")


def _key_numbers(text: str) -> set:
    """Doses and lab values worth verifying: decimals and numbers with 3+ digits ("0.22", "240", "1.100")."""
    return {n.replace(",", ".") for n in NUMBER.findall(text) if ("." in n or "," in n or len(n) >= 3)}


def _similar(a: str, b: str) -> bool:
    """Near-duplicate phrases ("Call urologist Butnari" / "Call the urologist Butnari")."""
    wa, wb = set(re.findall(r"\w{3,}", a.lower())), set(re.findall(r"\w{3,}", b.lower()))
    return bool(wa and wb) and len(wa & wb) / min(len(wa), len(wb)) >= 0.75


def _stems(text: str) -> set:
    """Language-independent word keys: numbers plus the first 5 letters of longer (Latin or Cyrillic) words,
    without diacritics.

    "noradrenaline 0.22" (English item) and "noradrenalină 0,22" (Romanian transcript) share {"norad", "0.22"}.
    """
    plain = "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))
    return ({w[:5] for w in re.findall(r"[a-zа-я]{5,}", plain)} |
            {n.replace(",", ".") for n in NUMBER.findall(plain)})


def _locate(item: str, lines: list, fallback: str) -> str:
    """Time of the transcript line that shares the most words / numbers with an extracted item."""
    keys = _stems(item)
    best, best_score = fallback, 0
    for line in lines:
        score = len(keys & _stems(line.split(":", 2)[-1]))  # text only, not the "[mm:ss] S2:" prefix
        if score > best_score:
            best, best_score = line[1:line.index("]")], score
    return best


SAMPLE_TEMPERATURES = (0.6, 0.9)  # extra self-consistency samples after the first one at 0.1


def _union(a: dict, b: dict) -> dict:
    """Merge a second extraction of the same chunk into the first one.

    Topics are matched by position (both samples list the patients of the chunk in order); a topic that only
    the second sample has is dropped, since its patient split cannot be trusted. List fields are united and
    near-duplicates are removed.
    """
    out = {"topics": [dict(t) for t in a["topics"]]}
    for mine, theirs in zip(out["topics"], b["topics"]):
        for field, value in theirs.items():
            if isinstance(value, list):
                mine[field] = mine[field] + [x for x in value if not any(_same(x, y) for y in mine[field])]
    return out


def _same(x, y) -> bool:
    text = lambda v: " ".join(str(s) for s in v.values()) if isinstance(v, dict) else str(v)  # noqa: E731
    return _similar(text(x), text(y))


class MinutesBuilder:
    """Incremental minutes: feed transcript lines as they arrive, then finalize(). language: of the minutes, a
    key of MINUTES_LANGUAGES; instructions: the hospital's own for this meeting type, added to every prompt."""

    def __init__(self, meeting_type="medical", model=DEFAULT_MODEL, language="en", num_thread=10,
                 verbose=True, final_model=None, samples=1, instructions=""):
        self.meeting_type, self.model, self.language = meeting_type, model, language
        self.instructions = HOSPITAL_INSTRUCTIONS.format(instructions.strip()) if instructions.strip() else ""
        self.words = WORDS[language]
        self.samples = max(1, min(samples, len(SAMPLE_TEMPERATURES) + 1))
        self.final_model = final_model or model
        self.default_owner = self.words["icu_team" if meeting_type == "medical" else "team"]
        self.num_thread, self.verbose = num_thread, verbose
        # The system prompt is identical for every chunk (the per-chunk note goes into the user message),
        # so Ollama reuses its cached prompt instead of re-reading it on every call.
        self.system = CHUNK_SYSTEM.format(meeting_type=meeting_type, language=MINUTES_LANGUAGES[language],
                                          name_example=self.words["bed"].format(n=9),
                                          **HINTS[meeting_type]) + self.instructions
        self.buffer, self.buffer_words = [], 0
        self.starts_new_topic, self.next_name = True, None  # what the current buffer starts with
        self.current_name = None  # the bed / room the speakers are on, from the last name cue
        self.label = None  # name of the topic the next continuation chunk continues
        # Chunks are extracted in the background (up to MAX_IN_FLIGHT at once) and merged strictly in order.
        self.pool, self.pending, self.submitted = ThreadPoolExecutor(MAX_IN_FLIGHT), [], 0
        self.topics, self.decisions, self.actions, self.issues = [], [], [], []
        self.warnings = []
        self.calls = []

    def add_line(self, line: str):
        prefix, text = line.split(": ", 1)
        sentences = SENTENCE.split(text)
        for i, sentence in enumerate(sentences):
            name = _cue_name(sentence, self.language)
            if name and name != self.current_name:
                # Cut exactly at the sentence that moves on, even in the middle of a long utterance.
                if i:
                    self._append(f"{prefix}: {' '.join(sentences[:i])}")
                self._start_topic(name)
                self._append(f"{prefix}: {' '.join(sentences[i:])}")
                return
        if self.buffer_words >= CHUNK_MIN_WORDS and TOPIC_CUE.search(text):
            self._flush()
        self._append(line)

    def _append(self, line: str):
        words = len(line.split())
        if self.buffer and self.buffer_words + words > CHUNK_MAX_WORDS:
            self._flush()  # mid-discussion: the next chunk continues the current patient
        self.buffer.append(line)
        self.buffer_words += words

    def _start_topic(self, name: str):
        self.current_name = name
        if self.buffer_words < TOPIC_MIN_WORDS and self.starts_new_topic and not self.next_name:
            self.next_name = name  # only a preamble ("Așa.") so far: it belongs to this patient
            return
        self._flush()
        self.starts_new_topic, self.next_name = True, name

    def _flush(self):
        if not self.buffer:
            return
        continues = self.submitted > 0 and not self.starts_new_topic
        if continues:
            note = (f'The first lines continue the discussion of {self.label or "the previous patient"}: make it '
                    f'the first topic and report only what is new.\n\n')
        elif self.next_name:
            note = f"This part starts with {self.next_name}.\n\n"
        else:
            note = ""
        user = note + "Transcript part:\n\n" + "\n".join(self.buffer)
        future = self.pool.submit(self._extract, user)
        self.pending.append((future, self.buffer, self.buffer_words, continues, self.next_name))
        self.submitted += 1
        if not continues:
            self.label = self.next_name
        self.buffer, self.buffer_words = [], 0
        self.starts_new_topic, self.next_name = False, None
        self._merge_ready()

    def _extract(self, user: str):
        # Self-consistency (--samples 2+): a small model misses a different random subset of facts on every
        # run, so extra samples at a higher temperature are merged in. Only worth it when Ollama decodes them
        # as one batch (OLLAMA_NUM_PARALLEL >= samples); otherwise each sample adds the full time again.
        temperatures = (0.1,) + SAMPLE_TEMPERATURES[:self.samples - 1]
        t = time.perf_counter()
        def sample(temp):
            try:
                return chat(self.model, self.system, user, CHUNK_SCHEMA, num_thread=self.num_thread,
                             temperature=temp)
            except json.JSONDecodeError:  # two broken answers: lose this chunk, not the whole minutes
                print("  chunk skipped: no valid JSON after a retry", file=sys.stderr)
                return {"topics": []}, {"wall": 0, "prompt_tokens": 0, "prompt_s": 0, "output_tokens": 0,
                                        "output_s": 0}

        with ThreadPoolExecutor(len(temperatures)) as pool:
            results = list(pool.map(sample, temperatures))
        part, stats = results[0]
        for extra, extra_stats in results[1:]:
            part = _union(part, extra)
            stats["output_tokens"] += extra_stats["output_tokens"]
        stats["wall"] = round(time.perf_counter() - t, 1)
        return part, stats

    def _merge_ready(self, wait=False):
        """Merge finished chunks in transcript order (all of them when wait=True)."""
        while self.pending and (wait or self.pending[0][0].done()):
            future, lines, words, continues, cue_name = self.pending.pop(0)
            part, stats = future.result()
            stats.update(step="map", lines=len(lines), words=words, samples=self.samples)
            self.calls.append(stats)
            if self.verbose:
                print(f"  map {lines[0].split()[0]}..{lines[-1].split()[0]} {words} words"
                      f"{' (' + cue_name + ')' if cue_name else ''}: {stats['wall']}s "
                      f"({stats['prompt_tokens']} in / {stats['output_tokens']} out)", file=sys.stderr, flush=True)
            self._merge(part, lines, continues, cue_name)

    def _check(self, text: str, source_numbers: set, chunk_time: str) -> str:
        """Flag doses / lab values that do not occur in the transcript chunk they were extracted from."""
        missing = ", ".join(sorted(_key_numbers(text) - source_numbers))
        if not missing:
            return text
        self.warnings.append(f"[{chunk_time}] " + self.words["not_found"].format(values=missing, text=text))
        return f"{text} " + self.words["unverified"].format(values=missing)

    def _checked_name(self, name: str, chunk_text: str) -> str:
        """The model's topic name, or "" when it is doubtful: small models often invent or reuse bed numbers.

        For medical meetings only a bed number that was actually said is kept (models also turn staff names such
        as the colleague who "knows BiPAP" into patients); other meetings keep agenda-item names.
        """
        name = name.strip()
        if not name or any(t["name"].lower() == name.lower() for t in self.topics):
            return ""
        bed = _bed(name)
        if not bed:
            return "" if self.meeting_type == "medical" else name
        return name if _number_said(bed, chunk_text) else ""

    def _topic_for(self, i, t, continues, cue_name, chunk_text, chunk_time) -> int:
        """Index of the topic an extracted entry belongs to; creates it if it is new.

        Code decides patient identity: a chunk cut in mid-discussion continues the previous entry, and a chunk
        cut at a name cue starts that patient (or returns to it). Model names are only trusted for further
        patients inside a chunk, and never used to merge: small models mislabel beds, and a wrong name is far
        less harmful than two patients merged into one.
        """
        if i == 0 and continues:
            idx = len(self.topics) - 1
            name = self._checked_name(t["name"], chunk_text)
            if name and self.topics[idx]["name"].startswith(self.words["patient"].format(n="")):
                self.topics[idx]["name"] = name
            return idx
        if i == 0 and cue_name:
            for idx, topic in enumerate(self.topics):
                if topic["name"] == cue_name:
                    return idx
        name = (cue_name if i == 0 else None) or self._checked_name(t["name"], chunk_text)
        self.topics.append({"name": name or self.words["patient"].format(n=len(self.topics) + 1), "time": chunk_time,
                            "status": "", "findings": []})
        return len(self.topics) - 1

    def _merge(self, part, lines, continues, cue_name):
        chunk_text = "\n".join(lines)
        chunk_time = lines[0][1:lines[0].index("]")]
        src = _key_numbers(chunk_text)

        def checked(text):
            text = _clean(text)
            return text and self._check(text, src, chunk_time)

        for i, t in enumerate(part["topics"]):
            idx = self._topic_for(i, t, continues, cue_name, chunk_text, chunk_time)
            topic = self.topics[idx]
            status = checked(t["status"]).rstrip(".")
            if status and not any(_similar(status, s) for s in topic["status"].split("; ") if s):
                topic["status"] = f"{topic['status']}; {status}" if topic["status"] else status
            for f in map(checked, t["findings"]):
                if f and not any(_similar(f, x) for x in topic["findings"]):
                    topic["findings"].append(f)
            for d in map(checked, t["decisions"]):
                if d and not any(_similar(d, x["decision"]) for x in self.decisions if x["_topic"] == idx):
                    self.decisions.append({"decision": d, "time": _locate(d, lines, chunk_time), "_topic": idx})
            for a in t["tasks"]:
                task = checked(a["task"])
                if task and not any(_similar(task, x["task"]) for x in self.actions if x["_topic"] == idx):
                    self.actions.append({"task": task, "owner": _clean(a["owner"]) or self.default_owner,
                                         "deadline": _clean(a["deadline"]) or self.words["no_deadline"],
                                         "priority": a["priority"], "time": _locate(task, lines, chunk_time),
                                         "_topic": idx})
            for o in map(_clean, t["open"]):
                if o and not UNCHANGED.match(o) and not any(_similar(o, x["issue"]) for x in self.issues):
                    self.issues.append({"issue": o, "_topic": idx})

    def _facts_text(self) -> str:
        """Merged facts as compact text for the finalize call (statuses and decisions per patient)."""
        out = []
        for idx, t in enumerate(self.topics):
            out.append(f"- {t['name']}: {t['status']}")
            out += [f"  - decided: {d['decision']}" for d in self.decisions if d["_topic"] == idx]
        out += ["Open issues:"] + [f"- {i['issue']}" for i in self.issues]
        return "\n".join(out)

    def _key_moments(self, limit=6) -> list:
        """Most important moments, chosen in code from what the chunk extraction already rated.

        Selecting (instead of letting the LLM rewrite) keeps them traceable and saves an LLM call. One per
        patient first, so a long discussion of one patient does not crowd out the others.
        """
        candidates = [(d["time"], d["decision"], d["patient"]) for d in self.decisions
                      if not UNCHANGED.match(d["decision"])]
        candidates += [(a["time"], a["task"], a["patient"]) for a in self.actions if a["priority"] == "high"]
        candidates.sort(key=lambda c: not ACTION.search(c[1]))  # care changes first (stable sort)
        picked, seen = [], set()
        for rnd in (0, 1, 2):
            for time_, text, patient in candidates:
                if len(picked) >= limit:
                    break
                if (rnd == 0 and patient in seen) or any(_similar(text, m["moment"]) for m in picked):
                    continue
                seen.add(patient)
                picked.append({"time": time_, "moment": f"{text} — {patient}"})
        return sorted(picked, key=lambda m: m["time"])

    def finalize(self) -> dict:
        system = FINAL_SYSTEM.format(meeting_type=self.meeting_type,
                                     language=MINUTES_LANGUAGES[self.language]) + self.instructions
        self._merge_ready(wait=True)
        if self.topics and self.buffer:
            # The header (title / summary) is written from everything before the last chunk,
            # concurrently with extracting that last chunk (needs OLLAMA_NUM_PARALLEL >= samples + 1). The last
            # minutes are usually wrap-up, and key moments / tables below still include them.
            header = self.pool.submit(chat, self.final_model, system, self._facts_text(), FINAL_SCHEMA,
                                      num_thread=self.num_thread, num_predict=400)
            self._flush()
            self._merge_ready(wait=True)
            head, stats = header.result()
        else:
            self._flush()
            self._merge_ready(wait=True)
            head, stats = chat(self.final_model, system, self._facts_text(), FINAL_SCHEMA,
                                num_thread=self.num_thread, num_predict=400)
        self.pool.shutdown()
        for entry in self.decisions + self.actions + self.issues:  # patients can be renamed after recording
            entry["patient"] = self.topics[entry.pop("_topic")]["name"]
        stats["step"] = "finalize"
        self.calls.append(stats)
        if self.verbose:
            print(f"  finalize: {stats['wall']}s ({stats['prompt_tokens']} in / {stats['output_tokens']} out)",
                  file=sys.stderr, flush=True)
        return {**head, "key_moments": self._key_moments(), "topics": self.topics, "decisions": self.decisions,
                "action_items": self.actions,
                "open_issues": [f"{i['patient']}: {i['issue']}" for i in self.issues], "warnings": self.warnings,
                "attendees": []}  # who was present: the moderator adds them


class LiveMinutes:
    """Runs a MinutesBuilder in a background thread, so transcription is never blocked by the LLM.

    Feed dialog utterances while Whisper is running; finish() waits for the remaining chunks and finalizes.
    """

    def __init__(self, builder: MinutesBuilder):
        self.builder, self.queue = builder, queue.Queue()
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def feed(self, utterance):
        line = format_line(_clock(utterance.start), utterance.speaker, utterance.text)
        if line:
            self.queue.put(line)

    def _run(self):
        while (line := self.queue.get()) is not None:
            self.builder.add_line(line)

    def finish(self) -> dict:
        self.queue.put(None)
        self.thread.join()
        return self.builder.finalize()


def _clock(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"
