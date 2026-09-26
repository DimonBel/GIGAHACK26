"""Login, logout, sessions, password changes, CSRF, login lockout, security headers, host check, HTTPS."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update

import server.__main__ as entry
from server.config import load_config
from server.db import AuditLog, LoginSession, User, utcnow
from server.security import (CSRF_HEADER, HSTS, LOCKOUT_S, MAX_FAILURES, MAX_IP_FAILURES, SESSION_COOKIE,
                             LoginLimiter)

NEW_PASSWORD = "a brand new passphrase"


def test_login_me_logout(client, users, password):
    response = client.post("/api/auth/login", json={"email": " ION@medpark.md", "password": password})
    assert response.status_code == 200
    body = response.json()
    assert body["user"] == {**body["user"], "email": "ion@medpark.md", "role": "moderator", "active": True,
                            "must_change_password": False}
    assert set(body["user"]) == {"id", "email", "full_name", "position", "role", "active", "must_change_password",
                                 "created_at"}
    cookie = response.headers["set-cookie"].lower()
    assert cookie.startswith(f"{SESSION_COOKIE}=") and "httponly" in cookie and "samesite=strict" in cookie
    assert "secure" not in cookie.replace("samesite", "")  # plain http in tests

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "ion@medpark.md" and me.json()["csrf_token"] == body["csrf_token"]

    token = client.cookies[SESSION_COOKIE]
    assert client.post("/api/auth/logout", headers={CSRF_HEADER: body["csrf_token"]}).status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    client.cookies.set(SESSION_COOKIE, token)  # the old cookie is dead on the server too
    assert client.get("/api/auth/me").status_code == 401


def test_session_id_is_stored_hashed(app, login):
    signed_in = login("user")
    with app.state.db() as db:
        stored = db.scalars(select(LoginSession.id)).all()
    assert signed_in.cookies[SESSION_COOKIE] not in stored and len(stored) == 1


def test_wrong_password_is_401_and_audited(app, client, users):
    response = client.post("/api/auth/login", json={"email": "ion@medpark.md", "password": "wrong password!"})
    assert response.status_code == 401
    assert response.json() == {"detail": "Wrong email or password"}
    assert client.post("/api/auth/login", json={"email": "nobody@medpark.md", "password": "x"}).status_code == 401
    with app.state.db() as db:
        failed = db.scalars(select(AuditLog).where(AuditLog.action == "login_failed")).all()
    assert [a.user_email for a in failed] == ["ion@medpark.md", "nobody@medpark.md"]


def test_lockout_after_five_failures(client, users, password):
    for _ in range(MAX_FAILURES):
        assert client.post("/api/auth/login", json={"email": "ion@medpark.md", "password": "bad"}).status_code == 401
    response = client.post("/api/auth/login", json={"email": "ion@medpark.md", "password": password})
    assert response.status_code == 429
    assert 0 < int(response.headers["retry-after"]) <= LOCKOUT_S


def test_lockout_per_ip_across_emails(client, users, password):
    """Every local client is 127.0.0.1: a few failures, whoever made them, must not lock everyone out; a guessing
    run over many emails does."""
    for i in range(MAX_IP_FAILURES - 1):
        client.post("/api/auth/login", json={"email": f"guess{i}@medpark.md", "password": "bad"})
    assert client.post("/api/auth/login", json={"email": "ana@medpark.md", "password": password}).status_code == 200
    client.post("/api/auth/login", json={"email": "guess@medpark.md", "password": "bad"})
    response = client.post("/api/auth/login", json={"email": "ion@medpark.md", "password": password})
    assert response.status_code == 429 and 0 < int(response.headers["retry-after"]) <= LOCKOUT_S


def test_guesses_sent_together_are_all_counted(app, users):
    """The check and its count are one step: parallel requests can't all pass before the first failure counts."""
    def guess(_) -> int:
        return TestClient(app).post("/api/auth/login", json={"email": "ion@medpark.md", "password": "bad"}).status_code

    with ThreadPoolExecutor(max_workers=10) as pool:
        statuses = list(pool.map(guess, range(15)))
    assert statuses.count(401) == MAX_FAILURES and statuses.count(429) == 15 - MAX_FAILURES


def test_a_locked_address_does_not_block_password_changes(client, login, password):
    """All local clients share 127.0.0.1: a locked address must not keep a signed-in user from their password."""
    signed_in = login("user")
    for i in range(MAX_IP_FAILURES):
        client.post("/api/auth/login", json={"email": f"guess{i}@medpark.md", "password": "bad"})
    assert client.post("/api/auth/login", json={"email": "ana@medpark.md", "password": password}).status_code == 429
    assert signed_in.post("/api/auth/password", json={"current": password, "new": NEW_PASSWORD}).status_code == 200


def _run_main(monkeypatch, tmp_path, **env) -> dict:
    """server.__main__.main() with only env (no .env files); returns what it passed to uvicorn.run."""
    options, none = {}, tmp_path / "none"
    monkeypatch.setattr(entry, "load_config", lambda: load_config(env, env_file=none, automation_env_file=none))
    monkeypatch.setattr(entry.uvicorn, "run", lambda app, **kwargs: options.update(kwargs))
    monkeypatch.setattr(entry, "create_app", lambda config: None)
    monkeypatch.setattr(entry.os, "umask", lambda mask: mask)
    monkeypatch.setattr(entry.logging, "basicConfig", lambda **kwargs: None)
    entry.main()
    return options


def test_server_ignores_forwarded_headers(monkeypatch, tmp_path):
    """Every local client connects from 127.0.0.1, which uvicorn trusts as a proxy by default: none of them may
    claim another address with X-Forwarded-For (it would dodge the lockout and fake the audit log)."""
    options = _run_main(monkeypatch, tmp_path)
    assert options["proxy_headers"] is False and options["host"] == "127.0.0.1" and "ssl_certfile" not in options


def test_another_address_needs_https(monkeypatch, tmp_path):
    cert, key = tmp_path / "cert.pem", tmp_path / "key.pem"
    with pytest.raises(SystemExit, match="needs HTTPS"):
        _run_main(monkeypatch, tmp_path, SECURE_MOM_HOST="0.0.0.0")
    with pytest.raises(SystemExit, match="both"):
        _run_main(monkeypatch, tmp_path, SECURE_MOM_HOST="0.0.0.0", SECURE_MOM_TLS_CERT=str(cert))
    options = _run_main(monkeypatch, tmp_path, SECURE_MOM_HOST="0.0.0.0", SECURE_MOM_TLS_CERT=str(cert),
                        SECURE_MOM_TLS_KEY=str(key))
    assert (options["ssl_certfile"], options["ssl_keyfile"]) == (cert.resolve(), key.resolve())
    behind_proxy = _run_main(monkeypatch, tmp_path, SECURE_MOM_HOST="10.0.0.5", SECURE_MOM_COOKIE_SECURE="1")
    assert behind_proxy["host"] == "10.0.0.5" and "ssl_certfile" not in behind_proxy


def test_https_sets_hsts_and_the_secure_cookie(app, client, users, password):
    assert "strict-transport-security" not in client.get("/api/auth/me").headers
    secure = TestClient(app, base_url="https://testserver")
    response = secure.post("/api/auth/login", json={"email": "ion@medpark.md", "password": password})
    assert response.headers["strict-transport-security"] == HSTS
    assert "; secure" in response.headers["set-cookie"].lower()


def test_lock_ends_after_lockout():
    now = [1000.0]
    limiter = LoginLimiter(clock=lambda: now[0])
    for _ in range(MAX_FAILURES - 1):
        limiter.failed("a@medpark.md", "10.0.0.1")
    assert limiter.retry_after("a@medpark.md", "10.0.0.1") == 0
    limiter.failed("a@medpark.md", "10.0.0.1")
    assert limiter.retry_after("a@medpark.md", "10.0.0.2") == LOCKOUT_S  # the account, from anywhere
    assert limiter.retry_after("b@medpark.md", "10.0.0.1") == 0  # not the address yet
    now[0] += LOCKOUT_S - 1
    assert limiter.retry_after("a@medpark.md", "10.0.0.1") == 1
    now[0] += 1
    assert limiter.retry_after("a@medpark.md", "10.0.0.1") == 0


def test_address_lock_is_not_reset_by_a_success():
    limiter = LoginLimiter(clock=lambda: 1000.0)
    for i in range(MAX_IP_FAILURES - 1):
        limiter.failed(f"guess{i}@medpark.md", "10.1.2.3")
    limiter.succeeded("ana@medpark.md")
    limiter.failed("guess@medpark.md", "10.1.2.3")
    assert limiter.retry_after("ana@medpark.md", "10.1.2.3") == LOCKOUT_S


def test_local_clients_are_locked_by_email_only():
    """Every local client is 127.0.0.1: counting that address would lock everyone out."""
    limiter = LoginLimiter(clock=lambda: 1000.0)
    for i in range(MAX_IP_FAILURES + 5):
        limiter.failed(f"guess{i}@medpark.md", "127.0.0.1")
    assert limiter.retry_after("ana@medpark.md", "127.0.0.1") == 0
    for _ in range(MAX_FAILURES):
        limiter.failed("ana@medpark.md", "127.0.0.1")
    assert limiter.retry_after("ana@medpark.md", "127.0.0.1") == LOCKOUT_S


def test_success_resets_the_email_counter(client, users, password):
    for _ in range(MAX_FAILURES - 1):
        client.post("/api/auth/login", json={"email": "ion@medpark.md", "password": "bad"})
    assert client.post("/api/auth/login", json={"email": "ion@medpark.md", "password": password}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "ion@medpark.md", "password": "bad"}).status_code == 401


def test_csrf_token_required_on_changes(login):
    admin = login("admin")
    token = admin.headers.pop(CSRF_HEADER)
    assert admin.put("/api/settings", json={"keep_audio_days": 1}).status_code == 403
    assert admin.put("/api/settings", json={"keep_audio_days": 1},
                     headers={CSRF_HEADER: token + "x"}).status_code == 403
    assert admin.post("/api/auth/logout").status_code == 403
    assert admin.get("/api/settings").status_code == 200  # reads need no token
    assert admin.put("/api/settings", json={"keep_audio_days": 1}, headers={CSRF_HEADER: token}).status_code == 200


def test_login_needs_json(client, users, password):
    response = client.post("/api/auth/login", data={"email": "ion@medpark.md", "password": password})
    assert response.status_code == 400


def test_idle_session_expires(app, login):
    signed_in = login("moderator")
    with app.state.db() as db:
        db.execute(update(LoginSession).values(last_seen=utcnow() - timedelta(hours=8, minutes=1)))
        db.commit()
    assert signed_in.get("/api/auth/me").status_code == 401
    with app.state.db() as db:
        assert db.scalars(select(LoginSession)).all() == []


def test_session_ends_twelve_hours_after_login_however_active(app, login):
    signed_in = login("moderator")
    with app.state.db() as db:
        db.execute(update(LoginSession).values(created_at=utcnow() - timedelta(hours=12, minutes=1)))
        db.commit()
    assert signed_in.get("/api/auth/me").status_code == 401
    login("moderator")  # a new login cleans up old sessions
    with app.state.db() as db:
        assert len(db.scalars(select(LoginSession)).all()) == 1


def test_change_own_password(app, login, users, password):
    signed_in, elsewhere = login("user"), login("user")
    response = signed_in.post("/api/auth/password", json={"current": password, "new": NEW_PASSWORD})
    assert response.status_code == 200
    assert response.json()["user"]["must_change_password"] is False
    assert response.json()["csrf_token"] == signed_in.headers[CSRF_HEADER]
    assert signed_in.get("/api/auth/me").status_code == 200  # this session stays
    assert elsewhere.get("/api/auth/me").status_code == 401  # the others end
    assert login("user", NEW_PASSWORD).get("/api/auth/me").status_code == 200
    with app.state.db() as db:
        actions = db.scalars(select(AuditLog.action).where(AuditLog.user_email == "ana@medpark.md")).all()
    assert "password_change" in actions and NEW_PASSWORD not in str(actions)


def test_password_change_is_checked(login, password):
    signed_in = login("user")
    token = signed_in.headers.pop(CSRF_HEADER)
    assert signed_in.post("/api/auth/password", json={"current": password, "new": NEW_PASSWORD}).status_code == 403
    signed_in.headers[CSRF_HEADER] = token
    for body, detail in (({"current": "wrong", "new": NEW_PASSWORD}, "current: the password is wrong"),
                         ({"current": password, "new": password}, "new: must differ from the current password"),
                         ({"current": password, "new": "short"}, "new: ")):
        response = signed_in.post("/api/auth/password", json=body)
        assert response.status_code == 400 and response.json()["detail"].startswith(detail), body


def test_password_guesses_are_limited_like_logins(client, login, password):
    signed_in = login("user")
    for _ in range(MAX_FAILURES):
        assert signed_in.post("/api/auth/password", json={"current": "guess", "new": NEW_PASSWORD}).status_code == 400
    assert signed_in.post("/api/auth/password", json={"current": password, "new": NEW_PASSWORD}).status_code == 429
    assert client.post("/api/auth/login", json={"email": "ana@medpark.md", "password": password}).status_code == 429


def test_a_password_set_by_an_admin_must_be_changed_first(login, users, password):
    admin = login("admin")
    assert admin.patch(f"/api/users/{users['user'].id}", json={"password": password}).status_code == 200
    reader = login("user")
    assert reader.get("/api/auth/me").json()["user"]["must_change_password"] is True
    response = reader.get("/api/meetings")
    assert response.status_code == 403 and response.json() == {"detail": "Change your password first"}
    assert reader.post("/api/auth/password", json={"current": password, "new": NEW_PASSWORD}).status_code == 200
    assert reader.get("/api/meetings").status_code == 200


def test_deactivated_user_is_signed_out_and_cannot_log_in(app, client, login, password):
    signed_in = login("user")
    with app.state.db() as db:
        db.execute(update(User).where(User.email == "ana@medpark.md").values(active=False))
        db.commit()
    assert signed_in.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/login", json={"email": "ana@medpark.md", "password": password}).status_code == 401


def test_security_headers_and_no_cors(client):
    response = client.get("/api/auth/me", headers={"Origin": "http://evil.example"})
    headers = response.headers
    policy = dict(part.strip().split(" ", 1) for part in headers["content-security-policy"].split(";"))
    assert policy["default-src"] == "'self'" and "script-src" not in policy  # scripts: this server only
    assert policy["frame-ancestors"] == "'none'" and policy["media-src"] == "'self' blob: data:"
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["referrer-policy"] == "no-referrer"
    assert headers["cache-control"] == "no-store"
    assert "access-control-allow-origin" not in headers
    preflight = client.options("/api/auth/login", headers={"Origin": "http://evil.example",
                                                           "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in preflight.headers


def test_unknown_host_is_refused(app, client):
    rebound = TestClient(app, base_url="http://attacker.example")
    assert rebound.get("/api/auth/me").status_code == 400


def test_no_api_docs(client):
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404
