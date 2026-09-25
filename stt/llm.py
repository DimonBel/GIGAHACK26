"""Optional: post-process a transcript with a local LLM served by Ollama."""
import json
import urllib.request

OLLAMA_URL = "http://localhost:11434/api/generate"


def summarize(text: str, model: str = "llama3.1:8b") -> str:
    prompt = ("Summarize the following transcript in a few bullet points, "
              "in the same language as the transcript:\n\n" + text)
    body = json.dumps({"model": model, "prompt": prompt, "stream": False}).encode()
    req = urllib.request.Request(OLLAMA_URL, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.loads(resp.read())["response"].strip()
    except OSError as e:
        raise RuntimeError(f"Could not reach Ollama at {OLLAMA_URL}. Is `ollama serve` running? ({e})")
