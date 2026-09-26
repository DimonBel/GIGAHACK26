"""The minutes email: HTML (Jinja2, autoescaped: LLM output is untrusted) and text, delivered through the n8n
workflow or straight to the local SMTP server (MailHog). Other hosts are refused unless explicitly allowed."""
import smtplib
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path
from urllib.parse import urlsplit

import httpx2
from jinja2 import Environment, FileSystemLoader, StrictUndefined

from stt.minutes.markdown import to_markdown

from .config import Config, is_local_host
from .db import Meeting

TOKEN_HEADER = "X-Secure-MOM-Token"
DELIVERY_TIMEOUT_S = 60  # n8n needs ~40 s to report that the mail server is down
PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}

_templates = Environment(loader=FileSystemLoader(Path(__file__).resolve().parent / "templates"), autoescape=True,
                         undefined=StrictUndefined, trim_blocks=True, lstrip_blocks=True)


class DeliveryError(Exception):
    """The email could not be handed over. The message says why without hosts, URLs or paths (moderators read
    it); detail, for the server log, says exactly what failed."""

    def __init__(self, message: str, detail: str = ""):
        super().__init__(message)
        self.detail = detail or message


@dataclass(frozen=True)
class Email:
    meeting_id: str
    meeting_type: str
    subject: str
    to: list[str]
    cc: list[str]
    html: str
    text: str
    sender: str


def compose(meeting: Meeting, minutes: dict, sender: str, to: list[str], cc: list[str]) -> Email:
    """The email for the meeting's approved minutes."""
    medical = meeting.meeting_type == "medical"
    topic_names = {t["name"] for t in minutes["topics"]}
    context = {
        "m": minutes,
        "type_label": meeting.meeting_type.capitalize(),
        "title": minutes["title"] or meeting.title,
        "meeting_title": meeting.title,
        "held": _local_time(meeting.created_at),
        "duration": _duration(meeting.duration_s),
        "approved_by": meeting.approved_by.full_name if meeting.approved_by else "",
        "topics_label": "Patients" if medical else "Agenda items",
        "item_label": "Patient" if medical else "Item",
        "other_decisions": [d for d in minutes["decisions"] if d["patient"] not in topic_names],
        "action_items": sorted(minutes["action_items"], key=lambda a: PRIORITY_ORDER.get(a["priority"], 3)),
    }
    header = [f"{context['type_label']} meeting: {meeting.title}", f"Held: {context['held']}"]
    if context["approved_by"]:
        header.append(f"Approved by: {context['approved_by']}")
    text = "\n".join(header) + "\n\n" + to_markdown(minutes, meeting.meeting_type)
    return Email(meeting_id=meeting.id, meeting_type=meeting.meeting_type,
                 subject=_one_line(f"[{context['type_label']}] {meeting.title}"), to=to, cc=cc,
                 html=_templates.get_template("minutes_email.html").render(**context), text=text, sender=sender)


class Mailer:
    """Hands an email to the n8n workflow (default) or straight to the local SMTP server."""

    def __init__(self, config: Config):
        self.config = config

    def deliver(self, email: Email, settings: dict):
        if settings["delivery"] == "smtp":
            self._smtp(email, settings["smtp_host"], settings["smtp_port"])
        else:
            self._n8n(email, settings["n8n_webhook_url"])

    def _check_host(self, host: str):
        if not self.config.allow_remote_delivery and not is_local_host(host):
            raise DeliveryError("the mail server in the settings is not on this machine",
                                f"{host} is not this machine (set SECURE_MOM_ALLOW_REMOTE_DELIVERY=1 to allow it)")

    def _n8n(self, email: Email, url: str):
        self._check_host(urlsplit(url).hostname or "")
        if not self.config.n8n_token:
            raise DeliveryError("SECURE_MOM_N8N_TOKEN is not set, so the n8n workflow would refuse the email")
        payload = asdict(email)
        payload["from"] = payload.pop("sender")
        try:
            # No proxies from the environment and no redirects: the minutes go to this URL or nowhere.
            response = httpx2.post(url, json=payload, headers={TOKEN_HEADER: self.config.n8n_token},
                                  timeout=DELIVERY_TIMEOUT_S, follow_redirects=False, trust_env=False)
        except httpx2.TimeoutException:
            raise DeliveryError(f"n8n did not answer within {DELIVERY_TIMEOUT_S} s") from None
        except httpx2.HTTPError as e:
            raise DeliveryError("n8n is not reachable", f"n8n is not reachable at {url} ({e})") from None
        try:
            answer = response.json()
        except ValueError:
            answer = None
        if not isinstance(answer, dict):
            answer = {}
        detail = f": {answer['detail']}" if answer.get("detail") else ""  # may name hosts: for the log only
        if not response.is_success:
            raise DeliveryError(f"n8n answered {response.status_code}", f"n8n answered {response.status_code}{detail}")
        if answer.get("sent") is False:
            raise DeliveryError("n8n did not send the email", f"n8n did not send the email{detail}")

    def _smtp(self, email: Email, host: str, port: int):
        self._check_host(host)
        message = EmailMessage()
        message["Subject"] = email.subject
        message["From"] = email.sender
        message["To"] = ", ".join(email.to)
        if email.cc:
            message["Cc"] = ", ".join(email.cc)
        message["Date"] = formatdate(localtime=True)
        message["Message-ID"] = make_msgid(domain=email.sender.split("@")[1])  # a domain: no DNS lookup
        message.set_content(email.text)
        message.add_alternative(email.html, subtype="html")
        try:
            with smtplib.SMTP(host, port, local_hostname="localhost", timeout=DELIVERY_TIMEOUT_S) as smtp:
                smtp.send_message(message)
        except OSError as e:  # includes every smtplib error
            raise DeliveryError("the SMTP server failed", f"the SMTP server {host}:{port} failed ({e})") from None


def _one_line(text: str) -> str:
    return " ".join(text.split())


def _local_time(moment: datetime) -> str:
    return moment.replace(tzinfo=UTC).astimezone().strftime("%d.%m.%Y %H:%M")


def _duration(seconds: float | None) -> str:
    if not seconds:
        return ""
    seconds = round(seconds)
    if seconds < 3600:
        return f"{seconds // 60} min {seconds % 60:02d} s"
    return f"{seconds // 3600} h {seconds % 3600 // 60:02d} min"
