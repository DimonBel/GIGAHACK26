"""The minutes email: escaping of LLM output, the text version, the n8n payload, the SMTP message, and
delivery only to this machine."""
import dataclasses
from typing import ClassVar

import httpx2
import pytest

from server import mail
from server.config import Config
from server.db import Meeting, User, utcnow
from server.mail import DeliveryError, Mailer, compose
from server.schemas import minutes_doc

SETTINGS = {"delivery": "n8n", "n8n_webhook_url": "http://127.0.0.1:5678/webhook/secure-mom",
            "smtp_host": "127.0.0.1", "smtp_port": 1025}
MINUTES = minutes_doc({
    "title": "Round <script>alert('title')</script>",
    "summary": "Fever.\n<img src=x onerror=alert(1)>",
    "topics": [{"name": "Bed 8", "time": "00:03", "status": "<b>stable</b>", "findings": ["<iframe>"]}],
    "decisions": [{"decision": "Order tests", "time": "00:04", "patient": "Bed 8"},
                  {"decision": "Call cardiology", "time": "05:00", "patient": "Box"}],
    "action_items": [{"task": "Echo <script>", "owner": "ICU", "deadline": "today", "priority": "low"},
                     {"task": "Blood tests", "owner": "nurse", "deadline": "now", "priority": "high"}],
    "participants": {"SPEAKER 1": {"role": "leads the round", "name": "Dr. <u>X</u>", "seconds": 312}},
    "suggestions": ["Recheck <a href='http://evil'>here</a>"],
})


def _meeting(meeting_type: str = "medical") -> Meeting:
    approver = User(full_name="Ion <i>Rusu</i>", email="ion@medpark.md", role="moderator", password_hash="-")
    return Meeting(id="f" * 32, title="Board 26.09\r\nBcc: spy@example.com", meeting_type=meeting_type,
                   created_at=utcnow(), duration_s=703.2, approved_by=approver)


def _email(meeting_type: str = "medical") -> mail.Email:
    return compose(_meeting(meeting_type), MINUTES, "secure-mom@medpark.local", ["ana@medpark.md"],
                   ["quality@medpark.md"])


def test_html_escapes_llm_output():
    html = _email().html
    for tag in ("<script", "<img", "<iframe", "<b>stable", "<a href", "<u>X", "<i>Rusu"):
        assert tag not in html, tag
    assert "Round &lt;script&gt;alert(&#39;title&#39;)&lt;/script&gt;" in html
    assert "Ion &lt;i&gt;Rusu&lt;/i&gt;" in html
    assert "11 min 43 s" in html and "Patients" in html and "Call cardiology" in html  # decision of no topic


def test_high_priority_first_and_labels_per_type():
    html = _email("executive").html
    assert html.index("Blood tests") < html.index("Echo")
    assert "Agenda items" in html and "Patients" not in html


def test_subject_is_one_line_and_text_has_the_minutes():
    email = _email()
    assert email.subject == "[Medical] Board 26.09 Bcc: spy@example.com"
    assert "# Round <script>alert('title')</script>" in email.text and "Approved by: Ion <i>Rusu</i>" in email.text


def test_n8n_gets_the_documented_payload(monkeypatch):
    calls = []

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return httpx2.Response(200, json={"sent": True})

    monkeypatch.setattr(mail.httpx2, "post", post)
    Mailer(Config(n8n_token="shared-secret")).deliver(_email(), SETTINGS)
    [(url, kwargs)] = calls
    assert url == SETTINGS["n8n_webhook_url"]
    assert kwargs["headers"] == {"X-Secure-MOM-Token": "shared-secret"}
    assert kwargs["trust_env"] is False and kwargs["follow_redirects"] is False
    payload = kwargs["json"]
    assert set(payload) == {"meeting_id", "meeting_type", "subject", "to", "cc", "html", "text", "from"}
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
    Mailer(Config()).deliver(_email(), {**SETTINGS, "delivery": "smtp"})
    [(address, message)] = FakeSMTP.sent
    assert address == ("127.0.0.1", 1025)
    assert (message["To"], message["Cc"], message["From"]) == ("ana@medpark.md", "quality@medpark.md",
                                                               "secure-mom@medpark.local")
    assert message["Subject"] == "[Medical] Board 26.09 Bcc: spy@example.com" and message["Bcc"] is None
    html = message.get_body(("html",)).get_content()
    assert "&lt;script&gt;" in html and "<script" not in html
    assert "Blood tests" in message.get_body(("plain",)).get_content()


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
