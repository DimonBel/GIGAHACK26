"""Keep Whisper Large V3 loaded in a local whisper-server, so many short clips can be transcribed fast."""
import http.client
import json
import shutil
import socket
import subprocess
import time
import urllib.request
import uuid
from pathlib import Path

from .transcriber import DEFAULT_MODEL

# Talk to the local server directly: urllib would otherwise send even 127.0.0.1 requests (with the audio)
# through a proxy configured in the environment or in macOS settings.
_local = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class WhisperServer:
    """Context manager: starts whisper-server on localhost, stops it on exit."""

    def __init__(self, model: Path = DEFAULT_MODEL, language: str = "auto", translate: bool = False,
                 threads: int = 8):
        if shutil.which("whisper-server") is None:
            raise RuntimeError("whisper-server not found. Install it with: brew install whisper-cpp")
        if not Path(model).exists():
            raise FileNotFoundError(f"Model not found: {model}")
        self.port = _free_port()
        self.cmd = ["whisper-server", "-m", str(model), "-l", language, "-t", str(threads),
                    "--host", "127.0.0.1", "--port", str(self.port),
                    # Same anti-hallucination settings as the file transcriber.
                    "-mc", "0", "-sns"]
        if translate:
            self.cmd.append("-tr")
        self.proc = None

    def __enter__(self):
        self.proc = subprocess.Popen(self.cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.time() + 180  # loading a 3 GB model can take a while the first time
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError(f"whisper-server exited with code {self.proc.returncode}")
            try:
                _local.open(f"http://127.0.0.1:{self.port}/", timeout=1)
                return self
            except OSError:
                time.sleep(0.5)
        self.__exit__()
        raise RuntimeError("whisper-server did not start in time")

    def __exit__(self, *exc):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proc.kill()

    def transcribe(self, wav_bytes: bytes, language: str = None) -> str:
        """Transcribe one 16 kHz mono WAV clip and return its text (language overrides the server's -l)."""
        fields = {"response_format": "json"}
        if language:
            fields["language"] = language
        return self._inference(wav_bytes, fields)["text"].strip()

    def transcribe_detect(self, wav_bytes: bytes) -> tuple:
        """Transcribe with automatic language detection; return (text, {language code: probability})."""
        result = self._inference(wav_bytes, {"response_format": "verbose_json", "language": "auto"})
        return result["text"].strip(), result.get("language_probabilities", {})

    def transcribe_verbose(self, wav_bytes: bytes, language: str = None, quick: bool = False) -> dict:
        """Transcribe one clip; return the verbose_json result (segments with per-token times and probabilities).

        Uses beam search like whisper-cli (the server's default is greedy): ~20% slower, fewer wrong words.
        quick: greedy, for a transcript only looked at for evidence."""
        fields = {"response_format": "verbose_json"} if quick else {
            "response_format": "verbose_json", "beam_size": 5, "best_of": 5}
        if language:
            fields["language"] = language
        return self._checked(wav_bytes, fields)

    def detect_language(self, wav_bytes: bytes) -> dict:
        """Whisper's guess at the clip's language, without transcribing it: {language code: probability}."""
        result = self._checked(wav_bytes, {"response_format": "verbose_json", "detect_language": "true"})
        return result.get("language_probabilities", {})

    def _checked(self, wav_bytes: bytes, fields: dict) -> dict:
        try:
            return self._inference(wav_bytes, fields)
        except (OSError, ValueError, http.client.HTTPException) as e:  # server crashed, timed out or sent no JSON
            raise RuntimeError(f"whisper-server request failed: {e}") from e

    def _inference(self, wav_bytes: bytes, fields: dict) -> dict:
        boundary = uuid.uuid4().hex
        parts = [
            (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="clip.wav"\r\n'
             "Content-Type: audio/wav\r\n\r\n").encode() + wav_bytes + b"\r\n",
            *(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
              for k, v in fields.items()),
            f"--{boundary}--\r\n".encode(),
        ]
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/inference", data=b"".join(parts),
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        with _local.open(req, timeout=600) as resp:
            return json.loads(resp.read())
