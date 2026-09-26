"""Where meetings are stored, how long a sign-in lasts, and the password of the seeded accounts."""
from dataclasses import dataclass, field
from pathlib import Path

from mom.config import SERVER_DIR, env

COOKIE = "mom_session"


@dataclass(frozen=True)
class Settings:
    storage_dir: Path = field(default_factory=lambda: Path(env("MOM_STORAGE") or SERVER_DIR / "storage"))
    session_hours: float = 12
    # Password of the demo accounts created on first start (see db.SEED_USERS).
    seed_password: str = field(default_factory=lambda: env("SEED_PASSWORD") or "demo")
    max_upload_mb: int = 2048
    # Approved minutes are emailed through this relay. It must be local (see mailer.check_local): Mailpit on
    # this computer by default (scripts/mailpit.sh); any external SMTP (Gmail, Outlook, SendGrid...) is refused.
    smtp_host: str = field(default_factory=lambda: env("SMTP_HOST") or "127.0.0.1")
    smtp_port: int = field(default_factory=lambda: int(env("SMTP_PORT") or 1025))
    mail_from: str = field(default_factory=lambda: env("MAIL_FROM") or "Verbal <minutes@medpark.local>")
    # Where the web app runs, for the link in the email.
    app_url: str = field(default_factory=lambda: (env("APP_URL") or "http://localhost:5173").rstrip("/"))

    @property
    def db_path(self) -> Path:
        return self.storage_dir / "app.db"

    def meeting_dir(self, meeting_id: int) -> Path:
        return self.storage_dir / "meetings" / str(meeting_id)
