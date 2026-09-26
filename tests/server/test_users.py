"""User accounts (admin) and the recipients directory."""
from fastapi.testclient import TestClient

NEW_USER = {"email": "Doina@Medpark.md", "full_name": "Doina Rusu", "position": "Cardiologist",
            "role": "moderator", "password": "a long enough password"}


def test_create_and_list_users(login):
    admin = login("admin")
    response = admin.post("/api/users", json=NEW_USER)
    assert response.status_code == 201
    created = response.json()
    assert created["email"] == "doina@medpark.md" and created["position"] == "Cardiologist"
    assert created["role"] == "moderator" and created["active"] is True
    assert created["must_change_password"] is True  # the admin chose it
    assert NEW_USER["password"] not in str(created) and "password_hash" not in created
    assert "doina@medpark.md" in [u["email"] for u in admin.get("/api/users").json()]
    assert admin.post("/api/users", json=NEW_USER).status_code == 409


def test_new_user_can_log_in(app, login):
    login("admin").post("/api/users", json=NEW_USER)
    response = TestClient(app).post("/api/auth/login", json={"email": "doina@medpark.md",
                                                             "password": NEW_USER["password"]})
    assert response.status_code == 200 and response.json()["user"]["role"] == "moderator"


def test_invalid_users_are_400(login):
    admin = login("admin")
    for change in ({"password": "short"}, {"email": "not-an-email"}, {"role": "root"}, {"full_name": " "},
                   {"extra": True}):
        response = admin.post("/api/users", json={**NEW_USER, **change})
        assert response.status_code == 400, change
    assert "password" in admin.post("/api/users", json={**NEW_USER, "password": "short"}).json()["detail"]


def test_update_user(login, users):
    admin = login("admin")
    response = admin.patch(f"/api/users/{users['user'].id}", json={"position": "Head nurse", "role": "moderator"})
    assert response.status_code == 200
    assert response.json()["position"] == "Head nurse" and response.json()["role"] == "moderator"
    assert admin.patch("/api/users/9999", json={"position": "x"}).status_code == 404


def test_new_password_signs_the_user_out(app, login, users):
    user, admin = login("user"), login("admin")
    new_password = "another long password"
    response = admin.patch(f"/api/users/{users['user'].id}", json={"password": new_password})
    assert response.status_code == 200 and response.json()["must_change_password"] is True
    assert user.get("/api/auth/me").status_code == 401
    assert login("user", new_password).get("/api/auth/me").status_code == 200


def test_own_password_change_keeps_the_current_session(login, users):
    admin = login("admin")
    other_session = login("admin")
    response = admin.patch(f"/api/users/{users['admin'].id}", json={"password": "a new admin password"})
    assert response.status_code == 200 and response.json()["must_change_password"] is False  # their own choice
    assert admin.get("/api/auth/me").status_code == 200
    assert other_session.get("/api/auth/me").status_code == 401


def test_delete_deactivates(app, login, users, password):
    user, admin = login("user"), login("admin")
    assert admin.delete(f"/api/users/{users['user'].id}").status_code == 204
    assert user.get("/api/auth/me").status_code == 401
    listed = {u["email"]: u for u in admin.get("/api/users").json()}
    assert listed["ana@medpark.md"]["active"] is False
    response = TestClient(app).post("/api/auth/login", json={"email": "ana@medpark.md", "password": password})
    assert response.status_code == 401
    reactivated = admin.patch(f"/api/users/{users['user'].id}", json={"active": True})
    assert reactivated.json()["active"] is True


def test_last_admin_cannot_be_removed(login, users):
    admin = login("admin")
    me = users["admin"].id
    assert admin.delete(f"/api/users/{me}").status_code == 409
    assert admin.patch(f"/api/users/{me}", json={"role": "moderator"}).status_code == 409
    assert admin.patch(f"/api/users/{me}", json={"active": False}).status_code == 409
    assert admin.patch(f"/api/users/{users['moderator'].id}", json={"role": "admin"}).status_code == 200
    assert admin.patch(f"/api/users/{me}", json={"role": "moderator"}).status_code == 200


def test_directory_lists_active_users(login, users):
    admin, moderator = login("admin"), login("moderator")
    admin.delete(f"/api/users/{users['user2'].id}")
    directory = moderator.get("/api/directory").json()
    assert {"id", "full_name", "position", "email"} == set(directory[0])
    emails = [p["email"] for p in directory]
    assert "ana@medpark.md" in emails and "vlad@medpark.md" not in emails


def test_user_changes_are_audited(login):
    admin = login("admin")
    created = admin.post("/api/users", json=NEW_USER).json()
    admin.patch(f"/api/users/{created['id']}", json={"password": "yet another password"})
    admin.delete(f"/api/users/{created['id']}")
    entries = admin.get("/api/audit").json()
    assert [e["action"] for e in entries[:3]] == ["user_delete", "user_update", "user_create"]
    assert entries[1]["detail"] == "doina@medpark.md: password"
    assert "yet another password" not in str(entries)
