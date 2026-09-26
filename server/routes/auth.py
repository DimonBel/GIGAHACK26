"""Login, logout, the current user and their password."""
from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select

from ..db import Db, User, audit
from ..schemas import LoginIn, PasswordChangeIn
from ..security import (CurrentSession, clear_session_cookie, client_ip, end_sessions, hash_password, needs_rehash,
                        set_session_cookie, start_session, verify_password)
from ..serialize import user_json

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Db) -> dict:
    """Starts a session: sets the cookie and returns the user with the CSRF token for later requests. Failures
    count for the email and the client address (see LoginLimiter)."""
    ip = client_ip(request)
    user = db.scalar(select(User).where(User.email == body.email))
    password_hash = user.password_hash if user and user.active else None  # None: checked anyway, never valid
    if not request.app.state.limiter.verify(lambda: verify_password(password_hash, body.password), body.email, ip):
        audit(db, "login_failed", email=body.email, detail=f"from {ip}")
        db.commit()
        raise HTTPException(401, "Wrong email or password")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    token, session = start_session(db, user)
    audit(db, "login", user, detail=f"from {ip}")
    db.commit()
    set_session_cookie(response, request, token)
    return {"user": user_json(user), "csrf_token": session.csrf_token}


@router.post("/logout", status_code=204)
def logout(request: Request, session: CurrentSession, db: Db) -> Response:
    db.delete(session)
    db.commit()
    response = Response(status_code=204)
    clear_session_cookie(response, request)
    return response


@router.get("/me")
def me(session: CurrentSession) -> dict:
    return {"user": user_json(session.user), "csrf_token": session.csrf_token}


@router.post("/password")
def change_password(body: PasswordChangeIn, request: Request, session: CurrentSession, db: Db) -> dict:
    """The signed-in user's new password, given the current one. Wrong guesses count like failed logins of that
    email (not of the client address, which all local clients share). Signs the user out everywhere else."""
    user, ip = session.user, client_ip(request)
    if not request.app.state.limiter.verify(lambda: verify_password(user.password_hash, body.current), user.email):
        audit(db, "password_change_failed", user, detail=f"from {ip}")
        db.commit()
        raise HTTPException(400, "current: the password is wrong")
    if body.new == body.current:
        raise HTTPException(400, "new: must differ from the current password")
    user.password_hash, user.must_change_password = hash_password(body.new), False
    end_sessions(db, user, keep=session.id)
    audit(db, "password_change", user, detail=f"from {ip}")
    db.commit()
    return {"user": user_json(user), "csrf_token": session.csrf_token}

