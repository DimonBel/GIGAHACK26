"""Speech-to-text engines for short WAV clips (one speaker turn, or one <=28 s piece).

Every engine is a context manager with transcribe(wav_bytes) -> str:
  whisper        Whisper Large V3 (whisper.cpp server) - most accurate, slowest
  whisper-turbo  Whisper Large V3 Turbo - same encoder, 4 instead of 32 decoder layers (default, fast)
  gemma          Gemma 4 E4B via local Ollama - audio-capable LLM
  gemma-fast     Gemma 4 E2B via local Ollama - smaller and faster, less accurate
"""
from ..config import GEMMA_FAST_ASR_MODEL, WHISPER_LARGE_V3, WHISPER_TURBO, WHISPER_TURBO_Q8
from .gemma import GemmaEngine
from .whisper_server import WhisperServer

ENGINES = ("whisper", "whisper-turbo", "gemma", "gemma-fast")


def make_engine(name: str, language: str = "auto", translate: bool = False):
    if name == "whisper":
        return WhisperServer(WHISPER_LARGE_V3, language, translate)
    if name == "whisper-turbo":
        # 8-bit version: ~20% faster on Apple M4, same words as the f16 model on the Medpark recording.
        if not WHISPER_TURBO_Q8.exists():
            raise FileNotFoundError(
                f"{WHISPER_TURBO_Q8} not found. Create it with:\n  curl -L -o {WHISPER_TURBO} "
                "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin\n"
                f"  whisper-quantize {WHISPER_TURBO} {WHISPER_TURBO_Q8} q8_0")
        return WhisperServer(WHISPER_TURBO_Q8, language, translate)
    if name == "gemma":
        return GemmaEngine(language, translate)
    if name == "gemma-fast":
        return GemmaEngine(language, translate, model=GEMMA_FAST_ASR_MODEL)
    raise ValueError(f"unknown engine {name!r}, choose from {ENGINES}")
