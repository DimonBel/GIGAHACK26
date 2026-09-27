"""Backend test fixtures: the app on a temporary data folder with a fake speech pipeline and a fake mailer
(no models, no network), an account per role, and signed-in clients."""
import copy
import threading
import time
import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.config import Config
from server.db import User
from server.jobs import Transcription
from server.mail import DeliveryError
from server.security import hash_password

PASSWORD = "correct horse battery staple"
TEST_HOSTS = ("testserver", "127.0.0.1", "localhost")
WAIT_S = 10
ACCOUNTS = {"admin": ("admin@medpark.md", "admin"), "moderator": ("ion@medpark.md", "moderator"),
            "moderator2": ("maria@medpark.md", "moderator"), "user": ("ana@medpark.md", "user"),
            "user2": ("vlad@medpark.md", "user")}
UTTERANCES = [
    {"start": 0.5, "end": 4.2, "speaker": "SPEAKER 1", "languages": ["ro"], "accent": "",
     "text": "Pacientul din patul 8 are febră."},
    {"start": 4.5, "end": 7.0, "speaker": "SPEAKER 2", "languages": ["ro", "ru"], "accent": "",
     "text": "Da, короче, facem analizele."},
]
MINUTES = {
    "title": "Round <script>alert('title')</script>",
    "summary": "Bed 8 has a fever.\n<img src=x onerror=alert(1)>",
    "key_moments": [{"time": "00:04", "moment": "Blood tests ordered — Bed 8"}],
    "topics": [{"name": "Bed 8", "time": "00:00", "status": "fever <b>38.5</b>", "findings": ["38.5 °C"]}],
    "decisions": [{"decision": "Order blood tests", "time": "00:04", "patient": "Bed 8"}],
    "action_items": [{"task": "Blood tests <script>x</script>", "owner": "nurse", "deadline": "today",
                      "priority": "high", "time": "00:04", "patient": "Bed 8"}],
    "open_issues": ["Bed 8: cause of the fever"],
    "warnings": [],
    "participants": {"SPEAKER 1": {"role": "leads the round", "name": "", "evidence": "asks", "seconds": 4},
                     "SPEAKER 2": {"role": "nurse", "name": "", "evidence": "", "seconds": 3}},
}


class FakePipeline:
    """Stands in for the speech pipeline: canned transcript and minutes, at once (or when gate is set)."""

    def __init__(self):
        self.utterances = UTTERANCES
        self.minutes_result = MINUTES
        self.error: Exception | None = None
        self.gate: threading.Event | None = None
        self.audio: list[Path] = []
        self.minutes_calls = 0
        self.minutes_languages: list[tuple[str, str]] = []  # (step, minutes_language it was given)
        self.instructions: list[tuple[str, str]] = []  # (step, the template's instructions it was given)
        self.cancelled = False
        self.live_updates: list[dict] = []  # reported (on_live) before the gate: what it has heard and found

    def transcribe(self, audio: Path, settings: dict, on_progress, meeting_type=None, minutes_language="ro",
                   instructions="", on_live=None) -> Transcription:
        self.audio.append(audio)
        self.minutes_languages.append(("transcribe", minutes_language))
        self.instructions.append(("transcribe", instructions))
        on_progress("converting")
        for update in self.live_updates:
            on_live(update)
        if self.gate is not None:
            self.gate.wait(WAIT_S)
        if self.cancelled:
            raise RuntimeError("The transcription stopped unexpectedly (exit code -9)")
        on_progress("transcribing", 1, 1)
        on_progress("speakers")
        if self.error is not None:
            raise self.error
        return Transcription("ro", copy.deepcopy(self.utterances))

    def minutes(self, transcription: Transcription, meeting_type: str, settings: dict, minutes_language: str,
                instructions: str = "", on_live=None) -> dict:
        self.minutes_calls += 1
        self.minutes_languages.append(("minutes", minutes_language))
        self.instructions.append(("minutes", instructions))
        return copy.deepcopy(self.minutes_result)

    def cancel(self):
        self.cancelled = True
        if self.gate is not None:
            self.gate.set()


class FakeMailer:
    """Keeps the emails instead of delivering them; set error to make the delivery fail."""

    def __init__(self):
        self.sent = []
        self.error: DeliveryError | None = None

    def deliver(self, email, settings: dict):
        if self.error:
            raise self.error
        self.sent.append(email)


@pytest.fixture(autouse=True)
def no_ollama(monkeypatch) -> list:
    """The real transcription frees Ollama's memory first: never this machine's Ollama in the tests."""
    calls = []
    monkeypatch.setattr("server.jobs.unload_all", lambda: calls.append("unload") or [])
    return calls


@pytest.fixture
def config(tmp_path) -> Config:
    return Config(data_dir=tmp_path / "data", allowed_hosts=TEST_HOSTS, web_dist=tmp_path / "no-web")


@pytest.fixture
def pipeline() -> FakePipeline:
    return FakePipeline()


@pytest.fixture
def mailer() -> FakeMailer:
    return FakeMailer()


@pytest.fixture
def app(config, pipeline, mailer):
    return create_app(config, pipeline=pipeline, mailer=mailer)


@pytest.fixture
def client(app):
    """An anonymous client; it also starts and stops the app (the job worker)."""
    with TestClient(app) as anonymous:
        yield anonymous


@pytest.fixture
def password() -> str:
    return PASSWORD


@pytest.fixture
def users(app) -> dict[str, User]:
    """One account per role, plus a second moderator and a second user, all with PASSWORD."""
    hashed = hash_password(PASSWORD)
    accounts = {key: User(email=email, full_name=f"{key.capitalize()} Test", position="Doctor", role=role,
                          password_hash=hashed) for key, (email, role) in ACCOUNTS.items()}
    with app.state.db() as db:
        db.add_all(accounts.values())
        db.commit()
    return accounts


@pytest.fixture
def login(app, client, users):
    """login("moderator") -> a client signed in as that account that sends its CSRF token."""
    def sign_in(who: str, secret: str = PASSWORD) -> TestClient:
        signed_in = TestClient(app)
        response = signed_in.post("/api/auth/login", json={"email": users[who].email, "password": secret})
        assert response.status_code == 200, response.text
        signed_in.headers["X-CSRF-Token"] = response.json()["csrf_token"]
        return signed_in
    return sign_in


@pytest.fixture
def wav(tmp_path) -> Path:
    """Half a second of silence: real audio for ffprobe."""
    path = tmp_path / "board meeting.wav"
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(16000)
        f.writeframes(b"\0\0" * 8000)
    return path


@pytest.fixture
def upload(wav):
    """upload(client, meeting_type=..., title=..., path=..., minutes_language=...) -> the response of
    POST /api/meetings (without minutes_language unless it is given)."""
    def send(signed_in: TestClient, meeting_type: str = "medical", title: str = "Medical board",
             path: Path | None = None, content_type: str = "audio/wav", minutes_language: str | None = None):
        path = path or wav
        data = {"meeting_type": meeting_type, "title": title}
        if minutes_language is not None:
            data["minutes_language"] = minutes_language
        with open(path, "rb") as f:
            return signed_in.post("/api/meetings", files={"file": (path.name, f, content_type)}, data=data)
    return send


@pytest.fixture
def wait():
    """wait(client, meeting_id) -> the meeting once it is ready or failed (or statuses=...)."""
    def until(signed_in: TestClient, meeting_id: str, statuses=("ready", "failed")) -> dict:
        deadline = time.monotonic() + WAIT_S
        while True:
            meeting = signed_in.get(f"/api/meetings/{meeting_id}").json()
            if meeting["status"] in statuses:
                return meeting
            assert time.monotonic() < deadline, f"meeting still {meeting['status']}"
            time.sleep(0.02)
    return until


@pytest.fixture
def ready(login, upload, wait):
    """A meeting of the moderator, processed: (moderator client, meeting)."""
    moderator = login("moderator")
    response = upload(moderator)
    assert response.status_code == 201, response.text
    return moderator, wait(moderator, response.json()["id"])
