"""Meeting processing: one worker thread takes meetings from a queue, one at a time (the models fill the GPU and
RAM), and runs the speech pipeline: audio -> transcript with speakers (in a child process) -> draft minutes."""
import json
import logging
import os
import queue
import shutil
import signal
import subprocess
import sys
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Protocol

from sqlalchemy import select, update
from sqlalchemy.orm import sessionmaker

from stt.config import ROOT, overlap_minutes

from .config import Config
from .db import Meeting, Minutes, Transcript, utcnow
from .schemas import minutes_doc
from .settings import load_settings
from .transcribe import ProcessingError, readable_error

log = logging.getLogger(__name__)

UNFINISHED = ("queued", "processing")
MAX_ATTEMPTS = 2  # processing runs a restart may interrupt before the meeting is failed instead of retried
RETENTION_CHECK_S = 3600
ORPHAN_AGE_S = 3600  # an audio file no meeting refers to (a crashed upload) is deleted after this
STOP_WAIT_S = 5
INTERRUPTED = "Processing was interrupted by a server restart. Upload the recording again."
STAGE_MESSAGES = {"queued": "Waiting in the queue", "converting": "Converting the audio",
                  "transcribing": "Transcribing", "speakers": "Finding the speakers",
                  "minutes": "Writing the minutes", "done": "Done"}


@dataclass
class Transcription:
    language: str
    utterances: list[dict]  # {"start", "end", "speaker", "languages", "accent", "text"}
    minutes: dict | None = None  # when written during the transcription


class Pipeline(Protocol):
    def transcribe(self, audio: Path, settings: dict, on_progress: Callable,
                   meeting_type: str | None = None) -> Transcription: ...

    def minutes(self, transcription: Transcription, meeting_type: str, settings: dict) -> dict: ...

    def cancel(self):
        """Stops a transcription that is running (the server is stopping)."""


class SttPipeline:
    """The real speech pipeline (stt/): the transcription runs in a child process (server/transcribe.py) that
    frees its GPU memory when it exits. Given the meeting type, the child also writes the minutes while it
    transcribes (the local LLM through Ollama); minutes() is the fallback here. The child's temporary files (the
    decoded recording) go to temp_dir, which the JobRunner empties. The child leads a process group with all it
    starts (whisper-server with its ~3 GB model, ffmpeg): nothing of it outlives the transcription."""

    def __init__(self, temp_dir: Path):
        self.temp_dir = temp_dir
        self._child: subprocess.Popen | None = None
        self._lock = threading.Lock()  # the group is killed only before the child is reaped: then its id is free

    def transcribe(self, audio: Path, settings: dict, on_progress: Callable,
                   meeting_type: str | None = None) -> Transcription:
        command = [sys.executable, "-m", "server.transcribe", str(audio), f"--engine={settings['asr_engine']}",
                   f"--model={settings['asr_model']}", f"--language={settings['language']}"]
        if settings.get("max_duration_min"):  # enforced while decoding too, in case the file lies about its length
            command.append(f"--max-seconds={settings['max_duration_min'] * 60}")
        if meeting_type and overlap_minutes():  # else the minutes are written here, after the child freed its memory
            command += [f"--minutes={meeting_type}", f"--llm={settings['llm_model']}"]
        result, error = None, None
        # stdin stays open (the child exits when it closes); stderr gets every transcript line: discarded.
        with subprocess.Popen(command, cwd=ROOT, env={**os.environ, "TMPDIR": str(self.temp_dir)},
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
                              encoding="utf-8", start_new_session=True) as child:
            with self._lock:
                self._child = child
            try:
                for line in child.stdout:
                    message = json.loads(line)
                    if "progress" in message:
                        on_progress(*message["progress"])
                    elif "error" in message:
                        log.error("Transcription failed: %s", message["trace"])
                        error = message["error"]
                    else:
                        result = message["result"]
            finally:
                with self._lock:
                    self._child = None
                    _kill_group(child)  # what a crashed child left running
        if error or result is None:
            raise ProcessingError(error or f"The transcription stopped unexpectedly (exit code {child.returncode})")
        return Transcription(result["language"], result["utterances"], result.get("minutes"))

    def cancel(self):
        """Kills the running transcription and everything it started."""
        with self._lock:
            if self._child is not None:
                _kill_group(self._child)

    def minutes(self, transcription: Transcription, meeting_type: str, settings: dict) -> dict:
        from stt.pipeline import meeting_minutes
        from stt.speakers.dialog import Utterance

        dialog = [Utterance(u["start"], u["end"], u["speaker"], u["text"]) for u in transcription.utterances]
        return meeting_minutes(dialog, meeting_type, settings["llm_model"])


class JobRunner:
    """The queue and its worker thread; progress, timings and errors go into the Meeting row."""

    def __init__(self, db: sessionmaker, config: Config, pipeline: Pipeline):
        self.db, self.config, self.pipeline = db, config, pipeline
        self.queue: queue.Queue[str | None] = queue.Queue()
        self.thread = threading.Thread(target=self._run, name="meeting-jobs", daemon=True)
        self.stopping = threading.Event()

    def start(self):
        _empty(self.config.temp_dir)  # what a transcription interrupted by a stop or crash left behind
        self._recover()
        self.thread.start()

    def stop(self):
        """Stops the worker and kills a transcription that is running; its meeting stays processing and is picked
        up again at the next start."""
        if self.thread.is_alive():
            self.stopping.set()
            self.queue.put(None)
            self.pipeline.cancel()
            self.thread.join(timeout=STOP_WAIT_S)

    def submit(self, meeting_id: str):
        self.queue.put(meeting_id)

    def _run(self):
        self._purge_audio()
        while True:
            try:
                meeting_id = self.queue.get(timeout=RETENTION_CHECK_S)
            except queue.Empty:
                self._purge_audio()
                continue
            if meeting_id is None or self.stopping.is_set():
                return
            try:
                self._process(meeting_id)
                self._purge_audio()
            except Exception:  # a database error must not stop the worker
                log.exception("Job for meeting %s failed", meeting_id)

    def _process(self, meeting_id: str):
        with self.db() as db:
            meeting = db.get(Meeting, meeting_id)
            if meeting is None or meeting.status != "queued":
                return  # deleted while it waited
            meeting.status, meeting.attempts, meeting.error = "processing", meeting.attempts + 1, None
            _set_progress(meeting, "converting")
            audio = self.config.audio_dir / meeting.audio_file if meeting.audio_file else None
            meeting_type, settings = meeting.meeting_type, load_settings(db)
            db.commit()
        log.info("Processing meeting %s", meeting_id)
        started = time.perf_counter()
        try:
            if audio is None or not audio.is_file():
                raise ProcessingError("The recording is missing")
            ready = []  # when the transcript was done (the child then finishes the minutes)

            def progress(stage, done=0, total=0):
                if stage == "minutes":
                    ready.append(time.perf_counter())
                self._progress(meeting_id, stage, done, total)

            transcription = self.pipeline.transcribe(audio, settings, progress, meeting_type)
            transcribed = ready[0] if ready else time.perf_counter()
            self._save_transcript(meeting_id, transcription, transcribed - started)
            if transcription.minutes is not None:
                minutes = minutes_doc(transcription.minutes)
            elif transcription.utterances:
                minutes = minutes_doc(self.pipeline.minutes(transcription, meeting_type, settings))
            else:  # nothing for the LLM to summarize: it would invent minutes
                minutes = minutes_doc({"title": "No speech detected",
                                       "summary": "The recording contains no speech that could be transcribed.",
                                       "warnings": ["No speech was detected in the recording."]})
            finished = time.perf_counter()
            self._save_minutes(meeting_id, minutes, finished - transcribed, finished - started)
            log.info("Meeting %s ready in %.1f s", meeting_id, finished - started)
        except Exception as e:
            if self.stopping.is_set():
                log.info("Meeting %s was interrupted by the server stopping", meeting_id)
            else:
                log.exception("Meeting %s failed", meeting_id)
                self._fail(meeting_id, readable_error(e))
        finally:
            _empty(self.config.temp_dir)  # a killed child (out of memory) can't clean up after itself

    def _progress(self, meeting_id: str, stage: str, done: int = 0, total: int = 0):
        with self.db() as db:
            db.execute(update(Meeting).where(Meeting.id == meeting_id).values(
                progress_stage=stage, progress_done=done, progress_total=total,
                progress_message=_progress_message(stage, done, total)))
            db.commit()

    def _save_transcript(self, meeting_id: str, transcription: Transcription, seconds: float):
        with self.db() as db:
            meeting = db.get(Meeting, meeting_id)
            db.merge(Transcript(meeting_id=meeting_id, language=transcription.language,
                                utterances=transcription.utterances))
            meeting.language = transcription.language or None
            if meeting.duration_s is None and transcription.utterances:  # the container had no duration
                meeting.duration_s = round(max(u["end"] for u in transcription.utterances), 1)
            meeting.transcription_s = round(seconds, 1)
            _set_progress(meeting, "minutes")
            db.commit()

    def _save_minutes(self, meeting_id: str, minutes: dict, minutes_s: float, total_s: float):
        with self.db() as db:
            meeting = db.get(Meeting, meeting_id)
            db.merge(Minutes(meeting_id=meeting_id, draft=minutes))
            meeting.status = "ready"
            meeting.minutes_s, meeting.total_s = round(minutes_s, 1), round(total_s, 1)
            _set_progress(meeting, "done")
            db.commit()

    def _fail(self, meeting_id: str, error: str):
        with self.db() as db:
            meeting = db.get(Meeting, meeting_id)
            if meeting is not None:
                meeting.status, meeting.error, meeting.progress_message = "failed", error, "Failed"
                db.commit()

    def _recover(self):
        """Requeues the meetings a restart interrupted (their audio is still there); fails the others."""
        with self.db() as db:
            stuck = db.scalars(select(Meeting).where(Meeting.status.in_(UNFINISHED)).order_by(Meeting.created_at))
            for meeting in stuck:
                audio_kept = meeting.audio_file and (self.config.audio_dir / meeting.audio_file).is_file()
                if audio_kept and meeting.attempts < MAX_ATTEMPTS:
                    meeting.status = "queued"
                    _set_progress(meeting, "queued")
                    self.queue.put(meeting.id)
                else:
                    meeting.status, meeting.error, meeting.progress_message = "failed", INTERRUPTED, "Failed"
            db.commit()

    def _purge_audio(self):
        """Deletes the recordings of processed meetings older than keep_audio_days (0: all of them), and audio
        files no meeting refers to."""
        with self.db() as db:
            cutoff = utcnow() - timedelta(days=load_settings(db)["keep_audio_days"])
            kept = set()
            for meeting in db.scalars(select(Meeting).where(Meeting.audio_file.is_not(None))):
                if meeting.status in UNFINISHED or meeting.created_at > cutoff:
                    kept.add(meeting.audio_file)
                else:
                    (self.config.audio_dir / meeting.audio_file).unlink(missing_ok=True)
                    meeting.audio_file = None
            db.commit()
        for path in self.config.audio_dir.iterdir():
            if path.name not in kept and time.time() - path.stat().st_mtime > ORPHAN_AGE_S:
                path.unlink(missing_ok=True)


def _kill_group(child: subprocess.Popen):
    """Kills the child and everything it started: it leads their process group."""
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):  # all gone; macOS says EPERM while the child isn't reaped
        pass


def _empty(folder: Path):
    """Deletes everything in folder."""
    for path in folder.iterdir():
        if path.is_dir() and not path.is_symlink():
            shutil.rmtree(path, ignore_errors=True)
        else:
            path.unlink(missing_ok=True)


def _set_progress(meeting: Meeting, stage: str):
    meeting.progress_stage, meeting.progress_done, meeting.progress_total = stage, 0, 0
    meeting.progress_message = _progress_message(stage)


def _progress_message(stage: str, done: int = 0, total: int = 0) -> str:
    message = STAGE_MESSAGES.get(stage, stage.capitalize())
    return f"{message} {done}/{total}" if total else message
