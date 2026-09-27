"""The React build (web/dist) is served, with index.html for client-side routes."""
import dataclasses

from fastapi.testclient import TestClient

from server.app import create_app


def test_spa_is_served(tmp_path, config, pipeline, mailer):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><div id=root></div>")
    (dist / "assets" / "app.js").write_text("console.log('app')")
    (tmp_path / "secret.txt").write_text("secret")
    app = create_app(dataclasses.replace(config, web_dist=dist), pipeline=pipeline, mailer=mailer)
    with TestClient(app) as browser:
        home = browser.get("/")
        assert home.text.startswith("<!doctype html>")
        assert home.headers["content-security-policy"].startswith("default-src 'self'")
        assert browser.get("/meetings/6f1c").text == home.text
        script = browser.get("/assets/app.js")
        assert script.status_code == 200 and "javascript" in script.headers["content-type"]
        assert browser.get("/api/nothing").json() == {"detail": "Not Found"}
        assert "secret" not in browser.get("/..%2Fsecret.txt").text
        assert browser.get("/api/auth/me").status_code == 401
