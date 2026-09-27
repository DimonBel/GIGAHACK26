"""The minutes email: escaping of LLM output, the text version, the n8n payload, the SMTP message, and
delivery only to this machine."""
import base64
import dataclasses
import io
from datetime import datetime
from typing import ClassVar

import httpx2
import pypdf
import pytest

from server import mail
from server.config import Config
from server.db import Meeting, User
from server.mail import DeliveryError, Mailer, compose
from server.schemas import minutes_doc
from server.settings import default_template
from stt.minutes.markdown import SECTIONS

SETTINGS = {"delivery": "n8n", "n8n_webhook_url": "http://127.0.0.1:5678/webhook/secure-mom",
            "smtp_host": "127.0.0.1", "smtp_port": 1025}
MINUTES = minutes_doc({
    "title": "Round <script>alert('title')</script>",
    "summary": "Fever.\n<img src=x onerror=alert(1)>",
    "key_moments": [{"time": "00:04", "moment": "Tests ordered — Bed 8"}],
    "topics": [{"name": "Bed 8", "time": "00:03", "status": "<b>stable</b>", "findings": ["<iframe>"]}],
    "decisions": [{"decision": "Order tests", "time": "00:04", "patient": "Bed 8"},
                  {"decision": "Call cardiology", "time": "05:00", "patient": "Box"}],
    "action_items": [{"task": "Echo <script>", "owner": "ICU", "deadline": "today", "priority": "low"},
                     {"task": "Blood tests", "owner": "nurse", "deadline": "now", "priority": "high"}],
    "open_issues": ["Bed 8: recheck <a href='http://evil'>here</a>"],
    "warnings": ["[00:03] 38.5 not found"],
    "attendees": [{"user_id": 7, "name": "Ana Popescu", "job_title": "Head of cardiology", "position": "Doctor",
                   "specialty": "Cardiologist"},
                  {"user_id": None, "name": "Guest <b>Surgeon</b>", "job_title": "", "position": "", "specialty": ""}],
    "participants": {"SPEAKER 1": {"role": "leads the round", "name": "Dr. <u>X</u>", "seconds": 312}},
})
ENGLISH = ("Summary", "Key moments", "Topics", "Status", "Findings", "Decisions", "Other decisions", "Action items",
           "Task", "Owner", "Deadline", "Priority", "Open issues", "Present", "Participants", "Roles are guessed",
           "Verification notes", "Minutes", "meeting", "approved by", "Drafted by", "Processed entirely", ">high<")


HELD = datetime(2026, 9, 26, 6, 17)  # UTC; :17 local in any time zone, never one of the minutes' times


def _meeting(meeting_type: str = "medical", minutes_language: str = "en") -> Meeting:
    approver = User(full_name="Ion <i>Rusu</i>", email="ion@medpark.md", role="moderator", password_hash="-")
    return Meeting(id="f" * 32, title="Board 26.09\r\nBcc: spy@example.com", meeting_type=meeting_type,
                   minutes_language=minutes_language, created_at=HELD, duration_s=703.2, approved_by=approver)


def _email(meeting_type: str = "medical", minutes_language: str = "en", minutes: dict = MINUTES,
           template: dict | None = None, pdf: bool = False) -> mail.Email:
    return compose(_meeting(meeting_type, minutes_language), minutes, "secure-mom@medpark.local",
                   ["ana@medpark.md"], ["quality@medpark.md"], template, pdf)


def _pdf_text(data: bytes) -> str:
    return "\n".join(page.extract_text() for page in pypdf.PdfReader(io.BytesIO(data)).pages)


def _everything(meeting_type: str = "medical") -> dict:
    """A template with every section on, the ones off by default too."""
    return {**default_template(meeting_type), "sections": [{"key": key, "enabled": True} for key in SECTIONS]}


def _minutes(meeting_type: str = "medical", minutes_language: str = "en", minutes: dict = MINUTES,
             template: dict | None = None) -> str:
    """The text of the attached PDF: the minutes themselves."""
    return _pdf_text(_email(meeting_type, minutes_language, minutes, template, pdf=True).attachment.data)


@pytest.mark.parametrize(("language", "note"), [
    ("en", ["Hello,", "Please find attached the minutes of the meeting “Board 26.09 Bcc: spy@example.com” held on",
            "They were approved by Ion <i>Rusu</i>.", "Kind regards,\nAna Popescu"]),
    ("ro", ["Bună ziua,", "Vă transmitem atașat procesul-verbal al ședinței „Board 26.09 Bcc: spy@example.com” din",
            "Acesta a fost aprobat de Ion <i>Rusu</i>.", "Cu stimă,\nAna Popescu"]),
    ("ru", ["Здравствуйте!", "Во вложении — протокол совещания «Board 26.09 Bcc: spy@example.com» от",
            "Протокол утверждён: Ion <i>Rusu</i>.", "С уважением,\nAna Popescu"]),
])
def test_the_email_is_a_short_note_in_the_minutes_language(language, note):
    """The minutes are the attached PDF: the email says what it carries, signed by who sends it, in one-line
    subject and names escaped in the HTML."""
    email = compose(_meeting(minutes_language=language), MINUTES, "secure-mom@medpark.local", ["ana@medpark.md"], [],
                    signed_by="Ana Popescu")
    for line in note:
        assert line in email.text, line
    assert f'<html lang="{language}">' in email.html
    assert "Ion &lt;i&gt;Rusu&lt;/i&gt;" in email.html and "<i>Rusu" not in email.html
    for content in ("Round", "Fever", "Blood tests", "Call cardiology"):  # the minutes are in the PDF only
        assert content not in email.html + email.text, content
    assert email.subject == "[Medical] Board 26.09 Bcc: spy@example.com"  # the web app shows the English type


def test_the_pdf_shows_what_was_typed_as_text():
    text = _minutes()
    assert "Round <script>alert('title')</script>" in text and "<b>stable</b>" in text  # text, never markup
    assert "Ion <i>Rusu</i>" in text and "11 min 43 s" in text and "Call cardiology" in text  # a decision of no topic


def test_high_priority_first_and_labels_per_type():
    text = _minutes("executive")
    assert text.index("Blood tests") < text.index("Echo")
    assert "EXECUTIVE MEETING" in text and "MINUTES" in text and "TOPICS" in text and "Patients" not in text


@pytest.mark.parametrize(("language", "labels"), [
    ("ro", ["Ședință medicală", "Proces-verbal", "Rezumat", "Subiecte", "Stare", "Constatări", "Decizii",
            "Alte decizii", "Sarcini", "Sarcină", "Subiect", "Responsabil", "Termen", "Prioritate", "ridicată",
            "scăzută", "Probleme nerezolvate", "Prezenți", "11 min 43 s", "Aprobat de", "Durata"]),
    ("ru", ["Медицинское совещание", "Протокол", "Краткое содержание", "Темы", "Состояние", "Данные", "Решения",
            "Другие решения", "Поручения", "Ответственный", "Срок", "Приоритет", "высокий", "низкий",
            "Открытые вопросы", "Присутствовали", "11 мин 43 с", "Утверждено", "Продолжительность"]),
])
def test_the_pdf_is_in_the_minutes_language(language, labels):
    text = _minutes(minutes_language=language).casefold()
    for label in labels:
        assert label.casefold() in text, label
    for english in ENGLISH:
        assert english.casefold() not in text, english


@pytest.mark.parametrize(("language", "present", "voices"), [("en", "Present", "Participants"),
                                                             ("ro", "Prezenți", "Participanți"),
                                                             ("ru", "Присутствовали", "Участники")])
def test_attendees_are_listed_before_the_voices(language, present, voices):
    """Everyone present, also those who did not speak: name, then job title, position and specialty if known."""
    text = _minutes(minutes_language=language, template=_everything()).casefold()
    ana = "Ana Popescu — Head of cardiology, Doctor, Cardiologist".casefold()
    assert text.index(present.casefold()) < text.index(ana) < text.index(voices.casefold())
    assert "guest <b>surgeon</b>" in text
    nobody = _minutes(minutes_language=language, minutes=minutes_doc({**MINUTES, "attendees": []}))
    assert present.casefold() not in nobody.casefold()


def test_the_minutes_read_as_minutes_not_as_ai_output():
    """No minute marks, no timeline style and no notes about the AI, whatever the template shows; by default the
    timeline, the voices and the automatic check's notes are left out: they are for the moderator."""
    for template in (None, _everything()):
        text = _minutes(template=template)
        for mark in ("00:03", "00:04", "05:00", "Drafted by", "local AI", "Roles are guessed", "Processed entirely"):
            assert mark not in text, mark
    default = _minutes().casefold()
    for hidden in ("Key moments", "Participants", "Verification notes", "38.5 not found"):
        assert hidden.casefold() not in default, hidden
    assert "Tests ordered — Bed 8" in _minutes(template=_everything())


def test_the_notes_for_the_moderator_are_not_in_the_minutes():
    decision = {"decision": "Start 2 g ⚠ unverified: 2 g", "time": "00:04", "patient": "Bed 8"}
    text = _minutes(minutes={**MINUTES, "decisions": [decision]}, template=_everything())
    assert "Start 2 g" in text and "unverified" not in text


@pytest.mark.parametrize(("language", "labels"), [
    ("en", ["MINUTES", "MEDICAL MEETING", "Held", "Duration", "Approved by", "SUMMARY", "1. Bed 8", "Page 1 of 1"]),
    ("ro", ["PROCES-VERBAL", "ȘEDINȚĂ MEDICALĂ", "Data", "Durata", "Aprobat de", "REZUMAT", "1. Bed 8",
            "Pagina 1 din 1"]),
    ("ru", ["ПРОТОКОЛ", "МЕДИЦИНСКОЕ СОВЕЩАНИЕ", "Дата", "Продолжительность", "Утверждено", "КРАТКОЕ СОДЕРЖАНИЕ",
            "1. Bed 8", "Страница 1 из 1"]),
])
def test_the_minutes_are_attached_as_a_pdf(language, labels):
    """In the minutes' language, laid out as the email (no minute marks, no notes for the moderator), with a file
    name a mail header can carry."""
    minutes = {**MINUTES, "decisions": [{"decision": "Order tests ⚠ unverified: 2", "time": "00:04",
                                         "patient": "Bed 8"}]}
    email = _email(minutes_language=language, minutes=minutes, pdf=True)
    attachment = email.attachment
    assert attachment.content_type == "application/pdf" and attachment.data.startswith(b"%PDF-")
    assert attachment.filename.endswith(".pdf") and "Board 26.09 Bcc spy@example.com" in attachment.filename
    assert "\n" not in attachment.filename and "\r" not in attachment.filename
    text = _pdf_text(attachment.data)
    for label in labels:
        assert label in text, label
    assert "Order tests" in text and "Round <script>alert('title')</script>" in text  # text, never markup
    for hidden in ("unverified", "00:03", "00:04", "05:00", "Key moments", "38.5 not found"):
        assert hidden not in text, hidden
    assert _email(minutes_language=language).attachment is None  # the preview makes no PDF


def test_the_template_lays_out_the_minutes():
    """The template's sections in its order, the disabled ones left out, and topics with its fields only."""
    order = ["open_issues", "summary", "topics", "attendees", "key_moments", "other_decisions", "action_items",
             "participants", "warnings"]
    sections = [{"key": key, "enabled": key not in ("key_moments", "participants")} for key in order]
    template = {**default_template("medical"), "sections": sections,
                "topic_fields": {"status": False, "findings": True, "decisions": False}}
    text = _minutes(template=template)
    assert text.index("OPEN ISSUES") < text.index("SUMMARY") < text.index("TOPICS") < text.index("PRESENT")
    for hidden in ("Key moments", "KEY MOMENTS", "Tests ordered", "PARTICIPANTS", "Roles are guessed", "Status",
                   "stable", "Order tests"):
        assert hidden not in text, hidden
    assert "Findings" in text  # the other topic fields
    assert "Call cardiology — Box" in text  # a decision about no topic


def test_older_minutes_show_no_suggestions():
    """Minutes stored while the LLM still wrote AI suggestions: the PDF leaves them out."""
    text = _minutes(minutes={**MINUTES, "suggestions": ["Recheck the fever tonight"]})
    assert "Recheck the fever" not in text and "suggestion" not in text.lower()


def test_n8n_gets_the_documented_payload(monkeypatch):
    calls = []

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return httpx2.Response(200, json={"sent": True})

    monkeypatch.setattr(mail.httpx2, "post", post)
    email = _email(pdf=True)
    Mailer(Config(n8n_token="shared-secret")).deliver(email, SETTINGS)
    [(url, kwargs)] = calls
    assert url == SETTINGS["n8n_webhook_url"]
    assert kwargs["headers"] == {"X-Secure-MOM-Token": "shared-secret"}
    assert kwargs["trust_env"] is False and kwargs["follow_redirects"] is False
    payload = kwargs["json"]
    assert set(payload) == {"meeting_id", "meeting_type", "language", "subject", "to", "cc", "html", "text", "from",
                            "attachment"}
    assert payload["attachment"] == {"filename": email.attachment.filename, "content_type": "application/pdf",
                                     "data": base64.b64encode(email.attachment.data).decode("ascii")}
    assert (payload["to"], payload["cc"], payload["from"]) == (["ana@medpark.md"], ["quality@medpark.md"],
                                                               "secure-mom@medpark.local")


@pytest.mark.parametrize(("answer", "error", "detail"), [
    (httpx2.Response(500), "n8n answered 500", "n8n answered 500"),
    (httpx2.Response(502, json={"sent": False, "detail": "mail server error: connect ECONNREFUSED 172.18.0.2:1025"}),
     "n8n answered 502", "n8n answered 502: mail server error: connect ECONNREFUSED 172.18.0.2:1025"),
    (httpx2.Response(200, json={"sent": False, "detail": "queued at 172.18.0.2"}), "n8n did not send the email",
     "n8n did not send the email: queued at 172.18.0.2"),
])
def test_n8n_failures(monkeypatch, answer, error, detail):
    """The message is for the moderator; n8n's own words (hosts, addresses) only go to the server log."""
    monkeypatch.setattr(mail.httpx2, "post", lambda url, **kwargs: answer)
    with pytest.raises(DeliveryError) as failure:
        Mailer(Config(n8n_token="t")).deliver(_email(), SETTINGS)
    assert (str(failure.value), failure.value.detail) == (error, detail)


def test_n8n_timeout(monkeypatch):
    def slow(url, **kwargs):
        raise httpx2.ReadTimeout("timed out")

    monkeypatch.setattr(mail.httpx2, "post", slow)
    with pytest.raises(DeliveryError, match="did not answer within"):
        Mailer(Config(n8n_token="t")).deliver(_email(), SETTINGS)


def test_n8n_needs_the_token_and_a_running_n8n():
    with pytest.raises(DeliveryError, match="SECURE_MOM_N8N_TOKEN"):
        Mailer(Config()).deliver(_email(), SETTINGS)
    closed_port = {**SETTINGS, "n8n_webhook_url": "http://127.0.0.1:9/webhook/secure-mom"}
    with pytest.raises(DeliveryError, match="^n8n is not reachable$") as failure:
        Mailer(Config(n8n_token="t")).deliver(_email(), closed_port)
    assert "http://127.0.0.1:9/webhook/secure-mom" in failure.value.detail


class FakeSMTP:
    sent: ClassVar[list] = []
    error: ClassVar[OSError | None] = None

    def __init__(self, host, port, local_hostname=None, timeout=None):
        if FakeSMTP.error:
            raise FakeSMTP.error
        self.address = (host, port)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def send_message(self, message):
        FakeSMTP.sent.append((self.address, message))


def test_smtp_message(monkeypatch):
    FakeSMTP.sent = []
    monkeypatch.setattr(mail.smtplib, "SMTP", FakeSMTP)
    email = _email(minutes_language="ro", pdf=True)
    Mailer(Config()).deliver(email, {**SETTINGS, "delivery": "smtp"})
    [(address, message)] = FakeSMTP.sent
    assert address == ("127.0.0.1", 1025)
    assert (message["To"], message["Cc"], message["From"]) == ("ana@medpark.md", "quality@medpark.md",
                                                               "secure-mom@medpark.local")
    assert message["Subject"] == "[Medical] Board 26.09 Bcc: spy@example.com" and message["Bcc"] is None
    html = message.get_body(("html",)).get_content()
    assert "Ion &lt;i&gt;Rusu&lt;/i&gt;" in html and "<i>" not in html
    assert "Vă transmitem atașat procesul-verbal" in message.get_body(("plain",)).get_content()
    [pdf] = message.iter_attachments()
    assert pdf.get_content_type() == "application/pdf" and pdf.get_filename() == email.attachment.filename
    assert pdf.get_content() == email.attachment.data and email.attachment.filename.startswith("Proces-verbal - ")


def test_smtp_failure_hides_the_server(monkeypatch):
    FakeSMTP.sent, FakeSMTP.error = [], ConnectionRefusedError(61, "Connection refused")
    monkeypatch.setattr(mail.smtplib, "SMTP", FakeSMTP)
    with pytest.raises(DeliveryError, match="^the SMTP server failed$") as failure:
        Mailer(Config()).deliver(_email(), {**SETTINGS, "delivery": "smtp"})
    FakeSMTP.error = None
    assert "127.0.0.1:1025" in failure.value.detail


def test_delivery_stays_on_this_machine(monkeypatch):
    FakeSMTP.sent = []
    monkeypatch.setattr(mail.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(mail.httpx2, "post", lambda url, **kwargs: pytest.fail("posted to a remote host"))
    local_only = Mailer(Config(n8n_token="t"))
    with pytest.raises(DeliveryError, match="not on this machine") as failure:
        local_only.deliver(_email(), {**SETTINGS, "delivery": "smtp", "smtp_host": "smtp.gmail.com"})
    assert "smtp.gmail.com" not in str(failure.value) and "smtp.gmail.com" in failure.value.detail
    with pytest.raises(DeliveryError, match="not on this machine"):
        local_only.deliver(_email(), {**SETTINGS, "n8n_webhook_url": "https://hooks.example.com/x"})
    allowed = Mailer(dataclasses.replace(Config(), allow_remote_delivery=True))
    allowed.deliver(_email(), {**SETTINGS, "delivery": "smtp", "smtp_host": "mail.medpark.md"})
    assert FakeSMTP.sent[0][0] == ("mail.medpark.md", 1025)
