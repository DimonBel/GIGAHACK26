"""The audit log (admin only), newest first."""
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select

from ..db import AuditLog, Db
from ..security import Admin
from ..serialize import audit_json

router = APIRouter(prefix="/audit", tags=["audit"])
DEFAULT_LIMIT = 500
MAX_LIMIT = 5000


@router.get("")
def audit_log(_: Admin, db: Db, meeting_id: str | None = None,
              limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT) -> list[dict]:
    query = select(AuditLog).order_by(AuditLog.id.desc()).limit(limit)
    if meeting_id:
        query = query.where(AuditLog.meeting_id == meeting_id)
    return [audit_json(entry) for entry in db.scalars(query)]
