"""Distribution lists: admins write, moderators read."""


def test_list_crud(login, users):
    admin = login("admin")
    body = {"name": "Medical board", "meeting_type": "medical",
            "members": [{"user_id": users["user"].id, "kind": "to"}, {"email": "Quality@Medpark.md", "kind": "cc"},
                        {"email": "ana@medpark.md", "kind": "cc"}]}
    response = admin.post("/api/lists", json=body)
    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Medical board" and created["meeting_type"] == "medical"
    assert created["members"] == [
        {"user_id": users["user"].id, "email": "ana@medpark.md", "name": "User Test", "kind": "to"},
        {"user_id": None, "email": "quality@medpark.md", "name": "", "kind": "cc"}]  # ana once only
    path = f"/api/lists/{created['id']}"

    patched = admin.patch(path, json={"name": "Board", "meeting_type": None,
                                      "members": [{"email": "chief@medpark.md", "kind": "to"}]}).json()
    assert patched["name"] == "Board" and patched["meeting_type"] is None
    assert [m["email"] for m in patched["members"]] == ["chief@medpark.md"]
    assert admin.patch(path, json={"name": "Board 2"}).json()["meeting_type"] is None  # untouched

    assert admin.delete(path).status_code == 204
    assert admin.get("/api/lists").json() == []
    assert admin.delete(path).status_code == 404
    actions = [e["action"] for e in admin.get("/api/audit").json()[:4]]
    assert actions == ["list_delete", "list_update", "list_update", "list_create"]


def test_filter_by_meeting_type_includes_lists_for_any_type(login):
    admin = login("admin")
    for name, meeting_type in (("Doctors", "medical"), ("Directors", "executive"), ("Everyone", None)):
        admin.post("/api/lists", json={"name": name, "meeting_type": meeting_type, "members": []})
    names = [d["name"] for d in login("moderator").get("/api/lists", params={"meeting_type": "medical"}).json()]
    assert names == ["Doctors", "Everyone"]
    assert admin.get("/api/lists", params={"meeting_type": "party"}).status_code == 400


def test_invalid_lists_are_rejected(login, users):
    admin = login("admin")
    for members in ([{"kind": "to"}], [{"user_id": users["user"].id, "email": "a@medpark.md", "kind": "to"}],
                    [{"email": "no-at-sign", "kind": "to"}], [{"email": "a@medpark.md", "kind": "bcc"}],
                    [{"user_id": 9999, "kind": "to"}]):
        assert admin.post("/api/lists", json={"name": "L", "members": members}).status_code == 400, members
    assert admin.post("/api/lists", json={"name": "L", "meeting_type": "party"}).status_code == 400
    assert admin.post("/api/lists", json={"name": "L"}).status_code == 201
    assert admin.post("/api/lists", json={"name": "L"}).status_code == 409


def test_outside_addresses_must_be_in_the_allowed_domains(login, users):
    admin = login("admin")
    outside = {"name": "Guests", "members": [{"email": "guest@gmail.com", "kind": "cc"}]}
    response = admin.post("/api/lists", json=outside)
    assert response.status_code == 400
    detail = "Not in an allowed recipient domain (medpark.md, medpark.local): guest@gmail.com"
    assert response.json() == {"detail": detail}
    created = admin.post("/api/lists", json={"name": "Guests", "members": [{"email": "it@medpark.local"}]}).json()
    assert admin.patch(f"/api/lists/{created['id']}", json=outside).status_code == 400
    assert admin.put("/api/settings", json={"allowed_recipient_domains": ["gmail.com"]}).status_code == 200
    assert admin.patch(f"/api/lists/{created['id']}", json=outside).status_code == 200


def test_deactivated_users_are_left_out(login, users):
    admin = login("admin")
    created = admin.post("/api/lists", json={"name": "L", "members": [{"user_id": users["user2"].id}]}).json()
    assert len(created["members"]) == 1
    admin.delete(f"/api/users/{users['user2'].id}")
    assert admin.get("/api/lists").json()[0]["members"] == []
