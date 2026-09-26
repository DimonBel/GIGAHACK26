"""Passwords, sessions, CSRF, login lockout, role checks, security headers and body size limits."""
import hashlib
import ipaddress
import hmac
import math
import secrets
import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable
from datetime import timedelta
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import delete, or_
from sqlalchemy.orm import Session
from starlette.datastructures import Headers, MutableHeaders

from .db import Db, LoginSession, User, utcnow

SESSION_COOKIE = "smom_session"
CSRF_HEADER = "X-CSRF-Token"
SESSION_IDLE = timedelta(hours=8)
SESSION_MAX_AGE = timedelta(hours=12)  # since the sign-in, however active the session is
SESSION_TOUCH = timedelta(minutes=1)  # last_seen is written at most this often
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
MAX_FAILURES = 5  # failed sign-ins that lock an email
MAX_IP_FAILURES = 30  # ... and a remote client address (local clients all share 127.0.0.1: email only)
FAILURE_WINDOW_S = 15 * 60
LOCKOUT_S = 15 * 60
MAX_TRACKED_KEYS = 10000  # failure counters kept before stale ones are dropped
MAX_JSON_BYTES = 1024 * 1024

# Scripts only from this server. Inline styles are allowed because the web app's UI library (Mantine) puts its
# theme variables in <style> elements; CSS can't run code, and img/font/connect sources stay 'self', so injected
# CSS can't send anything elsewhere either.
CONTENT_SECURITY_POLICY = ("default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; "
                           "media-src 'self' blob: data:; object-src 'none'; base-uri 'none'; form-action 'self'; "
                           "frame-ancestors 'none'")
SECURITY_HEADERS = {
    "content-security-policy": CONTENT_SECURITY_POLICY,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "permissions-policy": "camera=(), geolocation=(), microphone=(self)",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
}
HSTS = "max-age=31536000"

_hasher = PasswordHasher()  # argon2id, RFC 9106 low-memory profile
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """Checks the password; costs the same when there is no such user, so timing doesn't reveal accounts."""
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


class LoginLimiter:
    """Locks an email after MAX_FAILURES, a client address after MAX_IP_FAILURES failed sign-ins within
    FAILURE_WINDOW_S, for LOCKOUT_S."""

    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self._failures: dict[str, deque] = defaultdict(deque)
        self._locked_until: dict[str, float] = {}
        self._lock = threading.Lock()
        self._checking = threading.Lock()

    def verify(self, check: Callable[[], bool], email: str, ip: str | None = None) -> bool:
        """check() (a password) for email, from ip if given; 429 while either is locked. Counts a failure, or
        forgets the email's. One check at a time, so that guesses sent together can't outrun the count."""
        with self._checking:
            wait = self.retry_after(email, ip)
            if wait:
                raise HTTPException(429, "Too many failed attempts; try again later",
                                    headers={"Retry-After": str(wait)})
            if check():
                self.succeeded(email)
                return True
            self.failed(email, ip)
            return False

    def retry_after(self, email: str, ip: str | None = None) -> int:
        """Seconds until email may try again from ip (0: now)."""
        now = self.clock()
        keys = _limits(email, ip)
        with self._lock:
            for key in [k for k in keys if self._locked_until.get(k, now) <= now]:
                self._locked_until.pop(key, None)
            return max((math.ceil(self._locked_until[k] - now) for k in keys if k in self._locked_until), default=0)

    def failed(self, email: str, ip: str | None = None):
        now = self.clock()
        with self._lock:
            if len(self._failures) > MAX_TRACKED_KEYS:
                self._failures = defaultdict(deque, {k: f for k, f in self._failures.items()
                                                     if f[-1] > now - FAILURE_WINDOW_S})
            for key, limit in _limits(email, ip).items():
                failures = self._failures[key]
                failures.append(now)
                while failures[0] <= now - FAILURE_WINDOW_S:
                    failures.popleft()
                if len(failures) >= limit:
                    self._locked_until[key] = now + LOCKOUT_S
                    del self._failures[key]

    def succeeded(self, email: str):
        """Forgets the email's failures; the address keeps its count (else one account could reset it)."""
        with self._lock:
            self._failures.pop(f"email:{email}", None)


def _limits(email: str, ip: str | None) -> dict[str, int]:
    """The email's counter, and the client address's unless it is this machine (shared by every local client:
    counting it would lock everyone out)."""
    limits = {f"email:{email}": MAX_FAILURES}
    if ip is not None and not _loopback(ip):
        limits[f"ip:{ip}"] = MAX_IP_FAILURES
    return limits


def _loopback(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_loopback
    except ValueError:
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(db: Session, user: User) -> tuple[str, LoginSession]:
    """A new session for user (expired sessions are cleaned up); returns the cookie value and the session."""
    now = utcnow()
    db.execute(delete(LoginSession).where(or_(LoginSession.last_seen < now - SESSION_IDLE,
                                              LoginSession.created_at < now - SESSION_MAX_AGE)))
    token = secrets.token_urlsafe(32)
    session = LoginSession(id=token_hash(token), user=user, csrf_token=secrets.token_urlsafe(32))
    db.add(session)
    return token, session


def end_sessions(db: Session, user: User, keep: str | None = None):
    """Signs user out everywhere, except the session with id keep."""
    query = delete(LoginSession).where(LoginSession.user_id == user.id)
    if keep:
        query = query.where(LoginSession.id != keep)
    db.execute(query)


def set_session_cookie(response: Response, request: Request, token: str):
    response.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="strict", secure=_https(request), path="/")


def clear_session_cookie(response: Response, request: Request):
    response.delete_cookie(SESSION_COOKIE, httponly=True, samesite="strict", secure=_https(request), path="/")


def _https(request: Request) -> bool:
    return request.app.state.config.cookie_secure or request.url.scheme == "https"


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def authenticate(request: Request, db: Db) -> LoginSession:
    """The caller's session: 401 without a live one (idle for SESSION_IDLE, older than SESSION_MAX_AGE), 403 when
    a state-changing request lacks the CSRF token."""
    token = request.cookies.get(SESSION_COOKIE)
    session = db.get(LoginSession, token_hash(token)) if token else None
    now = utcnow()
    expired = session is not None and (now - session.last_seen > SESSION_IDLE
                                       or now - session.created_at > SESSION_MAX_AGE)
    if session is None or expired or not session.user.active:
        if session is not None:
            db.delete(session)
            db.commit()
        raise HTTPException(401, "Not logged in")
    sent = request.headers.get(CSRF_HEADER, "")
    if request.method not in SAFE_METHODS and not hmac.compare_digest(sent.encode(), session.csrf_token.encode()):
        raise HTTPException(403, "Missing or invalid CSRF token")
    if now - session.last_seen > SESSION_TOUCH:
        session.last_seen = now
    db.commit()  # ends the read transaction, which a long upload would otherwise hold open
    request.state.session = session
    return session


CurrentSession = Annotated[LoginSession, Depends(authenticate)]


def current_user(session: CurrentSession) -> User:
    """The signed-in user; 403 while they must change their password (only /api/auth answers them then)."""
    if session.user.must_change_password:
        raise HTTPException(403, "Change your password first")
    return session.user


CurrentUser = Annotated[User, Depends(current_user)]


def require_role(*roles: str):
    """Dependency: the current user if their role is one of roles, else 403."""
    def check(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(403, "Not allowed for your role")
        return user
    return check


Admin = Annotated[User, Depends(require_role("admin"))]
Manager = Annotated[User, Depends(require_role("moderator", "admin"))]  # they manage meetings


class SecurityHeaders:
    """Adds the security headers to every response, HSTS over HTTPS (behind_tls: a TLS proxy in front); API
    responses (patient data) are never cached."""

    def __init__(self, app, behind_tls: bool = False):
        self.app, self.behind_tls = app, behind_tls

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        api = scope["path"].startswith("/api/")
        https = self.behind_tls or scope.get("scheme") == "https"

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in SECURITY_HEADERS.items():
                    headers[name] = value
                if https:
                    headers["strict-transport-security"] = HSTS
                if api:
                    headers["cache-control"] = "no-store"
            await send(message)

        await self.app(scope, receive, send_with_headers)


class BodyLimit:
    """413 for request bodies over max_bytes, except on the exempt (method, path): the upload has its own limit."""

    def __init__(self, app, max_bytes: int, exempt: tuple[str, str]):
        self.app, self.max_bytes, self.exempt = app, max_bytes, exempt

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or (scope["method"], scope["path"]) == self.exempt:
            await self.app(scope, receive, send)
            return
        length = Headers(scope=scope).get("content-length", "")
        if length.isdigit() and int(length) > self.max_bytes:
            await JSONResponse({"detail": "Request body too large"}, status_code=413)(scope, receive, send)
            return
        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            received += len(message.get("body", b""))
            if received > self.max_bytes:
                raise HTTPException(413, "Request body too large")
            return message

        await self.app(scope, limited_receive, send)
