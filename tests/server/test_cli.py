"""python -m server.cli: accounts from the command line."""
import io
import sys

from sqlalchemy import select

from server import cli
from server.db import AuditLog, User, connect


def _run(monkeypatch, args: list[str], stdin: str) -> int:
    monkeypatch.setattr(sys, "stdin", io.StringIO(stdin))
    return cli.main(args)


def test_create_admin(monkeypatch, tmp_path, capsys):
    monkeypatch.setenv("SECURE_MOM_DATA_DIR", str(tmp_path / "data"))
    args = ["create-admin", "--email", "Boss@Medpark.md", "--name", "Ana Boss", "--position", "Director",
            "--password-stdin"]
    assert _run(monkeypatch, args, "a strong password\n") == 0
    assert "Created admin boss@medpark.md" in capsys.readouterr().out
    assert _run(monkeypatch, args, "a strong password\n") == 1
    assert "already exists" in capsys.readouterr().err
    with connect(tmp_path / "data" / "secure_mom.db")() as db:
        user = db.scalar(select(User))
        assert (user.email, user.role, user.position) == ("boss@medpark.md", "admin", "Director")
        assert user.password_hash.startswith("$argon2id$") and user.must_change_password is False
        assert db.scalar(select(AuditLog.action)) == "user_create"


def test_create_user_checks_the_input(monkeypatch, tmp_path, capsys):
    monkeypatch.setenv("SECURE_MOM_DATA_DIR", str(tmp_path / "data"))
    args = ["create-user", "--role", "moderator", "--email", "ion@medpark.md", "--name", "Ion", "--password-stdin"]
    assert _run(monkeypatch, args, "short\n") == 1
    assert "password" in capsys.readouterr().err
    assert _run(monkeypatch, [*args[:4], "not-an-email", *args[5:]], "a long enough password\n") == 1
    assert _run(monkeypatch, args, "a long enough password\n") == 0
    with connect(tmp_path / "data" / "secure_mom.db")() as db:
        assert db.scalar(select(User.must_change_password)) is True  # whoever ran the command knows it
