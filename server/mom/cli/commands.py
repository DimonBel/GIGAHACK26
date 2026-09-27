"""The CLI commands: plain transcript, speaker dialog (optionally with roles and minutes), microphone."""
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .. import dialog as fmt
from ..asr.whisper_cli import transcribe
from ..audio.convert import CLEAN_FILTERS
from ..config import whisper_model
from .output import print_transcript, report_time, save, write_minutes, write_roles


def run_transcribe(audio: Path, args):
    t0 = time.time()
    if args.engine != "whisper-file":
        from ..pipeline import transcribe_plain

        print(f"Transcribing with {args.engine} (no speaker detection)...", file=sys.stderr, flush=True)
        text = transcribe_plain(audio, args.engine, args.lang, args.translate)
        print(text)
        if args.out:
            save(args.out, text)
    else:
        transcript = transcribe(audio, model=whisper_model(args.model), language=args.lang,
                                translate=args.translate, beam_size=args.beam_size)
        print(f"[language: {transcript.language}]\n", file=sys.stderr)
        print_transcript(transcript, args.format, Path(args.out) if args.out else None)
        text = transcript.text
    if args.summarize:
        from ..llm import summarize
        print("\n--- Summary (local LLM) ---")
        print(summarize(text, model=args.llm_model))
    report_time(t0, audio)


def run_dialog(audio: Path, args):
    from ..pipeline import transcribe_dialog, transcribe_dialog_file

    t0 = time.time()
    live = args.format in ("txt", "timestamps")  # txt is shown live; srt/json are printed at the end
    minutes = None
    if args.minutes:
        # Minutes are extracted chunk by chunk while the speech is still being transcribed.
        from ..minutes import LiveMinutes, MinutesBuilder
        minutes = LiveMinutes(MinutesBuilder(args.minutes, args.minutes_model))
    stages = {}
    speakers = {k: v for k, v in dict(num_speakers=args.speakers, min_speakers=args.min_speakers,
                                      max_speakers=args.max_speakers).items() if v}
    if args.engine == "whisper-file":
        # The minutes get Whisper's text at once, without waiting for the speakers (see transcribe_dialog_file).
        utterances = transcribe_dialog_file(audio, model=whisper_model(args.model), language=args.lang,
                                            translate=args.translate, beam_size=args.beam_size, live=live,
                                            on_text=minutes.feed if minutes else None, speakers=speakers,
                                            audio_filters=CLEAN_FILTERS[args.clean_audio], timings=stages)
    else:
        utterances = transcribe_dialog(audio, engine=args.engine, language=args.lang,
                                       translate=args.translate, live=live,
                                       on_utterance=minutes.feed if minutes else None, speakers=speakers)
    roles = None
    if args.roles or minutes:
        # One short LLM call; runs while the minutes are being finished (Ollama serves both at once).
        from ..minutes.participants import label_roles
        roles = ThreadPoolExecutor(1).submit(label_roles, utterances, args.minutes or "medical", args.minutes_model)
    formatter = {"srt": fmt.to_srt, "json": fmt.to_json}.get(args.format, fmt.to_text)
    result = formatter(utterances)
    if not live:
        print(result)
    if args.out:  # saved before the LLM steps, so the transcript is never lost over them
        save(args.out, result)
    if args.summarize:
        from ..llm import summarize
        print("\n--- Summary (local LLM) ---")
        print(summarize(fmt.to_text(utterances), model=args.llm_model))
    if minutes:
        write_minutes(minutes, args, t0, roles)
    if roles:
        write_roles(roles.result(), result, args)
    report_time(t0, audio, stages)


def run_record(args):
    from ..audio.record import record

    with tempfile.TemporaryDirectory() as tmp:
        audio = record(args.seconds, Path(tmp) / "mic.wav")
        (run_dialog if args.dialog else run_transcribe)(audio, args)
