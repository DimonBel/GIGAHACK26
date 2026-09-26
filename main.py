"""Local speech-to-text CLI using whisper.cpp + Whisper Large V3."""
import argparse
import sys
import tempfile
import time
from pathlib import Path

from stt import mlx_backend
from stt.transcriber import DEFAULT_MODEL, FAST_MODEL, ROMANIAN_MODEL, transcribe


def output(transcript, fmt: str, out: Path = None):
    if fmt == "srt":
        result = transcript.to_srt()
    elif fmt == "json":
        result = transcript.to_json()
    elif fmt == "timestamps":
        result = transcript.to_timestamps()
    else:
        result = transcript.to_text()
    print(result)
    if out:
        out.write_text(result + "\n", encoding="utf-8")
        print(f"\nSaved to {out}", file=sys.stderr)


def romanian_model(args):
    return Path(args.ro_model) if args.ro_model else None


def run(audio: Path, args):
    t0 = time.time()
    transcript = transcribe(audio, model=Path(args.model), language=args.lang, translate=args.translate,
                            romanian_model=romanian_model(args), engine=args.engine, fix_words=not args.no_fix_words)
    print(f"[language: {transcript.language} | {time.time() - t0:.1f}s]\n", file=sys.stderr)
    output(transcript, args.format, Path(args.out) if args.out else None)
    if args.summarize:
        from stt.llm import summarize
        print("\n--- Summary (local LLM) ---")
        print(summarize(transcript.text, model=args.llm_model))


def run_dialog(audio: Path, args):
    from stt import dialog as fmt
    from stt.pipeline import transcribe_dialog

    t0 = time.time()
    language, utterances = transcribe_dialog(audio, model=Path(args.model), language=args.lang,
                                             translate=args.translate, romanian_model=romanian_model(args),
                                             engine=args.engine, fix_words=not args.no_fix_words)
    print(f"\n[language: {language} | {time.time() - t0:.1f}s]\n", file=sys.stderr)
    formatter = {"srt": fmt.to_srt, "json": fmt.to_json}.get(args.format, fmt.to_text)
    result = formatter(utterances)
    print(result)
    if args.out:
        Path(args.out).write_text(result + "\n", encoding="utf-8")
        print(f"\nSaved to {args.out}", file=sys.stderr)
    if args.summarize:
        from stt.llm import summarize
        print("\n--- Summary (local LLM) ---")
        print(summarize(fmt.to_text(utterances), model=args.llm_model))


def main():
    p = argparse.ArgumentParser(description="Local speech-to-text with Whisper Large V3")
    sub = p.add_subparsers(dest="cmd", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--model", help="Whisper model (default: turbo with --engine mlx, "
                                         "models/ggml-large-v3.bin with whisper.cpp)")
    common.add_argument("--ro-model", default="",
                        help="another model for the Romanian pass, e.g. models/ggml-large-v3-turbo-q8_0.bin "
                             f"(faster) or {ROMANIAN_MODEL.relative_to(ROMANIAN_MODEL.parent.parent)} (Moldovan "
                             "fine-tune, see README); --model still does Russian, English and loops")
    common.add_argument("--engine", choices=["whisper.cpp", "mlx"],
                        default="mlx" if mlx_backend.available() else "whisper.cpp",
                        help="mlx: Apple Silicon, ~4x faster and more accurate (default there); "
                             "whisper.cpp: whisper-server, any machine")
    common.add_argument("--no-fix-words", action="store_true",
                        help="don't correct misheard Romanian words (\"Pocentul\" -> \"Pacientul\")")
    common.add_argument("--lang", default="auto",
                        help="auto = detect Romanian/Russian/English for every sentence (default), "
                             "or one language code for the whole recording (ro, ru, en, ...)")
    common.add_argument("--translate", action="store_true", help="translate speech to English")
    common.add_argument("--format", choices=["txt", "srt", "timestamps", "json"], default="txt",
                        help="output format (json includes every word with its language)")
    common.add_argument("--out", help="save result to this file")
    common.add_argument("--summarize", action="store_true", help="summarize with a local LLM (Ollama)")
    common.add_argument("--llm-model", default="llama3.1:8b", help="Ollama model name")

    t = sub.add_parser("transcribe", parents=[common], help="transcribe an audio/video file")
    t.add_argument("file")

    r = sub.add_parser("record", parents=[common], help="record from the microphone, then transcribe")
    r.add_argument("--seconds", type=float, default=10)
    r.add_argument("--dialog", action="store_true", help="also detect speakers")

    d = sub.add_parser("dialog", parents=[common],
                       help="transcribe and split by speaker (SPEAKER 1, SPEAKER 2, ...)")
    d.add_argument("file")

    args = p.parse_args()
    if not args.model:  # turbo was the most accurate on Moldovan speech with MLX, and 4x faster (README)
        args.model = str(FAST_MODEL if args.engine == "mlx" else DEFAULT_MODEL)
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
