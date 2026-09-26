"""Settings the admin changes at runtime (speech engine, models, delivery, recipients, retention, limits), stored
in the database."""
from collections.abc import Iterable
from functools import cache
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from stt.config import ROOT, default_model
from stt.minutes.ollama import DEFAULT_MODEL as DEFAULT_LLM

from .db import Setting


@cache
def mlx_available() -> bool:
    from stt.asr import mlx

    return mlx.available()


@cache
def defaults() -> dict:
    """MLX on Apple Silicon (the Moldovan fine-tune when installed, else turbo), whisper.cpp with Large V3
    elsewhere."""
    engine = "mlx" if mlx_available() else "whisper.cpp"
    return {
        "asr_engine": engine,
        "asr_model": str(default_model(engine).relative_to(ROOT)),
        "llm_model": DEFAULT_LLM,
        "language": "auto",
        "delivery": "n8n",
        "n8n_webhook_url": "http://127.0.0.1:5678/webhook/secure-mom",
        "smtp_host": "127.0.0.1",
        "smtp_port": 1025,
        "mail_from": "secure-mom@medpark.local",
        "allowed_recipient_domains": ["medpark.md", "medpark.local"],  # empty: any domain
        "keep_audio_days": 0,
        "max_upload_mb": 500,
        "max_duration_min": 240,
    }


def load_settings(db: Session) -> dict:
    stored = {s.key: s.value for s in db.scalars(select(Setting))}
    return {key: stored.get(key, default) for key, default in defaults().items()}


def save_settings(db: Session, changes: dict):
    for key, value in changes.items():
        db.merge(Setting(key=key, value=value))


def check_recipient_domains(addresses: Iterable[str], allowed: list[str]):
    """ValueError naming the addresses outside the allowed domains (exact match; an empty list allows any)."""
    outside = [address for address in addresses if allowed and address.rpartition("@")[2] not in allowed]
    if outside:
        raise ValueError(f"Not in an allowed recipient domain ({', '.join(allowed)}): {', '.join(outside)}")


def model_path(value: str) -> Path:
    """A model setting as a path; relative paths are relative to the project folder."""
    path = Path(value).expanduser()
    return path if path.is_absolute() else ROOT / path


def check_asr(engine: str, model: str):
    """ValueError unless engine can run model on this machine."""
    path = model_path(model)
    if engine == "mlx":
        if not mlx_available():
            raise ValueError("MLX is not available on this machine; use whisper.cpp")
        from stt.asr.mlx import mlx_model

        try:
            mlx_model(path)
        except RuntimeError as e:
            raise ValueError(str(e)) from None
    elif not path.is_file():
        raise ValueError(f"Model file not found: {model}")
