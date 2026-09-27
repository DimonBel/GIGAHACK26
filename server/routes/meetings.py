"""Meetings: upload, processing status, transcript, audio, minutes, approval ("I agree") and sending.

Admins manage every meeting, moderators their own; a meeting whose minutes were sent can also be read by its
recipients. Anyone else gets 404, so meeting ids reveal nothing."""
import logging
import threading
from datetime import datetime, timedelta
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlalchemy import false, func, or_, select
from sqlalchemy.orm import Session, sessionmaker

from stt.minutes.builder import MEETING_TYPES, MINUTES_LANGUAGES
from stt.minutes.labels import LABELS
from stt.minutes.markdown import for_recipients

from ..db import AuditLog, Db, Meeting, Recipient, User, audit, checkpoint, utcnow
from ..jobs import STAGE_MESSAGES, UNFINISHED
from ..mail import DeliveryError, compose, minutes_pdf, pdf_filename
from ..schemas import MinutesDoc, SendIn, minutes_doc
from ..security import CurrentUser, Manager
from ..serialize import meeting_json
from ..settings import active_template, check_recipient_domains, load_settings
from ..uploads import MB, Upload, probe, receive_audio

log = logging.getLogger(__name__)
router = APIRouter(prefix="/meetings", tags=["meetings"])
UPLOAD_PATH = "/api/meetings"
MAX_TITLE = 200
MAX_UNFINISHED = 3  # meetings of one uploader waiting or being processed
_creating = threading.Lock()
PLAYBACK_START = ("", "bytes=0-")  # the Range of a new playback; the requests that continue it are not audited
PLAYBACK_GAP = timedelta(minutes=30)  # any other Range is audited too when the user hasn't played it this recently
AUDIO_TYPES = {"wav": "audio/wav", "mp3": "audio/mpeg", "m4a": "audio/mp4", "mp4": "video/mp4", "mov": "video/mp4",
               "webm": "audio/webm", "mkv": "video/webm", "ogg": "audio/ogg", "oga": "audio/ogg",
               "opus": "audio/ogg", "flac": "audio/flac", "aac": "audio/aac"}


@router.post("", status_code=201)
async def upload(request: Request, user: Manager) -> dict:
    """multipart/form-data with file, meeting_type, and optionally minutes_language (the language the minutes are
    written in, ro by default) and title; processing starts in the background.
    429 while the uploader has MAX_UNFINISHED meetings waiting or processing, 413 over the size or length limit."""
    state = request.app.state
    settings = await run_in_threadpool(_upload_settings, state.db, user)
    received = await receive_audio(request, state.config.audio_dir, settings["max_upload_mb"] * MB)
    try:
        meeting_type = received.fields.get("meeting_type", "").strip()
        if meeting_type not in MEETING_TYPES:
            raise HTTPException(400, f"meeting_type must be one of: {', '.join(MEETING_TYPES)}")
        minutes_language = received.fields.get("minutes_language", "ro").strip()
        if minutes_language not in MINUTES_LANGUAGES:
            raise HTTPException(400, f"minutes_language must be one of: {', '.join(MINUTES_LANGUAGES)}")
        title = _title(received.fields.get("title", ""), meeting_type, minutes_language)
        duration = await run_in_threadpool(probe, received.path)
        if duration is not None and duration > settings["max_duration_min"] * 60:
            raise HTTPException(413, f"The recording is longer than {settings['max_duration_min']} minutes")
        meeting = await run_in_threadpool(_create, state.db, user, title, meeting_type, minutes_language, received,
                                          duration)
    except BaseException:
        received.path.unlink(missing_ok=True)
        raise
    state.jobs.submit(meeting["id"])
    return meeting


@router.get("")
def list_meetings(user: CurrentUser, db: Db) -> list[dict]:
    """Newest first: admins see all, moderators their own, everyone the meetings sent to them."""
    query = select(Meeting).order_by(Meeting.created_at.desc())
    if user.role != "admin":
        sent_to_me = select(Recipient.meeting_id).where(Recipient.email == user.email)
        mine = Meeting.created_by_id == user.id if user.role == "moderator" else false()
        query = query.where(or_(mine, (Meeting.status == "sent") & Meeting.id.in_(sent_to_me)))
    return [meeting_json(m) for m in db.scalars(query)]


@router.get("/{meeting_id}")
def get_meeting(meeting_id: str, user: CurrentUser, db: Db) -> dict:
    return meeting_json(_meeting(db, meeting_id, user))


@router.get("/{meeting_id}/transcript")
def transcript(meeting_id: str, user: Manager, db: Db) -> dict:
    """Who said what, with each speaker's role from the (edited) minutes."""
    meeting = _meeting(db, meeting_id, user, manage=True)
    if meeting.transcript is None:
        raise HTTPException(409, "The transcript is not ready yet")
    participants = meeting.minutes.current.get("participants", {}) if meeting.minutes else {}
    utterances = [{"start": u["start"], "end": u["end"], "speaker": u["speaker"],
                   "role": participants.get(u["speaker"], {}).get("role", ""), "languages": u["languages"],
                   "accent": u.get("accent", ""), "text": u["text"]} for u in meeting.transcript.utterances]
    audit(db, "view_transcript", user, meeting.id)
    db.commit()
    return {"language": meeting.transcript.language, "utterances": utterances}


@router.get("/{meeting_id}/audio")
def audio(meeting_id: str, request: Request, user: Manager, db: Db) -> FileResponse:
    """The recording, in ranges for playback; each playback is audited once, by its first request."""
    meeting = _meeting(db, meeting_id, user, manage=True)
    path = request.app.state.config.audio_dir / meeting.audio_file if meeting.audio_file else None
    if path is None or not path.is_file():
        raise HTTPException(404, "The recording is no longer kept")
    if request.headers.get("range", "").strip() in PLAYBACK_START or not _played_lately(db, user, meeting.id):
        audit(db, "view_audio", user, meeting.id)
        db.commit()
    return FileResponse(path, media_type=AUDIO_TYPES.get(path.suffix.lstrip("."), "application/octet-stream"))


@router.get("/{meeting_id}/live")
def get_live(meeting_id: str, request: Request, user: Manager, db: Db) -> dict:
    """While the meeting is processing, what it heard and found so far: the newest transcript lines (speakers once
    known) and the minutes' topics and counts, to show the processing as it happens. Kept in memory only."""
    meeting = _meeting(db, meeting_id, user, manage=True)
    return request.app.state.jobs.live(meeting.id)


@router.get("/{meeting_id}/minutes")
def get_minutes(meeting_id: str, user: CurrentUser, db: Db) -> dict:
    """The edited minutes if there are any, else the draft, in the documented shape (older minutes lose fields
    since removed, e.g. suggestions); a recipient's reading is audited, and gets them as emailed (no "⚠ unverified"
    notes)."""
    meeting = _meeting(db, meeting_id, user)
    if meeting.minutes is None:
        raise HTTPException(409, "The minutes are not ready yet")
    if _can_manage(user, meeting):
        return minutes_doc(meeting.minutes.current)
    audit(db, "view_minutes", user, meeting.id)
    db.commit()
    return for_recipients(minutes_doc(meeting.minutes.current))


@router.get("/{meeting_id}/email-preview")
def email_preview(meeting_id: str, user: Manager, db: Db) -> dict:
    """The email the minutes are sent as (the note, signed by this user; the PDF of the minutes as they are now, a
    draft too, is at minutes.pdf): {"subject", "language", "html", "text", "attachment"}, for the moderator to see
    what they approve."""
    meeting = _meeting(db, meeting_id, user, manage=True)
    if meeting.minutes is None:
        raise HTTPException(409, "The minutes are not ready yet")
    email = compose(meeting, minutes_doc(meeting.minutes.current), load_settings(db)["mail_from"], [], [],
                    active_template(db, meeting.meeting_type), signed_by=user.full_name)
    return {"subject": email.subject, "language": email.language, "html": email.html, "text": email.text,
            "attachment": pdf_filename(meeting)}


@router.get("/{meeting_id}/minutes.pdf")
def get_minutes_pdf(meeting_id: str, user: CurrentUser, db: Db) -> Response:
    """The minutes as the PDF that is emailed, laid out by the active template: for the moderator from the draft on,
    for a recipient once sent (audited, like reading them)."""
    meeting = _meeting(db, meeting_id, user)
    if meeting.minutes is None:
        raise HTTPException(409, "The minutes are not ready yet")
    if not _can_manage(user, meeting):
        audit(db, "view_minutes", user, meeting.id, "pdf")
        db.commit()
    pdf = minutes_pdf(meeting, minutes_doc(meeting.minutes.current), active_template(db, meeting.meeting_type))
    filename = pdf_filename(meeting)
    return Response(pdf, media_type="application/pdf", headers={
        "Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}",
        "Cache-Control": "no-store",  # patient data: not kept by the browser
    })


@router.put("/{meeting_id}/minutes")
def put_minutes(meeting_id: str, body: MinutesDoc, user: Manager, db: Db) -> dict:
    meeting = _meeting(db, meeting_id, user, manage=True)
    _require_status(meeting, "ready")
    minutes = meeting.minutes
    minutes.edited, minutes.edited_by_id, minutes.edited_at = body.model_dump(), user.id, utcnow()
    audit(db, "edit_minutes", user, meeting.id)
    db.commit()
    return minutes.current


@router.post("/{meeting_id}/approve")
def approve(meeting_id: str, user: Manager, db: Db) -> dict:
    """"I agree": the minutes are frozen and can be sent."""
    meeting = _meeting(db, meeting_id, user, manage=True)
    _require_status(meeting, "ready")
    meeting.status, meeting.approved_by, meeting.approved_at = "approved", user, utcnow()
    audit(db, "approve", user, meeting.id)
    db.commit()
    return meeting_json(meeting)


@router.post("/{meeting_id}/reopen")
def reopen(meeting_id: str, user: Manager, db: Db) -> dict:
    """Back to ready, for more edits."""
    meeting = _meeting(db, meeting_id, user, manage=True)
    _require_status(meeting, "approved")
    meeting.status, meeting.approved_by, meeting.approved_at = "ready", None, None
    audit(db, "reopen", user, meeting.id)
    db.commit()
    return meeting_json(meeting)


@router.post("/{meeting_id}/send")
def send(meeting_id: str, body: SendIn, request: Request, user: Manager, db: Db) -> dict:
    """Emails the approved minutes (n8n or SMTP, see settings), laid out by the active template of the meeting's
    type; 400 for an address outside the allowed domains, 502 if the delivery fails (the details go to the server
    log only)."""
    meeting = _meeting(db, meeting_id, user, manage=True)
    _require_status(meeting, "approved")
    to = list(dict.fromkeys(body.to))
    cc = [address for address in dict.fromkeys(body.cc) if address not in to]
    settings = load_settings(db)
    try:
        check_recipient_domains([*to, *cc], settings["allowed_recipient_domains"])
    except ValueError as e:
        raise HTTPException(400, str(e)) from None
    template = active_template(db, meeting.meeting_type)
    email = compose(meeting, meeting.minutes.current, settings["mail_from"], to, cc, template, pdf=True,
                    signed_by=user.full_name, note=body.note)
    try:
        request.app.state.mailer.deliver(email, settings)
    except DeliveryError as e:
        log.warning("Meeting %s: the email could not be sent: %s", meeting.id, e.detail)
        audit(db, "send_failed", user, meeting.id, str(e))
        db.commit()
        raise HTTPException(502, f"The email could not be sent: {e}") from None
    meeting.status, meeting.sent_at = "sent", utcnow()
    meeting.recipients = [Recipient(email=a, kind="to") for a in to] + [Recipient(email=a, kind="cc") for a in cc]
    detail = f"to: {', '.join(to)}; cc: {', '.join(cc) or '-'}"
    if body.note.strip():
        detail += "; own note"
    if template["version"]:  # a saved version, not the built-in template
        detail += f"; template v{template['version']}"
    audit(db, "send", user, meeting.id, detail)
    db.commit()
    return meeting_json(meeting)


@router.delete("/{meeting_id}", status_code=204)
def delete_meeting(meeting_id: str, request: Request, user: Manager, db: Db) -> Response:
    """Deletes the meeting with its audio, transcript and minutes (not while it is being processed)."""
    meeting = _meeting(db, meeting_id, user, manage=True)
    if meeting.status == "processing":
        raise HTTPException(409, "The meeting is being processed; delete it once it is done")
    audio_file = meeting.audio_file
    db.delete(meeting)
    audit(db, "delete", user, meeting.id, meeting.meeting_type)  # not the title: it may name patients
    db.commit()
    checkpoint(db)
    if audio_file:
        (request.app.state.config.audio_dir / audio_file).unlink(missing_ok=True)
    return Response(status_code=204)


def _meeting(db: Session, meeting_id: str, user: User, manage: bool = False) -> Meeting:
    """The meeting if user may read it (manage: may change it), else 404."""
    meeting = db.get(Meeting, meeting_id)
    if meeting is not None and (_can_manage(user, meeting) or (not manage and _was_sent_to(user, meeting))):
        return meeting
    raise HTTPException(404, "No such meeting")


def _can_manage(user: User, meeting: Meeting) -> bool:
    return user.role == "admin" or (user.role == "moderator" and meeting.created_by_id == user.id)


def _was_sent_to(user: User, meeting: Meeting) -> bool:
    return meeting.status == "sent" and any(r.email == user.email for r in meeting.recipients)


def _require_status(meeting: Meeting, status: str):
    if meeting.status != status:
        raise HTTPException(409, f"Not possible while the meeting is {meeting.status} (needs {status})")


def _title(value: str, meeting_type: str, language: str) -> str:
    """The title on one line without control characters; by default the meeting type in the minutes' language and
    when it was uploaded ("Ședință administrativă 27.09.2026 10:49")."""
    title = " ".join("".join(c if c.isprintable() else " " for c in value).split())[:MAX_TITLE]
    return title or f"{LABELS[language][meeting_type]} {datetime.now():%d.%m.%Y %H:%M}"


def _upload_settings(db_factory: sessionmaker, user: User) -> dict:
    """The settings, once user may upload: checked before the file arrives."""
    with db_factory() as db:
        _check_queue(db, user)
        return load_settings(db)


def _played_lately(db: Session, user: User, meeting_id: str) -> bool:
    """Whether user started a playback of this recording within PLAYBACK_GAP (Safari starts with "bytes=0-1",
    a download tool with any range: those are audited when there was none)."""
    return db.scalar(select(AuditLog.id).where(
        AuditLog.user_id == user.id, AuditLog.meeting_id == meeting_id, AuditLog.action == "view_audio",
        AuditLog.at > utcnow() - PLAYBACK_GAP).limit(1)) is not None


def _check_queue(db: Session, user: User):
    """429 while user has MAX_UNFINISHED meetings waiting or processing: one uploader can't hold up everyone."""
    waiting = db.scalar(select(func.count()).select_from(Meeting).where(Meeting.created_by_id == user.id,
                                                                        Meeting.status.in_(UNFINISHED)))
    if waiting >= MAX_UNFINISHED:
        raise HTTPException(429, f"You already have {MAX_UNFINISHED} meetings waiting or being processed; upload "
                                 "this one when one of them is done")


def _create(db_factory: sessionmaker, user: User, title: str, meeting_type: str, minutes_language: str,
            received: Upload, duration: float | None) -> dict:
    with _creating, db_factory() as db:  # one at a time: two uploads finishing together can't both pass the check
        _check_queue(db, user)  # again: more uploads of this user may have arrived meanwhile
        meeting = Meeting(title=title, meeting_type=meeting_type, minutes_language=minutes_language,
                          created_by_id=user.id, audio_file=received.path.name, duration_s=duration,
                          progress_message=STAGE_MESSAGES["queued"])
        db.add(meeting)
        db.flush()
        audit(db, "upload", user, meeting.id, f"{meeting_type}, {received.size / MB:.1f} MB")
        db.commit()
        db.refresh(meeting)
        return meeting_json(meeting)
