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


def report_time(t0: float, audio: Path, stages: dict = None):
    """Final line: total processing time, audio length and speed (and time per stage, if known)."""
    from stt.audio import duration

    took, length = time.time() - t0, duration(audio)
    speed = f", {length / took:.1f}x faster than real time" if length and took else ""
    detail = " (" + ", ".join(f"{k} {_mmss(v)}" for k, v in stages.items()) + ")" if stages else ""
    print(f"\n=== Done. Total time: {_mmss(took)} for {_mmss(length)} of audio{speed}{detail} ===")


def model_path(name: str) -> Path:
    """--model: a ggml file, or a short name of an installed one ("turbo", "large")."""
    from stt.transcriber import MODELS_DIR

    short = {"turbo": "ggml-large-v3-turbo-q8_0.bin", "large": "ggml-large-v3-q8_0.bin"}
    return MODELS_DIR / short[name] if name in short else Path(name)


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
        transcript = transcribe(audio, model=model_path(args.model), language=args.lang, translate=args.translate,
                                beam_size=args.beam_size)
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
    from stt.pipeline import transcribe_dialog, transcribe_dialog_file

    t0 = time.time()
    live = args.format in ("txt", "timestamps")  # txt is shown live; srt/json are printed at the end
    minutes = None
    if args.minutes:
        # Minutes are extracted chunk by chunk while the speech is still being transcribed.
        from stt.minutes import LiveMinutes, MinutesBuilder
        minutes = LiveMinutes(MinutesBuilder(args.minutes, args.minutes_model))
    on_utterance = minutes.feed if minutes else None
    stages = {}
    speakers = {k: v for k, v in dict(num_speakers=args.speakers, min_speakers=args.min_speakers,
                                      max_speakers=args.max_speakers).items() if v}
    if args.engine == "whisper-file":
        from stt.audio import CLEAN_FILTERS
        utterances = transcribe_dialog_file(audio, model=model_path(args.model), language=args.lang,
                                            translate=args.translate, beam_size=args.beam_size, live=live,
                                            on_utterance=on_utterance, speakers=speakers,
                                            audio_filters=CLEAN_FILTERS[args.clean_audio], timings=stages)
    else:
        utterances = transcribe_dialog(audio, engine=args.engine, language=args.lang,
                                       translate=args.translate, live=live, on_utterance=on_utterance,
                                       speakers=speakers)
    roles = None
    if args.roles or minutes:
        # One short LLM call; runs while the minutes are being finished (Ollama serves both at once).
        from concurrent.futures import ThreadPoolExecutor

        from stt.speakers import label_roles
        roles = ThreadPoolExecutor(1).submit(label_roles, utterances, args.minutes or "medical", args.minutes_model)
    formatter = {"srt": fmt.to_srt, "json": fmt.to_json}.get(args.format, fmt.to_text)
    result = formatter(utterances)
    if not live:
        print(result)
    if args.out:  # saved before the LLM steps, so the transcript is never lost over them
        Path(args.out).write_text(result + "\n", encoding="utf-8")
        print(f"\nSaved to {args.out}", file=sys.stderr)
    if args.summarize:
        from stt.llm import summarize
        print("\n--- Summary (local LLM) ---")
        print(summarize(fmt.to_text(utterances), model=args.llm_model))
    if minutes:
        write_minutes(minutes, args, t0, roles)
    if roles:
        write_roles(roles.result(), result, args)
    report_time(t0, audio, stages)


def write_roles(roles: dict, result: str, args):
    """Print the speaker legend; with --out, put it on top of the .txt and save <name>.speakers.json."""
    import json

    from stt.speakers import legend

    if not roles:
        return
    print("\n--- Speakers (roles guessed by the local LLM) ---\n" + legend(roles))
    if not args.out:
        return
    if args.format == "txt":
        Path(args.out).write_text(legend(roles) + "\n\n" + result + "\n", encoding="utf-8")
    base = str(Path(args.out).with_suffix(""))
    Path(base + ".speakers.json").write_text(json.dumps(roles, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved speaker roles to {base}.speakers.json", file=sys.stderr)


def write_minutes(minutes, args, t0: float, roles=None):
    import json

    from stt.minutes import to_markdown

    t_end = time.time()
    print("\nFinishing the minutes...", file=sys.stderr, flush=True)
    result = minutes.finish()
    if roles:
        result["participants"] = roles.result()
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
    common.add_argument("--model", default=str(DEFAULT_MODEL),
                        help="ggml model file, or 'turbo' / 'large' for the installed 8-bit Large V3 Turbo / Large V3")
    common.add_argument("--clean-audio", choices=["none", "highpass", "norm", "denoise"], default="none",
                        help="dialog: clean the audio before speaker detection and Whisper (see README)")
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
    t.add_argument("--engine", choices=ENGINES + ("whisper-file",), default=DEFAULT_ENGINE,
                   help="whisper-turbo = Whisper Large V3 Turbo (fast, default), whisper = Large V3, "
                        "gemma / gemma-fast = Gemma 4 E4B / E2B via Ollama, whisper-file = whole file "
                        "in one whisper-cli run (needed for --format srt/timestamps) (default: %(default)s)")

    r = sub.add_parser("record", parents=[common], help="record from the microphone, then transcribe")
    r.add_argument("--seconds", type=float, default=10)
    r.add_argument("--dialog", action="store_true", help="also detect speakers")
    r.add_argument("--engine", choices=ENGINES + ("whisper-file",), default=DEFAULT_ENGINE,
                   help="speech-to-text engine")

    d = sub.add_parser("dialog", parents=[common],
                       help="transcribe and split by speaker (SPEAKER 1, SPEAKER 2, ...)")
    d.add_argument("file")
    d.add_argument("--engine", choices=ENGINES + ("whisper-file",), default="whisper-file",
                   help="whisper-file = Whisper Large V3 over the whole file in one run, then sentences are "
                        "assigned to speakers (fast, default); whisper / whisper-turbo / gemma / gemma-fast = "
                        "transcribe every speaker turn separately (slower) (default: %(default)s)")

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
