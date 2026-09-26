"""The meeting lifecycle: upload -> processing -> ready -> edit -> approve ("I agree") -> send -> read."""
import os
import selectors
import shutil
import subprocess
import sys
import threading
import time

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select

from server.app import create_app
from server.db import Meeting, Minutes, Transcript, User
from server.jobs import INTERRUPTED, SttPipeline
from server.mail import DeliveryError
from server.routes.meetings import MAX_UNFINISHED
from server.schemas import minutes_doc
from server.transcribe import ProcessingError, utterance_json
from stt.config import ROOT
from stt.speakers.dialog import Utterance

CHILD_SETTINGS = {"asr_engine": "whisper.cpp", "asr_model": "models/ggml-large-v3.bin", "language": "auto"}
# A transcription child that starts a helper (like whisper-server) holding the pipe end argv[1] and, unless it is
# killed, ends after 2 s without it: the helper would outlive it.
STARTS_A_HELPER = ("import json, subprocess, sys, time; "
                   "subprocess.Popen(['sleep', '60'], pass_fds=(int(sys.argv[1]),), stdout=subprocess.DEVNULL); "
                   "print(json.dumps({'progress': ['converting', 0, 0]}), flush=True); time.sleep(2)")
ENDED_WAIT_S = 10


def test_lifecycle(login, upload, wait, mailer):
    moderator = login("moderator")
    response = upload(moderator, title="Medical board 26.09")
    assert response.status_code == 201
    created = response.json()
    assert created["status"] == "queued" and created["title"] == "Medical board 26.09"
    assert created["meeting_type"] == "medical" and created["created_by"]["full_name"] == "Moderator Test"
    assert created["duration_s"] == 0.5
    meeting = wait(moderator, created["id"])
    assert meeting["status"] == "ready" and meeting["language"] == "ro" and meeting["error"] is None
    assert meeting["progress"] == {"stage": "done", "done": 0, "total": 0, "message": "Done"}
    assert all(meeting["timings"][k] is not None for k in ("transcription_s", "minutes_s", "total_s"))
    path = f"/api/meetings/{meeting['id']}"

    transcript = moderator.get(path + "/transcript").json()
    assert transcript["language"] == "ro"
    assert transcript["utterances"][0] == {"start": 0.5, "end": 4.2, "speaker": "SPEAKER 1",
                                           "role": "leads the round", "languages": ["ro"], "accent": "",
                                           "text": "Pacientul din patul 8 are febră."}
    assert moderator.get(path + "/audio").status_code == 404  # keep_audio_days 0: deleted once processed

    minutes = moderator.get(path + "/minutes").json()
    assert minutes["topics"][0]["name"] == "Bed 8"
    minutes["title"] = "Medical board: bed 8"
    minutes["action_items"][0]["priority"] = "HIGH"
    edited = moderator.put(path + "/minutes", json=minutes)
    assert edited.status_code == 200 and edited.json()["action_items"][0]["priority"] == "high"
    assert moderator.get(path + "/minutes").json()["title"] == "Medical board: bed 8"

    assert moderator.post(path + "/send", json={"to": ["ana@medpark.md"]}).status_code == 409  # not approved
    approved = moderator.post(path + "/approve").json()
    assert approved["status"] == "approved" and approved["approved_by"]["full_name"] == "Moderator Test"
    assert moderator.put(path + "/minutes", json=minutes).status_code == 409  # frozen once approved
    assert moderator.post(path + "/reopen").json()["status"] == "ready"
    assert moderator.post(path + "/approve").json()["status"] == "approved"

    sent = moderator.post(path + "/send", json={"to": ["ana@medpark.md", "ANA@medpark.md"],
                                                "cc": ["quality@medpark.md", "ana@medpark.md"]})
    assert sent.status_code == 200
    assert sent.json()["status"] == "sent" and sent.json()["sent_at"]
    assert sent.json()["recipients"] == {"to": ["ana@medpark.md"], "cc": ["quality@medpark.md"]}
    [email] = mailer.sent
    assert (email.to, email.cc) == (["ana@medpark.md"], ["quality@medpark.md"])
    assert email.subject == "[Medical] Medical board 26.09" and email.meeting_type == "medical"
    assert "Medical board: bed 8" in email.html and "<script>" not in email.html
    assert moderator.post(path + "/send", json={"to": ["ana@medpark.md"]}).status_code == 409  # sent already

    reader = login("user")
    assert [m["id"] for m in reader.get("/api/meetings").json()] == [meeting["id"]]
    assert reader.get(path).json()["status"] == "sent"
    assert reader.get(path + "/minutes").json()["title"] == "Medical board: bed 8"
    assert reader.get(path + "/transcript").status_code == 403
    assert login("user2").get(path + "/minutes").status_code == 404

    audit = login("admin").get("/api/audit", params={"meeting_id": meeting["id"]}).json()
    assert [a["action"] for a in audit] == ["view_minutes", "send", "approve", "reopen", "approve", "edit_minutes",
                                            "view_transcript", "upload"]
    assert audit[0]["user"] == "ana@medpark.md"
    assert audit[1]["user"] == "ion@medpark.md" and "quality@medpark.md" in audit[1]["detail"]


def test_one_meeting_at_a_time(login, upload, wait, pipeline):
    pipeline.gate = threading.Event()
    moderator = login("moderator")
    first, second = upload(moderator).json()["id"], upload(moderator).json()["id"]
    processing = wait(moderator, first, statuses=("processing",))
    assert processing["progress"]["stage"] == "converting"
    assert moderator.get(f"/api/meetings/{second}").json()["status"] == "queued"
    assert moderator.get(f"/api/meetings/{first}/transcript").status_code == 409
    assert moderator.get(f"/api/meetings/{first}/minutes").status_code == 409
    assert moderator.post(f"/api/meetings/{first}/approve").status_code == 409
    assert moderator.delete(f"/api/meetings/{first}").status_code == 409
    pipeline.gate.set()
    assert wait(moderator, first)["status"] == "ready"
    assert wait(moderator, second)["status"] == "ready"


def test_deleted_queued_meeting_is_skipped(login, upload, wait, pipeline):
    pipeline.gate = threading.Event()
    moderator = login("moderator")
    first, second = upload(moderator).json()["id"], upload(moderator).json()["id"]
    wait(moderator, first, statuses=("processing",))
    assert moderator.delete(f"/api/meetings/{second}").status_code == 204
    pipeline.gate.set()
    third = upload(moderator).json()["id"]
    wait(moderator, third)
    assert len(pipeline.audio) == 2


@pytest.mark.parametrize(("error", "shown"), [
    (RuntimeError("Could not reach Ollama at http://127.0.0.1:11434/api/chat. Is it running? (refused)"),
     "The local LLM (Ollama) is not reachable. Is it running?"),
    (FileNotFoundError("Model not found: /Users/it/secure-mom/models/ggml-large-v3.bin"),
     "The speech model is missing on the server"),
    (FileNotFoundError(2, "No such file or directory", "/Users/it/secure-mom/data/tmp/input.wav"),
     "Processing failed (FileNotFoundError); the server log has the details"),
    (KeyError("speaker"), "Processing failed (KeyError); the server log has the details"),
])
def test_failure_is_readable_without_paths_or_urls(login, upload, wait, pipeline, config, error, shown):
    pipeline.error = error
    moderator = login("moderator")
    meeting = wait(moderator, upload(moderator).json()["id"])
    assert meeting["status"] == "failed" and meeting["error"] == shown
    assert list(config.audio_dir.iterdir()) == []


def test_audio_kept_with_retention(login, upload, wait, wav, config):
    admin = login("admin")
    assert admin.put("/api/settings", json={"keep_audio_days": 7}).status_code == 200
    moderator = login("moderator")
    meeting = wait(moderator, upload(moderator).json()["id"])
    path = f"/api/meetings/{meeting['id']}"
    audio = moderator.get(path + "/audio")
    assert audio.status_code == 200 and audio.content == wav.read_bytes()
    assert audio.headers["content-type"] == "audio/wav"
    part = moderator.get(path + "/audio", headers={"Range": "bytes=0-9"})
    assert part.status_code == 206 and part.content == wav.read_bytes()[:10]
    assert moderator.get(path + "/audio", headers={"Range": "bytes=0-"}).status_code == 206
    actions = [e["action"] for e in admin.get("/api/audit", params={"meeting_id": meeting["id"]}).json()]
    assert actions.count("view_audio") == 2  # each playback once: its first request, not the ones that go on
    assert moderator.delete(path).status_code == 204
    assert list(config.audio_dir.iterdir()) == []


def test_no_speech_skips_the_llm(login, upload, wait, pipeline):
    pipeline.utterances = []
    moderator = login("moderator")
    meeting = wait(moderator, upload(moderator).json()["id"])
    assert meeting["status"] == "ready"
    minutes = moderator.get(f"/api/meetings/{meeting['id']}/minutes").json()
    assert minutes["title"] == "No speech detected" and minutes["warnings"]
    assert pipeline.minutes_calls == 0


def test_minutes_edits_are_validated(ready):
    moderator, meeting = ready
    path = f"/api/meetings/{meeting['id']}/minutes"
    assert moderator.put(path, json={"title": "x" * 5000}).status_code == 400
    assert moderator.put(path, json={"topics": "not a list"}).status_code == 400
    response = moderator.put(path, json={"title": "Short", "unknown": 1})
    assert response.status_code == 200
    assert "unknown" not in response.json() and response.json()["topics"] == []  # PUT replaces the whole document


def test_minutes_errors_do_not_quote_the_minutes():
    """The server log gets the error when the LLM's minutes don't fit: it must not quote patient data."""
    with pytest.raises(ValidationError) as error:
        minutes_doc({"summary": "Pacientul Ion Popescu din patul 8. " * 1000})
    assert "summary" in str(error.value) and "Popescu" not in str(error.value)


def test_send_checks_the_recipients(ready, mailer):
    moderator, meeting = ready
    path = f"/api/meetings/{meeting['id']}"
    moderator.post(path + "/approve")
    for body in ({"to": []}, {"cc": ["a@medpark.md"]}, {"to": ["not an email"]},
                 {"to": ["a@medpark.md\r\nBcc: spy@example.com"]}, {"to": ["a@medpark.md"], "cc": ["b@"]}):
        assert moderator.post(path + "/send", json=body).status_code == 400, body
    assert mailer.sent == []


def test_recipients_must_be_in_the_allowed_domains(ready, mailer, login):
    moderator, meeting = ready
    path = f"/api/meetings/{meeting['id']}"
    moderator.post(path + "/approve")
    for body in ({"to": ["ana@gmail.com"]}, {"to": ["ana@medpark.md"], "cc": ["spy@medpark.md.evil.com"]},
                 {"to": ["ana@sub.medpark.md"]}):
        response = moderator.post(path + "/send", json=body)
        assert response.status_code == 400, body
        assert response.json()["detail"].startswith("Not in an allowed recipient domain (medpark.md, medpark.local)")
    assert mailer.sent == []
    assert login("admin").put("/api/settings", json={"allowed_recipient_domains": []}).status_code == 200
    response = moderator.post(path + "/send", json={"to": ["ana@medpark.md"], "cc": ["colleague@gmail.com"]})
    assert response.status_code == 200  # an empty list allows any domain


def test_failed_delivery_keeps_it_approved_and_hides_the_details(ready, mailer, login):
    moderator, meeting = ready
    path = f"/api/meetings/{meeting['id']}"
    moderator.post(path + "/approve")
    mailer.error = DeliveryError("n8n is not reachable",
                                 "n8n is not reachable at http://127.0.0.1:5678/webhook/secure-mom (refused)")
    response = moderator.post(path + "/send", json={"to": ["ana@medpark.md"]})
    assert response.status_code == 502
    assert response.json()["detail"] == "The email could not be sent: n8n is not reachable"
    assert moderator.get(path).json()["status"] == "approved"
    audit = login("admin").get("/api/audit", params={"meeting_id": meeting["id"]}).json()
    assert audit[0]["action"] == "send_failed" and "127.0.0.1" not in audit[0]["detail"]


def test_delete_removes_transcript_and_minutes(app, config, ready, login):
    moderator, meeting = ready
    path = f"/api/meetings/{meeting['id']}"
    assert moderator.delete(path).status_code == 204
    assert moderator.get(path).status_code == 404
    with app.state.db() as db:
        assert db.get(Transcript, meeting["id"]) is None and db.get(Minutes, meeting["id"]) is None
    db_file = config.db_path.read_bytes() + config.db_path.with_name(config.db_path.name + "-wal").read_bytes()
    assert b"patul 8" not in db_file  # secure_delete: the transcript is overwritten, not left behind
    audit = login("admin").get("/api/audit", params={"meeting_id": meeting["id"]}).json()
    assert (audit[0]["action"], audit[0]["detail"]) == ("delete", "medical")  # not the title: it may name patients


def test_uploads_per_moderator_are_limited(login, upload, wait, pipeline, config):
    pipeline.gate = threading.Event()
    moderator = login("moderator")
    waiting = [upload(moderator).json()["id"] for _ in range(MAX_UNFINISHED)]
    response = upload(moderator)
    assert response.status_code == 429 and f"{MAX_UNFINISHED} meetings" in response.json()["detail"]
    assert len(list(config.audio_dir.iterdir())) == MAX_UNFINISHED
    assert upload(login("moderator2")).status_code == 201  # another moderator's queue
    pipeline.gate.set()
    for meeting_id in waiting:
        wait(moderator, meeting_id)
    assert upload(moderator).status_code == 201


def test_default_title(login, upload):
    created = upload(login("moderator"), meeting_type="executive", title="  ").json()
    assert created["title"].startswith("Executive meeting ")


def test_restart_requeues_interrupted_meetings(app, config, pipeline, mailer, users, wav):
    """A restart finds meetings the old process left queued or processing (the first app never started)."""
    def meeting(key: str, status: str, attempts: int, audio: bool) -> Meeting:
        name = f"{key}.wav"
        if audio:
            shutil.copy(wav, config.audio_dir / name)
        return Meeting(id=key * 32, title=key, meeting_type="medical", status=status, attempts=attempts,
                       created_by_id=users["moderator"].id, audio_file=name)

    with app.state.db() as db:
        db.add_all([meeting("a", "processing", 1, True), meeting("b", "queued", 0, True),
                    meeting("c", "processing", 1, False), meeting("d", "processing", 2, True)])
        db.commit()
    with TestClient(create_app(config, pipeline=pipeline, mailer=mailer)):
        deadline = time.monotonic() + 10
        while True:
            with app.state.db() as db:
                states = {m.id[0]: (m.status, m.error) for m in db.scalars(select(Meeting))}
            if states["a"][0] == states["b"][0] == "ready" or time.monotonic() > deadline:
                break
            time.sleep(0.02)
    assert states == {"a": ("ready", None), "b": ("ready", None), "c": ("failed", INTERRUPTED),
                      "d": ("failed", INTERRUPTED)}
    assert list(config.audio_dir.iterdir()) == []


def test_users_are_deactivated_not_deleted_so_meetings_keep_their_author(app, ready, login, users):
    _, meeting = ready
    admin = login("admin")
    assert admin.delete(f"/api/users/{users['moderator'].id}").status_code == 204
    assert admin.get(f"/api/meetings/{meeting['id']}").json()["created_by"]["full_name"] == "Moderator Test"
    with app.state.db() as db:
        assert db.scalar(select(User.active).where(User.id == users["moderator"].id)) is False


def test_transcription_child_reports_errors(tmp_path, monkeypatch):
    """The real child process (no models needed: it fails before loading them), with its temporary files in
    the private scratch folder and its own process group. Its errors name no server paths."""
    scratch = tmp_path / "scratch"
    scratch.mkdir()
    started = []
    popen = subprocess.Popen
    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs: started.append(kwargs) or popen(*args, **kwargs))
    stages = []
    missing = tmp_path / "missing.wav"
    with pytest.raises(ProcessingError, match="the server log has the details") as error:
        SttPipeline(scratch).transcribe(missing, CHILD_SETTINGS, lambda stage, done, total: stages.append(stage))
    assert "missing.wav" not in str(error.value)
    assert stages == ["converting"]
    assert started[0]["env"]["TMPDIR"] == str(scratch) and started[0]["start_new_session"] is True
    garbage = tmp_path / "garbage.wav"
    garbage.write_bytes(b"not audio")
    with pytest.raises(ProcessingError, match="ffmpeg could not decode the recording"):
        SttPipeline(scratch).transcribe(garbage, CHILD_SETTINGS, lambda *progress: None)
    assert list(scratch.iterdir()) == []


def _ended(read_end: int) -> bool:
    """True once every process holding the pipe's write end has ended: its read end sees EOF (even before init
    reaps an orphan)."""
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(read_end, selectors.EVENT_READ)
            return bool(selector.select(ENDED_WAIT_S)) and os.read(read_end, 1) == b""
    finally:
        os.close(read_end)


def test_cancel_kills_the_transcription_and_what_it_started(tmp_path, monkeypatch):
    """What the server does when it stops: whisper-server (here: a helper) must not outlive the child."""
    helper_alive, write_end = os.pipe()
    popen = subprocess.Popen
    monkeypatch.setattr(subprocess, "Popen", lambda command, **kwargs: popen(
        [sys.executable, "-c", STARTS_A_HELPER, str(write_end)], pass_fds=(write_end,), **kwargs))
    pipeline = SttPipeline(tmp_path)
    with pytest.raises(ProcessingError, match="stopped unexpectedly"):
        pipeline.transcribe(tmp_path / "a.wav", CHILD_SETTINGS, lambda *progress: pipeline.cancel())
    os.close(write_end)
    assert _ended(helper_alive)


def test_child_ends_its_process_group_when_the_server_is_gone():
    """The child notices that the server is gone (its stdin closes) and takes whisper-server along."""
    helper_alive, write_end = os.pipe()
    code = ("import subprocess, sys, time; from server.transcribe import _exit_with_parent; _exit_with_parent(); "
            "subprocess.Popen(['sleep', '60'], pass_fds=(int(sys.argv[1]),)); print(flush=True); time.sleep(60)")
    child = subprocess.Popen([sys.executable, "-c", code, str(write_end)], cwd=ROOT, stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, pass_fds=(write_end,), start_new_session=True)
    os.close(write_end)
    child.stdout.readline()  # the helper runs
    child.stdin.close()
    child.wait(timeout=ENDED_WAIT_S)
    child.stdout.close()
    assert _ended(helper_alive)


def test_stopping_the_server_keeps_the_meeting_for_the_next_start(app, config, mailer, login, upload, wait,
                                                                     pipeline):
    pipeline.gate = threading.Event()
    moderator = login("moderator")
    meeting_id = upload(moderator).json()["id"]
    wait(moderator, meeting_id, statuses=("processing",))
    app.state.jobs.stop()
    assert pipeline.cancelled
    assert moderator.get(f"/api/meetings/{meeting_id}").json()["status"] == "processing"  # not failed
    pipeline.cancelled, pipeline.gate = False, None
    with TestClient(create_app(config, pipeline=pipeline, mailer=mailer)) as restarted:
        restarted.cookies, restarted.headers = moderator.cookies, moderator.headers
        assert wait(restarted, meeting_id)["status"] == "ready"


def test_scratch_files_are_deleted_after_each_meeting(config, login, upload, wait, pipeline, monkeypatch):
    """A child killed while it transcribes (out of memory) leaves the decoded recording behind."""
    transcribe = pipeline.transcribe

    def killed_child(audio, settings, on_progress, meeting_type=None):
        (config.temp_dir / "tmpabc123").mkdir()
        (config.temp_dir / "tmpabc123" / "input.wav").write_bytes(b"RIFF")
        return transcribe(audio, settings, on_progress, meeting_type)

    monkeypatch.setattr(pipeline, "transcribe", killed_child)
    moderator = login("moderator")
    assert wait(moderator, upload(moderator).json()["id"])["status"] == "ready"
    assert list(config.temp_dir.iterdir()) == []


def test_scratch_files_are_deleted_at_start(config, pipeline, mailer):
    """What a transcription left behind when the server stopped or crashed is gone once it starts again."""
    app = create_app(config, pipeline=pipeline, mailer=mailer)
    (config.temp_dir / "tmpabc123").mkdir()
    (config.temp_dir / "tmpabc123" / "input.wav").write_bytes(b"RIFF")
    (config.temp_dir / "stray.wav").write_bytes(b"RIFF")
    with TestClient(app):
        assert list(config.temp_dir.iterdir()) == []


def test_transcript_utterances_name_the_accent():
    """The child writes accents as the web shows them ("American"), not as the model's labels ("us")."""
    english = Utterance(1.234, 5.678, "SPEAKER 1", "The deadline is Friday.", accent="us")
    romanian = Utterance(6.0, 8.0, "SPEAKER 2", "Bine.")
    assert utterance_json(english) == {"start": 1.23, "end": 5.68, "speaker": "SPEAKER 1", "languages": [],
                                       "accent": "American", "text": "The deadline is Friday."}
    assert utterance_json(romanian)["accent"] == ""


def test_minutes_written_during_the_transcription_are_used(login, upload, wait, pipeline, monkeypatch):
    """The child writes the minutes while it transcribes; they are not written again here."""
    transcribe = pipeline.transcribe

    def with_minutes(audio, settings, on_progress, meeting_type=None):
        transcription = transcribe(audio, settings, on_progress, meeting_type)
        on_progress("minutes")
        transcription.minutes = {"title": "Written during the transcription", "summary": "Bed 8 is stable."}
        return transcription

    monkeypatch.setattr(pipeline, "transcribe", with_minutes)
    moderator = login("moderator")
    meeting = wait(moderator, upload(moderator).json()["id"])
    assert meeting["status"] == "ready" and pipeline.minutes_calls == 0
    assert moderator.get(f"/api/meetings/{meeting['id']}/minutes").json()["title"] == "Written during the transcription"
    assert all(meeting["timings"][k] is not None for k in ("transcription_s", "minutes_s", "total_s"))


def test_a_playback_starting_with_any_range_is_audited(login, upload, wait):
    """Safari starts with "bytes=0-1", a download tool with any range: audited when the user hadn't just played it."""
    admin = login("admin")
    assert admin.put("/api/settings", json={"keep_audio_days": 7}).status_code == 200
    moderator = login("moderator")
    meeting = wait(moderator, upload(moderator).json()["id"])
    path = f"/api/meetings/{meeting['id']}/audio"
    assert moderator.get(path, headers={"Range": "bytes=0-1"}).status_code == 206
    assert moderator.get(path, headers={"Range": "bytes=2-9"}).status_code == 206  # the same playback goes on
    actions = [e["action"] for e in admin.get("/api/audit", params={"meeting_id": meeting["id"]}).json()]
    assert actions.count("view_audio") == 1
