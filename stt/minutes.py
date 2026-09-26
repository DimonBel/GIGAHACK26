"""Turn a dialog transcript into structured Minutes of Meeting with a local LLM (Ollama).

Input: dialog text as written by `main.py dialog` ("[00:00:00 - 00:00:29] SPEAKER 2: ...").
Output: JSON (for automation / email routing) and Markdown (for people), always in English.

Small models on CPU cannot digest a whole multi-patient meeting in one call (they merge patients and
invent), and big models are too slow. So the transcript is processed in three steps:

  1. map      - the transcript is cut at patient/topic boundaries into ~300-word chunks and a small model
                extracts facts from each chunk. MinutesBuilder.add_line() can be fed while Whisper is still
                transcribing, so most of this work is done before the meeting audio is fully processed.
  2. merge    - plain code joins the chunk results (same patient -> one entry, duplicates dropped).
  3. finalize - key moments are picked in code; one short LLM call writes title, summary and suggestions.

  python -m stt.minutes Medpark_dialog.txt --type medical --out out/Medpark
"""
import argparse
import json
import queue
import re
import sys
import threading
import time
import unicodedata
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

OLLAMA_URL = "http://localhost:11434/api/chat"
DEFAULT_MODEL = "gemma3:4b"
MEETING_TYPES = ("medical", "executive", "administrative")
LINE = re.compile(r"\[(?P<start>[\d:]+) - (?P<end>[\d:]+)\] (?P<speaker>[^:]+): (?P<text>.*)")
# A new patient / agenda item usually starts with one of these words.
TOPIC_CUE = re.compile(r"\b(pacient\w*|patul|patului|salonul|punctul|următor\w*|пациент\w*|больн\w*|"
                       r"следующ\w*|next patient|agenda item)\b", re.IGNORECASE)
CHUNK_MIN_WORDS = 220  # cut at the next topic cue once a chunk has this many words
CHUNK_MAX_WORDS = 420  # hard cut

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


# No "time" fields: code finds each item's transcript line (_locate), and every generated token costs ~0.15 s.
_ACTIONS = _objs(max_items=5, task=_STR, owner=_STR, deadline=_STR,
                 priority={"type": "string", "enum": ["high", "medium", "low"]})

CHUNK_SCHEMA = {
    "type": "object",
    "properties": {
        "topics": _objs(max_items=4, name=_STR, status=_STR, plan=_strs(6)),
        "decisions": _strs(6),
        "action_items": _ACTIONS,
        "open_issues": _strs(3),
    },
    "required": ["topics", "decisions", "action_items", "open_issues"],
}

# Experimental (--slots): explicit per-patient slots instead of a generic "plan", with decisions / action items
# derived in code. With gemma3:4b it catches stopped drugs and named consultants but drops other facts, so it
# scores below the generic schema (15-17 vs 19-21 on the reference checklist).
_MEDS = _objs(max_items=6, drug=_STR, dose=_STR,
              action={"type": "string", "enum": ["start", "stop", "increase", "decrease", "change", "continue"]})

MEDICAL_CHUNK_SCHEMA = {
    "type": "object",
    "properties": {
        "patients": _objs(max_items=4, name=_STR, status=_STR, results=_strs(6), medications=_MEDS,
                          procedures=_strs(4), consults=_objs(max_items=3, specialist=_STR, name=_STR),
                          watch=_objs(max_items=3, what=_STR, until=_STR)),
        "open_issues": _strs(3),
    },
    "required": ["patients", "open_issues"],
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
    (r"\b(di)?nor(ul|ului|u)?\b", "noradrenalină"),
    (r"\bdob(-ul|ul|u)?\b", "dobutamină"),
    (r"\bm[ie]rop[ie]n[ae]m\w*", "meropenem"),
    (r"\bamica?cin\w*", "amikacină"),
    (r"\bclepsiell\w*|\bklepsiel\w*", "Klebsiella"),
    (r"\bne(p|f)r[ao]st[oa]m\w*", "nefrostomă"),
    (r"\bhidronifer\w*|\bhidronefr\w*", "hidronefroză"),
    (r"\btrombopro(f|fl)\w*", "tromboprofilaxie"),
    (r"\bdiacarp\w*", "Diacarb (acetazolamidă)"),
    (r"\btrans ?f[aă]g[ei]an\w*|\btrans ?duracec\w*", "ecografie transesofagiană (ETE)"),
    (r"\b(pune\w*) (o )?arti?er[aăe]\w*", r"\1 linie arterială"),
    (r"\beco\b", "ecocardiografie"),
    (r"\bEKS\b", "EKS (pacemaker)"),
]

GLOSSARY = """The transcript is noisy speech recognition of Romanian (with Russian and Latin medical terms); \
speaker labels may be wrong. "gol" means the ventricles are empty (hypovolemia), not low ejection fraction. \
"secundare" nodules means metastases. "scan" means CT scan. "stent"/"stentare" with "hidronefroză" means a \
ureteral stent. "ruptura de cordaj" = chordae tendineae rupture."""

CHUNK_SYSTEM = """You extract facts for the Minutes of a {meeting_type} meeting at Medpark hospital (Moldova) \
from one part of the transcript. Translate everything into {language}; write short phrases.

""" + GLOSSARY + """

Rules:
- Use only what is said in this part. Never invent values, names, owners or deadlines. Keep doses and lab \
values exact.
- topics: {topics_hint} {continuation}
  name: the bed number or name exactly as said (e.g. "Bed 9"), or "" if not said. At most 6 plan items \
per topic.
- decisions: every management decision in this part, one short phrase each: drugs started, stopped or \
changed (with dose), transfusions, procedures and scans ordered, consults requested.
- action_items: concrete tasks, including what must be watched and until when. owner = the person's name \
or role only if said in this part (e.g. "the cardiologist"), else "ICU team". deadline only if said (e.g. \
"this evening", "tomorrow"), else "Not specified". priority: high = patient safety / urgent, medium = today, \
low = other.
- At most 5 action_items per part.
- open_issues: unresolved questions or things being waited for.
- Empty lists are fine if this part has nothing of that kind."""

TOPICS_HINT = {
    "medical": "one entry per patient discussed in this part, in order (status = clinical state with key "
               "values; plan = treatment steps). A new patient starts when the speakers move to another bed / "
               "patient ('pacientul', 'patul').",
    "executive": "one entry per agenda item (status = where it stands with key figures; plan = next steps).",
    "administrative": "one entry per agenda item (status = where it stands; plan = next steps).",
}

MEDICAL_CHUNK_SYSTEM = """You extract facts for the Minutes of a medical meeting (ICU handover) at Medpark hospital \
(Moldova) from one part of the transcript. Translate everything into {language}; write short phrases.

""" + GLOSSARY + """

List each patient discussed in this part, in order. A new patient starts when the speakers move to another bed \
or patient ('pacientul', 'patul'). {continuation}
- name: the bed number exactly as said (e.g. "Bed 9"), or "" if not said.
- status: diagnosis and current clinical state, at most 25 words.
- results: every lab value and every imaging (CT, echocardiography) or microbiology finding mentioned, with \
values (e.g. "creatinine 240, was 90", "CT: pleural fluid right 600 ml").
- medications: every drug mentioned, with what was decided (start, stop, increase, decrease, change or \
continue) and the current (latest) dose exactly as said, or "".
- procedures: interventions done or ordered (lines, scans, echocardiography, transfusion, ventilation, \
drains, stents).
- consults: specialists called or to be called; name only if said, else "".
- watch: what must be monitored or awaited; until = the time limit if said (e.g. "this evening"), else "".
- open_issues: unresolved questions in this part.
Use only what is said. Never invent values or names. Empty lists are fine."""

FINAL_SYSTEM = """You write the header of the Minutes of a {meeting_type} meeting at Medpark hospital, in \
{language}, from the facts already extracted below. Use only these facts.
- title: short, specific.
- summary: 2-3 sentences for a reader who missed the meeting.
- suggestions: at most 3 follow-ups the team may have overlooked, based only on these facts, at most \
15 words each.
Never add details that are not in the facts (no age, sex, diagnoses or numbers of your own)."""


def normalize(text: str) -> str:
    for pattern, replacement in MEDICAL_LEXICON:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


def _short_time(ts: str) -> str:
    """"00:02:57" -> "02:57" (saves tokens on every line); keeps the hour when there is one."""
    return ts[3:] if ts.startswith("00:") else ts


def format_line(start: str, speaker: str, text: str):
    """Normalized "[mm:ss] S2: text" line for the LLM, or None for an obvious repetition loop."""
    words = text.split()
    if len(words) >= 4 and len(set(w.strip(",.").lower() for w in words)) / len(words) < 0.3:
        return None  # "Viniște, viniște, viniște, ..." style hallucination
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


def _chat(model, system, user, schema, num_ctx=4096, num_thread=10, num_predict=900, retry=True,
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
    if model.startswith("qwen3"):
        body["think"] = False
    req = urllib.request.Request(OLLAMA_URL, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    t = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=3600) as resp:
            data = json.loads(resp.read())
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


def _bed(name: str) -> str:
    """Bed number in a topic name ("Bed 9" -> "9"), or "" if there is none."""
    digits = re.findall(r"\d+", name)
    return digits[0] if digits else ""


# Spoken numbers (Romanian, Russian) used to check a bed number the model claims was said.
NUMBER_WORDS = {
    "1": "unu|unul|una|один", "2": "doi|două|doua|два", "3": "trei|три", "4": "patru|четыре",
    "5": "cinci|пять", "6": "șase|sase|шесть", "7": "șapte|sapte|семь", "8": "opt|восемь",
    "9": "nouă|noua|девять", "10": "zece|десять", "11": "unsprezece", "12": "doisprezece",
    "13": "treisprezece", "14": "paisprezece", "15": "cincisprezece", "16": "șaisprezece",
    "17": "șaptesprezece", "18": "optsprezece", "19": "nouăsprezece", "20": "douăzeci",
}


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
    the second sample has is dropped, since its patient split cannot be trusted. Everything else is united
    and near-duplicates are removed.
    """
    out = {k: list(v) for k, v in a.items()}
    list_key = "topics" if "topics" in a else "patients"
    for mine, theirs in zip(out[list_key], b[list_key]):
        for field, value in theirs.items():
            if isinstance(value, list):
                mine[field] = mine[field] + [x for x in value if not any(_same(x, y) for y in mine[field])]
    for key in out:
        if key != list_key:
            out[key] += [x for x in b[key] if not any(_same(x, y) for y in out[key])]
    return out


def _same(x, y) -> bool:
    text = lambda v: " ".join(str(s) for s in v.values()) if isinstance(v, dict) else str(v)  # noqa: E731
    return _similar(text(x), text(y))


class MinutesBuilder:
    """Incremental minutes: feed transcript lines as they arrive, then finalize()."""

    def __init__(self, meeting_type="medical", model=DEFAULT_MODEL, language="English", num_thread=10,
                 verbose=True, final_model=None, slots=False, samples=2):
        self.meeting_type, self.model, self.language = meeting_type, model, language
        self.samples = max(1, min(samples, len(SAMPLE_TEMPERATURES) + 1))
        self.final_model = final_model or model
        # Per-patient slots (medications / consults / watch). Experimental: with gemma3:4b it catches stopped
        # drugs and named consultants but drops other facts, scoring below the generic schema overall.
        self.slots = slots and meeting_type == "medical"
        self.starts_new_topic = True  # the current buffer starts at a topic cue (or the meeting start)
        self.num_thread, self.verbose = num_thread, verbose
        self.buffer, self.buffer_words = [], 0
        self.topics, self.decisions, self.actions, self.issues = [], [], [], []
        self.warnings = []
        self.calls = []

    def add_line(self, line: str):
        words = len(line.split())
        text = line.split(":", 1)[-1]
        cue = bool(TOPIC_CUE.search(text))
        if self.buffer and (self.buffer_words + words > CHUNK_MAX_WORDS or
                            (self.buffer_words >= CHUNK_MIN_WORDS and cue)):
            self._flush()
            self.starts_new_topic = cue
        self.buffer.append(line)
        self.buffer_words += words

    def _flush(self):
        if not self.buffer:
            return
        self.continues = bool(self.topics) and not self.starts_new_topic
        # Only the name: given the previous status, small models copy it into this chunk's output.
        continuation = (f'This part starts in the middle of the discussion of "{self.topics[-1]["name"]}"; '
                        f'the first topic is that one (report only what is new in this part).'
                        if self.continues else "")
        medical = self.slots
        if medical:
            system = MEDICAL_CHUNK_SYSTEM.format(language=self.language, continuation=continuation)
        else:
            system = CHUNK_SYSTEM.format(meeting_type=self.meeting_type, language=self.language,
                                         topics_hint=TOPICS_HINT[self.meeting_type], continuation=continuation)
        user = "Transcript part:\n\n" + "\n".join(self.buffer)
        schema = MEDICAL_CHUNK_SCHEMA if medical else CHUNK_SCHEMA
        # Self-consistency: a small model misses a different random subset of facts on every run, so extra
        # samples at a higher temperature are merged in (union; duplicates are dropped by the merge step).
        # The samples are sent concurrently: with OLLAMA_NUM_PARALLEL >= samples they are decoded as one batch,
        # which on CPU costs little more than a single sample (decoding is memory-bandwidth bound).
        temperatures = (0.1,) + SAMPLE_TEMPERATURES[:self.samples - 1]
        t = time.perf_counter()
        with ThreadPoolExecutor(len(temperatures)) as pool:
            results = list(pool.map(lambda temp: _chat(self.model, system, user, schema, num_thread=self.num_thread,
                                                       temperature=temp), temperatures))
        part, stats = results[0]
        for extra, extra_stats in results[1:]:
            part = _union(part, extra)
            stats["output_tokens"] += extra_stats["output_tokens"]
        stats.update(step="map", wall=round(time.perf_counter() - t, 1), lines=len(self.buffer),
                     words=self.buffer_words, samples=self.samples)
        self.calls.append(stats)
        if self.verbose:
            print(f"  map {self.buffer[0].split()[0]}..{self.buffer[-1].split()[0]} {self.buffer_words} words: "
                  f"{stats['wall']}s ({stats['prompt_tokens']} in / {stats['output_tokens']} out)",
                  file=sys.stderr, flush=True)
        chunk_time = self.buffer[0][1:self.buffer[0].index("]")]
        if medical:
            self._merge_medical(part, chunk_time, self.buffer)
        else:
            self._merge(part, chunk_time, self.buffer)
        self.buffer, self.buffer_words = [], 0

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

    def _merge(self, part, chunk_time, lines):
        """Code decides patient identity: only a chunk cut in mid-discussion continues the previous entry.

        Topics are never merged by name: small models mislabel beds, and a wrong name is far less harmful
        than two patients merged into one. Item times come from the transcript line the item matches best;
        the model's own time (often missing or wrong) is only the fallback.
        """
        chunk_text = "\n".join(lines)
        src = _key_numbers(chunk_text)
        for i, t in enumerate(part["topics"]):
            status = self._check(t["status"], src, chunk_time)
            plan = [self._check(x, src, chunk_time) for x in t["plan"]]
            target = self.topics[-1] if i == 0 and self.continues else None
            if target is None:
                name = self._checked_name(t["name"], chunk_text) or f"Patient {len(self.topics) + 1}"
                self.topics.append({"name": name, "status": status, "plan": plan, "time": chunk_time})
                continue
            name = self._checked_name(t["name"], chunk_text)
            if name and target["name"].startswith("Patient "):
                target["name"] = name
            if status and not any(_similar(status, s) for s in target["status"].split("; ")):
                target["status"] += "; " + status
            target["plan"] += [x for x in plan if not any(_similar(x, y) for y in target["plan"])]
        for d in part["decisions"]:
            if not any(_similar(d, x["decision"]) for x in self.decisions):
                self.decisions.append({"decision": self._check(d, src, chunk_time),
                                       "time": _locate(d, lines, chunk_time)})
        for a in part["action_items"]:
            if not any(_similar(a["task"], x["task"]) for x in self.actions):
                self.actions.append({**a, "task": self._check(a["task"], src, chunk_time),
                                     "time": _locate(a["task"], lines, chunk_time)})
        self.issues += [x for x in part["open_issues"] if not any(_similar(x, y) for y in self.issues)]

    def _merge_medical(self, part, chunk_time, lines):
        """Turn the per-patient slots into topics, decisions and action items (linked to their patient)."""
        text = "\n".join(lines)
        src = _key_numbers(text)

        def item(s):  # number check + timestamp of the transcript line it comes from
            s = self._check(s, src, chunk_time)
            return s, _locate(s, lines, chunk_time)

        for i, p in enumerate(part["patients"]):
            if i == 0 and self.continues:
                idx = len(self.topics) - 1
                name = self._checked_name(p["name"], text)
                if name and self.topics[idx]["name"].startswith("Patient "):
                    self.topics[idx]["name"] = name
            else:
                name = self._checked_name(p["name"], text) or f"Patient {len(self.topics) + 1}"
                self.topics.append({"name": name, "status": "", "plan": [], "time": chunk_time})
                idx = len(self.topics) - 1
            topic = self.topics[idx]
            status = p["status"].strip().rstrip(".")
            status += f". Results: {'; '.join(p['results'])}." if p["results"] else ("." if status else "")
            status, _ = item(status)
            if status and not any(_similar(status, s) for s in topic["status"].split("; ") if s):
                topic["status"] = f"{topic['status']}; {status}" if topic["status"] else status

            def add(task, decision=False, owner="ICU team", deadline="Not specified", priority="high",
                    plan_only=False):
                task, t = item(task)
                if not any(_similar(task, x) for x in topic["plan"]):
                    topic["plan"].append(task)
                if plan_only:
                    return
                target = self.decisions if decision else self.actions
                key = "decision" if decision else "task"
                if any(_similar(task, x[key]) and x["_topic"] == idx for x in target):
                    return
                entry = {key: task, "time": t, "_topic": idx}
                if not decision:
                    entry.update(owner=owner, deadline=deadline, priority=priority)
                target.append(entry)

            for m in p["medications"]:
                dose = m["dose"].strip()
                dose = f" {dose}" if dose and dose not in m["drug"] else ""
                unchanged = m["action"] == "continue"  # plan only: not a decision, not a new task
                add(f"{m['action'].capitalize()} {m['drug'].strip()}{dose}", decision=True, plan_only=unchanged)
            for proc in p["procedures"]:
                add(proc[:1].upper() + proc[1:])
            for c in p["consults"]:
                who = f"{c['specialist'].strip()} {c['name'].strip()}".strip()
                add(f"Consult {who}", owner=who, priority="medium")
            for w in p["watch"]:
                what, until = re.sub(r"^(monitor\w*\s*)+", "", w["what"].strip(), flags=re.I), w["until"].strip()
                if len(re.findall(r"\w{3,}", what)) < 1:  # "Monitor monitor" style filler
                    continue
                add(f"Monitor {what}", deadline=until or "Not specified",
                    priority="high" if until else "medium")
        self.issues += [x for x in part["open_issues"] if not any(_similar(x, y) for y in self.issues)]

    def _facts_text(self) -> str:
        """Merged facts as compact text for the finalize call (statuses, decisions, open issues only)."""
        out = ["Topics:"] + [f"- {t['name']}: {t['status']}" for t in self.topics]
        out += ["Decisions:"] + [f"- {d['decision']}" + (f" ({d['patient']})" if d.get("patient") else "")
                                 for d in self.decisions]
        out += ["Open issues:"] + [f"- {i}" for i in self.issues]
        return "\n".join(out)

    def _key_moments(self, limit=5) -> list:
        """Most important moments, chosen in code from what the chunk extraction already rated.

        Selecting (instead of letting the LLM rewrite) keeps them traceable and saves ~25 s on CPU.
        """
        rank = {"high": 0, "medium": 1, "low": 2}
        items = sorted(self.actions, key=lambda a: rank.get(a["priority"], 3))
        def who(x):
            return f" — {x['patient']}" if x.get("patient") else ""

        picked = [{"time": a["time"], "moment": a["task"] + who(a)} for a in items if a["priority"] == "high"]
        picked += [{"time": d["time"], "moment": d["decision"] + who(d)} for d in self.decisions]
        moments = []
        for m in picked:
            if not any(_similar(m["moment"], x["moment"]) for x in moments):
                moments.append(m)
        return sorted(moments[:limit], key=lambda m: m["time"])

    def finalize(self) -> dict:
        system = FINAL_SYSTEM.format(meeting_type=self.meeting_type, language=self.language)
        if self.topics and self.buffer:
            # The header (title / summary / suggestions) is written from everything before the last chunk,
            # concurrently with extracting that last chunk (needs OLLAMA_NUM_PARALLEL >= samples + 1). The last
            # minutes are usually wrap-up, and key moments / tables below still include them.
            facts = self._facts_text()
            with ThreadPoolExecutor(1) as pool:
                header = pool.submit(_chat, self.final_model, system, facts, FINAL_SCHEMA,
                                     num_thread=self.num_thread, num_predict=400)
                self._flush()
                head, stats = header.result()
        else:
            self._flush()
            head, stats = _chat(self.final_model, system, self._facts_text(), FINAL_SCHEMA,
                                num_thread=self.num_thread, num_predict=400)
        for entry in self.decisions + self.actions:  # patients can be renamed after an item was recorded
            if "_topic" in entry:
                entry["patient"] = self.topics[entry.pop("_topic")]["name"]
        stats["step"] = "finalize"
        self.calls.append(stats)
        if self.verbose:
            print(f"  finalize: {stats['wall']}s ({stats['prompt_tokens']} in / {stats['output_tokens']} out)",
                  file=sys.stderr, flush=True)
        return {**head, "key_moments": self._key_moments(), "topics": self.topics, "decisions": self.decisions,
                "action_items": self.actions, "open_issues": self.issues, "warnings": self.warnings}


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
        out += [f"### {t['name']}  `{t['time']}`", f"**Status:** {t['status']}"]
        if t["plan"]:
            out += ["", "**Plan:**"] + [f"- {p}" for p in t["plan"]]
        out.append("")
    out += ["## Decisions"] + [f"- `{d['time']}` {d['decision']}" + (f" — {d['patient']}" if d.get("patient")
                                                                       else "") for d in m["decisions"]]
    by_patient = any(a.get("patient") for a in m["action_items"])
    head = "| # | Task |" + (" Patient |" if by_patient else "") + " Owner | Deadline | Priority | Time |"
    out += ["", "## Action items", head, "|---" * head.count(" |") + "|"]
    order = {"high": 0, "medium": 1, "low": 2}
    for i, a in enumerate(sorted(m["action_items"], key=lambda a: order.get(a["priority"], 3)), 1):
        patient = f" {a.get('patient', '')} |" if by_patient else ""
        out.append(f"| {i} | {a['task']} |{patient} {a['owner']} | {a['deadline']} | {a['priority']} | {a['time']} |")
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
    p.add_argument("--slots", action="store_true", help="medical: experimental per-patient slot extraction")
    p.add_argument("--samples", type=int, default=2,
                   help="extractions per chunk merged together (1-3); more = better recall, slower")
    p.add_argument("--language", default="English")
    p.add_argument("--threads", type=int, default=10)
    p.add_argument("--out", type=str, help="output path prefix (writes .json, .md, .meta.json)")
    args = p.parse_args()

    t0 = time.perf_counter()
    builder = MinutesBuilder(args.type, args.model, args.language, args.threads, final_model=args.final_model,
                             slots=args.slots, samples=args.samples)
    for line in parse_dialog(args.dialog):
        builder.add_line(line)
    t_before_last = time.perf_counter()
    last_chunk_calls = len(builder.calls)
    minutes = builder.finalize()
    total = time.perf_counter() - t0
    # With live transcription, everything except the last chunk and finalize runs during the meeting.
    after_end = time.perf_counter() - t_before_last
    stats = {"model": args.model, "final_model": builder.final_model, "total_seconds": round(total, 1),
             "seconds_after_transcript_end": round(after_end, 1), "map_calls": last_chunk_calls + 1,
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
