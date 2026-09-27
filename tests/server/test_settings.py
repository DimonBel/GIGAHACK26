"""Runtime settings (admin)."""
import dataclasses

from fastapi.testclient import TestClient

from server.app import create_app

KEYS = {"asr_engine", "asr_model", "llm_model", "language", "delivery", "n8n_webhook_url", "smtp_host", "smtp_port",
        "mail_from", "allowed_recipient_domains", "keep_audio_days", "max_upload_mb", "max_duration_min"}


def test_defaults(login):
    settings = login("admin").get("/api/settings").json()
    assert set(settings) == KEYS
    assert settings["delivery"] == "n8n" and settings["n8n_webhook_url"].startswith("http://127.0.0.1:")
    assert (settings["smtp_host"], settings["smtp_port"]) == ("127.0.0.1", 1025)
    assert settings["keep_audio_days"] == 0 and settings["max_upload_mb"] == 500 and settings["max_duration_min"] == 240
    assert settings["allowed_recipient_domains"] == ["medpark.md", "medpark.local"]
    assert settings["asr_engine"] in ("mlx", "whisper.cpp") and settings["language"] == "auto"


def test_partial_update_is_saved_and_audited(login):
    admin = login("admin")
    response = admin.put("/api/settings", json={"delivery": "smtp", "smtp_port": 2525,
                                                "mail_from": "MOM@Medpark.local"})
    assert response.status_code == 200
    assert response.json()["delivery"] == "smtp" and response.json()["mail_from"] == "mom@medpark.local"
    assert admin.get("/api/settings").json()["smtp_port"] == 2525
    entry = admin.get("/api/audit").json()[0]
    assert entry["action"] == "settings" and "smtp_port: 1025 -> 2525" in entry["detail"]


def test_invalid_settings_are_400(login):
    admin = login("admin")
    for body in ({"delivery": "gmail"}, {"smtp_port": 0}, {"keep_audio_days": -1}, {"max_upload_mb": 0},
                 {"mail_from": "nobody"}, {"language": "english"}, {"n8n_webhook_url": "ftp://127.0.0.1/x"},
                 {"llm_model": "bad model name"}, {"surprise": 1}, {"max_duration_min": 0},
                 {"allowed_recipient_domains": "medpark.md"}, {"allowed_recipient_domains": ["@medpark.md"]},
                 {"allowed_recipient_domains": ["medpark"]}, {"allowed_recipient_domains": ["a b.md"]}):
        assert admin.put("/api/settings", json=body).status_code == 400, body


def test_recipient_domains_are_normalized(login):
    admin = login("admin")
    response = admin.put("/api/settings", json={"allowed_recipient_domains": [" MedPark.MD", "medpark.md", "x.org"]})
    assert response.status_code == 200 and response.json()["allowed_recipient_domains"] == ["medpark.md", "x.org"]
    assert login("moderator").get("/api/directory/domains").json() == ["medpark.md", "x.org"]


def test_mail_must_stay_on_this_machine(login):
    admin = login("admin")
    for body in ({"smtp_host": "smtp.gmail.com"}, {"smtp_host": "10.0.0.5"},
                 {"n8n_webhook_url": "https://hooks.example.com/secure-mom"}):
        response = admin.put("/api/settings", json=body)
        assert response.status_code == 400 and "this machine" in response.json()["detail"], body
    assert admin.put("/api/settings", json={"smtp_host": "localhost"}).status_code == 200


def test_remote_mail_host_allowed_by_flag(config, pipeline, mailer, users, password):
    app = create_app(dataclasses.replace(config, allow_remote_delivery=True), pipeline=pipeline, mailer=mailer)
    with TestClient(app) as admin:
        token = admin.post("/api/auth/login", json={"email": "admin@medpark.md", "password": password}).json()
        admin.headers["X-CSRF-Token"] = token["csrf_token"]
        assert admin.put("/api/settings", json={"smtp_host": "mail.medpark.md"}).status_code == 200


def test_speech_model_is_checked(login):
    admin = login("admin")
    response = admin.put("/api/settings", json={"asr_engine": "whisper.cpp", "asr_model": "models/missing.bin"})
    assert response.status_code == 400 and "not found" in response.json()["detail"]
