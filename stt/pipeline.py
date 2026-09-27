"""The whole job: audio -> transcript with speakers (dialog) -> Minutes of Meeting."""
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .asr.transcriber import print_segments, transcribe_wav
from .audio import to_wav16k
from .config import DEFAULT_MODEL, overlap_minutes
from .minutes.ollama import DEFAULT_MODEL as DEFAULT_LLM
from .speakers.dialog import build_dialog
from .speakers.diarizer import diarize


def transcribe_dialog(audio: Path, model: Path = DEFAULT_MODEL, language: str = "auto", translate: bool = False,
                      romanian_model: Path = None, engine: str = "whisper.cpp", fix_words: bool = True,
                      on_progress=None, on_dialog=None, max_seconds: float = None):
    """(main language, dialog utterances) for any audio/video file; speakers are found while Whisper runs.
    on_progress(stage, done, total): stages "converting", "transcribing", "speakers". on_dialog(dialog so far)
    after each chunk once the speakers are known (to start on the minutes early). max_seconds: transcribe only
    the start of longer recordings."""
    progress = on_progress or (lambda stage, done=0, total=0: None)
    import soundfile as sf

    from .speakers.accent import label_speakers

    with tempfile.TemporaryDirectory() as tmp:
        print("[1/3] Converting audio...", file=sys.stderr)
        progress("converting")
        wav = to_wav16k(Path(audio), Path(tmp) / "input.wav", max_seconds)
        print("[2/3] Detecting speakers while transcribing...\n", file=sys.stderr, flush=True)
        with ThreadPoolExecutor(max_workers=1) as pool:
            speakers, words = pool.submit(diarize, wav), []

            def chunk_done(segments):
                print_segments(segments)
                words.extend(w for s in segments for w in s.words)
                if on_dialog and speakers.done() and not speakers.exception():
                    on_dialog(build_dialog(words, speakers.result()))

            transcript = transcribe_wav(wav, model, language, translate, accents=False, on_segments=chunk_done,
                                        romanian_model=romanian_model, engine=engine, fix_words=fix_words,
                                        on_progress=lambda done, total: progress("transcribing", done, total))
            progress("speakers")
            turns = speakers.result()
        print(f"[3/3] Found {len({t.speaker for t in turns})} speaker(s); matching sentences to speakers.",
              file=sys.stderr, flush=True)
        dialog = build_dialog(transcript.words, turns)
        if not translate:
            audio_data, sr = sf.read(str(wav), dtype="float32")
            label_speakers(dialog, audio_data, sr)
    return transcript.language, dialog


def transcribe_minutes(audio: Path, meeting_type: str = "medical", llm: str = DEFAULT_LLM, overlap: bool = None,
                       minutes_language: str = "ro", instructions: str = "", **options) -> tuple:
    """(language, dialog, minutes or None without speech) for any audio/video file, the minutes written in
    minutes_language (ro, ru or en), following instructions (the hospital's own for the meeting type, if any). With
    overlap (default: on machines with enough memory, see config.overlap_minutes) the minutes are written while
    Whisper still transcribes, from the speakers' turns on. on_progress gets the "minutes" stage once the
    transcript is ready. options: those of transcribe_dialog."""
    from .minutes.builder import LiveMinutes, MinutesBuilder
    from .speakers.roles import label_roles

    if not (overlap_minutes() if overlap is None else overlap):
        language, dialog = transcribe_dialog(audio, **options)
        if not dialog:
            return language, dialog, None
        _free_gpu_memory()
        if options.get("on_progress"):
            options["on_progress"]("minutes")
        return language, dialog, meeting_minutes(dialog, meeting_type, llm, minutes_language, instructions)

    live, fed = None, 0

    def feed(dialog, final=False):
        nonlocal live, fed
        ready = dialog if final else dialog[:-1]  # the newest line may still grow
        for utterance in ready[fed:]:
            live = live or LiveMinutes(MinutesBuilder(meeting_type, llm, minutes_language, instructions=instructions))
            live.feed(utterance)
        fed = max(fed, len(ready))

    language, dialog = transcribe_dialog(audio, on_dialog=feed, **options)
    feed(dialog, final=True)
    if live is None:  # no speech: the LLM would only invent minutes
        return language, dialog, None
    if options.get("on_progress"):
        options["on_progress"]("minutes")
    with ThreadPoolExecutor(max_workers=1) as pool:
        roles = pool.submit(label_roles, dialog, meeting_type, llm, minutes_language)
        minutes = live.finish()
        minutes["participants"] = roles.result()
    return language, dialog, minutes


def meeting_minutes(dialog: list, meeting_type: str = "medical", model: str = DEFAULT_LLM,
                    language: str = "ro", instructions: str = "") -> dict:
    """Minutes for dialog utterances, written in language (ro, ru or en) following instructions (if any); the
    speakers' roles are guessed at the same time."""
    from .minutes.builder import dialog_lines
    from .speakers.roles import label_roles

    with ThreadPoolExecutor(max_workers=1) as pool:
        roles = pool.submit(label_roles, dialog, meeting_type, model, language)
        result = _minutes(dialog_lines(dialog), meeting_type, model, language, instructions)
        result["participants"] = roles.result()
    return result


def minutes_from_file(path: Path, meeting_type: str = "medical", model: str = DEFAULT_LLM,
                      language: str = "ro", instructions: str = "") -> dict:
    """Minutes, written in language (ro, ru or en) following instructions (if any), for a dialog .txt written by
    the dialog command."""
    from .minutes.builder import parse_dialog
    from .speakers.roles import read_legend

    result = _minutes(parse_dialog(Path(path)), meeting_type, model, language, instructions)
    result["participants"] = read_legend(Path(path).read_text(encoding="utf-8"))
    return result


def _minutes(lines: list, meeting_type: str, model: str, language: str, instructions: str) -> dict:
    from .minutes.builder import MinutesBuilder

    builder = MinutesBuilder(meeting_type, model, language, instructions=instructions)
    for line in lines:
        builder.add_line(line)
    return builder.finalize()


def _free_gpu_memory():
    """Give the models' cached GPU buffers back before the LLM runs (the models themselves stay loaded)."""
    import gc

    gc.collect()
    try:
        import mlx.core as mx

        mx.clear_cache()
    except (ImportError, AttributeError):
        pass
    try:
        import torch

        if torch.backends.mps.is_available():
            torch.mps.empty_cache()
    except ImportError:
        pass
