"""SQLite storage with SQLAlchemy 2.0: the tables and the session factory."""
import os
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, Request
from sqlalchemy import JSON, ForeignKey, String, Text, create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

PRIVATE_FILE = 0o600
BUSY_TIMEOUT_MS = 5000
MAX_AUDIT_DETAIL = 2000


def utcnow() -> datetime:
    """Now in UTC, without a time zone (SQLite stores none)."""
    return datetime.now(UTC).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    full_name: Mapped[str] = mapped_column(String(200))
    position: Mapped[str] = mapped_column(String(200), default="")
    role: Mapped[str] = mapped_column(String(16))
    password_hash: Mapped[str] = mapped_column(String(255))
    must_change_password: Mapped[bool] = mapped_column(default=False)  # someone else chose it (an admin)
    active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class LoginSession(Base):
    """A signed-in browser. The id is the SHA-256 of the cookie value: the database alone can't log anyone in."""
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_seen: Mapped[datetime] = mapped_column(default=utcnow)

    user: Mapped[User] = relationship(lazy="joined")


class DistributionList(Base):
    __tablename__ = "distribution_lists"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    meeting_type: Mapped[str | None] = mapped_column(String(20))  # None: any type

    members: Mapped[list["ListMember"]] = relationship(cascade="all, delete-orphan", order_by="ListMember.id",
                                                       lazy="selectin")


class ListMember(Base):
    """A user of the app (user_id) or an outside address (email)."""
    __tablename__ = "list_members"

    id: Mapped[int] = mapped_column(primary_key=True)
    list_id: Mapped[int] = mapped_column(ForeignKey("distribution_lists.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    email: Mapped[str | None] = mapped_column(String(254))
    kind: Mapped[str] = mapped_column(String(2))  # "to" or "cc"

    user: Mapped[User | None] = relationship(lazy="joined")


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    title: Mapped[str] = mapped_column(String(200))
    meeting_type: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(12), default="queued", index=True)
    progress_stage: Mapped[str] = mapped_column(String(20), default="queued")
    progress_done: Mapped[int] = mapped_column(default=0)
    progress_total: Mapped[int] = mapped_column(default=0)
    progress_message: Mapped[str] = mapped_column(String(200), default="")
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    audio_file: Mapped[str | None] = mapped_column(String(64))  # name in the audio folder; None once deleted
    duration_s: Mapped[float | None]
    language: Mapped[str | None] = mapped_column(String(8))
    error: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(default=0)  # processing runs started (a restart may interrupt one)
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[datetime | None]
    sent_at: Mapped[datetime | None]
    transcription_s: Mapped[float | None]
    minutes_s: Mapped[float | None]
    total_s: Mapped[float | None]

    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id], lazy="joined")
    approved_by: Mapped[User | None] = relationship(foreign_keys=[approved_by_id], lazy="joined")
    recipients: Mapped[list["Recipient"]] = relationship(cascade="all, delete-orphan", order_by="Recipient.id",
                                                         lazy="selectin")
    transcript: Mapped["Transcript | None"] = relationship(cascade="all, delete-orphan")
    minutes: Mapped["Minutes | None"] = relationship(cascade="all, delete-orphan")


class Recipient(Base):
    """An address the minutes were sent to: users read the meetings sent to their email."""
    __tablename__ = "recipients"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(254), index=True)
    kind: Mapped[str] = mapped_column(String(2))  # "to" or "cc"


class Transcript(Base):
    __tablename__ = "transcripts"

    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True)
    language: Mapped[str] = mapped_column(String(8), default="")
    utterances: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Minutes(Base):
    """The LLM's draft and, once a moderator edits it, the edited version."""
    __tablename__ = "minutes"

    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True)
    draft: Mapped[dict] = mapped_column(JSON)
    edited: Mapped[dict | None] = mapped_column(JSON)
    edited_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    edited_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    @property
    def current(self) -> dict:
        return self.draft if self.edited is None else self.edited


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    user_email: Mapped[str | None] = mapped_column(String(254))  # also the address tried in a failed login
    action: Mapped[str] = mapped_column(String(40))
    meeting_id: Mapped[str | None] = mapped_column(String(32), index=True)  # no foreign key: outlives the meeting
    detail: Mapped[str] = mapped_column(Text, default="")


def connect(db_path: Path) -> sessionmaker:
    """Session factory for the SQLite file (created 0600, WAL mode), with the tables created."""
    if not db_path.exists():
        os.close(os.open(db_path, os.O_CREAT | os.O_WRONLY, PRIVATE_FILE))
    os.chmod(db_path, PRIVATE_FILE)
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    event.listen(engine, "connect", _sqlite_pragmas)
    Base.metadata.create_all(engine)
    return sessionmaker(engine, expire_on_commit=False)


def _sqlite_pragmas(connection, _record):
    cursor = connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")  # the job thread writes progress while requests read
    cursor.execute("PRAGMA secure_delete=ON")  # a deleted meeting's transcript is overwritten, not left in free pages
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MS}")
    cursor.close()


def get_db(request: Request) -> Iterator[Session]:
    """FastAPI dependency: a database session for one request."""
    with request.app.state.db() as db:
        yield db


Db = Annotated[Session, Depends(get_db)]


def checkpoint(db: Session):
    """Writes the WAL into the database file and empties it. With secure_delete, rows deleted before then leave no
    copy on disk: the WAL would keep their old pages until it is reused."""
    db.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
    db.commit()


def audit(db: Session, action: str, user: User | None = None, meeting_id: str | None = None, detail: str = "",
          email: str | None = None):
    """Adds an audit log entry, committed together with the action it records. email: who, without a user."""
    db.add(AuditLog(user_id=user.id if user else None, user_email=user.email if user else email, action=action,
                    meeting_id=meeting_id, detail=detail[:MAX_AUDIT_DETAIL]))
