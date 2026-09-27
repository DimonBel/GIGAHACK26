"""Accounts from the command line. The first admin can only be created here: there are no default accounts.

    python -m server.cli create-admin --email ana@medpark.md --name "Ana Popescu" [--job-title "Head of ICU"]
    python -m server.cli create-user --role moderator --email ion@medpark.md --name "Ion Rusu" [--position Doctor]
        [--specialty Cardiologist] [--job-title ...]

The password is asked twice without echo; --password-stdin reads it from standard input instead (scripts). An
account made with create-user must change it at its first sign-in: whoever ran the command knows it."""
import argparse
import getpass
import sys

from pydantic import ValidationError
from sqlalchemy import select

from .config import load_config, prepare_dirs
from .db import User, audit, connect
from .schemas import MIN_PASSWORD, UserIn
from .security import hash_password

ROLES = ("admin", "moderator", "user")


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    password = sys.stdin.readline().rstrip("\r\n") if args.password_stdin else _ask_password()
    try:
        account = UserIn(email=args.email, full_name=args.name, position=args.position, specialty=args.specialty,
                         job_title=args.job_title, role=getattr(args, "role", "admin"), password=password)
    except ValidationError as e:
        error = e.errors()[0]
        print(f"{error['loc'][0]}: {error['msg'].removeprefix('Value error, ')}", file=sys.stderr)
        return 1
    config = load_config()
    prepare_dirs(config)
    with connect(config.db_path)() as db:
        if db.scalar(select(User.id).where(User.email == account.email)) is not None:
            print(f"A user with the email {account.email} already exists", file=sys.stderr)
            return 1
        user = User(email=account.email, full_name=account.full_name, position=account.position,
                    specialty=account.specialty, job_title=account.job_title, role=account.role,
                    password_hash=hash_password(account.password),
                    must_change_password=args.command == "create-user")
        db.add(user)
        db.flush()
        audit(db, "user_create", detail=f"{user.email} ({user.role}), from the command line")
        db.commit()
        print(f"Created {user.role} {user.email} (id {user.id}) in {config.db_path}")
    return 0


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m server.cli", description="Secure MOM accounts")
    commands = parser.add_subparsers(dest="command", required=True)
    for name, description in (("create-admin", "create an admin"), ("create-user", "create an account")):
        command = commands.add_parser(name, help=description)
        if name == "create-user":
            command.add_argument("--role", required=True, choices=ROLES)
        command.add_argument("--email", required=True)
        command.add_argument("--name", required=True, help="full name")
        command.add_argument("--position", default="", help="e.g. Doctor")
        command.add_argument("--specialty", default="", help="e.g. Cardiologist")
        command.add_argument("--job-title", default="", help="the function, e.g. Head of ICU")
        command.add_argument("--password-stdin", action="store_true", help="read the password from standard input")
    return parser


def _ask_password() -> str:
    password = getpass.getpass(f"Password (at least {MIN_PASSWORD} characters): ")
    if password != getpass.getpass("Repeat the password: "):
        raise SystemExit("The passwords differ")
    return password


if __name__ == "__main__":
    raise SystemExit(main())
