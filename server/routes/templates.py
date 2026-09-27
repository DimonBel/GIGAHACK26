"""Minutes templates, per meeting type: how the minutes are written (instructions for the local AI) and shown
(sections, topic fields). Every save is a new version, the newest is the active one. Admins write them; everyone
reads the active ones (recipients print the minutes with them)."""
import threading

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from stt.minutes.builder import MEETING_TYPES

from ..db import Db, MinutesTemplate, User, audit
from ..schemas import TemplateIn
from ..security import Admin, CurrentUser
from ..serialize import template_json
from ..settings import active_template, default_template

router = APIRouter(prefix="/templates", tags=["templates"])
_saving = threading.Lock()  # one new version at a time: two saves can't take the same number


@router.get("")
def templates(_: CurrentUser, db: Db) -> list[dict]:
    """The active template of each meeting type."""
    return [active_template(db, meeting_type) for meeting_type in MEETING_TYPES]


@router.get("/{meeting_type}/versions")
def versions(meeting_type: str, _: Admin, db: Db) -> list[dict]:
    """Every version, newest first: the built-in one (version 0) last."""
    _check_type(meeting_type)
    query = (select(MinutesTemplate).where(MinutesTemplate.meeting_type == meeting_type)
             .order_by(MinutesTemplate.version.desc()))
    return [template_json(t) for t in db.scalars(query)] + [default_template(meeting_type)]


@router.post("/{meeting_type}", status_code=201)
def save_template(meeting_type: str, body: TemplateIn, user: Admin, db: Db) -> dict:
    """A new version, the active one from now on."""
    _check_type(meeting_type)
    return _add_version(db, user, meeting_type, body.model_dump())


@router.post("/{meeting_type}/versions/{version}/restore", status_code=201)
def restore(meeting_type: str, version: int, user: Admin, db: Db) -> dict:
    """A new version with the content of an older one (version 0: the built-in template)."""
    _check_type(meeting_type)
    if version == 0:
        old = default_template(meeting_type)
    else:
        stored = db.scalar(select(MinutesTemplate).where(MinutesTemplate.meeting_type == meeting_type,
                                                         MinutesTemplate.version == version))
        if stored is None:
            raise HTTPException(404, "No such template version")
        old = template_json(stored)
    content = {"sections": old["sections"], "topic_fields": old["topic_fields"], "instructions": old["instructions"],
               "note": f"Restored version {version}"}
    return _add_version(db, user, meeting_type, content, restored=version)


def _check_type(meeting_type: str):
    if meeting_type not in MEETING_TYPES:
        raise HTTPException(404, "No such meeting type")


def _add_version(db: Session, user: User, meeting_type: str, content: dict, restored: int | None = None) -> dict:
    """content (sections, topic_fields, instructions, note) as the meeting type's next version."""
    with _saving:
        newest = db.scalar(select(func.max(MinutesTemplate.version))
                           .where(MinutesTemplate.meeting_type == meeting_type)) or 0
        template = MinutesTemplate(meeting_type=meeting_type, version=newest + 1, created_by=user, **content)
        db.add(template)
        restored_from = "" if restored is None else f" (restored v{restored})"
        audit(db, "template_change", user, detail=f"{meeting_type} v{template.version}{restored_from}")
        db.commit()
    return template_json(template)
