"""Processing meetings in the background: one at a time (Whisper and pyannote need the whole GPU), in order.

For each meeting the runner keeps a live JobState (stages, transcript lines so far, topics found) that the
progress endpoint reads, and writes into the meeting's folder:
  source.<ext>       the uploaded recording
  transcript.json    the dialog (start / end / speaker / text), saved before the minutes are started
  dialog.txt         the same as text, as `python -m mom dialog` writes it
  minutes.raw.json   the minutes as `mom` wrote them;  speakers.json  the speaker roles
  minutes.json       the editable document (schemas.MinutesDoc)
"""
import json
import os
import sys
import threading
import time
import traceback
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from mom.dialog import Utterance, to_text

from .convert import minutes_doc
from .db import Store
from .schemas import MinutesDoc
from .settings import Settings

STAGES = ("upload", "convert", "speakers", "transcribe", "minutes")


def write_json(path: Path, data):
    """Write atomically: a reader never sees half a file."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


class JobState:
    """What the progress endpoint shows while a meeting is queued or processing."""

    def __init__(self, stages: list = None):
        self.lock = threading.Lock()
        self.stages = {n: {"name": n, "state": "waiting"} for n in STAGES}
        for s in stages or []:  # a retry keeps the stages that were done (e.g. the transcript)
            if s["state"] in ("done", "skipped"):
                self.stages[s["name"]] = dict(s)
        self.stages["upload"]["state"] = "done"
        self.lines, self.topics, self.total = [], 0, None
        self._started = {}

    def stage(self, name: str, state: str, seconds: float = None, at: float = None, total: float = None,
              count: int = None, **_):
        with self.lock:
            s = self.stages[name]
            if state == "running" and name not in self._started:
                self._started[name] = time.perf_counter()
            if state in ("done", "failed") and seconds is None and name in self._started:
                seconds = round(time.perf_counter() - self._started[name], 1)
            s["state"] = state
            if total:
                self.total = total
            if seconds is not None:
                s["seconds"] = seconds
            if at is not None and total:
                s["percent"] = min(100.0, round(100 * at / total, 1))
            if state == "done" and name == "transcribe":
                s["percent"] = 100.0
            if count is not None:
                s["detail"] = f"{count} speaker{'s' if count != 1 else ''}"

    def line(self, u):
        with self.lock:
            self.lines.append({"start": u.start, "end": u.end, "speaker": u.speaker, "text": u.text})

    def fail_running(self):
        with self.lock:
            running = [s for s in self.stages.values() if s["state"] == "running"]
        for s in running:
            self.stage(s["name"], "failed")

    def snapshot(self, after: int = 0) -> dict:
        with self.lock:
            return {"stages": [dict(s) for s in self.stages.values()], "lines": self.lines[after:],
                    "next_line": len(self.lines), "topics": self.topics}


class JobRunner:
    def __init__(self, store: Store, settings: Settings, pipeline):
        self.store, self.settings, self.pipeline = store, settings, pipeline
        self.queue, self.jobs, self.current = deque(), {}, None
        self.cv = threading.Condition()
        threading.Thread(target=self._loop, name="meeting-jobs", daemon=True).start()

    def recover(self):
        """After a restart: a meeting that was processing failed with it; queued ones are queued again."""
        for m in self.store.meetings(["processing"]):
            self.store.update_meeting(m["id"], status="failed", error="The server restarted during processing.")
        for m in reversed(self.store.meetings(["queued"])):
            self.submit(m["id"])

    def submit(self, meeting_id: int, minutes_only: bool = False):
        with self.cv:
            stages = None
            if minutes_only:
                stages = (self.store.meeting(meeting_id) or {}).get("stages")
            self.jobs[meeting_id] = JobState(stages)
            self.queue.append((meeting_id, minutes_only))
            self.store.update_meeting(meeting_id, status="queued", error=None)
            self.cv.notify_all()

    def queue_position(self, meeting_id: int):
        """1 = next after the one processing now; None when it is not waiting."""
        with self.cv:
            ids = [m for m, _ in self.queue]
            return ids.index(meeting_id) + 1 if meeting_id in ids else None

    def state(self, meeting_id: int):
        return self.jobs.get(meeting_id)

    def busy(self, meeting_id: int) -> bool:
        with self.cv:
            return self.current == meeting_id or any(m == meeting_id for m, _ in self.queue)

    def wait_idle(self, timeout: float = 10) -> bool:
        """For tests: wait until nothing is queued or running."""
        with self.cv:
            return self.cv.wait_for(lambda: not self.queue and self.current is None, timeout)

    def _loop(self):
        while True:
            with self.cv:
                self.cv.wait_for(lambda: self.queue)
                meeting_id, minutes_only = self.queue.popleft()
                self.current = meeting_id
            try:
                self._run(meeting_id, minutes_only)
            finally:
                with self.cv:
                    self.current = None
                    self.cv.notify_all()

    def _run(self, meeting_id: int, minutes_only: bool):
        meeting = self.store.meeting(meeting_id)
        if not meeting:
            return
        folder, job = self.settings.meeting_dir(meeting_id), self.jobs[meeting_id]
        mtype = meeting["type"]
        self.store.update_meeting(meeting_id, status="processing")
        try:
            if minutes_only:
                utterances = [Utterance(**u) for u in read_json(folder / "transcript.json")]
                session = self.pipeline.minutes(mtype)
                job.stage("minutes", "running")
                for u in utterances:
                    session.feed(u)
            else:
                session = self.pipeline.minutes(mtype)

                def on_utterance(u):
                    if job.stages["minutes"]["state"] == "waiting":
                        job.stage("minutes", "running")
                    session.feed(u)
                    job.line(u)
                    job.topics = session.topic_count()

                def progress(stage, state, **info):
                    job.stage(stage, state, **info)
                    if stage == "convert" and state == "done" and info.get("total"):
                        self.store.update_meeting(meeting_id, duration=info["total"])  # list shows the length

                utterances = self.pipeline.transcribe(folder / meeting["source"], meeting["language"],
                                                      meeting["speakers"], on_utterance, progress)
                # Saved before the minutes: the transcript is never lost when the LLM step fails.
                write_json(folder / "transcript.json", [u.__dict__ for u in utterances])
                (folder / "dialog.txt").write_text(to_text(utterances) + "\n", encoding="utf-8")
                self.store.update_meeting(meeting_id, duration=job.total)
                job.stage("minutes", "running")

            roles_file = folder / "speakers.json"
            with ThreadPoolExecutor(1) as pool:
                # One short LLM call, run while the minutes are finished (Ollama serves both at once).
                roles = pool.submit(self.pipeline.roles, utterances, mtype) if not roles_file.exists() else None
                minutes = session.finish()
                minutes["participants"] = roles.result() if roles else read_json(roles_file)
            write_json(roles_file, minutes["participants"])
            write_json(folder / "minutes.raw.json", minutes)
            doc = MinutesDoc.model_validate(minutes_doc(minutes, mtype))
            # The moderator's title wins; the AI's is used only when none was given at upload.
            title = doc.title.strip() if meeting["title_auto"] and doc.title.strip() else meeting["title"]
            doc.title = title
            write_json(folder / "minutes.json", doc.model_dump(by_alias=True))
            job.topics = len(doc.topics)
            job.stage("minutes", "done")
            self.store.update_meeting(meeting_id, status="draft", topic_count=len(doc.topics), title=title,
                                      title_auto=0, stages=job.snapshot()["stages"])
        except Exception as e:  # noqa: BLE001 - any failure ends this job, never the runner
            traceback.print_exc(file=sys.stderr)
            job.fail_running()
            message = (str(e).strip().splitlines() or [type(e).__name__])[0][:300]
            self.store.update_meeting(meeting_id, status="failed", error=message, stages=job.snapshot()["stages"])
