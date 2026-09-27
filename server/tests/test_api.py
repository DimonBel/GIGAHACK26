"""HTTP API with a fake pipeline: sign-in, upload -> transcript -> minutes, editing, approval, suggestions."""
import threading

import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from api.convert import minutes_doc
from api.settings import Settings
from mom.dialog import Utterance

UTTERANCES = [Utterance(0.0, 4.0, "SPEAKER 1", "Patul 9, bună dimineața."),
              Utterance(4.0, 9.0, "SPEAKER 2", "Creatinina 240, era 90.")]

MINUTES = {
    "title": "ICU round", "summary": "Bed 9 reviewed.", "suggestions": ["Recheck potassium"],
    "key_moments": [{"time": "00:04", "moment": "Stopped Forxiga. — Bed 9"}],
    "topics": [{"name": "Bed 9", "time": "00:00", "status": "Stable",
                "findings": ["Creatinine 240 µmol/l, was 90", "Lactate 1.8 ⚠ unverified: 1.8"]}],
    "decisions": [{"decision": "Stopped Forxiga.", "time": "00:04", "patient": "Bed 9"}],
    "action_items": [{"task": "Ask about the BiPAP mask", "owner": "ICU team", "deadline": "Not specified",
                      "priority": "high", "time": "00:05", "patient": "Bed 9"}],
    "open_issues": ["Bed 9: Palliative care?"], "warnings": ["[00:04] value(s) 1.8 not found"],
}


class FakeSession:
    def __init__(self, fail):
        self.fed, self.fail = [], fail

    def feed(self, u):
        self.fed.append(u)

    def finish(self):
        if self.fail:
            raise RuntimeError("Could not reach Ollama at http://127.0.0.1:11434/api/chat. Is it running?")
        assert self.fed, "the minutes get the transcript"
        return dict(MINUTES)

    def topic_count(self):
        return 1


class FakePipeline:
    def __init__(self):
        self.fail_minutes, self.transcribed, self.gate = False, 0, threading.Event()
        self.gate.set()

    def transcribe(self, audio, language, speakers, on_utterance, progress, on_text=None):
        assert audio.exists()
        self.gate.wait(5)
        self.transcribed += 1
        progress("convert", "done", seconds=0.1, total=9.0)
        progress("speakers", "done", seconds=0.2, count=2)
        for u in UTTERANCES:
            progress("transcribe", "running", at=u.end, total=9.0)
            on_text(u)
        for u in UTTERANCES:  # the speakers are known later
            on_utterance(u)
        progress("transcribe", "done", seconds=0.3, total=9.0)
        return list(UTTERANCES)

    def minutes(self, meeting_type):
        return FakeSession(self.fail_minutes)

    def roles(self, utterances, meeting_type):
        return {"SPEAKER 1": {"role": "leads the round", "name": "", "evidence": "", "seconds": 4}}

    def codes(self, minutes, meeting_type):
        return {"Bed 9": {"principal": "J96.0", "secondary": ["E87.3"],
                          "drg": {"family": "E64", "name": "Edem pulmonar si insuficienta respiratorie",
                                  "variants": ["E64Z"], "mdc": 4}}}


@pytest.fixture
def pipeline():
    return FakePipeline()


class FakeSMTP:
    """smtplib.SMTP stand-in: collects the messages; `down` makes the relay refuse connections."""
    sent, down, hosts = [], False, []

    def __init__(self, host, port, timeout=None):
        FakeSMTP.hosts.append((host, port))
        if FakeSMTP.down:
            raise ConnectionRefusedError(61, "Connection refused")

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def send_message(self, msg):
        FakeSMTP.sent.append(msg)


@pytest.fixture(autouse=True)
def smtp():
    FakeSMTP.sent, FakeSMTP.down, FakeSMTP.hosts = [], False, []
    return FakeSMTP


@pytest.fixture
def app(tmp_path, pipeline):
    return create_app(Settings(storage_dir=tmp_path, seed_password="pw"), pipeline, smtp=FakeSMTP)


def client(app, email=None):
    c = TestClient(app)
    if email:
        assert c.post("/api/auth/login", json={"email": email, "password": "pw"}).status_code == 200
    return c


ELENA, NATALIA = "elena.rusu@medpark.md", "natalia.popescu@medpark.md"


def upload(c, **form):
    data = {"title": "Round", "type": "medical", "language": "ro", **form}
    return c.post("/api/meetings", data=data, files={"file": ("round.m4a", b"fake audio", "audio/mp4")})


def processed(app, c):
    r = upload(c)
    assert r.status_code == 201, r.text
    assert app.state.runner.wait_idle()
    return r.json()["id"]


def test_login_me_logout(app):
    c = TestClient(app)
    assert c.get("/api/auth/me").status_code == 401
    assert c.post("/api/auth/login", json={"email": ELENA, "password": "nope"}).status_code == 401
    r = c.post("/api/auth/login", json={"email": " Elena.Rusu@medpark.md ", "password": "pw"})
    assert r.status_code == 200 and r.json()["cabinets"] == ["moderator", "participant"]
    assert "password_hash" not in r.json() and "passwordHash" not in r.json()
    assert c.get("/api/auth/me").json()["name"] == "Dr. Elena Rusu"
    assert c.post("/api/auth/logout").status_code == 204
    assert c.get("/api/auth/me").status_code == 401


def test_participant_cannot_upload(app):
    assert upload(client(app, NATALIA)).status_code == 403


def test_upload_rejects_non_audio(app):
    c = client(app, ELENA)
    r = c.post("/api/meetings", data={"title": "x", "type": "medical"}, files={"file": ("a.exe", b"x")})
    assert r.status_code == 415
    assert c.get("/api/meetings").json() == []


def test_upload_to_draft_minutes(app):
    c = client(app, ELENA)
    mid = processed(app, c)
    meeting = c.get(f"/api/meetings/{mid}").json()
    assert meeting["status"] == "draft" and meeting["topicCount"] == 1 and meeting["hasTranscript"]
    assert meeting["duration"] == 9.0 and meeting["createdBy"] == "Dr. Elena Rusu"

    progress = c.get(f"/api/meetings/{mid}/progress").json()
    assert [s["state"] for s in progress["stages"]] == ["done"] * 5
    assert progress["stages"][2]["detail"] == "2 speakers"
    assert len(progress["lines"]) == 2 and progress["nextLine"] == 2
    assert c.get(f"/api/meetings/{mid}/progress?after=2").json()["lines"] == []

    doc = c.get(f"/api/meetings/{mid}/minutes").json()
    assert doc["title"] == "Round"  # the moderator's title, not the AI's
    assert doc["participants"][0]["role"] == "leads the round"
    blocks = {b["label"]: b for b in doc["topics"][0]["blocks"]}
    assert list(blocks) == ["Status", "Findings", "Decisions", "Tasks", "Open issues", "Diagnosis codes (suggested)"]
    codes = blocks["Diagnosis codes (suggested)"]["items"]
    assert [(c["system"], c["code"]) for c in codes] == [("ICD-10", "J96.0"), ("ICD-10", "E87.3"), ("DRG", "E64")]
    assert codes[0]["label"] == "Acute respiratory failure"
    assert blocks["Findings"]["items"][1]["unverified"] == "1.8"
    assert blocks["Findings"]["items"][1]["text"] == "Lactate 1.8"
    assert blocks["Tasks"]["items"][0]["deadline"] == "" and blocks["Tasks"]["items"][0]["priority"] == "high"
    assert blocks["Open issues"]["items"][0]["text"] == "Palliative care?"
    assert [l["speaker"] for l in c.get(f"/api/meetings/{mid}/transcript").json()] == ["SPEAKER 1", "SPEAKER 2"]


def test_edit_with_version_then_approve(app):
    c = client(app, ELENA)
    mid = processed(app, c)
    doc = c.get(f"/api/meetings/{mid}/minutes").json()
    doc["topics"][0]["blocks"].append({"id": "b1", "kind": "list", "label": "Notes", "items": [{"id": "i1", "text": "Call family"}]})
    saved = c.put(f"/api/meetings/{mid}/minutes", json=doc)
    assert saved.status_code == 200 and saved.json()["version"] == 2
    assert c.put(f"/api/meetings/{mid}/minutes", json=doc).status_code == 409  # stale version
    assert c.get(f"/api/meetings/{mid}/minutes").json()["topics"][0]["blocks"][-1]["label"] == "Notes"

    doc["version"] = 2
    doc["topics"][0]["blocks"].append({"id": "b2", "kind": "bogus", "label": "x"})
    assert c.put(f"/api/meetings/{mid}/minutes", json=doc).status_code == 422

    assert c.post(f"/api/meetings/{mid}/approve").status_code == 200
    doc["topics"][0]["blocks"].pop()
    assert c.put(f"/api/meetings/{mid}/minutes", json=doc).status_code == 409
    assert c.get(f"/api/meetings/{mid}").json()["approvedBy"] == "Dr. Elena Rusu"


def test_participant_sees_ready_minutes_and_suggests(app, pipeline):
    elena, natalia = client(app, ELENA), client(app, NATALIA)
    pipeline.gate.clear()  # hold the job in processing
    mid = upload(elena).json()["id"]
    assert natalia.get("/api/meetings").json() == []
    assert natalia.get(f"/api/meetings/{mid}").status_code == 404
    pipeline.gate.set()
    assert app.state.runner.wait_idle()
    assert natalia.get("/api/meetings").json() == []  # ready, but she is not an attendee yet

    doc = elena.get(f"/api/meetings/{mid}/minutes").json()
    doc["attendees"] = [3]  # Natalia
    assert elena.put(f"/api/meetings/{mid}/minutes", json=doc).status_code == 200
    assert [m["id"] for m in natalia.get("/api/meetings").json()] == [mid]
    assert natalia.get(f"/api/meetings/{mid}/attendees").json() == [{"id": 3, "name": "Dr. Natalia Popescu", "dept": "ATI"}]
    assert natalia.get("/api/users").status_code == 403
    igor = client(app, "igor.munteanu@medpark.md")
    assert igor.get(f"/api/meetings/{mid}").status_code == 404
    doc = natalia.get(f"/api/meetings/{mid}/minutes").json()
    assert natalia.put(f"/api/meetings/{mid}/minutes", json=doc).status_code == 403
    topic = doc["topics"][0]["id"]
    assert natalia.post(f"/api/meetings/{mid}/suggestions", json={"topicId": "nope", "kind": "Task", "text": "x"}).status_code == 400
    r = natalia.post(f"/api/meetings/{mid}/suggestions", json={"topicId": topic, "kind": "Task", "text": "Call cardiology"})
    assert r.status_code == 201 and r.json()["author"] == "Dr. Natalia Popescu"

    inbox = elena.get(f"/api/meetings/{mid}/suggestions").json()
    assert [s["text"] for s in inbox] == ["Call cardiology"]
    assert elena.post(f"/api/meetings/{mid}/suggestions/{inbox[0]['id']}/resolve", json={"accepted": True}).status_code == 204
    assert elena.get(f"/api/meetings/{mid}/suggestions").json() == []
    assert natalia.get(f"/api/meetings/{mid}/suggestions").json()[0]["state"] == "accepted"


def test_minutes_failure_keeps_transcript_and_retry_redoes_only_minutes(app, pipeline):
    c = client(app, ELENA)
    pipeline.fail_minutes = True
    mid = processed(app, c)
    meeting = c.get(f"/api/meetings/{mid}").json()
    assert meeting["status"] == "failed" and "Ollama" in meeting["error"] and meeting["hasTranscript"]
    stages = {s["name"]: s["state"] for s in c.get(f"/api/meetings/{mid}/progress").json()["stages"]}
    assert stages["transcribe"] == "done" and stages["minutes"] == "failed"

    pipeline.fail_minutes = False
    assert c.post(f"/api/meetings/{mid}/retry").status_code == 200
    assert app.state.runner.wait_idle()
    assert c.get(f"/api/meetings/{mid}").json()["status"] == "draft"
    assert pipeline.transcribed == 1  # the transcript was reused


def test_queue_position_and_delete(app, pipeline):
    c = client(app, ELENA)
    pipeline.gate.clear()
    first, second = upload(c).json()["id"], upload(c).json()["id"]
    assert c.get(f"/api/meetings/{second}").json()["queuePosition"] == 1
    assert c.delete(f"/api/meetings/{second}").status_code == 409
    pipeline.gate.set()
    assert app.state.runner.wait_idle()
    assert c.delete(f"/api/meetings/{second}").status_code == 204
    assert [m["id"] for m in c.get("/api/meetings").json()] == [first]


def test_restart_marks_interrupted_job_failed(tmp_path, pipeline):
    settings = Settings(storage_dir=tmp_path, seed_password="pw")
    app = create_app(settings, pipeline, smtp=FakeSMTP)
    c = client(app, ELENA)
    mid = processed(app, c)
    app.state.store.update_meeting(mid, status="processing")
    again = create_app(settings, pipeline, smtp=FakeSMTP)
    assert again.state.store.meeting(mid)["status"] == "failed"


def test_convert_without_participants_or_issues():
    doc = minutes_doc({"topics": [{"name": "Budget", "time": "00:00", "status": "", "findings": ["Up 4%"]}]},
                      "executive")
    assert [b["label"] for b in doc["topics"][0]["blocks"]] == ["Key facts"]
    assert doc["participants"] == []


def test_no_title_takes_the_minutes_title(app):
    c = client(app, ELENA)
    r = upload(c, title="")
    assert r.status_code == 201 and r.json()["title"].startswith("Medical meeting — ")
    assert app.state.runner.wait_idle()
    mid = r.json()["id"]
    assert c.get(f"/api/meetings/{mid}").json()["title"] == "ICU round"
    assert c.get(f"/api/meetings/{mid}/minutes").json()["title"] == "ICU round"


def test_old_database_gets_new_columns(tmp_path, pipeline):
    import sqlite3
    db = tmp_path / "app.db"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE meetings (id INTEGER PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL, "
                 "language TEXT NOT NULL, speakers INTEGER, source TEXT NOT NULL, duration REAL, status TEXT NOT NULL, "
                 "error TEXT, topic_count INTEGER, stages TEXT, created REAL NOT NULL, created_by INTEGER, "
                 "approved REAL, approved_by INTEGER)")
    conn.commit()
    conn.close()
    app = create_app(Settings(storage_dir=tmp_path, seed_password="pw"), pipeline, smtp=FakeSMTP)
    assert processed(app, client(app, ELENA))
