"""Meetings: upload a recording (moderators), list them, follow the processing, retry, delete."""
import re
import shutil
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..db import Store
from ..deps import current_user, get_runner, get_settings, get_store, moderator
from ..jobs import JobRunner
from ..schemas import Language, Meeting, MeetingType, Progress, RedoIn
from ..settings import Settings

router = APIRouter(prefix="/meetings", tags=["meetings"])

AUDIO_SUFFIXES = {".wav", ".mp3", ".m4a", ".mp4", ".ogg", ".oga", ".opus", ".webm", ".flac", ".aac", ".mov"}
READY = ("draft", "approved")  # what participants can open
CHUNK = 1024 * 1024


def meeting_out(m: dict, runner: JobRunner, settings: Settings) -> Meeting:
    progress = None
    if m["status"] == "processing" and (job := runner.state(m["id"])):
        stages = {s["name"]: s for s in job.snapshot(after=10 ** 9)["stages"]}
        progress = stages["transcribe"].get("percent")
    return Meeting(
        **{k: m[k] for k in ("id", "title", "type", "language", "speakers", "status", "error", "duration",
                             "topic_count", "created", "approved")},
        created_by=m["created_by_name"], approved_by=m["approved_by_name"],
        has_transcript=(settings.meeting_dir(m["id"]) / "transcript.json").exists(),
        queue_position=runner.queue_position(m["id"]), progress=progress)


def get_meeting(meeting_id: int, user: dict, store: Store) -> dict:
    """The meeting, if this user may see it (participants: minutes that are ready, of meetings they attended)."""
    m = store.meeting(meeting_id)
    if not m or ("moderator" not in user["cabinets"]
                 and (m["status"] not in READY or not store.is_attendee(meeting_id, user["id"]))):
        raise HTTPException(404, "Meeting not found")
    return m


@router.get("", response_model=list[Meeting])
def list_meetings(user: dict = Depends(current_user), store: Store = Depends(get_store),
                  runner: JobRunner = Depends(get_runner), settings: Settings = Depends(get_settings)):
    if "moderator" in user["cabinets"]:
        found = store.meetings()
    else:
        found = store.meetings(READY, attendee=user["id"])
    return [meeting_out(m, runner, settings) for m in found]


@router.post("", response_model=Meeting, status_code=201)
def create_meeting(file: UploadFile = File(...), title: str = Form("", max_length=200),
                   type: MeetingType = Form(...), language: Language = Form("auto"),
                   speakers: Optional[int] = Form(None, ge=1, le=20),
                   user: dict = Depends(moderator), store: Store = Depends(get_store),
                   runner: JobRunner = Depends(get_runner), settings: Settings = Depends(get_settings)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in AUDIO_SUFFIXES:
        raise HTTPException(415, f"Unsupported file type {suffix or '(none)'}; use "
                                 + ", ".join(sorted(AUDIO_SUFFIXES)))
    # No title given: a placeholder until the minutes are written, then the title the AI gives them.
    auto = not title.strip()
    title = title.strip() or f"{type.capitalize()} meeting — {time.strftime('%d.%m.%Y')}"
    meeting_id = store.add_meeting(title=title, title_auto=int(auto), type=type, language=language,
                                   speakers=speakers, source="source" + suffix, status="queued",
                                   created_by=user["id"])
    folder = settings.meeting_dir(meeting_id)
    folder.mkdir(parents=True, exist_ok=True)
    limit, size = settings.max_upload_mb * CHUNK, 0
    try:
        with open(folder / ("source" + suffix), "wb") as out:
            while chunk := file.file.read(CHUNK):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"The recording is larger than {settings.max_upload_mb} MB")
                out.write(chunk)
        if size == 0:
            raise HTTPException(400, "The recording is empty")
    except HTTPException:
        shutil.rmtree(folder, ignore_errors=True)
        store.delete_meeting(meeting_id)
        raise
    runner.submit(meeting_id)
    return meeting_out(store.meeting(meeting_id), runner, settings)


@router.get("/{meeting_id}", response_model=Meeting)
def read_meeting(meeting_id: int, user: dict = Depends(current_user), store: Store = Depends(get_store),
                 runner: JobRunner = Depends(get_runner), settings: Settings = Depends(get_settings)):
    return meeting_out(get_meeting(meeting_id, user, store), runner, settings)


@router.get("/{meeting_id}/progress", response_model=Progress)
def progress(meeting_id: int, after: int = 0, _: dict = Depends(moderator), store: Store = Depends(get_store),
             runner: JobRunner = Depends(get_runner)):
    m = store.meeting(meeting_id)
    if not m:
        raise HTTPException(404, "Meeting not found")
    job = runner.state(meeting_id)
    if job:
        snap = job.snapshot(max(after, 0))
    else:  # finished before the server (re)started: only the stored stage times
        stages = m["stages"] or [{"name": n, "state": "done" if m["status"] in READY else "waiting"}
                                 for n in ("upload", "convert", "speakers", "transcribe", "minutes")]
        snap = {"stages": stages, "lines": [], "next_line": 0, "topics": m["topic_count"] or 0}
    return Progress(status=m["status"], error=m["error"], queue_position=runner.queue_position(meeting_id), **snap)


@router.post("/{meeting_id}/retry", response_model=Meeting)
def retry(meeting_id: int, _: dict = Depends(moderator), store: Store = Depends(get_store),
          runner: JobRunner = Depends(get_runner), settings: Settings = Depends(get_settings)):
    m = store.meeting(meeting_id)
    if not m:
        raise HTTPException(404, "Meeting not found")
    if m["status"] != "failed":
        raise HTTPException(409, "Only a failed meeting can be retried")
    # With the transcript already saved, only the minutes are made again.
    runner.submit(meeting_id, minutes_only=(settings.meeting_dir(meeting_id) / "transcript.json").exists())
    return meeting_out(store.meeting(meeting_id), runner, settings)


@router.post("/{meeting_id}/redo-minutes", response_model=Meeting)
def redo_minutes(meeting_id: int, body: RedoIn, _: dict = Depends(moderator), store: Store = Depends(get_store),
                 runner: JobRunner = Depends(get_runner), settings: Settings = Depends(get_settings)):
    """Make the minutes again from the saved transcript, e.g. with the right meeting type. The moderator's edits
    to the minutes are replaced; attendees and the next meeting are kept."""
    m = store.meeting(meeting_id)
    if not m:
        raise HTTPException(404, "Meeting not found")
    if m["status"] not in ("draft", "failed"):
        raise HTTPException(409, "Only draft or failed minutes can be made again")
    folder = settings.meeting_dir(meeting_id)
    if not (folder / "transcript.json").exists():
        raise HTTPException(409, "There is no transcript yet; use Retry")
    if body.type != m["type"]:
        (folder / "speakers.json").unlink(missing_ok=True)  # the roles are guessed for the meeting type
    store.update_meeting(meeting_id, type=body.type)
    runner.submit(meeting_id, minutes_only=True)
    return meeting_out(store.meeting(meeting_id), runner, settings)


@router.delete("/{meeting_id}", status_code=204)
def delete(meeting_id: int, _: dict = Depends(moderator), store: Store = Depends(get_store),
           runner: JobRunner = Depends(get_runner), settings: Settings = Depends(get_settings)):
    if not store.meeting(meeting_id):
        raise HTTPException(404, "Meeting not found")
    if runner.busy(meeting_id):
        raise HTTPException(409, "The meeting is still being processed")
    store.delete_meeting(meeting_id)
    shutil.rmtree(settings.meeting_dir(meeting_id), ignore_errors=True)


@router.get("/{meeting_id}/audio")
def audio(meeting_id: int, user: dict = Depends(current_user), store: Store = Depends(get_store),
          settings: Settings = Depends(get_settings)):
    m = get_meeting(meeting_id, user, store)
    path = settings.meeting_dir(meeting_id) / m["source"]
    if not re.fullmatch(r"source\.[a-z0-9]+", m["source"]) or not path.exists():
        raise HTTPException(404, "No recording")
    return FileResponse(path)
