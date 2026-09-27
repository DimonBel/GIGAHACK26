"""Server configuration: SECURE_MOM_* environment variables (or server/.env) with safe defaults.

DATA_DIR (data), HOST (127.0.0.1), PORT (8000), N8N_TOKEN (shared with the n8n workflow; by default the one
automation/setup.sh wrote to automation/.env), ALLOWED_HOSTS (more Host header names, comma-separated),
ALLOW_REMOTE_DELIVERY (0: SMTP and n8n on this machine only), TLS_CERT and TLS_KEY (PEM files: HTTPS),
COOKIE_SECURE (0: Secure cookie and HSTS only over HTTPS; 1: behind a TLS proxy), WEB_DIST (web/dist)."""
import ipaddress
import os
from dataclasses import dataclass
from pathlib import Path

from stt.config import ROOT

ENV_FILE = Path(__file__).resolve().parent / ".env"
AUTOMATION_ENV_FILE = ROOT / "automation" / ".env"
ENV_PREFIX = "SECURE_MOM_"
TOKEN_VARIABLE = ENV_PREFIX + "N8N_TOKEN"
LOCAL_HOSTS = ("127.0.0.1", "localhost")
PRIVATE_DIR = 0o700


@dataclass(frozen=True)
class Config:
    data_dir: Path = ROOT / "data"
    host: str = "127.0.0.1"
    port: int = 8000
    n8n_token: str = ""
    allow_remote_delivery: bool = False  # SMTP / n8n on another machine (default: this machine only)
    tls_cert: Path | None = None  # with tls_key: uvicorn serves HTTPS
    tls_key: Path | None = None
    cookie_secure: bool = False  # force the Secure cookie flag and HSTS, e.g. behind a TLS proxy
    allowed_hosts: tuple = LOCAL_HOSTS  # Host headers accepted (blocks DNS rebinding)
    web_dist: Path = ROOT / "web" / "dist"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "secure_mom.db"

    @property
    def audio_dir(self) -> Path:
        return self.data_dir / "audio"

    @property
    def temp_dir(self) -> Path:
        """The transcription's scratch files (the decoded recording), instead of the system temp folder."""
        return self.data_dir / "tmp"


def load_config(env: dict | None = None, env_file: Path = ENV_FILE,
                automation_env_file: Path = AUTOMATION_ENV_FILE) -> Config:
    """Config from the environment; variables set in the process win over server/.env, which wins over the n8n
    token in automation/.env (the only value taken from there)."""
    shared = {k: v for k, v in _read_env_file(automation_env_file).items() if k == TOKEN_VARIABLE}
    values = {**shared, **_read_env_file(env_file), **(os.environ if env is None else env)}

    def get(name: str, default: str = "") -> str:
        return values.get(ENV_PREFIX + name, default).strip()

    host, tls_cert, tls_key = get("HOST", "127.0.0.1"), get("TLS_CERT"), get("TLS_KEY")
    extra_hosts = [h.strip() for h in get("ALLOWED_HOSTS").split(",") if h.strip()]
    return Config(
        data_dir=_path(get("DATA_DIR", "data")),
        host=host,
        port=int(get("PORT", "8000")),
        n8n_token=get("N8N_TOKEN"),
        allow_remote_delivery=_flag(get("ALLOW_REMOTE_DELIVERY")),
        tls_cert=_path(tls_cert) if tls_cert else None,
        tls_key=_path(tls_key) if tls_key else None,
        cookie_secure=_flag(get("COOKIE_SECURE")),
        allowed_hosts=tuple(dict.fromkeys([*LOCAL_HOSTS, host, *extra_hosts])),
        web_dist=_path(get("WEB_DIST", "web/dist")),
    )


def prepare_dirs(config: Config):
    """Create the data, audio and scratch folders, readable by this user only (they hold patient data)."""
    for folder in (config.data_dir, config.audio_dir, config.temp_dir):
        folder.mkdir(mode=PRIVATE_DIR, parents=True, exist_ok=True)
        os.chmod(folder, PRIVATE_DIR)


def listen_problem(config: Config) -> str | None:
    """Why the server must not start with config (None: it may). Reachable from other machines, it needs HTTPS:
    its own certificate, or a TLS proxy in front (COOKIE_SECURE)."""
    if bool(config.tls_cert) != bool(config.tls_key):
        return f"Set both {ENV_PREFIX}TLS_CERT and {ENV_PREFIX}TLS_KEY, or neither"
    if is_local_host(config.host) or config.tls_cert or config.cookie_secure:
        return None
    return (f"{ENV_PREFIX}HOST={config.host} makes the app reachable from other machines, so it needs HTTPS: set "
            f"{ENV_PREFIX}TLS_CERT and {ENV_PREFIX}TLS_KEY, or {ENV_PREFIX}COOKIE_SECURE=1 behind a TLS proxy")


def is_local_host(host: str) -> bool:
    """localhost or a loopback address: meeting data must not leave this machine."""
    host = host.strip("[]").lower()
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _read_env_file(path: Path) -> dict:
    """KEY=VALUE lines of an optional .env file; blank lines and # comments are skipped."""
    if not path.is_file():
        return {}
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep and not key.strip().startswith("#"):
            values[key.strip()] = value.strip().strip("'\"")
    return values


def _path(value: str) -> Path:
    """A path from the environment; relative paths are relative to the project folder."""
    path = Path(value).expanduser()
    return (path if path.is_absolute() else ROOT / path).resolve()


def _flag(value: str) -> bool:
    return value.lower() in ("1", "true", "yes", "on")
