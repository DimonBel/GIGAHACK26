"""Active users and the allowed domains, for picking the recipients of the minutes."""
from fastapi import APIRouter
from sqlalchemy import func, select

from ..db import Db, User
from ..security import Manager
from ..settings import load_settings

router = APIRouter(prefix="/directory", tags=["directory"])


@router.get("")
def directory(_: Manager, db: Db) -> list[dict]:
    users = db.scalars(select(User).where(User.active).order_by(func.lower(User.full_name)))
    return [{"id": u.id, "full_name": u.full_name, "position": u.position, "email": u.email} for u in users]


@router.get("/domains")
def recipient_domains(_: Manager, db: Db) -> list[str]:
    """The domains minutes may be sent to (the allowed_recipient_domains setting; empty: any)."""
    return load_settings(db)["allowed_recipient_domains"]
