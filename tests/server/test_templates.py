"""Minutes templates: every save is a new version and the newest is active; admins write them, everyone signed in
reads the active ones. They lay out the email and give the local AI its extra instructions."""
import io

import pypdf
import pytest

from stt.minutes.markdown import OFF_BY_DEFAULT, SECTIONS

DEFAULT_SECTIONS = [{"key": key, "enabled": key not in OFF_BY_DEFAULT} for key in SECTIONS]
ALL_FIELDS = {"status": True, "findings": True, "decisions": True}


def _body(**changes) -> dict:
    return {"sections": DEFAULT_SECTIONS, "topic_fields": ALL_FIELDS, "instructions": "", "note": "", **changes}


def _changes(admin) -> list[str]:
    return [e["detail"] for e in admin.get("/api/audit").json() if e["action"] == "template_change"]


def test_every_type_starts_with_the_built_in_version(login):
    templates = login("user").get("/api/templates")
    assert templates.status_code == 200
    assert templates.json() == [{"meeting_type": meeting_type, "version": 0, "sections": DEFAULT_SECTIONS,
                                 "topic_fields": ALL_FIELDS, "instructions": "", "note": "", "created_by": None,
                                 "created_at": None} for meeting_type in ("medical", "executive", "administrative")]
    assert login("admin").get("/api/templates/executive/versions").json() == [templates.json()[1]]


def test_each_save_is_a_new_version(login, users):
    admin = login("admin")
    response = admin.post("/api/templates/medical", json=_body(instructions="  Name every patient by bed.\n",
                                                               note=" Beds "))
    assert response.status_code == 201
    first = response.json()
    assert (first["meeting_type"], first["version"], first["instructions"], first["note"]) == \
        ("medical", 1, "Name every patient by bed.", "Beds")
    assert first["created_by"] == {"id": users["admin"].id, "full_name": "Admin Test"}
    assert first["created_at"].endswith("Z")
    reordered = [{"key": key, "enabled": key != "warnings"} for key in reversed(SECTIONS)]
    second = admin.post("/api/templates/medical", json=_body(sections=reordered, note="No warnings")).json()
    assert (second["version"], second["sections"], second["instructions"]) == (2, reordered, "")
    assert admin.post("/api/templates/executive", json=_body()).json()["version"] == 1  # numbered per type
    assert [t["version"] for t in login("moderator").get("/api/templates").json()] == [2, 1, 0]
    versions = admin.get("/api/templates/medical/versions").json()
    assert [v["version"] for v in versions] == [2, 1, 0] and versions[1] == first  # a version never changes
    assert _changes(admin) == ["executive v1", "medical v2", "medical v1"]


@pytest.mark.parametrize("body", [
    _body(sections=DEFAULT_SECTIONS[1:]),
    _body(sections=DEFAULT_SECTIONS + DEFAULT_SECTIONS[:1]),
    _body(sections=DEFAULT_SECTIONS[:-1] + [{"key": "suggestions", "enabled": True}]),
    _body(sections=[{"key": "summary"}] + DEFAULT_SECTIONS[1:]),
    _body(topic_fields={"status": True, "findings": True}),
    _body(topic_fields={**ALL_FIELDS, "owner": True}),
    _body(instructions="x" * 1001),
    _body(note="x" * 201),
    {"topic_fields": ALL_FIELDS},
    _body(surprise=1),
])
def test_invalid_templates_are_400(login, body):
    admin = login("admin")
    assert admin.post("/api/templates/medical", json=body).status_code == 400
    assert [v["version"] for v in admin.get("/api/templates/medical/versions").json()] == [0]


def test_what_is_wrong_is_said(login):
    admin = login("admin")
    twice = admin.post("/api/templates/medical", json=_body(sections=DEFAULT_SECTIONS + DEFAULT_SECTIONS[:1]))
    assert twice.json() == {"detail": f"sections: must list each section exactly once: {', '.join(SECTIONS)}"}
    unknown = admin.post("/api/templates/medical", json=_body(sections=[{"key": "notes", "enabled": True}]))
    assert unknown.json()["detail"].startswith("sections.0.key: Input should be 'summary', 'key_moments'")
    longest = _body(instructions="x" * 1000, note="x" * 200)
    assert admin.post("/api/templates/medical", json=longest).status_code == 201


def test_control_characters_are_dropped_from_the_instructions(login):
    """They go on the transcription process's command line, which can't take a NUL."""
    saved = login("admin").post("/api/templates/medical", json=_body(instructions="Beds\x00 by\r\n\tnumber\x1b"))
    assert saved.json()["instructions"] == "Beds by\n\tnumber"


def test_unknown_meeting_types_are_404(login):
    admin = login("admin")
    assert admin.post("/api/templates/party", json=_body()).status_code == 404
    assert admin.get("/api/templates/party/versions").status_code == 404
    assert admin.post("/api/templates/party/versions/0/restore").status_code == 404


def test_only_admins_change_templates(client, login):
    assert client.get("/api/templates").status_code == 401
    for who in ("user", "moderator"):
        someone = login(who)
        assert someone.get("/api/templates").status_code == 200, who
        assert someone.get("/api/templates/medical/versions").status_code == 403, who
        assert someone.post("/api/templates/medical", json=_body()).status_code == 403, who
        assert someone.post("/api/templates/medical/versions/0/restore").status_code == 403, who
    assert [t["version"] for t in login("admin").get("/api/templates").json()] == [0, 0, 0]


def test_restoring_makes_a_new_version_with_the_old_content(login):
    admin = login("admin")
    first = admin.post("/api/templates/medical", json=_body(instructions="Name every patient by bed.",
                                                            note="Beds")).json()
    admin.post("/api/templates/medical", json=_body(topic_fields={**ALL_FIELDS, "findings": False}))
    response = admin.post("/api/templates/medical/versions/1/restore")
    assert response.status_code == 201
    restored = response.json()
    assert restored == {**first, "version": 3, "note": "Restored version 1", "created_at": restored["created_at"]}
    built_in = admin.post("/api/templates/medical/versions/0/restore").json()
    assert (built_in["version"], built_in["note"], built_in["instructions"], built_in["sections"],
            built_in["topic_fields"]) == (4, "Restored version 0", "", DEFAULT_SECTIONS, ALL_FIELDS)
    assert admin.post("/api/templates/medical/versions/9/restore").status_code == 404
    assert admin.post("/api/templates/executive/versions/1/restore").status_code == 404  # versions are per type
    assert admin.get("/api/templates").json()[0]["version"] == 4
    assert _changes(admin) == ["medical v4 (restored v0)", "medical v3 (restored v1)", "medical v2", "medical v1"]


def _pdf_text(data: bytes) -> str:
    """The text of a PDF: the minutes the email carries."""
    return "\n".join(page.extract_text() for page in pypdf.PdfReader(io.BytesIO(data)).pages)


def test_the_email_follows_the_active_template(login, upload, wait, mailer):
    """Each email is laid out by the template active when it is sent; the audit log names a saved version."""
    admin, moderator = login("admin"), login("moderator")

    def send() -> str:
        meeting = wait(moderator, upload(moderator, minutes_language="en").json()["id"])
        path = f"/api/meetings/{meeting['id']}"
        moderator.post(path + "/approve")
        assert moderator.post(path + "/send", json={"to": ["ana@medpark.md"]}).status_code == 200
        return admin.get("/api/audit", params={"meeting_id": meeting["id"]}).json()[0]["detail"]

    assert send() == "to: ana@medpark.md; cc: -"  # the built-in template
    sections = [{"key": "open_issues", "enabled": True}] + [{"key": key, "enabled": key != "key_moments"}
                                                            for key in SECTIONS if key != "open_issues"]
    admin.post("/api/templates/medical", json=_body(sections=sections, topic_fields={**ALL_FIELDS, "status": False}))
    assert send() == "to: ana@medpark.md; cc: -; template v1"
    built_in, templated = (_pdf_text(email.attachment.data) for email in mailer.sent)  # the minutes: the PDF
    assert built_in.index("Summary") < built_in.index("Agenda") < built_in.index("Open issues")
    assert "Key moments" not in built_in  # off in the built-in template
    assert templated.index("Open issues") < templated.index("Summary") < templated.index("Agenda")
    for hidden in ("Key moments", "Blood tests ordered"):
        assert hidden not in templated, hidden


def test_the_instructions_reach_the_pipeline(login, upload, wait, pipeline):
    """The job hands the instructions of the meeting type's active template to the transcription (whose child may
    write the minutes) and to the minutes written after it."""
    login("admin").post("/api/templates/medical", json=_body(instructions="Name every patient by bed."))
    moderator = login("moderator")
    wait(moderator, upload(moderator, meeting_type="medical").json()["id"])
    wait(moderator, upload(moderator, meeting_type="executive").json()["id"])
    assert pipeline.instructions == [("transcribe", "Name every patient by bed."),
                                     ("minutes", "Name every patient by bed."), ("transcribe", ""), ("minutes", "")]
