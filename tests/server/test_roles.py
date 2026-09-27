"""Every endpoint checks the role on the server; other moderators' meetings are 404, not 403."""


def test_anonymous_is_401(client):
    for path in ("/api/meetings", "/api/users", "/api/settings", "/api/audit", "/api/lists", "/api/directory"):
        assert client.get(path).status_code == 401, path


def test_user_cannot_upload(login, upload):
    assert upload(login("user")).status_code == 403


def test_endpoints_by_role(login):
    user, moderator, admin = login("user"), login("moderator"), login("admin")
    for path in ("/api/users", "/api/settings", "/api/audit"):
        assert user.get(path).status_code == 403, path
        assert moderator.get(path).status_code == 403, path
        assert admin.get(path).status_code == 200, path
    for path in ("/api/lists", "/api/directory", "/api/directory/domains"):
        assert user.get(path).status_code == 403, path
        assert moderator.get(path).status_code == 200, path
    new_list = {"name": "Board", "members": []}
    assert moderator.post("/api/lists", json=new_list).status_code == 403
    assert admin.post("/api/lists", json=new_list).status_code == 201
    new_user = {"email": "x@medpark.md", "full_name": "X", "role": "user", "password": "a long password"}
    assert moderator.post("/api/users", json=new_user).status_code == 403


def test_moderator_only_sees_own_meetings(login, ready):
    owner, meeting = ready
    other = login("moderator2")
    path = f"/api/meetings/{meeting['id']}"
    assert [m["id"] for m in other.get("/api/meetings").json()] == []
    for sub in ("", "/transcript", "/minutes", "/audio"):
        assert other.get(path + sub).status_code == 404, sub
    assert other.put(path + "/minutes", json={"title": "mine now"}).status_code == 404
    assert other.post(path + "/approve").status_code == 404
    assert other.delete(path).status_code == 404
    assert owner.get(path).status_code == 200


def test_admin_sees_all_meetings(login, upload, wait):
    first, second = login("moderator"), login("moderator2")
    ids = {upload(first).json()["id"], upload(second).json()["id"]}
    admin = login("admin")
    assert {m["id"] for m in admin.get("/api/meetings").json()} == ids
    for meeting_id in ids:
        wait(admin, meeting_id)
        assert admin.get(f"/api/meetings/{meeting_id}/transcript").status_code == 200


def test_user_sees_nothing_before_sending(login, ready):
    _, meeting = ready
    user = login("user")
    assert user.get("/api/meetings").json() == []
    assert user.get(f"/api/meetings/{meeting['id']}").status_code == 404
    assert user.get(f"/api/meetings/{meeting['id']}/minutes").status_code == 404
    assert user.get(f"/api/meetings/{meeting['id']}/transcript").status_code == 403
