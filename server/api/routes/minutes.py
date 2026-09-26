"""The minutes document: read (everyone who may see the meeting), edit and approve (moderators), transcript,
and participants' suggestions."""
import threading
import time

from fastapi import APIRouter, Depends, HTTPException

from ..db import Store
from ..deps import current_user, get_mailer, get_settings, get_store, moderator
from ..jobs import read_json, write_json
from ..mailer import Mailer
from ..schemas import Approved, Attendee, Delivery, Line, MinutesDoc, ResolveIn, Saved, Suggestion, SuggestionIn
from ..settings import Settings
from .meetings import get_meeting

router = APIRouter(prefix="/meetings/{meeting_id}", tags=["minutes"])
save_lock = threading.Lock()  # version check + write must not interleave between two saves


def _doc_path(meeting_id: int, settings: Settings):
    path = settings.meeting_dir(meeting_id) / "minutes.json"
    if not path.exists():
        raise HTTPException(409, "The minutes are not ready yet")
    return path


@router.get("/minutes", response_model=MinutesDoc)
def read_minutes(meeting_id: int, user: dict = Depends(current_user), store: Store = Depends(get_store),
                 settings: Settings = Depends(get_settings)):
    get_meeting(meeting_id, user, store)
    return read_json(_doc_path(meeting_id, settings))


@router.put("/minutes", response_model=Saved)
def save_minutes(meeting_id: int, doc: MinutesDoc, user: dict = Depends(moderator),
                 store: Store = Depends(get_store), settings: Settings = Depends(get_settings)):
    m = get_meeting(meeting_id, user, store)
    if m["status"] != "draft":
        raise HTTPException(409, "Approved minutes can no longer be edited")
    path = _doc_path(meeting_id, settings)
    known = {u["id"] for u in store.users()}
    if not set(doc.attendees) <= known:
        raise HTTPException(400, "Unknown attendee")
    doc.attendees = list(dict.fromkeys(doc.attendees))
    with save_lock:
        current = read_json(path).get("version", 1)
        if doc.version != current:
            raise HTTPException(409, "The minutes were changed elsewhere. Reload to see the latest version.")
        doc.version = current + 1
        write_json(path, doc.model_dump(by_alias=True))
    store.update_meeting(meeting_id, topic_count=len(doc.topics), title=doc.title.strip() or m["title"])
    store.set_attendees(meeting_id, doc.attendees)
    return Saved(version=doc.version)


@router.post("/approve", response_model=Approved)
def approve(meeting_id: int, user: dict = Depends(moderator), store: Store = Depends(get_store),
            settings: Settings = Depends(get_settings), mailer: Mailer = Depends(get_mailer)):
    """Locks the minutes and emails them to every attendee (through the local relay, in the background)."""
    m = get_meeting(meeting_id, user, store)
    if m["status"] != "draft":
        raise HTTPException(409, "Only draft minutes can be approved")
    doc = read_json(_doc_path(meeting_id, settings))
    users = {u["id"]: u for u in store.users()}
    store.update_meeting(meeting_id, status="approved", approved=time.time(), approved_by=user["id"])
    ids = store.add_deliveries(meeting_id, [(uid, users[uid]["email"]) for uid in doc.get("attendees", [])
                                            if uid in users])
    mailer.enqueue(ids)
    return Approved(version=doc.get("version", 1), deliveries=store.deliveries(meeting_id))


@router.get("/attendees", response_model=list[Attendee])
def attendees(meeting_id: int, user: dict = Depends(current_user), store: Store = Depends(get_store)):
    """Who attended (names only), for everyone who can open the minutes."""
    get_meeting(meeting_id, user, store)
    return store.attendees(meeting_id)


@router.get("/deliveries", response_model=list[Delivery])
def deliveries(meeting_id: int, user: dict = Depends(moderator), store: Store = Depends(get_store)):
    get_meeting(meeting_id, user, store)
    return store.deliveries(meeting_id)


@router.post("/deliveries/retry", response_model=list[Delivery])
def retry_deliveries(meeting_id: int, user: dict = Depends(moderator), store: Store = Depends(get_store),
                     mailer: Mailer = Depends(get_mailer)):
    """Send the emails that failed (e.g. the relay was down) once more."""
    get_meeting(meeting_id, user, store)
    mailer.enqueue(store.requeue_failed(meeting_id))
    return store.deliveries(meeting_id)


@router.get("/transcript", response_model=list[Line])
def transcript(meeting_id: int, user: dict = Depends(current_user), store: Store = Depends(get_store),
               settings: Settings = Depends(get_settings)):
    get_meeting(meeting_id, user, store)
    path = settings.meeting_dir(meeting_id) / "transcript.json"
    return read_json(path) if path.exists() else []


@router.get("/suggestions", response_model=list[Suggestion])
def list_suggestions(meeting_id: int, user: dict = Depends(current_user), store: Store = Depends(get_store)):
    """Moderators: the open suggestions to review. Participants: the ones they sent."""
    get_meeting(meeting_id, user, store)
    if "moderator" in user["cabinets"]:
        return store.suggestions(meeting_id, state="open")
    return store.suggestions(meeting_id, author_id=user["id"])


@router.post("/suggestions", response_model=Suggestion, status_code=201)
def suggest(meeting_id: int, body: SuggestionIn, user: dict = Depends(current_user),
            store: Store = Depends(get_store), settings: Settings = Depends(get_settings)):
    m = get_meeting(meeting_id, user, store)
    if m["status"] != "draft":
        raise HTTPException(409, "Suggestions are only possible while the minutes are a draft")
    topics = {t["id"] for t in read_json(_doc_path(meeting_id, settings))["topics"]}
    if body.topic_id not in topics:
        raise HTTPException(400, "Unknown topic")
    sid = store.add_suggestion(meeting_id, body.topic_id, user["id"], body.kind.strip(), body.text.strip())
    return next(s for s in store.suggestions(meeting_id, author_id=user["id"]) if s["id"] == sid)


@router.post("/suggestions/{suggestion_id}/resolve", status_code=204)
def resolve(meeting_id: int, suggestion_id: int, body: ResolveIn, user: dict = Depends(moderator),
            store: Store = Depends(get_store)):
    """The moderator took it into the minutes (accepted: the edit is saved with the document) or declined it."""
    get_meeting(meeting_id, user, store)
    if not store.resolve_suggestion(meeting_id, suggestion_id, "accepted" if body.accepted else "declined"):
        raise HTTPException(404, "No open suggestion with this id")
