"""One transcription in a child process: python -m server.transcribe AUDIO --engine E --model M --language L
[--minutes TYPE --minutes-language ro|ru|en --llm MODEL [--instructions TEXT]] (the minutes are then written during
the transcription, see stt.pipeline).

The job worker starts one per meeting. When it exits, all its model and GPU memory goes back to the system
(MLX and PyTorch keep theirs for the life of a process), so the local LLM has the RAM for the minutes, and a
crash in native code can't take the web server down. stdout carries JSON lines only: {"progress": [stage, done,
total]}, {"live": {"lines", "total", "speakers"}} (the newest lines heard so far, to show the transcription as it
happens), {"found": {"topics", "decisions", "tasks"}} (what the minutes have so far), then {"result": {"language",
"utterances"}} or {"error": message, "trace": traceback}. Everything the pipeline prints (every transcript line)
goes to stderr, which the server discards. The server starts it as the
leader of a process group: when the server goes, so does everything the transcription started (whisper-server)."""
import argparse
import json
import os
import signal
import subprocess
import sys
import threading
import traceback
from pathlib import Path

from pydantic import ValidationError

from stt.minutes.builder import MINUTES_LANGUAGES

from .settings import model_path

LIVE_LINES = 40  # the newest lines sent while transcribing: enough to show, small on every chunk

# What the moderator reads for the pipeline's known failures, by the start of the error's text. Their details
# (paths, URLs) go to the server log only; so does everything about an unknown failure.
KNOWN_FAILURES = (
    ("Could not reach Ollama", "The local LLM (Ollama) is not reachable. Is it running?"),
    ("Ollama has no model", "The LLM model chosen in the settings is not installed in Ollama"),
    ("Ollama error", "The local LLM (Ollama) failed"),
    ("OLLAMA_HOST", "Ollama must run on this machine"),
    ("ffmpeg not found", "ffmpeg is not installed on the server"),
    ("whisper-server not found", "whisper.cpp is not installed on the server"),
    ("whisper-vad-speech-segments not found", "whisper.cpp is not installed on the server"),
    ("whisper-server", "The speech recognition (whisper.cpp) failed"),
    ("whisper-vad-speech-segments", "The speech detection (whisper.cpp) failed"),
    ("Model not found", "The speech model is missing on the server"),
    ("VAD model not found", "The speech detection model is missing on the server"),
    ("No MLX version", "The speech model chosen in the settings has no MLX version"),
    ("Could not load pyannote", "The speaker model (pyannote) could not be loaded"),
)


class ProcessingError(RuntimeError):
    """A failure whose message is already fit for the moderator."""


def readable_error(error: Exception) -> str:
    """The error for the moderator: a fixed text, never a path or URL; the details stay in the server log."""
    if isinstance(error, ProcessingError):
        return str(error)
    if isinstance(error, subprocess.CalledProcessError):
        return "ffmpeg could not decode the recording"
    if isinstance(error, ValidationError):
        return "The local LLM returned minutes in an unexpected format"
    text = str(error).strip()
    for start, message in KNOWN_FAILURES:
        if text.startswith(start):
            return message
    return f"Processing failed ({type(error).__name__}); the server log has the details"


def utterance_json(u) -> dict:
    """An utterance as the API shows it, with the accent by name ("American"), not by model label ("us")."""
    from stt.speakers.accent import ACCENT_NAMES

    return {"start": round(u.start, 2), "end": round(u.end, 2), "speaker": u.speaker, "languages": u.langs,
            "accent": ACCENT_NAMES.get(u.accent, u.accent), "text": u.text}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m server.transcribe")
    parser.add_argument("audio", type=Path)
    parser.add_argument("--engine", required=True, choices=("mlx", "whisper.cpp"))
    parser.add_argument("--model", required=True)
    parser.add_argument("--language", default="auto")
    parser.add_argument("--minutes", help="meeting type: also write the minutes, during the transcription")
    parser.add_argument("--minutes-language", choices=MINUTES_LANGUAGES, default="ro",
                        help="language the minutes are written in")
    parser.add_argument("--llm", help="Ollama model for the minutes")
    parser.add_argument("--instructions", default="", help="the meeting type's template instructions for the LLM")
    parser.add_argument("--max-seconds", type=float, help="decode at most this much of the recording")
    args = parser.parse_args(argv)

    protocol = os.fdopen(os.dup(sys.stdout.fileno()), "w", encoding="utf-8")
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())  # stray output, even from native code, goes to stderr
    _exit_with_parent()

    written = threading.Lock()  # the minutes report from their own thread

    def emit(**message):
        line = json.dumps(message, ensure_ascii=False) + "\n"
        with written:
            protocol.write(line)
            protocol.flush()

    def live(lines, speakers):
        emit(live={"lines": [utterance_json(u) for u in lines[-LIVE_LINES:]], "total": len(lines),
                   "speakers": speakers})

    options = dict(model=model_path(args.model), language=args.language, engine=args.engine, max_seconds=args.max_seconds,
                   on_progress=lambda stage, done=0, total=0: emit(progress=[stage, done, total]), on_live=live)
    minutes = None
    try:
        from stt.pipeline import transcribe_dialog, transcribe_minutes

        if args.minutes:
            language, dialog, minutes = transcribe_minutes(args.audio, args.minutes, args.llm, overlap=True,
                                                           minutes_language=args.minutes_language,
                                                           instructions=args.instructions,
                                                           on_found=lambda found: emit(found=found), **options)
        else:
            language, dialog = transcribe_dialog(args.audio, **options)
    except Exception as e:
        emit(error=readable_error(e), trace=traceback.format_exc())
        return 1
    emit(result={"language": language, "utterances": [utterance_json(u) for u in dialog], "minutes": minutes})
    return 0


def _exit_with_parent():
    """The server holds our stdin open and never writes to it: end of input means it is gone. Then this process
    ends with its whole group (whisper-server, ffmpeg), unless it doesn't lead one (started by hand)."""
    def watch():
        sys.stdin.read()
        if os.getpgrp() == os.getpid():
            os.killpg(os.getpgrp(), signal.SIGKILL)
        os._exit(1)

    threading.Thread(target=watch, daemon=True).start()


if __name__ == "__main__":
    raise SystemExit(main())
