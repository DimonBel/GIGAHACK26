"""Paths, default models and the offline switch."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models"
ENV_FILE = ROOT / ".env"

DEFAULT_MODEL = MODELS_DIR / "ggml-large-v3.bin"         # whisper.cpp
FAST_MODEL = MODELS_DIR / "ggml-large-v3-turbo-q8_0.bin"  # MLX: mlx-community/whisper-large-v3-turbo
MOLDOVAN_MODEL = MODELS_DIR / "mlx-turbo-md"  # turbo fine-tuned on Moldovan speech (scripts/install_finetuned.sh)
VAD_MODEL = MODELS_DIR / "ggml-silero-v5.1.2.bin"
ACCENT_MODEL = MODELS_DIR / "speechbrain" / "accent-id-commonaccent_ecapa"
OVERLAP_MIN_RAM_GB = 32  # enough memory to write the minutes while Whisper runs


def offline():
    """No network at inference: Hugging Face libraries only read their local cache and send no telemetry, even
    if the environment says otherwise. Call before importing them (they read these variables at import)."""
    for name in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_DATASETS_OFFLINE", "HF_HUB_DISABLE_TELEMETRY"):
        os.environ[name] = "1"


def default_model(engine: str) -> Path:
    """MLX: the Moldovan fine-tune when installed, else stock turbo; whisper.cpp: Large V3."""
    if engine != "mlx":
        return DEFAULT_MODEL
    return MOLDOVAN_MODEL if (MOLDOVAN_MODEL / "config.json").exists() else FAST_MODEL


def overlap_minutes() -> bool:
    """Whether the minutes can be written while Whisper transcribes: with less memory the LLM and Whisper
    push each other into swap, and one after the other is faster."""
    return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") >= OVERLAP_MIN_RAM_GB * 1024 ** 3
