"""Emailing approved minutes: local relay only, one email per attendee, retry after the relay was down."""
import email

import pytest

from api.app import create_app
from api.email_render import is_owner, render
from api.mailer import NotLocalError, check_local
from api.settings import Settings
from tests.test_api import ELENA, FakeSMTP, client, pipeline, processed, smtp  # noqa: F401 - fixtures


@pytest.fixture
def app(tmp_path, pipeline):  # noqa: F811
    return create_app(Settings(storage_dir=tmp_path, seed_password="pw"), pipeline, smtp=FakeSMTP)


@pytest.mark.parametrize("host", ["127.0.0.1", "localhost", "::1", "10.0.0.5", "192.168.1.20", "172.16.3.4",
                                  "mail.medpark.local", "smtp.hospital.internal"])
def test_local_relays_are_allowed(host):
    check_local(host)


@pytest.mark.parametrize("host", ["smtp.gmail.com", "smtp.office365.com", "smtp.sendgrid.net", "8.8.8.8",
                                  "mail.medpark.md", "local.evil.com"])
def test_external_relays_are_refused(host):
    with pytest.raises(NotLocalError):
        check_local(host)


def test_api_refuses_to_start_with_external_smtp(tmp_path, pipeline):  # noqa: F811
    with pytest.raises(NotLocalError, match="external SMTP"):
        create_app(Settings(storage_dir=tmp_path, seed_password="pw", smtp_host="smtp.gmail.com"), pipeline)


def test_task_owner_matching():
    assert is_owner("Dr. Natalia Popescu", "Dr. Natalia Popescu")
    assert is_owner("Popescu", "Dr. Natalia Popescu")
    assert not is_owner("ICU team", "Dr. Natalia Popescu")
    assert not is_owner("", "Dr. Natalia Popescu")


def approve_with(app, attendees):
    c = client(app, ELENA)
    mid = processed(app, c)
    doc = c.get(f"/api/meetings/{mid}/minutes").json()
    doc["attendees"] = attendees
    doc["topics"][0]["blocks"].append({"id": "bt", "kind": "tasks", "label": "Tasks", "items": [
        {"id": "t1", "text": "Call the <family>", "owner": "Popescu", "deadline": "today", "priority": "high"}]})
    assert c.put(f"/api/meetings/{mid}/minutes", json=doc).status_code == 200
    r = c.post(f"/api/meetings/{mid}/approve")
    assert r.status_code == 200
    return c, mid, r.json()


def test_approve_emails_every_attendee(app):
    c, mid, approved = approve_with(app, [3, 4])  # Natalia, Igor
    assert len(approved["deliveries"]) == 2
    assert app.state.mailer.wait_idle()
    assert [d["status"] for d in c.get(f"/api/meetings/{mid}/deliveries").json()] == ["sent", "sent"]
    assert FakeSMTP.hosts == [("127.0.0.1", 1025)] * 2

    to = sorted((m["To"].addresses[0].display_name, m["To"].addresses[0].addr_spec) for m in FakeSMTP.sent)
    assert to == [("Dr. Igor Munteanu", "igor.munteanu@medpark.md"), ("Dr. Natalia Popescu", "natalia.popescu@medpark.md")]
    natalia = next(m for m in FakeSMTP.sent if "natalia" in m["To"])
    assert natalia["Subject"].startswith("Minutes: Round — ")
    assert natalia["Reply-To"].addresses[0].addr_spec == "elena.rusu@medpark.md"
    parsed = email.message_from_bytes(natalia.as_bytes())
    parts = {p.get_content_type(): p for p in parsed.walk()}
    html = parts["text/html"].get_payload(decode=True).decode()
    assert "Your tasks" in html and "Call the &lt;family&gt;" in html and "<family>" not in html
    assert "http" not in html.replace(f"http://localhost:5173/participant/read/{mid}", "")  # nothing external
    assert parts["text/markdown"].get_filename() == f"minutes-{mid}.md"
    igor = next(m for m in FakeSMTP.sent if "igor" in m["To"])
    assert "Your tasks" not in igor.get_body(("html",)).get_content()


def test_relay_down_then_retry(app):
    FakeSMTP.down = True
    c, mid, _ = approve_with(app, [3])
    assert app.state.mailer.wait_idle()
    failed = c.get(f"/api/meetings/{mid}/deliveries").json()
    assert failed[0]["status"] == "failed" and "refused" in failed[0]["error"].lower()

    FakeSMTP.down = False
    assert c.post(f"/api/meetings/{mid}/deliveries/retry").json()[0]["status"] == "queued"
    assert app.state.mailer.wait_idle()
    assert c.get(f"/api/meetings/{mid}/deliveries").json()[0]["status"] == "sent"


def test_unknown_attendee_is_rejected(app):
    c = client(app, ELENA)
    mid = processed(app, c)
    doc = c.get(f"/api/meetings/{mid}/minutes").json()
    doc["attendees"] = [999]
    assert c.put(f"/api/meetings/{mid}/minutes", json=doc).status_code == 400


def test_render_marks_unverified_and_escapes():
    meeting = {"title": "M", "type": "medical", "created": 0, "duration": 600, "approved": 0}
    doc = {"title": "<b>Round</b>", "summary": "", "attendees": [], "next": {}, "topics": [{
        "title": "Bed 9", "time": "03:00", "blocks": [{"id": "b", "kind": "list", "label": "Findings", "items": [
            {"id": "i", "text": "Lactate 1.8", "unverified": "1.8"}]}]}]}
    mail = render(meeting, doc, {"name": "X", "email": "x@medpark.md"}, "Dr. E", "http://localhost:5173/x", [])
    assert "&lt;b&gt;Round&lt;/b&gt;" in mail.html
    assert "Lactate 1.8 (not verified: 1.8)" in mail.markdown
