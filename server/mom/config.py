"""Paths, model files and settings shared by every layer. Nothing else in the package hard-codes them."""
import os
import re
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = SERVER_DIR / "models"
ENV_FILE = SERVER_DIR / ".env"

# --- Whisper (whisper.cpp ggml files, see README "Models to install") ---
WHISPER_LARGE_V3 = MODELS_DIR / "ggml-large-v3.bin"
# 8-bit Large V3: same model, ~20% less time on a whole file (decoding is memory-bound, so smaller weights win).
WHISPER_LARGE_V3_Q8 = MODELS_DIR / "ggml-large-v3-q8_0.bin"
WHISPER_TURBO = MODELS_DIR / "ggml-large-v3-turbo.bin"
WHISPER_TURBO_Q8 = MODELS_DIR / "ggml-large-v3-turbo-q8_0.bin"
# Large V3 Turbo fine-tuned on Moldovan / Romanian speech (LoRA, turbo-md-adapter/), 8-bit; scripts/build_turbo_md.sh
WHISPER_TURBO_MD_Q8 = MODELS_DIR / "ggml-turbo-md-q8_0.bin"
# Default for whole-file dialog (and the web app): the fine-tuned Turbo when it is built — on the Medpark recording
# as many minutes facts as Large V3 (24.7 vs 25.3 of 44, 3 runs each) in ~30% less time (108 vs 151 s) and half the
# size; stock Turbo found only 17.7. Else 8-bit Large V3, else the full Large V3.
DEFAULT_WHISPER_MODEL = next((m for m in (WHISPER_TURBO_MD_Q8, WHISPER_LARGE_V3_Q8) if m.exists()), WHISPER_LARGE_V3)
VAD_MODEL = MODELS_DIR / "ggml-silero-v5.1.2.bin"
# The whisper.cpp command line; WHISPER_CLI=/path/to/whisper-cli for another build (e.g. one with Core ML, which
# runs the encoder on the Neural Engine when models/<model>-encoder.mlmodelc exists).
WHISPER_CLI = os.environ.get("WHISPER_CLI") or "whisper-cli"
# --model accepts these short names besides a file path
WHISPER_SHORT_NAMES = {"turbo": WHISPER_TURBO_Q8, "large": WHISPER_LARGE_V3_Q8, "turbo-md": WHISPER_TURBO_MD_Q8}

# --- Ollama models ---
MINUTES_MODEL = "gemma4:e4b"        # minutes and speaker roles
GEMMA_ASR_MODEL = "gemma4:e4b"      # --engine gemma
GEMMA_FAST_ASR_MODEL = "gemma4:e2b"  # --engine gemma-fast
SUMMARY_MODEL = "llama3.1:8b"       # --summarize

# --- Speaker detection ---
DIARIZE_DEVICE = os.environ.get("STT_DIARIZE_DEVICE", "mps")  # "mps" (Apple GPU) or "cpu"


def env(name: str):
    """A setting from the environment, else from the server's .env file (None if neither has it)."""
    value = os.environ.get(name)
    if value or not ENV_FILE.exists():
        return value
    for line in ENV_FILE.read_text().splitlines():
        key, _, value = line.partition("=")
        if key.strip() == name:
            return value.strip().strip('"').strip("'") or None
    return None


def whisper_model(name: str) -> Path:
    """--model: a ggml file, or a short name of an installed one ("turbo", "large")."""
    return WHISPER_SHORT_NAMES.get(name, Path(name))


def ollama_base_url() -> str:
    """The Ollama server named by OLLAMA_HOST (as the ollama CLI reads it), else localhost."""
    host = os.environ.get("OLLAMA_HOST", "").strip() or "127.0.0.1:11434"
    host = host if "://" in host else "http://" + host
    if not re.search(r":\d+$", host.rstrip("/")):
        host = host.rstrip("/") + ":11434"
    return host.rstrip("/")
