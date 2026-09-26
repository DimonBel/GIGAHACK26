"""Local LLM calls through Ollama, on this machine only (no proxies, no remote hosts)."""
import ipaddress
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_MODEL = "gemma4:e4b"
_local = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def endpoint() -> str:
    """Ollama's chat URL from OLLAMA_HOST (default 127.0.0.1:11434). Meeting data never leaves this machine."""
    host = os.environ.get("OLLAMA_HOST", "").strip() or "127.0.0.1:11434"
    url = urllib.parse.urlsplit(host if "://" in host else "http://" + host)
    name = url.hostname or "127.0.0.1"
    if name != "localhost":
        try:
            ip = ipaddress.ip_address(name)
        except ValueError:
            ip = None
        if ip is None or not (ip.is_loopback or ip.is_unspecified):
            raise RuntimeError(f"OLLAMA_HOST={host} is not this machine: meeting data must stay on it")
        if ip.is_unspecified:
            name = "127.0.0.1"
    return f"http://{name}:{url.port or 11434}/api/chat"


def chat(model: str, system: str, user: str, schema: dict, num_ctx=4096, num_thread=10, num_predict=1000,
         retry=True, temperature=0.1, timeout=3600) -> tuple:
    """(JSON answer constrained to schema, timing stats). Retries once on invalid JSON."""
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
        body["think"] = False  # thinking would spend the whole budget before the JSON
    url = endpoint()
    request = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    t = time.perf_counter()
    try:
        with _local.open(request, timeout=timeout) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise RuntimeError(f"Ollama has no model {model!r}. Download it with: ollama pull {model}")
        raise RuntimeError(f"Ollama error for {model}: {e}")
    except OSError as e:
        raise RuntimeError(f"Could not reach Ollama at {url}. Is it running? ({e})")
    stats = {"wall": round(time.perf_counter() - t, 1), "prompt_tokens": data.get("prompt_eval_count", 0),
             "prompt_s": round(data.get("prompt_eval_duration", 0) / 1e9, 1),
             "output_tokens": data.get("eval_count", 0), "output_s": round(data.get("eval_duration", 0) / 1e9, 1)}
    try:
        return json.loads(data["message"]["content"]), stats
    except json.JSONDecodeError:
        if not retry:
            raise
        print(f"  invalid JSON from {model} ({data.get('done_reason')}), retrying", file=sys.stderr)
        result, again = chat(model, system, user, schema, num_ctx, num_thread, num_predict, retry=False,
                             timeout=timeout)
        again["wall"] += stats["wall"]
        return result, again
