"""Where the server's settings come from: the process environment, server/.env, and the n8n token that
automation/setup.sh wrote to automation/.env."""
from server.config import listen_problem, load_config

TOKEN = "SECURE_MOM_N8N_TOKEN"


def _config(tmp_path, env: dict, server_env: str = "", automation_env: str = ""):
    server_file, automation_file = tmp_path / "server.env", tmp_path / "automation.env"
    server_file.write_text(server_env, encoding="utf-8")
    automation_file.write_text(automation_env, encoding="utf-8")
    return load_config(env, env_file=server_file, automation_env_file=automation_file)


def test_the_token_comes_from_the_automation_setup(tmp_path):
    assert _config(tmp_path, {}, automation_env=f"{TOKEN}=from-setup\n").n8n_token == "from-setup"


def test_server_env_and_the_environment_win_over_the_automation_token(tmp_path):
    automation = f"{TOKEN}=from-setup\n"
    assert _config(tmp_path, {}, f"{TOKEN}='from-server-env'\n", automation).n8n_token == "from-server-env"
    assert _config(tmp_path, {TOKEN: "from-process"}, f"{TOKEN}=x\n", automation).n8n_token == "from-process"


def test_only_the_token_is_taken_from_the_automation_env(tmp_path):
    config = _config(tmp_path, {}, automation_env="SECURE_MOM_PORT=9999\nSECURE_MOM_HOST=0.0.0.0\n")
    assert (config.port, config.host, config.n8n_token) == (8000, "127.0.0.1", "")


def test_missing_env_files_leave_the_defaults(tmp_path):
    config = load_config({}, env_file=tmp_path / "none", automation_env_file=tmp_path / "none")
    assert (config.host, config.port, config.n8n_token) == ("127.0.0.1", 8000, "")
    assert config.allowed_hosts == ("127.0.0.1", "localhost")


def test_tls_files(tmp_path):
    config = _config(tmp_path, {"SECURE_MOM_TLS_CERT": "certs/mom.pem", "SECURE_MOM_TLS_KEY": str(tmp_path / "k")})
    assert config.tls_cert.name == "mom.pem" and config.tls_cert.is_absolute() and config.tls_key == tmp_path / "k"
    assert _config(tmp_path, {}).tls_cert is None


def test_only_this_machine_without_https(tmp_path):
    assert listen_problem(_config(tmp_path, {})) is None
    assert listen_problem(_config(tmp_path, {"SECURE_MOM_HOST": "::1"})) is None
    assert "needs HTTPS" in listen_problem(_config(tmp_path, {"SECURE_MOM_HOST": "0.0.0.0"}))
    tls = {"SECURE_MOM_TLS_CERT": "cert.pem", "SECURE_MOM_TLS_KEY": "key.pem"}
    assert listen_problem(_config(tmp_path, {"SECURE_MOM_HOST": "0.0.0.0", **tls})) is None
    behind_proxy = {"SECURE_MOM_HOST": "mom.medpark.local", "SECURE_MOM_COOKIE_SECURE": "1"}
    assert listen_problem(_config(tmp_path, behind_proxy)) is None
    assert "both" in listen_problem(_config(tmp_path, {"SECURE_MOM_TLS_KEY": "key.pem"}))
