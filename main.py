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


def main():
    p = argparse.ArgumentParser(description="Local speech-to-text with Whisper Large V3")
    sub = p.add_subparsers(dest="cmd", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--model", default=str(DEFAULT_MODEL), help="path to ggml model")
    common.add_argument("--lang", default="auto", help="language code (en, ro, ru, ...) or auto")
    common.add_argument("--translate", action="store_true", help="translate speech to English")
    common.add_argument("--format", choices=["txt", "srt", "timestamps"], default="txt")
    common.add_argument("--out", help="save result to this file")
    common.add_argument("--summarize", action="store_true", help="summarize with a local LLM (Ollama)")
    common.add_argument("--llm-model", default="llama3.1:8b", help="Ollama model name")

    t = sub.add_parser("transcribe", parents=[common], help="transcribe an audio/video file")
    t.add_argument("file")

    r = sub.add_parser("record", parents=[common], help="record from the microphone, then transcribe")
    r.add_argument("--seconds", type=float, default=10)

    args = p.parse_args()
    try:
        if args.cmd == "transcribe":
            run(Path(args.file), args)
        else:
            from stt.recorder import record
            with tempfile.TemporaryDirectory() as tmp:
                run(record(args.seconds, Path(tmp) / "mic.wav"), args)
    except (RuntimeError, FileNotFoundError) as e:
        sys.exit(f"Error: {e}")


if __name__ == "__main__":
    main()
