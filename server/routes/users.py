"""User accounts (admin only). Users are deactivated, never deleted: the audit log and meetings refer to them.
A password an admin chooses for someone else must be changed at their next sign-in."""
from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import Db, User, audit
from ..schemas import UserIn, UserPatch
from ..security import Admin, end_sessions, hash_password
from ..serialize import user_json

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
def list_users(_: Admin, db: Db) -> list[dict]:
    return [user_json(u) for u in db.scalars(select(User).order_by(func.lower(User.full_name)))]


@router.post("", status_code=201)
def create_user(body: UserIn, user: Admin, db: Db) -> dict:
    if db.scalar(select(User.id).where(User.email == body.email)) is not None:
        raise HTTPException(409, "A user with this email already exists")
    new = User(email=body.email, full_name=body.full_name, position=body.position, role=body.role,
               password_hash=hash_password(body.password), must_change_password=True)
    db.add(new)
    db.flush()
    audit(db, "user_create", user, detail=f"{new.email} ({new.role})")
    db.commit()
    return user_json(new)


@router.patch("/{user_id}")
def update_user(user_id: int, body: UserPatch, request: Request, user: Admin, db: Db) -> dict:
    """Changes any of full_name, position, role, active, password (null or missing: unchanged).
    A new password or deactivation signs the user out everywhere (except the admin's own session)."""
    target = _user(db, user_id)
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if changes.get("role", "admin") != "admin" or changes.get("active") is False:
        _keep_an_admin(db, target)
    password = changes.pop("password", None)
    if password is not None:
        target.password_hash, target.must_change_password = hash_password(password), target.id != user.id
    for name, value in changes.items():
        setattr(target, name, value)
    if password is not None or not target.active:
        end_sessions(db, target, keep=request.state.session.id)
    changed = sorted([*changes, *(["password"] if password is not None else [])])
    audit(db, "user_update", user, detail=f"{target.email}: {', '.join(changed) or 'no changes'}")
    db.commit()
    return user_json(target)


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, user: Admin, db: Db) -> Response:
    """Deactivates the user and ends their sessions."""
    target = _user(db, user_id)
    _keep_an_admin(db, target)
    target.active = False
    end_sessions(db, target)
    audit(db, "user_delete", user, detail=target.email)
    db.commit()
    return Response(status_code=204)


def _user(db: Session, user_id: int) -> User:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, "No such user")
    return target


def _keep_an_admin(db: Session, target: User):
    """409 if target is the last active admin (demoting or deactivating it would lock everyone out)."""
    if target.role != "admin" or not target.active:
        return
    others = db.scalar(select(func.count()).select_from(User).where(User.role == "admin", User.active,
                                                                    User.id != target.id))
    if not others:
        raise HTTPException(409, "The last active admin can't be removed")
