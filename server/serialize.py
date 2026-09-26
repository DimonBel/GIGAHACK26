"""Database rows as the JSON documents of docs/api.md."""
from datetime import datetime

from .db import AuditLog, DistributionList, Meeting, User


def iso(moment: datetime | None) -> str | None:
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ") if moment else None


def user_json(user: User) -> dict:
    return {"id": user.id, "email": user.email, "full_name": user.full_name, "position": user.position,
            "role": user.role, "active": user.active, "must_change_password": user.must_change_password,
            "created_at": iso(user.created_at)}


def person_json(user: User | None) -> dict | None:
    return {"id": user.id, "full_name": user.full_name} if user else None


def meeting_json(meeting: Meeting) -> dict:
    return {
        "id": meeting.id,
        "title": meeting.title,
        "meeting_type": meeting.meeting_type,
        "status": meeting.status,
        "progress": {"stage": meeting.progress_stage, "done": meeting.progress_done,
                     "total": meeting.progress_total, "message": meeting.progress_message},
        "created_by": person_json(meeting.created_by),
        "created_at": iso(meeting.created_at),
        "duration_s": meeting.duration_s,
        "language": meeting.language,
        "error": meeting.error,
        "approved_by": person_json(meeting.approved_by),
        "approved_at": iso(meeting.approved_at),
        "sent_at": iso(meeting.sent_at),
        "recipients": {kind: [r.email for r in meeting.recipients if r.kind == kind] for kind in ("to", "cc")},
        "timings": {"transcription_s": meeting.transcription_s, "minutes_s": meeting.minutes_s,
                    "total_s": meeting.total_s},
    }


def list_json(dist: DistributionList) -> dict:
    """A distribution list; members who are deactivated users are left out."""
    members = []
    for m in dist.members:
        if m.user is None:
            members.append({"user_id": None, "email": m.email, "name": "", "kind": m.kind})
        elif m.user.active:
            members.append({"user_id": m.user.id, "email": m.user.email, "name": m.user.full_name, "kind": m.kind})
    return {"id": dist.id, "name": dist.name, "meeting_type": dist.meeting_type, "members": members}


def audit_json(entry: AuditLog) -> dict:
    return {"id": entry.id, "at": iso(entry.at), "user": entry.user_email, "action": entry.action,
            "meeting_id": entry.meeting_id, "detail": entry.detail}
