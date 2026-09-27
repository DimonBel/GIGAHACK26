"""Demo accounts for trying the app locally: moderators, doctors, nurses and staff of every kind of meeting, with
Medpark emails (the local mail server, MailHog, catches what is sent to them).

    .venv/bin/python scripts/seed_demo_users.py

They share one random password (the one in demo-accounts.txt when there is one), written there with the accounts
(git ignores the file); an account whose email exists already is left as it is, so running it again adds only
what is missing. Never on a real server: these people and their password are made up."""
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from server.config import load_config, prepare_dirs  # noqa: E402
from server.db import User, audit, connect  # noqa: E402
from server.schemas import UserIn  # noqa: E402
from server.security import hash_password  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "demo-accounts.txt"

# (role, email, full name, position, specialty, job title)
ACCOUNTS = [
    ("admin", "admin.demo@medpark.md", "Radu Admin", "Engineer", "IT", "System administrator"),
    ("moderator", "elena.rusu@medpark.md", "Dr. Elena Rusu", "Doctor", "Anesthesiology and intensive care",
     "Head of ICU"),
    ("moderator", "ion.ceban@medpark.md", "Dr. Ion Ceban", "Doctor", "Cardiology", "Head of cardiology"),
    ("moderator", "maria.lungu@medpark.md", "Maria Lungu", "Manager", "", "Executive assistant to the director"),
    ("user", "andrei.popa@medpark.md", "Dr. Andrei Popa", "Doctor", "Cardiology", "Interventional cardiologist"),
    ("user", "natalia.ciobanu@medpark.md", "Dr. Natalia Ciobanu", "Doctor", "Neurology", "Neurologist"),
    ("user", "sergiu.birca@medpark.md", "Dr. Sergiu Bîrcă", "Doctor", "General surgery", "Surgeon"),
    ("user", "dmitri.volkov@medpark.md", "Dr. Dmitri Volkov", "Doctor", "Radiology", "Radiologist"),
    ("user", "tatiana.cazacu@medpark.md", "Tatiana Cazacu", "Nurse", "Intensive care", "Head nurse, ICU"),
    ("user", "victoria.rotaru@medpark.md", "Victoria Rotaru", "Nurse", "Cardiology", "Nurse"),
    ("user", "olga.munteanu@medpark.md", "Olga Munteanu", "Manager", "Finance", "Finance director"),
    ("user", "vasile.moraru@medpark.md", "Vasile Moraru", "Engineer", "IT", "IT manager"),
    ("user", "irina.grosu@medpark.md", "Irina Grosu", "Manager", "Human resources", "HR manager"),
]


def main() -> int:
    earlier = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
    known = [line.rsplit(": ", 1)[1] for line in earlier.splitlines() if line.startswith("# Password of the")]
    password = known[-1] if known else secrets.token_urlsafe(12)  # one password for every demo account
    config = load_config()
    prepare_dirs(config)
    created, existing = [], []
    with connect(config.db_path)() as db:
        for role, email, name, position, specialty, job_title in ACCOUNTS:
            account = UserIn(email=email, full_name=name, position=position, specialty=specialty,
                             job_title=job_title, role=role, password=password)
            if db.scalar(select(User.id).where(User.email == account.email)) is not None:
                existing.append(account)
                continue
            db.add(User(email=account.email, full_name=account.full_name, position=account.position,
                        specialty=account.specialty, job_title=account.job_title, role=account.role,
                        password_hash=hash_password(password)))
            audit(db, "user_create", detail=f"{account.email} ({account.role}), demo account")
            created.append(account)
        db.commit()
    if created:
        lines = [f"# Demo accounts created by scripts/seed_demo_users.py: made-up people, for local testing only.",
                 f"# Password of the accounts below: {password}", ""]
        lines += [f"{a.role:<10} {a.email:<30} {a.full_name} — {a.job_title}" for a in created]
        with OUT.open("a", encoding="utf-8") as out:
            out.write("\n".join(lines) + "\n\n")
        OUT.chmod(0o600)
    print(f"Created {len(created)} demo accounts ({len(existing)} existed already) in {config.db_path}")
    if created:
        print(f"Their emails and password: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
