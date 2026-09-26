"""Local speech-to-text CLI using whisper.cpp + Whisper Large V3."""
import argparse
import sys
import tempfile
import time
from pathlib import Path

from stt.engines import ENGINES
from stt.transcriber import DEFAULT_MODEL, transcribe

DEFAULT_ENGINE = "whisper-turbo"


def output(transcript, fmt: str, out: Path = None):
    if fmt == "srt":
        result = transcript.to_srt()
    elif fmt == "timestamps":
        result = "\n".join(f"[{s.start} --> {s.end}] {s.text}" for s in transcript.segments)
    else:
        result = transcript.text
    print(result)
    if out:
        out.write_text(result + "\n", encoding="utf-8")
        print(f"\nSaved to {out}", file=sys.stderr)


def _mmss(seconds: float) -> str:
    m, s = divmod(int(round(seconds)), 60)
    return f"{m}m {s:02d}s"


def report_time(t0: float, audio: Path):
    """Final line: total processing time, audio length and speed."""
    from stt.audio import duration

    took, length = time.time() - t0, duration(audio)
    speed = f", {length / took:.1f}x faster than real time" if length and took else ""
    print(f"\n=== Done. Total time: {_mmss(took)} for {_mmss(length)} of audio{speed} ===")


def run(audio: Path, args):
    t0 = time.time()
    if args.engine != "whisper-file":
        from stt.pipeline import transcribe_plain

        print(f"Transcribing with {args.engine} (no speaker detection)...", file=sys.stderr, flush=True)
        text = transcribe_plain(audio, args.engine, args.lang, args.translate)
        print(text)
        if args.out:
            Path(args.out).write_text(text + "\n", encoding="utf-8")
            print(f"\nSaved to {args.out}", file=sys.stderr)
    else:
        transcript = transcribe(audio, model=Path(args.model), language=args.lang, translate=args.translate)
        print(f"[language: {transcript.language}]\n", file=sys.stderr)
        output(transcript, args.format, Path(args.out) if args.out else None)
        text = transcript.text
    if args.summarize:
        from stt.llm import summarize
        print("\n--- Summary (local LLM) ---")
        print(summarize(text, model=args.llm_model))
    report_time(t0, audio)


def run_dialog(audio: Path, args):
    from stt import dialog as fmt
    from stt.pipeline import transcribe_dialog

    t0 = time.time()
    live = args.format in ("txt", "timestamps")  # txt is shown live; srt/json are printed at the end
    utterances = transcribe_dialog(audio, engine=args.engine, language=args.lang,
                                   translate=args.translate, live=live)
    formatter = {"srt": fmt.to_srt, "json": fmt.to_json}.get(args.format, fmt.to_text)
    result = formatter(utterances)
    if not live:
        print(result)
    if args.out:
        Path(args.out).write_text(result + "\n", encoding="utf-8")
        print(f"\nSaved to {args.out}", file=sys.stderr)
    if args.summarize:
        from stt.llm import summarize
        print("\n--- Summary (local LLM) ---")
        print(summarize(fmt.to_text(utterances), model=args.llm_model))
    report_time(t0, audio)


def main():
    p = argparse.ArgumentParser(description="Local speech-to-text with Whisper Large V3")
    sub = p.add_subparsers(dest="cmd", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--model", default=str(DEFAULT_MODEL), help="path to ggml model")
    common.add_argument("--lang", default="auto", help="language code (en, ro, ru, ...) or auto")
    common.add_argument("--translate", action="store_true", help="translate speech to English")
    common.add_argument("--format", choices=["txt", "srt", "timestamps", "json"], default="txt",
                        help="output format (json only for dialog)")
    common.add_argument("--out", help="save result to this file")
    common.add_argument("--summarize", action="store_true", help="summarize with a local LLM (Ollama)")
    common.add_argument("--llm-model", default="llama3.1:8b", help="Ollama model name")

    t = sub.add_parser("transcribe", parents=[common], help="transcribe an audio/video file (no speakers)")
    t.add_argument("file")
    t.add_argument("--engine", choices=ENGINES + ("whisper-file",), default=DEFAULT_ENGINE,
                   help="whisper-turbo = Whisper Large V3 Turbo (fast, default), whisper = Large V3, "
                        "gemma / gemma-fast = Gemma 4 E4B / E2B via Ollama, whisper-file = whole file "
                        "in one whisper-cli run (needed for --format srt/timestamps) (default: %(default)s)")

    r = sub.add_parser("record", parents=[common], help="record from the microphone, then transcribe")
    r.add_argument("--seconds", type=float, default=10)
    r.add_argument("--dialog", action="store_true", help="also detect speakers")
    r.add_argument("--engine", choices=ENGINES, default=DEFAULT_ENGINE, help="speech-to-text engine")

    d = sub.add_parser("dialog", parents=[common],
                       help="transcribe and split by speaker (SPEAKER 1, SPEAKER 2, ...)")
    d.add_argument("file")
    d.add_argument("--engine", choices=ENGINES, default=DEFAULT_ENGINE,
                   help="speech-to-text engine (default: %(default)s)")

    args = p.parse_args()
    try:
        if args.cmd == "transcribe":
            run(Path(args.file), args)
        elif args.cmd == "dialog":
            run_dialog(Path(args.file), args)
        else:
            from stt.recorder import record
            with tempfile.TemporaryDirectory() as tmp:
                audio = record(args.seconds, Path(tmp) / "mic.wav")
                (run_dialog if args.dialog else run)(audio, args)
    except (RuntimeError, FileNotFoundError) as e:
        sys.exit(f"Error: {e}")


if __name__ == "__main__":
    main()
