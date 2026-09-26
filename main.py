"""Local speech-to-text CLI using whisper.cpp + Whisper Large V3."""
import argparse
import sys
import tempfile
import time
from pathlib import Path

from stt.transcriber import DEFAULT_MODEL, transcribe


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


def run(audio: Path, args):
    t0 = time.time()
    transcript = transcribe(audio, model=Path(args.model), language=args.lang, translate=args.translate)
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
    live = args.format in ("txt", "timestamps")  # txt is shown live; srt/json are printed at the end
    minutes = None
    if args.minutes:
        # Minutes are extracted chunk by chunk while Whisper is still transcribing.
        from stt.minutes import LiveMinutes, MinutesBuilder
        minutes = LiveMinutes(MinutesBuilder(args.minutes, args.minutes_model))
    language, utterances = transcribe_dialog(audio, model=Path(args.model), language=args.lang,
                                             translate=args.translate, live=live,
                                             on_utterance=minutes.feed if minutes else None)
    print(f"\n[language: {language} | {time.time() - t0:.1f}s]", file=sys.stderr)
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
    if minutes:
        write_minutes(minutes, args, t0)


def write_minutes(minutes, args, t0: float):
    import json

    from stt.minutes import to_markdown

    t_end = time.time()
    print("\nFinishing the minutes...", file=sys.stderr, flush=True)
    result = minutes.finish()
    md = to_markdown(result, args.minutes)
    print(f"[minutes ready {time.time() - t_end:.1f}s after transcription | total {time.time() - t0:.1f}s]",
          file=sys.stderr)
    if not args.out:
        print("\n" + md)
        return
    base = str(Path(args.out).with_suffix(""))
    Path(base + ".minutes.md").write_text(md, encoding="utf-8")
    Path(base + ".minutes.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved minutes to {base}.minutes.md / .json", file=sys.stderr)


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
    common.add_argument("--minutes", choices=["medical", "executive", "administrative"],
                        help="dialog only: also write Minutes of Meeting for this meeting type (Ollama)")
    common.add_argument("--minutes-model", default="gemma4:e4b", help="Ollama model for the minutes")

    t = sub.add_parser("transcribe", parents=[common], help="transcribe an audio/video file")
    t.add_argument("file")

    r = sub.add_parser("record", parents=[common], help="record from the microphone, then transcribe")
    r.add_argument("--seconds", type=float, default=10)
    r.add_argument("--dialog", action="store_true", help="also detect speakers")

    d = sub.add_parser("dialog", parents=[common],
                       help="transcribe and split by speaker (SPEAKER 1, SPEAKER 2, ...)")
    d.add_argument("file")

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
