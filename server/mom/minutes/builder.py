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

  python -m mom.minutes data/Medpark_dialog.txt --type medical --out out/Medpark
"""
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor

from ..config import MINUTES_MODEL as DEFAULT_MODEL
from ..llm.ollama import chat
from .cues import CHUNK_MAX_WORDS, CHUNK_MIN_WORDS, TOPIC_CUE, TOPIC_MIN_WORDS, bed_number, cue_name, number_said
from .matching import ACTION, UNCHANGED, clean_item, key_numbers, locate, overlaps, similar, union
from .prompts import CHUNK_SCHEMA, CHUNK_SYSTEM, FINAL_SCHEMA, FINAL_SYSTEM, HINTS
from .transcript import SENTENCE

MAX_IN_FLIGHT = 2  # chunks sent to Ollama at once: 1.4x faster on an M4 with OLLAMA_NUM_PARALLEL=2, 4 is slower
SAMPLE_TEMPERATURES = (0.6, 0.9)  # extra self-consistency samples after the first one at 0.1


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
            name = cue_name(sentence)
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
            part = union(part, extra)
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
        missing = sorted(key_numbers(text) - source_numbers)
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
        bed = bed_number(name)
        if not bed:
            return "" if self.meeting_type == "medical" else name
        return name if number_said(bed, chunk_text) else ""

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
        src = key_numbers(chunk_text)

        def checked(text):
            text = clean_item(text)
            return text and self._check(text, src, chunk_time)

        for i, t in enumerate(part["topics"]):
            idx = self._topic_for(i, t, continues, cue_name, chunk_text, chunk_time)
            topic = self.topics[idx]
            status = checked(t["status"]).rstrip(".")
            if status and not any(similar(status, s) for s in topic["status"].split("; ") if s):
                topic["status"] = f"{topic['status']}; {status}" if topic["status"] else status
            for f in map(checked, t["findings"]):
                if f and not any(similar(f, x) for x in topic["findings"]):
                    topic["findings"].append(f)
            for d in map(checked, t["decisions"]):
                if d and not any(similar(d, x["decision"]) for x in self.decisions if x["_topic"] == idx):
                    self.decisions.append({"decision": d, "time": locate(d, lines, chunk_time), "_topic": idx})
            for a in t["tasks"]:
                task = checked(a["task"])
                if task and not any(similar(task, x["task"]) for x in self.actions if x["_topic"] == idx):
                    self.actions.append({"task": task, "owner": clean_item(a["owner"]) or self.default_owner,
                                         "deadline": clean_item(a["deadline"]) or "Not specified",
                                         "priority": a["priority"], "time": locate(task, lines, chunk_time),
                                         "_topic": idx})
            for o in map(clean_item, t["open"]):
                if o and not UNCHANGED.match(o) and not any(similar(o, x["issue"]) for x in self.issues):
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
                if (rnd == 0 and patient in seen) or any(similar(text, m["moment"]) for m in picked):
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
        known = [i["issue"] for i in self.issues] + [a["task"] for a in self.actions]
        suggestions = [x for x in map(clean_item, head["suggestions"]) if x and not any(overlaps(x, k) for k in known)]
        return {**head, "suggestions": suggestions,
                "key_moments": self._key_moments(), "topics": self.topics, "decisions": self.decisions,
                "action_items": self.actions,
                "open_issues": [f"{i['patient']}: {i['issue']}" for i in self.issues], "warnings": self.warnings}
