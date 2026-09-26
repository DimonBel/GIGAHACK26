"""Command-line arguments of `python -m mom` (transcribe / record / dialog)."""
import argparse

from ..asr.engines import ENGINES
from ..audio.convert import CLEAN_FILTERS
from ..config import DEFAULT_WHISPER_MODEL, MINUTES_MODEL, SUMMARY_MODEL
from ..minutes.prompts import MEETING_TYPES

DEFAULT_ENGINE = "whisper-turbo"
ALL_ENGINES = ENGINES + ("whisper-file",)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m mom", description="Local speech-to-text with Whisper Large V3")
    sub = p.add_subparsers(dest="cmd", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--model", default=str(DEFAULT_WHISPER_MODEL),
                        help="ggml model file, or 'turbo' / 'large' for the installed 8-bit Large V3 Turbo / Large V3")
    common.add_argument("--clean-audio", choices=list(CLEAN_FILTERS), default="none",
                        help="dialog: clean the audio before speaker detection and Whisper (see README)")
    common.add_argument("--lang", default="auto", help="language code (en, ro, ru, ...) or auto")
    common.add_argument("--translate", action="store_true", help="translate speech to English")
    common.add_argument("--format", choices=["txt", "srt", "timestamps", "json"], default="txt",
                        help="output format (json only for dialog)")
    common.add_argument("--out", help="save result to this file")
    common.add_argument("--summarize", action="store_true", help="summarize with a local LLM (Ollama)")
    common.add_argument("--llm-model", default=SUMMARY_MODEL, help="Ollama model name")
    common.add_argument("--minutes", choices=MEETING_TYPES,
                        help="dialog only: also write Minutes of Meeting for this meeting type (Ollama)")
    common.add_argument("--minutes-model", default=MINUTES_MODEL, help="Ollama model for the minutes")
    common.add_argument("--roles", action="store_true",
                        help="dialog: guess each speaker's role with the local LLM (always on with --minutes)")
    common.add_argument("--speakers", type=int,
                        help="dialog: exact number of speakers, if known (default: detected automatically)")
    common.add_argument("--min-speakers", type=int, help="dialog: at least this many speakers")
    common.add_argument("--max-speakers", type=int, help="dialog: at most this many speakers")
    common.add_argument("--beam-size", type=int, default=1,
                        help="whisper-file engine: 1 = greedy (fast, default), 5 = beam search (~35%% slower)")

    t = sub.add_parser("transcribe", parents=[common], help="transcribe an audio/video file (no speakers)")
    t.add_argument("file")
    t.add_argument("--engine", choices=ALL_ENGINES, default=DEFAULT_ENGINE,
                   help="whisper-turbo = Whisper Large V3 Turbo (fast, default), whisper = Large V3, "
                        "gemma / gemma-fast = Gemma 4 E4B / E2B via Ollama, whisper-file = whole file "
                        "in one whisper-cli run (needed for --format srt/timestamps) (default: %(default)s)")

    r = sub.add_parser("record", parents=[common], help="record from the microphone, then transcribe")
    r.add_argument("--seconds", type=float, default=10)
    r.add_argument("--dialog", action="store_true", help="also detect speakers")
    r.add_argument("--engine", choices=ALL_ENGINES, default=DEFAULT_ENGINE, help="speech-to-text engine")

    d = sub.add_parser("dialog", parents=[common],
                       help="transcribe and split by speaker (SPEAKER 1, SPEAKER 2, ...)")
    d.add_argument("file")
    d.add_argument("--engine", choices=ALL_ENGINES, default="whisper-file",
                   help="whisper-file = Whisper Large V3 over the whole file in one run, then sentences are "
                        "assigned to speakers (fast, default); whisper / whisper-turbo / gemma / gemma-fast = "
                        "transcribe every speaker turn separately (slower) (default: %(default)s)")
    return p
