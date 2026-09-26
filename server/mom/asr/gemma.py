"""Speech-to-text with Gemma 4 (audio-capable LLM) through the local Ollama server."""
import base64

from ..audio.clips import split_wav
from ..config import GEMMA_ASR_MODEL
from ..llm import ollama

GEMMA_MAX_SECONDS = 28.0  # Gemma's audio encoder accepts at most 30 s per request

LANGUAGE_NAMES = {"ro": "Romanian", "ru": "Russian", "en": "English", "uk": "Ukrainian", "fr": "French",
                  "de": "German", "it": "Italian", "es": "Spanish"}


class GemmaEngine:
    """Transcribe clips with Gemma 4 through the local Ollama server (must be running: `ollama serve`)."""

    def __init__(self, language="auto", translate=False, model=GEMMA_ASR_MODEL):
        self.model = model
        self.prompt = gemma_prompt(language, translate)

    def __enter__(self):
        ollama.ping()
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
        # OpenAI-compatible endpoint: Ollama's own /api/chat does not take audio input.
        return ollama.post("/v1/chat/completions", body, timeout=600)["choices"][0]["message"]["content"].strip()


def gemma_prompt(language: str, translate: bool) -> str:
    if translate:
        return ("Translate the speech in this audio into English. Translate faithfully; do not add, "
                "summarize or complete anything. Output only the translation.")
    lang = LANGUAGE_NAMES.get(language)
    where = f" in {lang}" if lang else " in the language that is spoken"
    return (f"Transcribe this audio verbatim{where}. Write exactly the words that are spoken, including "
            "numbers, doses and medical terms as heard. Do not correct, complete, summarize, explain or "
            "translate anything. If nothing intelligible is spoken, output nothing. Output only the transcription.")
