"""The minutes email: a short note (HTML and text) in the language of the minutes, with the minutes as a PDF
attached (Jinja2 HTML, autoescaped: LLM output is untrusted), delivered through the n8n workflow or straight to the
local SMTP server (MailHog). Other hosts are refused unless explicitly allowed."""
import base64
import re
import smtplib
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path
from urllib.parse import urlsplit

import httpx2
from jinja2 import Environment, FileSystemLoader, StrictUndefined

from stt.minutes.labels import LABELS
from stt.minutes.markdown import attendee_line, for_recipients, other_decisions, without_time

from .config import Config, is_local_host
from .db import Meeting
from .settings import default_template

TOKEN_HEADER = "X-Secure-MOM-Token"
DELIVERY_TIMEOUT_S = 60  # n8n needs ~40 s to report that the mail server is down
PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}
BOX_SECTIONS = ("summary", "key_moments", "open_issues", "participants", "warnings")  # the PDF's full-width boxes
# The one-page overview shows as much as fits one A4 page: the first of these limits whose page fits ("+ N more" after
# each list cut short); the last one fits even every list full of the longest texts (tested). Each text is at most
# OVERVIEW_TEXT characters (less in the narrow cells, see minutes_overview.html), the summary OVERVIEW_SUMMARY.
OVERVIEW_STEPS = [
    {"attendees": 12, "topics": 12, "decisions": 10, "action_items": 10, "open_issues": 5},
    {"attendees": 10, "topics": 10, "decisions": 8, "action_items": 8, "open_issues": 4},
    {"attendees": 8, "topics": 8, "decisions": 6, "action_items": 6, "open_issues": 3},
    {"attendees": 6, "topics": 6, "decisions": 4, "action_items": 4, "open_issues": 2},
    {"attendees": 4, "topics": 4, "decisions": 3, "action_items": 3, "open_issues": 1},
    {"attendees": 3, "topics": 3, "decisions": 2, "action_items": 2, "open_issues": 1},
]
OVERVIEW_TEXT = 100
OVERVIEW_SUMMARY = 600

_templates = Environment(loader=FileSystemLoader(Path(__file__).resolve().parent / "templates"), autoescape=True,
                         undefined=StrictUndefined, trim_blocks=True, lstrip_blocks=True)
# A fixed text inside a CSS string (the PDF's page numbers): no quote or backslash can end it early.
_templates.filters["css"] = lambda text: re.sub(r'["\\\n]', " ", str(text))
_templates.filters["short"] = lambda text, limit=OVERVIEW_TEXT: (
    text if len(text) <= limit else text[:limit - 1].rstrip() + "…")
UNSAFE_IN_FILENAMES = re.compile(r'[/\\:*?"<>|\x00-\x1f]+')


class DeliveryError(Exception):
    """The email could not be handed over. The message says why without hosts, URLs or paths (moderators read
    it); detail, for the server log, says exactly what failed."""

    def __init__(self, message: str, detail: str = ""):
        super().__init__(message)
        self.detail = detail or message


@dataclass(frozen=True)
class Attachment:
    filename: str
    content_type: str
    data: bytes


@dataclass(frozen=True)
class Email:
    meeting_id: str
    meeting_type: str
    language: str  # of the minutes: n8n writes its footer in it
    subject: str
    to: list[str]
    cc: list[str]
    html: str
    text: str
    sender: str
    attachment: Attachment | None = None  # the minutes as a PDF


def compose(meeting: Meeting, minutes: dict, sender: str, to: list[str], cc: list[str],
            template: dict | None = None, pdf: bool = False, signed_by: str = "", note: str = "") -> Email:
    """The email of the meeting's approved minutes: a short note (the default one in the language of the minutes,
    LABELS, signed by who sends it, or the moderator's own note) and, with pdf, the minutes themselves as the
    attached PDF (minutes_pdf), laid out by the template of the meeting type. The subject keeps the English type
    ("[Medical] ..."), as the web app shows it."""
    paragraphs = _paragraphs(note) or default_note(meeting, signed_by)
    attachment = None
    if pdf:
        attachment = Attachment(pdf_filename(meeting), "application/pdf", minutes_pdf(meeting, minutes, template))
    html = _templates.get_template("minutes_email.html").render(
        lang=meeting.minutes_language, title=_one_line(meeting.title),
        paragraphs=[paragraph.split("\n") for paragraph in paragraphs])
    return Email(meeting_id=meeting.id, meeting_type=meeting.meeting_type, language=meeting.minutes_language,
                 subject=_one_line(f"[{meeting.meeting_type.capitalize()}] {meeting.title}"), to=to, cc=cc,
                 html=html, text="\n\n".join(paragraphs) + "\n", sender=sender, attachment=attachment)


def default_note(meeting: Meeting, signed_by: str = "") -> list[str]:
    """The note's paragraphs: a greeting, what is attached (and who approved it), then the sender's name."""
    labels = LABELS[meeting.minutes_language]
    title = _one_line(meeting.title)
    cover = labels["cover"].format(meeting=title, date=_local_day(meeting.created_at))
    approved = labels["cover_approved"].format(name=meeting.approved_by.full_name) if meeting.approved_by else ""
    paragraphs = [labels["greeting"], " ".join(filter(None, [cover, approved]))]
    if _one_line(signed_by):
        paragraphs.append(f"{labels['regards']}\n{_one_line(signed_by)}")
    return paragraphs


def _paragraphs(note: str) -> list[str]:
    """A note typed by the moderator: its paragraphs (split at blank lines), each line without trailing spaces."""
    lines = [line.rstrip() for line in note.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    return [paragraph.strip("\n") for paragraph in re.split(r"\n{2,}", "\n".join(lines).strip()) if paragraph.strip()]


def minutes_pdf(meeting: Meeting, minutes: dict, template: dict | None = None, full: bool = False) -> bytes:
    """The minutes as an A4 PDF laid out by the template, in their language, without the notes for the moderator:
    by default the one-page overview that is emailed (what was discussed, decided and is to be done, long lists cut
    short); full, for the moderator, every topic with its details, on as many pages as they take."""
    context = _context(meeting, minutes, template)
    if full:
        return _render("minutes_pdf.html", context).write_pdf()
    for limits in OVERVIEW_STEPS:
        document = _render("minutes_overview.html", {**context, **_overview(context, limits)})
        if len(document.pages) == 1:
            break
    return document.write_pdf()


def pdf_filename(meeting: Meeting, full: bool = False) -> str:
    """ "Proces-verbal - Raport de gardă - 24.09.2026.pdf": the minutes' word, the meeting and the day it was held,
    without characters a file name can't have ("... (Detalii complete).pdf" for the full minutes)."""
    labels = LABELS[meeting.minutes_language]
    title = _one_line(UNSAFE_IN_FILENAMES.sub(" ", meeting.title))[:100].strip() or labels["minutes"]
    detail = f" ({labels['full_details']})" if full else ""
    return f"{labels['minutes']} - {title} - {_local_day(meeting.created_at)}{detail}.pdf"


def _context(meeting: Meeting, minutes: dict, template: dict | None) -> dict:
    """What the email and the PDF templates show: the minutes as recipients read them, laid out by the template."""
    minutes = for_recipients(minutes)
    labels = LABELS[meeting.minutes_language]
    template = template or default_template(meeting.meeting_type)
    sections = [s["key"] for s in template["sections"] if s["enabled"]]
    topic_fields = [field for field, shown in template["topic_fields"].items() if shown]
    attendees = [attendee_line(a) for a in minutes.get("attendees", [])]
    return {
        **_grid(minutes, sections, topic_fields, attendees),
        "m": minutes,
        "lang": meeting.minutes_language,
        "labels": labels,
        "meeting_label": labels[meeting.meeting_type],
        "title": minutes["title"] or meeting.title,
        "meeting_title": meeting.title,
        "held": _local_time(meeting.created_at),
        "duration": _duration(meeting.duration_s, labels),
        "approved_by": meeting.approved_by.full_name if meeting.approved_by else "",
        "approved_at": _local_time(meeting.approved_at) if meeting.approved_at else "",
        "attendees": attendees,
        "warnings": [without_time(w) for w in minutes["warnings"]],  # none in minutes from before them
        "other_decisions": other_decisions(minutes),
        "action_items": sorted(minutes["action_items"], key=lambda a: PRIORITY_ORDER.get(a["priority"], 3)),
        "sections": sections,
        "topic_fields": topic_fields,
    }


def _grid(minutes: dict, sections: list[str], topic_fields: list[str], attendees: list[str]) -> dict:
    """The PDF's 2x2 grid (Attendees | Agenda, Decisions | Action items): which cells the template shows and what
    they list; the other sections are boxes, above the grid if the template puts them before its first grid
    section (the summary, by default), below it otherwise."""
    topics_on = "topics" in sections
    by_topic = [(t["name"], [d for d in minutes["decisions"] if d["patient"] == t["name"]])
                for t in minutes["topics"]] if topics_on and "decisions" in topic_fields else []
    # No one added as present: the speakers the moderator named (their roles are only guessed, so not shown).
    names = [p["name"] for p in minutes["participants"].values() if p["name"].strip()]
    cells = {"attendees": "attendees" in sections, "topics": topics_on,
             "decisions": bool(by_topic) or "other_decisions" in sections, "action_items": "action_items" in sections}
    rows = [[cell for cell in row if cells[cell]] for row in (("attendees", "topics"), ("decisions", "action_items"))]
    boxes = [s for s in sections if s in BOX_SECTIONS]
    first_cell = next((i for i, s in enumerate(sections) if s not in BOX_SECTIONS), len(sections))
    return {
        "grid_rows": [row for row in rows if row],  # a cell alone in its row spans both columns
        "attendee_lines": attendees or names,
        "topic_decisions": [(name, decisions) for name, decisions in by_topic if decisions],
        "show_other_decisions": "other_decisions" in sections,
        "boxes_above": [s for s in boxes if sections.index(s) < first_cell],
        "boxes_below": [s for s in boxes if sections.index(s) > first_cell],
    }


def _overview(context: dict, limits: dict) -> dict:
    """What the one-page overview lists in each cell and box: the decisions of every topic in one list, not per
    topic; each list at most limits long, and how many more there are."""
    m = context["m"]
    decisions = [d for _, topic_decisions in context["topic_decisions"] for d in topic_decisions]
    if context["show_other_decisions"]:
        decisions += context["other_decisions"]
    lists = {"attendees": context["attendee_lines"], "topics": [t["name"] for t in m["topics"]],
             "decisions": [d["decision"] for d in decisions], "action_items": context["action_items"],
             "open_issues": m["open_issues"]}
    return {"overview": {key: items[:limits[key]] for key, items in lists.items()},
            "overview_more": {key: max(0, len(items) - limits[key]) for key, items in lists.items()},
            "summary_limit": OVERVIEW_SUMMARY}


def _render(template: str, context: dict):
    """The laid-out pages (a weasyprint Document: its pages counted, then written as a PDF)."""
    from weasyprint import HTML  # a second to load: only when a PDF is made

    html = _templates.get_template(template).render(**context)
    return HTML(string=html, url_fetcher=_fetch_nothing).render()


def _fetch_nothing(url: str, *args, **kwargs):
    """The PDF loads nothing, from the network or the disk: everything it shows is in its HTML."""
    raise ValueError(f"the minutes PDF loads no resources ({url[:40]})")


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
        attachment = payload.pop("attachment")
        if attachment:  # JSON: the PDF as base64
            payload["attachment"] = {"filename": attachment["filename"], "content_type": attachment["content_type"],
                                     "data": base64.b64encode(attachment["data"]).decode("ascii")}
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
        if email.attachment:
            maintype, subtype = email.attachment.content_type.split("/")
            message.add_attachment(email.attachment.data, maintype=maintype, subtype=subtype,
                                   filename=email.attachment.filename)
        try:
            with smtplib.SMTP(host, port, local_hostname="localhost", timeout=DELIVERY_TIMEOUT_S) as smtp:
                smtp.send_message(message)
        except OSError as e:  # includes every smtplib error
            raise DeliveryError("the SMTP server failed", f"the SMTP server {host}:{port} failed ({e})") from None


def _one_line(text: str) -> str:
    return " ".join(text.split())


def _local_time(moment: datetime) -> str:
    return moment.replace(tzinfo=UTC).astimezone().strftime("%d.%m.%Y %H:%M")


def _local_day(moment: datetime) -> str:
    return moment.replace(tzinfo=UTC).astimezone().strftime("%d.%m.%Y")


def _duration(seconds: float | None, labels: dict) -> str:
    if not seconds:
        return ""
    seconds = int(seconds + 0.5)  # half up, as the web app rounds
    if seconds < 3600:
        return labels["min_s"].format(m=seconds // 60, s=seconds % 60)
    return labels["h_min"].format(h=seconds // 3600, m=seconds % 3600 // 60)
