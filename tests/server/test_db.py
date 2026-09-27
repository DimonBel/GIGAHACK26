"""The database: one made by an older version gets the columns added since (there are no migrations)."""
import sqlite3

from sqlalchemy import select, text

from server.db import ADDED_COLUMNS, Meeting, User, connect


def test_an_older_database_gets_the_new_columns(tmp_path):
    path = tmp_path / "secure_mom.db"
    with connect(path)() as db:
        user = User(email="ion@medpark.md", full_name="Ion", position="Doctor", role="moderator", password_hash="-")
        db.add(user)
        db.flush()
        db.add(Meeting(id="a" * 32, title="Before the choice", meeting_type="medical", created_by_id=user.id))
        db.commit()
    older = sqlite3.connect(path)
    for table, column, _ in ADDED_COLUMNS:  # the tables as the first release made them
        older.execute(f"ALTER TABLE {table} DROP COLUMN {column}")
    older.close()

    with connect(path)() as db:
        for table, column, _ in ADDED_COLUMNS:
            assert {row.name: row.notnull for row in db.execute(text(f"PRAGMA table_info({table})"))}[column] == 1
        assert db.get(Meeting, "a" * 32).minutes_language == "en"  # its minutes were written in English
        before = db.get(User, user.id)
        assert (before.position, before.specialty, before.job_title) == ("Doctor", "", "")
        db.add(Meeting(id="b" * 32, title="After", meeting_type="medical", created_by_id=user.id))
        db.commit()
        assert db.get(Meeting, "b" * 32).minutes_language == "ro"
    with connect(path)() as db:  # nothing left to add
        assert db.scalars(select(Meeting.minutes_language).order_by(Meeting.id)).all() == ["en", "ro"]
