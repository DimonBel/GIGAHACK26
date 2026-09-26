"""Speech-to-text engines for the dialog pipeline. Each one transcribes short WAV clips (one speaker turn).

Every engine is a context manager with transcribe(wav_bytes) -> str:
  whisper        Whisper Large V3 (whisper.cpp server) - most accurate, slowest
  whisper-turbo  Whisper Large V3 Turbo - same encoder, 4 instead of 32 decoder layers (default, fast)
  gemma          Gemma 4 E4B via local Ollama - audio-capable LLM
  gemma-fast     Gemma 4 E2B via local Ollama - smaller and faster, less accurate
"""
import base64
import io
import json
import urllib.request

from .transcriber import MODELS_DIR
from .whisper_server import WhisperServer

OLLAMA_URL = "http://localhost:11434/v1/chat/completions"
GEMMA_MODEL = "gemma4:e4b"
GEMMA_FAST_MODEL = "gemma4:e2b"
GEMMA_MAX_SECONDS = 28.0  # Gemma's audio encoder accepts at most 30 s per request

LANGUAGE_NAMES = {"ro": "Romanian", "ru": "Russian", "en": "English", "uk": "Ukrainian", "fr": "French",
                  "de": "German", "it": "Italian", "es": "Spanish"}

# Automatic language choice for recordings that mix these languages (Moldovan speech is Romanian).
LANGUAGES = ("ro", "ru", "en")
SWITCH_CONFIDENCE = 0.8  # a piece may differ from the recording's main language only when this sure


def main_language(probabilities: list) -> str:
    """The recording's main language: the one of LANGUAGES with the highest total probability over all pieces."""
    return max(LANGUAGES, key=lambda lang: sum(p.get(lang, 0.0) for p in probabilities))


def choose_language(probs: dict, main: str) -> str:
    """Language for one piece: its detected language if Whisper is confident, otherwise the main language.

    Whisper's detection on a single piece is unreliable for Moldovan speech (Romanian pieces are often
    guessed as Russian with ~50% probability), so weak guesses fall back to the recording's language."""
    lang = max(LANGUAGES, key=lambda l: probs.get(l, 0.0))
    return lang if probs.get(lang, 0.0) >= SWITCH_CONFIDENCE else main


class GemmaEngine:
    """Transcribe clips with Gemma 4 through the local Ollama server (must be running: `ollama serve`)."""

    def __init__(self, language="auto", translate=False, model=GEMMA_MODEL):
        self.model = model
        self.prompt = gemma_prompt(language, translate)

    def __enter__(self):
        try:
            urllib.request.urlopen("http://localhost:11434/api/version", timeout=3)
        except OSError:
            raise RuntimeError("Ollama is not running. Start it with: brew services start ollama")
        return self

    def __exit__(self, *exc):
        pass

    def transcribe(self, wav_bytes: bytes) -> str:
        return " ".join(self._transcribe_one(part) for part in split_wav(wav_bytes, GEMMA_MAX_SECONDS)).strip()

    def _transcribe_one(self, wav_bytes: bytes) -> str:
        body = {
            "model": self.model,
            "temperature": 0,
            # Gemma 4 "thinks" before answering by default: ~10x slower and pointless for verbatim transcription.
            "reasoning_effort": "none",
            "messages": [{"role": "user", "content": [
                {"type": "input_audio",
                 "input_audio": {"data": base64.b64encode(wav_bytes).decode(), "format": "wav"}},
                {"type": "text", "text": self.prompt},
            ]}],
        }
        req = urllib.request.Request(OLLAMA_URL, data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=600) as resp:
            return json.loads(resp.read())["choices"][0]["message"]["content"].strip()


def gemma_prompt(language: str, translate: bool) -> str:
    if translate:
        return ("Translate the speech in this audio into English. Translate faithfully; do not add, "
                "summarize or complete anything. Output only the translation.")
    lang = LANGUAGE_NAMES.get(language)
    where = f" in {lang}" if lang else " in the language that is spoken"
    return (f"Transcribe this audio verbatim{where}. Write exactly the words that are spoken, including "
            "numbers, doses and medical terms as heard. Do not correct, complete, summarize, explain or "
            "translate anything. If nothing intelligible is spoken, output nothing. Output only the transcription.")


def split_wav(wav_bytes: bytes, max_seconds: float) -> list:
    """Split a WAV clip into WAV parts of at most max_seconds, cut at quiet moments (see split_audio)."""
    import soundfile as sf

    audio, sr = sf.read(io.BytesIO(wav_bytes), dtype="int16")
    if len(audio) <= int(max_seconds * sr):
        return [wav_bytes]
    out = []
    for p in split_audio(audio, sr, max_seconds):
        buf = io.BytesIO()
        sf.write(buf, p, sr, format="WAV", subtype="PCM_16")
        out.append(buf.getvalue())
    return out


def split_audio(audio, sr: int, max_seconds: float) -> list:
    """Split int16 samples into parts of at most max_seconds, cutting at the quietest moment near each limit."""
    import numpy as np

    limit = int(max_seconds * sr)
    parts, start = [], 0
    win = int(0.1 * sr)
    while len(audio) - start > limit:
        # search the last 5 s before the limit for the 100 ms window with the lowest energy
        lo, hi = start + limit - 5 * sr, start + limit - win
        energy = [np.abs(audio[i:i + win].astype(np.int32)).mean() for i in range(lo, hi, win // 2)]
        cut = lo + int(np.argmin(energy)) * (win // 2) + win // 2
        parts.append(audio[start:cut])
        start = cut
    parts.append(audio[start:])
    return parts


ENGINES = ("whisper", "whisper-turbo", "gemma", "gemma-fast")


def make_engine(name: str, language: str = "auto", translate: bool = False):
    if name == "whisper":
        return WhisperServer(MODELS_DIR / "ggml-large-v3.bin", language, translate)
    if name == "whisper-turbo":
        # 8-bit version: ~20% faster on Apple M4, same words as the f16 model on the Medpark recording.
        path = MODELS_DIR / "ggml-large-v3-turbo-q8_0.bin"
        if not path.exists():
            f16 = MODELS_DIR / "ggml-large-v3-turbo.bin"
            raise FileNotFoundError(
                f"{path} not found. Create it with:\n  curl -L -o {f16} "
                "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin\n"
                f"  whisper-quantize {f16} {path} q8_0")
        return WhisperServer(path, language, translate)
    if name == "gemma":
        return GemmaEngine(language, translate)
    if name == "gemma-fast":
        return GemmaEngine(language, translate, model=GEMMA_FAST_MODEL)
    raise ValueError(f"unknown engine {name!r}, choose from {ENGINES}")
