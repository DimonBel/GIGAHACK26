"""The one client for the local Ollama server (minutes, speaker roles, summaries, Gemma speech-to-text)."""
import json
import sys
import time
import urllib.error
import urllib.request

from ..config import ollama_base_url

BASE_URL = ollama_base_url()
CHAT_URL = BASE_URL + "/api/chat"


def ping(timeout: float = 3):
    """Raise RuntimeError when Ollama is not running."""
    try:
        urllib.request.urlopen(BASE_URL + "/api/version", timeout=timeout)
    except OSError:
        raise RuntimeError("Ollama is not running. Start it with: brew services start ollama")


def post(path: str, body: dict, timeout: float) -> dict:
    """POST a JSON body to an Ollama endpoint and return its JSON answer."""
    req = urllib.request.Request(BASE_URL + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def chat(model, system, user, schema, num_ctx=4096, num_thread=10, num_predict=1000, retry=True,
         temperature=0.1, timeout=3600):
    """Structured chat: the answer is JSON that follows `schema` (Ollama enforces it as a grammar).

    Returns (answer, stats). An invalid answer is retried once; a second one raises json.JSONDecodeError.
    """
    body = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "format": schema,
        "stream": False,
        "keep_alive": "30m",
        "options": {"temperature": temperature if retry else 0.4, "num_ctx": num_ctx, "num_thread": num_thread,
                    "num_predict": num_predict},
    }
    if model.startswith(("qwen3", "gemma4")):
        body["think"] = False  # thinking models would spend the whole num_predict budget before the JSON
    t = time.perf_counter()
    try:
        data = post("/api/chat", body, timeout)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise RuntimeError(f"Ollama has no model {model!r}. Download it with: ollama pull {model}")
        raise RuntimeError(f"Ollama error for {model}: {e}")
    except OSError as e:
        raise RuntimeError(f"Could not reach Ollama at {CHAT_URL}. Is it running? ({e})")
    stats = {"wall": round(time.perf_counter() - t, 1), "prompt_tokens": data.get("prompt_eval_count", 0),
             "prompt_s": round(data.get("prompt_eval_duration", 0) / 1e9, 1),
             "output_tokens": data.get("eval_count", 0), "output_s": round(data.get("eval_duration", 0) / 1e9, 1)}
    try:
        return json.loads(data["message"]["content"]), stats
    except json.JSONDecodeError:
        if retry:
            print(f"  invalid JSON from {model} ({data.get('done_reason')}), retrying: "
                  f"{data['message']['content'][:200]!r}", file=sys.stderr)
            result, again = chat(model, system, user, schema, num_ctx, num_thread, num_predict, retry=False,
                                 timeout=timeout)
            again["wall"] += stats["wall"]
            return result, again
        raise
