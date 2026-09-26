"""SQLite storage: accounts, sign-in sessions, meetings and participants' suggestions.

The minutes themselves are JSON files next to the meeting's audio (see jobs.py), not database rows.
"""
import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

from .security import hash_password

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, initials TEXT NOT NULL,
    dept TEXT NOT NULL, cabinets TEXT NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL, language TEXT NOT NULL, speakers INTEGER,
    title_auto INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL, duration REAL, status TEXT NOT NULL, error TEXT, topic_count INTEGER, stages TEXT,
    created REAL NOT NULL, created_by INTEGER REFERENCES users(id), approved REAL,
    approved_by INTEGER REFERENCES users(id));
CREATE TABLE IF NOT EXISTS meeting_attendees (
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY (meeting_id, user_id));
CREATE TABLE IF NOT EXISTS deliveries (
    id INTEGER PRIMARY KEY, meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id), email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', error TEXT,
    created REAL NOT NULL, sent REAL);
CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY, meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    topic_id TEXT NOT NULL, author_id INTEGER REFERENCES users(id), kind TEXT NOT NULL, text TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'open', created REAL NOT NULL);
"""

# The directory of the demo: created on first start, all with the password from Settings.seed_password.
SEED_USERS = [
    ("elena.rusu@medpark.md", "Dr. Elena Rusu", "ER", "Cardiologie", ["moderator", "participant"]),
    ("ion.bivol@medpark.md", "Ion Bivol", "IB", "IT & Securitate", ["admin", "moderator"]),
    ("natalia.popescu@medpark.md", "Dr. Natalia Popescu", "NP", "ATI", ["participant"]),
    ("igor.munteanu@medpark.md", "Dr. Igor Munteanu", "IM", "Imagistică", ["participant"]),
]

# Columns added after the first version: (table, column, definition), added to older databases by migrate().
ADDED_COLUMNS = [("meetings", "title_auto", "INTEGER NOT NULL DEFAULT 0")]

MEETING_FIELDS = {"title", "title_auto", "type", "language", "speakers", "source", "duration", "status", "error", "topic_count",
                  "stages", "approved", "approved_by"}


def _user(row) -> dict:
    return row and {**dict(row), "cabinets": json.loads(row["cabinets"])}


def _meeting(row) -> dict:
    return row and {**dict(row), "stages": json.loads(row["stages"]) if row["stages"] else None}


class Store:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def tx(self):
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def migrate(self):
        with self.tx() as c:
            c.execute("PRAGMA journal_mode = WAL")
            c.executescript(SCHEMA)
            for table, column, definition in ADDED_COLUMNS:
                if column not in {r["name"] for r in c.execute(f"PRAGMA table_info({table})")}:
                    c.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def seed_users(self, password: str):
        with self.tx() as c:
            if c.execute("SELECT 1 FROM users LIMIT 1").fetchone():
                return
            for email, name, initials, dept, cabinets in SEED_USERS:
                c.execute("INSERT INTO users (email, name, initials, dept, cabinets, password_hash) "
                          "VALUES (?, ?, ?, ?, ?, ?)",
                          (email, name, initials, dept, json.dumps(cabinets), hash_password(password)))

    # --- accounts and sessions ---

    def user_by_email(self, email: str):
        with self.tx() as c:
            return _user(c.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),)).fetchone())

    def user(self, user_id: int):
        with self.tx() as c:
            return _user(c.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())

    def users(self) -> list:
        with self.tx() as c:
            return [_user(r) for r in c.execute("SELECT * FROM users ORDER BY name")]

    def add_session(self, token_hash: str, user_id: int, expires: float):
        with self.tx() as c:
            c.execute("DELETE FROM sessions WHERE expires < ?", (time.time(),))
            c.execute("INSERT INTO sessions VALUES (?, ?, ?)", (token_hash, user_id, expires))

    def session_user(self, token_hash: str, extend_to: float):
        """The account signed in with this session; the session is extended (sliding expiry)."""
        with self.tx() as c:
            row = c.execute("SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id "
                            "WHERE token_hash = ? AND expires > ?", (token_hash, time.time())).fetchone()
            if row:
                c.execute("UPDATE sessions SET expires = ? WHERE token_hash = ?", (extend_to, token_hash))
            return _user(row)

    def delete_session(self, token_hash: str):
        with self.tx() as c:
            c.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))

    # --- meetings ---

    def add_meeting(self, **fields) -> int:
        assert set(fields) <= MEETING_FIELDS | {"created_by"}, set(fields) - MEETING_FIELDS
        cols = ", ".join(fields)
        with self.tx() as c:
            cur = c.execute(f"INSERT INTO meetings ({cols}, created) VALUES ({', '.join('?' * len(fields))}, ?)",
                            (*fields.values(), time.time()))
            return cur.lastrowid

    def meeting(self, meeting_id: int):
        with self.tx() as c:
            return _meeting(c.execute(MEETING_SELECT + " WHERE m.id = ?", (meeting_id,)).fetchone())

    def meetings(self, statuses=None, attendee: int = None) -> list:
        """Newest first; only these statuses, and only meetings `attendee` attended (when given)."""
        where, args = [], []
        if statuses:
            where.append(f"m.status IN ({', '.join('?' * len(statuses))})")
            args += list(statuses)
        if attendee is not None:
            where.append("m.id IN (SELECT meeting_id FROM meeting_attendees WHERE user_id = ?)")
            args.append(attendee)
        sql = MEETING_SELECT + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY m.created DESC"
        with self.tx() as c:
            return [_meeting(r) for r in c.execute(sql, args)]

    # --- attendees (who receives the minutes) ---

    def set_attendees(self, meeting_id: int, user_ids: list):
        with self.tx() as c:
            c.execute("DELETE FROM meeting_attendees WHERE meeting_id = ?", (meeting_id,))
            c.executemany("INSERT INTO meeting_attendees VALUES (?, ?)", [(meeting_id, u) for u in set(user_ids)])

    def attendees(self, meeting_id: int) -> list:
        with self.tx() as c:
            return [dict(r) for r in c.execute(
                "SELECT u.id, u.name, u.dept FROM meeting_attendees a JOIN users u ON u.id = a.user_id "
                "WHERE a.meeting_id = ? ORDER BY u.name", (meeting_id,))]

    def is_attendee(self, meeting_id: int, user_id: int) -> bool:
        with self.tx() as c:
            return c.execute("SELECT 1 FROM meeting_attendees WHERE meeting_id = ? AND user_id = ?",
                             (meeting_id, user_id)).fetchone() is not None

    # --- emails of the approved minutes ---

    def add_deliveries(self, meeting_id: int, recipients: list) -> list:
        """One queued email per (user_id, email); returns their ids."""
        with self.tx() as c:
            return [c.execute("INSERT INTO deliveries (meeting_id, user_id, email, created) VALUES (?, ?, ?, ?)",
                              (meeting_id, user_id, email, time.time())).lastrowid for user_id, email in recipients]

    def deliveries(self, meeting_id: int) -> list:
        with self.tx() as c:
            return [dict(r) for r in c.execute(
                "SELECT d.*, u.name AS name FROM deliveries d LEFT JOIN users u ON u.id = d.user_id "
                "WHERE d.meeting_id = ? ORDER BY d.id", (meeting_id,))]

    def delivery(self, delivery_id: int):
        with self.tx() as c:
            row = c.execute("SELECT * FROM deliveries WHERE id = ?", (delivery_id,)).fetchone()
            return row and dict(row)

    def update_delivery(self, delivery_id: int, **fields):
        assert set(fields) <= {"status", "error", "sent"}
        with self.tx() as c:
            c.execute(f"UPDATE deliveries SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
                      (*fields.values(), delivery_id))

    def queued_deliveries(self) -> list:
        with self.tx() as c:
            return [r["id"] for r in c.execute("SELECT id FROM deliveries WHERE status = 'queued' ORDER BY id")]

    def requeue_failed(self, meeting_id: int) -> list:
        with self.tx() as c:
            ids = [r["id"] for r in c.execute(
                "SELECT id FROM deliveries WHERE meeting_id = ? AND status = 'failed'", (meeting_id,))]
            c.execute("UPDATE deliveries SET status = 'queued', error = NULL WHERE meeting_id = ? AND status = 'failed'",
                      (meeting_id,))
            return ids

    def update_meeting(self, meeting_id: int, **fields):
        assert set(fields) <= MEETING_FIELDS, set(fields) - MEETING_FIELDS
        if "stages" in fields and fields["stages"] is not None:
            fields["stages"] = json.dumps(fields["stages"])
        with self.tx() as c:
            c.execute(f"UPDATE meetings SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
                      (*fields.values(), meeting_id))

    def delete_meeting(self, meeting_id: int):
        with self.tx() as c:
            c.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,))

    # --- suggestions ---

    def add_suggestion(self, meeting_id: int, topic_id: str, author_id: int, kind: str, text: str) -> int:
        with self.tx() as c:
            return c.execute("INSERT INTO suggestions (meeting_id, topic_id, author_id, kind, text, created) "
                             "VALUES (?, ?, ?, ?, ?, ?)",
                             (meeting_id, topic_id, author_id, kind, text, time.time())).lastrowid

    def suggestions(self, meeting_id: int, author_id: int = None, state: str = None) -> list:
        sql = ("SELECT s.*, u.name AS author FROM suggestions s LEFT JOIN users u ON u.id = s.author_id "
               "WHERE s.meeting_id = ?")
        args = [meeting_id]
        if author_id is not None:
            sql, args = sql + " AND s.author_id = ?", args + [author_id]
        if state:
            sql, args = sql + " AND s.state = ?", args + [state]
        with self.tx() as c:
            return [dict(r) for r in c.execute(sql + " ORDER BY s.created", args)]

    def resolve_suggestion(self, meeting_id: int, suggestion_id: int, state: str) -> bool:
        with self.tx() as c:
            cur = c.execute("UPDATE suggestions SET state = ? WHERE id = ? AND meeting_id = ? AND state = 'open'",
                            (state, suggestion_id, meeting_id))
            return cur.rowcount == 1


MEETING_SELECT = ("SELECT m.*, cu.name AS created_by_name, au.name AS approved_by_name FROM meetings m "
                  "LEFT JOIN users cu ON cu.id = m.created_by LEFT JOIN users au ON au.id = m.approved_by")
