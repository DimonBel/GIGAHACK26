"""Uploads: size limit (413), audio check (415), form checks (400), private storage."""
import os
import stat
import subprocess
import threading
import wave
from pathlib import Path

MB = 1024 * 1024


def _mode(path: Path) -> int:
    return stat.S_IMODE(os.stat(path).st_mode)


def _silence(path: Path, seconds: float) -> Path:
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(16000)
        f.writeframes(b"\0\0" * int(16000 * seconds))
    return path


def _browser_recording(path: Path, seconds: float) -> Path:
    """Opus in WebM without a duration in its header, as MediaRecorder writes it (streamed, never seeked)."""
    with open(path, "wb") as f:
        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
                        "-c:a", "libopus", "-f", "webm", "pipe:1"], stdout=f, check=True)
    return path


def test_recording_over_the_length_limit_is_413(login, upload, config, tmp_path):
    assert login("admin").put("/api/settings", json={"max_duration_min": 1}).status_code == 200
    moderator = login("moderator")
    response = upload(moderator, path=_silence(tmp_path / "long.wav", 61))
    assert response.status_code == 413 and response.json()["detail"] == "The recording is longer than 1 minutes"
    browser = upload(moderator, path=_browser_recording(tmp_path / "blob", 61), content_type="audio/webm")
    assert browser.status_code == 413  # the length comes from the packets when the header has none
    assert list(config.audio_dir.iterdir()) == []
    assert upload(moderator, path=_silence(tmp_path / "short.wav", 59)).status_code == 201


def test_upload_over_the_limit_is_413(login, upload, config, tmp_path):
    assert login("admin").put("/api/settings", json={"max_upload_mb": 1}).status_code == 200
    response = upload(login("moderator"), path=_silence(tmp_path / "long.wav", 40))  # 1.3 MB
    assert response.status_code == 413 and "1 MB" in response.json()["detail"]
    assert list(config.audio_dir.iterdir()) == []


def test_streamed_upload_over_the_limit_is_413(login, config):
    """Without a Content-Length the limit is enforced while the file arrives."""
    login("admin").put("/api/settings", json={"max_upload_mb": 1})
    boundary = "secure-mom-test"
    head = (f'--{boundary}\r\nContent-Disposition: form-data; name="meeting_type"\r\n\r\nmedical\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.wav"\r\n'
            f"Content-Type: audio/wav\r\n\r\n").encode()

    def body():
        yield head
        for _ in range(20):
            yield b"\0" * 65536
        yield f"\r\n--{boundary}--\r\n".encode()

    response = login("moderator").post("/api/meetings", content=body(),
                                       headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    assert response.status_code == 413
    assert list(config.audio_dir.iterdir()) == []


def test_form_fields_around_the_file_are_limited(login, config, wav):
    """Text fields stay in memory: many of them are 413, even streamed without a Content-Length."""
    boundary = "secure-mom-test"

    def body():
        for i in range(20):
            yield f'--{boundary}\r\nContent-Disposition: form-data; name="f{i}"\r\n\r\n{"x" * 4000}\r\n'.encode()
        yield (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.wav"\r\n'
               f"Content-Type: audio/wav\r\n\r\n").encode() + wav.read_bytes() + f"\r\n--{boundary}--\r\n".encode()

    response = login("moderator").post("/api/meetings", content=body(),
                                       headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    assert response.status_code == 413 and response.json()["detail"] == "The form fields are too large"
    assert list(config.audio_dir.iterdir()) == []


def test_files_without_audio_are_415(login, upload, config, tmp_path):
    moderator = login("moderator")
    text = tmp_path / "notes.wav"
    text.write_text("these are not the minutes you are looking for")
    assert upload(moderator, path=text).status_code == 415
    playlist = tmp_path / "playlist.m4a"  # a playlist would make ffmpeg open the files it names
    playlist.write_text("#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nsegment.wav\n#EXT-X-ENDLIST\n")
    assert upload(moderator, path=playlist).status_code == 415
    assert list(config.audio_dir.iterdir()) == []


def test_form_is_checked(login, upload, tmp_path, config):
    moderator = login("moderator")
    assert upload(moderator, meeting_type="party").status_code == 400
    for language in ("de", "RO", ""):
        response = upload(moderator, minutes_language=language)
        assert response.status_code == 400, language
        assert response.json()["detail"] == "minutes_language must be one of: ro, ru, en"
    assert moderator.post("/api/meetings", data={"meeting_type": "medical"}).status_code == 400
    assert moderator.post("/api/meetings", json={"meeting_type": "medical"}).status_code == 400
    no_file = moderator.post("/api/meetings", files={"other": ("a.wav", b"123")}, data={"meeting_type": "medical"})
    assert no_file.status_code == 400
    empty = tmp_path / "empty.wav"
    empty.write_bytes(b"")
    assert upload(moderator, path=empty).status_code == 400
    too_long = moderator.post("/api/meetings", files={"file": ("a.wav", b"123")},
                              data={"meeting_type": "medical", "title": "x" * 5000})
    assert too_long.status_code == 400
    assert list(config.audio_dir.iterdir()) == []


def test_storage_is_private(config, login, upload, pipeline, wait):
    pipeline.gate = threading.Event()
    moderator = login("moderator")
    meeting = upload(moderator).json()
    wait(moderator, meeting["id"], statuses=("processing",))
    [audio] = config.audio_dir.iterdir()
    assert _mode(audio) == 0o600 and audio.suffix == ".wav" and len(audio.stem) == 32  # not the upload's name
    assert _mode(config.data_dir) == _mode(config.audio_dir) == 0o700
    assert _mode(config.db_path) == 0o600
    pipeline.gate.set()
    wait(moderator, meeting["id"])


def test_browser_recording(login, upload, wait, tmp_path, pipeline):
    """MediaRecorder uploads a Blob named "blob" with type audio/webm, and no duration in the header."""
    moderator = login("moderator")
    response = upload(moderator, path=_browser_recording(tmp_path / "blob", 2.5), content_type="audio/webm;codecs=opus")
    assert response.status_code == 201 and response.json()["duration_s"] == 2.5
    wait(moderator, response.json()["id"])
    assert pipeline.audio[0].suffix == ".webm"


def test_json_bodies_are_limited(client):
    response = client.post("/api/auth/login", content=b"{" + b" " * (2 * MB) + b"}",
                           headers={"Content-Type": "application/json"})
    assert response.status_code == 413
