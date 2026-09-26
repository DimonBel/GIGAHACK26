"""Turn a dialog transcript into structured Minutes of Meeting with a local LLM (Ollama).

Input: dialog text as written by `main.py dialog` ("[00:00:00 - 00:00:29] SPEAKER 2: ...").
Output: JSON (for automation / email routing) and Markdown (for people), always in English.

Small local models cannot digest a whole multi-patient meeting in one call (they merge patients and
invent), and big models are too slow. So the transcript is processed in three steps:

  1. map      - code cuts the transcript where the speakers move to another bed / patient ("patul 9", "boxa")
                and names that patient; a small model extracts the facts of each chunk, filed per patient.
                MinutesBuilder.add_line() can be fed while Whisper is still transcribing, so most of this
                work is done before the meeting audio is fully processed.
  2. merge    - plain code joins the chunk results (same patient -> one entry, duplicates dropped).
  3. finalize - key moments are picked in code; one short LLM call writes title, summary and suggestions.

  python -m stt.minutes Medpark_dialog.txt --type medical --out out/Medpark
"""
import argparse
import json
import os
import queue
import re
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

def _ollama_url() -> str:
    """Chat endpoint of the Ollama server named by OLLAMA_HOST (as the ollama CLI reads it), else localhost."""
    host = os.environ.get("OLLAMA_HOST", "").strip() or "127.0.0.1:11434"
    host = host if "://" in host else "http://" + host
    if not re.search(r":\d+$", host.rstrip("/")):
        host = host.rstrip("/") + ":11434"
    return host.rstrip("/") + "/api/chat"


OLLAMA_URL = _ollama_url()
DEFAULT_MODEL = "gemma4:e4b"
MEETING_TYPES = ("medical", "executive", "administrative")
LINE = re.compile(r"\[(?P<start>[\d:]+) - (?P<end>[\d:]+)\] (?P<speaker>[^:]+): (?P<text>.*)")

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
# the chunk is cut there and the patient is named from the cue. ASR mangles "patul 9" into "pipatu nouă",
# "apatul, nouă" or "patru opt", hence the loose prefix and suffix.
NAME_CUES = [
    (re.compile(rf"\b\w{{0,2}}pat(?:ul|u|ului|ru)?\b[\s,.]+(?:de\s+|nr\.?\s*)?(?P<n>{_NUM})\b", re.I), "Bed {n}"),
    (re.compile(rf"\b(?:койк\w*|палат\w*)\s+(?:№\s*)?(?P<n>{_NUM})\b", re.I), "Bed {n}"),
    (re.compile(r"\bbox\w*", re.I), "Box"),
    (re.compile(r"\b(?:primir\w*|internăr\w*|admissions?)\b", re.I), "Expected admissions"),
    (re.compile(rf"\b(?:punctul|item)\s+(?P<n>{_NUM})\b", re.I), "Item {n}"),
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


def _strs(max_items=None, min_items=0):
    return _bounded({"type": "array", "items": _STR}, max_items, min_items)


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
        "topics": _objs(max_items=3, min_items=1, name=_STR, status=_STR, findings=_strs(7), decisions=_strs(6),
                        tasks=_objs(max_items=4, task=_STR, owner=_STR, deadline=_STR,
                                    priority={"type": "string", "enum": ["high", "medium", "low"]}),
                        open=_strs(2)),
    },
    "required": ["topics"],
}

FINAL_SCHEMA = {
    "type": "object",
    "properties": {
        "title": _STR,
        "summary": _STR,
        "suggestions": _strs(3),
    },
    "required": ["title", "summary", "suggestions"],
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
    (r"\b(\d{2,3}) pe (\d{2,3})\b", r"\1/\2"),  # "80 pe 40" -> "80/40"
    (r"\balcalotic\w*", "alcaloză metabolică"),
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
- name: the bed / room exactly as said (e.g. "Bed 9"), or "" if not said.
- status: {status_hint}
- findings: {findings_hint}
- decisions: what was decided or done in this meeting: {decisions_hint}
- tasks: what must still be done, asked, awaited or watched, saying exactly what (e.g. "Watch for delirium", \
"Ask Matei about the BiPAP mask"). owner = the named person or specialist who must act, only if said in \
this part (e.g. "urologist Butnari"), else "". deadline only if said (e.g. "this evening"), else "". \
priority: high = patient safety / urgent, medium = today, low = other.
- open: unresolved questions.
Use only what is said in this part. Never invent values, names, owners or deadlines. Keep doses and lab \
values exact. Empty lists are fine."""

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
- suggestions: at most 3 follow-ups the team may have overlooked (not already an open issue), based only \
on these facts, at most \
15 words each.
Never add details that are not in the facts (no age, sex, diagnoses or numbers of your own)."""

# Small models translate the same drug differently from chunk to chunk; one name per drug lets duplicates merge.
CANONICAL = [
    (r"\bnorepinephrine\b", "noradrenaline"),
    (r"\bnoradrenalin(?!e)\b", "noradrenaline"),
]
EMPTY = re.compile(r"^(none|n/?a|nothing|not (specified|mentioned|said|stated)|unknown|-+)?\W*$", re.I)
# Sentences a model writes instead of leaving a field empty ("Patient status not fully detailed.").
FILLER = re.compile(r"[^.;]*\b(not (fully )?(detailed|specified|mentioned|discussed|said)|no (details|information)|unclear|"
                    r"discussion (revolves|about|regarding))\b[^.;]*[.;]?\s*", re.I)
# Plan items that change nothing: kept under the patient, but they are not key moments.
UNCHANGED = re.compile(r"^(continu|maintain|keep|consider|plan)\w*\b", re.I)
# Items that change the patient's care rank first among key moments.
ACTION = re.compile(r"\b(start|stop|order|plac|insert|transfus|call|consult|increas|reduc|decreas|switch|chang|"
                    r"set|adjust|introduc|discontinu|withdr)\w*", re.I)
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


def parse_dialog(path: Path) -> list:
    """Normalized lines of a dialog transcript file (as written by `main.py dialog`)."""
    lines = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        m = LINE.match(raw.strip())
        line = m and format_line(m["start"], m["speaker"], m["text"])
        if line:
            lines.append(line)
    return lines


def _chat(model, system, user, schema, num_ctx=4096, num_thread=10, num_predict=1000, retry=True,
          temperature=0.1):
    body = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "format": schema,
        "stream": False,
        "keep_alive": "30m",
        "options": {"temperature": temperature if retry else 0.4, "num_ctx": num_ctx, "num_thread": num_thread,
                    "num_predict": num_predict},
    }
    if model.startswith(("qwen3", "gemma4")):
        body["think"] = False  # thinking models would spend the whole num_predict budget before the JSON
    req = urllib.request.Request(OLLAMA_URL, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    t = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=3600) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise RuntimeError(f"Ollama has no model {model!r}. Download it with: ollama pull {model}")
        raise RuntimeError(f"Ollama error for {model}: {e}")
    except OSError as e:
        raise RuntimeError(f"Could not reach Ollama at {OLLAMA_URL}. Is it running? ({e})")
    stats = {"wall": round(time.perf_counter() - t, 1), "prompt_tokens": data.get("prompt_eval_count", 0),
             "prompt_s": round(data.get("prompt_eval_duration", 0) / 1e9, 1),
             "output_tokens": data.get("eval_count", 0), "output_s": round(data.get("eval_duration", 0) / 1e9, 1)}
    try:
        return json.loads(data["message"]["content"]), stats
    except json.JSONDecodeError:
        if retry:
            print(f"  invalid JSON from {model} ({data.get('done_reason')}), retrying: "
                  f"{data['message']['content'][:200]!r}", file=sys.stderr)
            result, again = _chat(model, system, user, schema, num_ctx, num_thread, num_predict, retry=False)
            again["wall"] += stats["wall"]
            return result, again
        raise


def _cue_name(sentence: str):
    """Name of the bed / room / item a sentence moves to ("da pacientul de pipatu nouă" -> "Bed 9"), or None."""
    for pattern, name in NAME_CUES:
        m = pattern.search(sentence)
        if m:
            n = m.groupdict().get("n")
            return name.format(n=WORD_TO_NUMBER.get(n.lower(), n) if n else "")
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
    """Language-independent word keys: numbers plus the first 5 letters of longer words, without diacritics.

    "noradrenaline 0.22" (English item) and "noradrenalină 0,22" (Romanian transcript) share {"norad", "0.22"}.
    """
    plain = "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))
    return ({w[:5] for w in re.findall(r"[a-z]{5,}", plain)} |
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
    """Incremental minutes: feed transcript lines as they arrive, then finalize()."""

    def __init__(self, meeting_type="medical", model=DEFAULT_MODEL, language="English", num_thread=10,
                 verbose=True, final_model=None, samples=1):
        self.meeting_type, self.model, self.language = meeting_type, model, language
        self.samples = max(1, min(samples, len(SAMPLE_TEMPERATURES) + 1))
        self.final_model = final_model or model
        self.default_owner = "ICU team" if meeting_type == "medical" else "Team"
        self.num_thread, self.verbose = num_thread, verbose
        # The system prompt is identical for every chunk (the per-chunk note goes into the user message),
        # so Ollama reuses its cached prompt instead of re-reading it on every call.
        self.system = CHUNK_SYSTEM.format(meeting_type=meeting_type, language=language, **HINTS[meeting_type])
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
            name = _cue_name(sentence)
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
        with ThreadPoolExecutor(len(temperatures)) as pool:
            results = list(pool.map(lambda temp: _chat(self.model, self.system, user, CHUNK_SCHEMA,
                                                       num_thread=self.num_thread, temperature=temp),
                                    temperatures))
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
        missing = sorted(_key_numbers(text) - source_numbers)
        if not missing:
            return text
        self.warnings.append(f"[{chunk_time}] value(s) {', '.join(missing)} not found in the transcript: {text}")
        return f"{text} ⚠ unverified: {', '.join(missing)}"

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
            if name and self.topics[idx]["name"].startswith("Patient "):
                self.topics[idx]["name"] = name
            return idx
        if i == 0 and cue_name:
            for idx, topic in enumerate(self.topics):
                if topic["name"] == cue_name:
                    return idx
        name = (cue_name if i == 0 else None) or self._checked_name(t["name"], chunk_text)
        self.topics.append({"name": name or f"Patient {len(self.topics) + 1}", "time": chunk_time,
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
                                         "deadline": _clean(a["deadline"]) or "Not specified",
                                         "priority": a["priority"], "time": _locate(task, lines, chunk_time),
                                         "_topic": idx})
            for o in map(_clean, t["open"]):
                if o and not any(_similar(o, x["issue"]) for x in self.issues):
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
        system = FINAL_SYSTEM.format(meeting_type=self.meeting_type, language=self.language)
        self._merge_ready(wait=True)
        if self.topics and self.buffer:
            # The header (title / summary / suggestions) is written from everything before the last chunk,
            # concurrently with extracting that last chunk (needs OLLAMA_NUM_PARALLEL >= samples + 1). The last
            # minutes are usually wrap-up, and key moments / tables below still include them.
            header = self.pool.submit(_chat, self.final_model, system, self._facts_text(), FINAL_SCHEMA,
                                      num_thread=self.num_thread, num_predict=400)
            self._flush()
            self._merge_ready(wait=True)
            head, stats = header.result()
        else:
            self._flush()
            self._merge_ready(wait=True)
            head, stats = _chat(self.final_model, system, self._facts_text(), FINAL_SCHEMA,
                                num_thread=self.num_thread, num_predict=400)
        self.pool.shutdown()
        for entry in self.decisions + self.actions + self.issues:  # patients can be renamed after recording
            entry["patient"] = self.topics[entry.pop("_topic")]["name"]
        stats["step"] = "finalize"
        self.calls.append(stats)
        if self.verbose:
            print(f"  finalize: {stats['wall']}s ({stats['prompt_tokens']} in / {stats['output_tokens']} out)",
                  file=sys.stderr, flush=True)
        return {**head, "suggestions": [s for s in map(_clean, head["suggestions"]) if s],
                "key_moments": self._key_moments(), "topics": self.topics, "decisions": self.decisions,
                "action_items": self.actions,
                "open_issues": [f"{i['patient']}: {i['issue']}" for i in self.issues], "warnings": self.warnings}


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


def to_markdown(m: dict, meeting_type: str) -> str:
    out = [f"# {m['title']}", f"*Meeting type: {meeting_type.capitalize()}*", "", "## Summary", m["summary"], ""]
    out += ["## Key moments"] + [f"- `{k['time']}` {k['moment']}" for k in m["key_moments"]] + [""]
    out.append("## Patients" if meeting_type == "medical" else "## Agenda items")
    for t in m["topics"]:
        out += [f"### {t['name']}  `{t['time']}`", f"**Status:** {t['status'] or '—'}"]
        if t["findings"]:
            out += ["", "**Findings:**"] + [f"- {f}" for f in t["findings"]]
        decisions = [d for d in m["decisions"] if d["patient"] == t["name"]]
        if decisions:
            out += ["", "**Decisions:**"] + [f"- `{d['time']}` {d['decision']}" for d in decisions]
        out.append("")
    head = "| # | Task | Patient | Owner | Deadline | Priority | Time |" if meeting_type == "medical" else \
        "| # | Task | Item | Owner | Deadline | Priority | Time |"
    out += ["## Action items", head, "|---" * head.count(" |") + "|"]
    order = {"high": 0, "medium": 1, "low": 2}
    for i, a in enumerate(sorted(m["action_items"], key=lambda a: order.get(a["priority"], 3)), 1):
        out.append(f"| {i} | {a['task']} | {a['patient']} | {a['owner']} | {a['deadline']} | {a['priority']} "
                   f"| {a['time']} |")
    if m["open_issues"]:
        out += ["", "## Open issues"] + [f"- {o}" for o in m["open_issues"]]
    if m["suggestions"]:
        out += ["", "## AI suggestions (not decided in the meeting)"] + [f"- {s}" for s in m["suggestions"]]
    if m.get("warnings"):
        out += ["", "## Verification warnings"] + [f"- {w}" for w in m["warnings"]]
    return "\n".join(out) + "\n"


def main():
    p = argparse.ArgumentParser(description="Minutes of Meeting from a dialog transcript (local LLM)")
    p.add_argument("dialog", type=Path)
    p.add_argument("--type", choices=MEETING_TYPES, default="medical")
    p.add_argument("--model", default=DEFAULT_MODEL, help="model for extracting facts from each chunk")
    p.add_argument("--final-model", help="model for title/summary/suggestions (default: --model)")
    p.add_argument("--samples", type=int, default=1,
                   help="extractions per chunk merged together (1-3); more = better recall, slower unless "
                        "OLLAMA_NUM_PARALLEL >= samples")
    p.add_argument("--language", default="English")
    p.add_argument("--threads", type=int, default=10)
    p.add_argument("--out", type=str, help="output path prefix (writes .json, .md, .meta.json)")
    args = p.parse_args()

    t0 = time.perf_counter()
    builder = MinutesBuilder(args.type, args.model, args.language, args.threads, final_model=args.final_model,
                             samples=args.samples)
    for line in parse_dialog(args.dialog):
        builder.add_line(line)
    minutes = builder.finalize()
    total = time.perf_counter() - t0
    # With live transcription, everything except the last chunk and finalize runs during the meeting.
    maps = [c for c in builder.calls if c["step"] == "map"]
    after_end = (maps[-1]["wall"] if maps else 0) + builder.calls[-1]["wall"]
    stats = {"model": args.model, "final_model": builder.final_model, "total_seconds": round(total, 1),
             "seconds_after_transcript_end": round(after_end, 1), "map_calls": len(maps),
             "calls": builder.calls}
    md = to_markdown(minutes, args.type)
    print(md)
    print(json.dumps({k: v for k, v in stats.items() if k != "calls"}), file=sys.stderr)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out + ".json").write_text(json.dumps(minutes, ensure_ascii=False, indent=2), encoding="utf-8")
        Path(args.out + ".md").write_text(md, encoding="utf-8")
        Path(args.out + ".meta.json").write_text(json.dumps(
            {**stats, "dialog": str(args.dialog), "meeting_type": args.type}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
