"""Command line: transcribe, dialog (who said what), minutes (audio -> Minutes of Meeting), record."""
from stt.config import offline

offline()  # before any model library is imported

import argparse  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import sys  # noqa: E402
import tempfile  # noqa: E402
import time  # noqa: E402
from pathlib import Path  # noqa: E402

from stt.asr import mlx  # noqa: E402
from stt.config import default_model  # noqa: E402
from stt.minutes.builder import MEETING_TYPES  # noqa: E402
from stt.minutes.ollama import DEFAULT_MODEL as DEFAULT_LLM  # noqa: E402


def save(path, text: str):
    """Write a result only the current user can read: transcripts and minutes hold patient data."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        f.write(text)
    os.chmod(path, 0o600)
    print(f"Saved {path}", file=sys.stderr)


def asr_options(args) -> dict:
    return dict(model=Path(args.model), language=args.lang, translate=args.translate,
                romanian_model=Path(args.ro_model) if args.ro_model else None, engine=args.engine,
                fix_words=not args.no_fix_words)


def run_transcribe(audio: Path, args):
    from stt.asr.transcriber import transcribe

    t0 = time.time()
    transcript = transcribe(audio, **asr_options(args))
    print(f"[language: {transcript.language} | {time.time() - t0:.1f}s]\n", file=sys.stderr)
    fmt = {"srt": transcript.to_srt, "json": transcript.to_json, "timestamps": transcript.to_timestamps}
    result = fmt.get(args.format, transcript.to_text)()
    print(result)
    if args.out:
        save(args.out, result + "\n")


def run_dialog(audio: Path, args):
    from stt.pipeline import transcribe_dialog
    from stt.speakers import dialog as fmt

    t0 = time.time()
    language, dialog = transcribe_dialog(audio, **asr_options(args))
    print(f"\n[language: {language} | {time.time() - t0:.1f}s]\n", file=sys.stderr)
    result = {"srt": fmt.to_srt, "json": fmt.to_json}.get(args.format, fmt.to_text)(dialog)
    print(result)
    if args.out:
        save(args.out, result + "\n")


def run_minutes(source: Path, args):
    """Audio -> dialog -> minutes, or minutes only from a dialog .txt."""
    from stt.minutes.markdown import to_markdown
    from stt.pipeline import minutes_from_file, transcribe_minutes
    from stt.speakers import dialog as fmt

    prefix = args.out or str(Path("out") / source.stem)
    t0 = time.time()
    if source.suffix == ".txt":
        minutes = minutes_from_file(source, args.type, args.llm)
    else:
        _, dialog, minutes = transcribe_minutes(source, args.type, args.llm, **asr_options(args))
        save(prefix + ".dialog.txt", fmt.to_text(dialog) + "\n")
    md = to_markdown(minutes, args.type)
    print(md)
    save(prefix + ".minutes.md", md)
    save(prefix + ".minutes.json", json.dumps(minutes, ensure_ascii=False, indent=2))
    print(f"[total {time.time() - t0:.1f}s]", file=sys.stderr)


def main():
    p = argparse.ArgumentParser(description="Secure MOM: local meeting transcription and minutes")
    sub = p.add_subparsers(dest="cmd", required=True)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--engine", choices=["whisper.cpp", "mlx"], default="mlx" if mlx.available() else "whisper.cpp",
                        help="mlx: Apple Silicon, ~4x faster (default there); whisper.cpp: any machine")
    common.add_argument("--model", help="Whisper model (default: the Moldovan fine-tune or turbo with mlx, "
                                         "Large V3 with whisper.cpp)")
    common.add_argument("--ro-model", default="", help="another Whisper model for the Romanian pass")
    common.add_argument("--lang", default="auto", help="auto (ro/ru/en per sentence) or one language code")
    common.add_argument("--translate", action="store_true", help="translate speech to English")
    common.add_argument("--no-fix-words", action="store_true", help="keep misheard words as Whisper wrote them")
    common.add_argument("--format", choices=["txt", "srt", "timestamps", "json"], default="txt")
    common.add_argument("--out", help="save the result to this file (minutes: path prefix, default out/<name>)")
    minutes = argparse.ArgumentParser(add_help=False)
    minutes.add_argument("--type", choices=MEETING_TYPES, default="medical", help="meeting type")
    minutes.add_argument("--llm", default=DEFAULT_LLM, help="Ollama model for the minutes")

    sub.add_parser("transcribe", parents=[common], help="audio/video file -> transcript").add_argument("file")
    sub.add_parser("dialog", parents=[common], help="audio/video file -> who said what").add_argument("file")
    sub.add_parser("minutes", parents=[common, minutes],
                   help="audio/video file (or a dialog .txt) -> Minutes of Meeting").add_argument("file")
    rec = sub.add_parser("record", parents=[common, minutes], help="record the microphone, then transcribe")
    rec.add_argument("--seconds", type=float, default=10)
    rec.add_argument("--then", choices=["transcribe", "dialog", "minutes"], default="transcribe")

    args = p.parse_args()
    args.model = args.model or str(default_model(args.engine))
    run = {"transcribe": run_transcribe, "dialog": run_dialog, "minutes": run_minutes}
    try:
        if args.cmd == "record":
            from stt.audio import record
            with tempfile.TemporaryDirectory() as tmp:
                run[args.then](record(args.seconds, Path(tmp) / "mic.wav"), args)
        else:
            run[args.cmd](Path(args.file), args)
    except (RuntimeError, FileNotFoundError) as e:
        sys.exit(f"Error: {e}")


if __name__ == "__main__":
    main()
