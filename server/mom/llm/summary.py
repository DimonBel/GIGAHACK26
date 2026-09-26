"""Optional: a short bullet summary of a transcript with a local LLM."""
from ..config import SUMMARY_MODEL
from . import ollama


def summarize(text: str, model: str = SUMMARY_MODEL) -> str:
    prompt = ("Summarize the following transcript in a few bullet points, "
              "in the same language as the transcript:\n\n" + text)
    try:
        return ollama.post("/api/generate", {"model": model, "prompt": prompt, "stream": False},
                           timeout=300)["response"].strip()
    except OSError as e:
        raise RuntimeError(f"Could not reach Ollama at {ollama.BASE_URL}. Is `ollama serve` running? ({e})")
