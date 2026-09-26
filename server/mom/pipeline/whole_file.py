"""Dialog, whole-file mode (default, fast): one whisper-cli run over the file, then every sentence goes to the
speaker who talks most during it.

Whisper's encoder always processes a 30 s window, so one run over the file needs ~25 windows for 12 minutes,
while transcribing every speaker turn separately (per_turn.py) needs one per turn (~170, most of them a few
seconds long): ~3x more work for the same model.
"""
import sys
import tempfile
import threading
import time
from pathlib import Path

from ..asr.whisper_cli import transcribe_wav
from ..audio.convert import to_wav16k
from ..config import DEFAULT_WHISPER_MODEL
from ..diarization import diarize
from ..dialog import build_dialog, clean_text, collapse_repeats, segment_words, to_text


def transcribe_dialog_file(audio: Path, model: Path = DEFAULT_WHISPER_MODEL, language: str = "auto",
                           translate: bool = False, beam_size: int = 1, live: bool = True, on_utterance=None,
                           speakers: dict = None, audio_filters: str = "", parallel: bool = True,
                           timings: dict = None):
    """Return the dialog (list of Utterance) for any audio/video file, using one Whisper run over the file.

    Speaker detection (pyannote) and Whisper run at the same time (parallel=True): Whisper's segments are
    held back until the speaker turns exist, then printed / passed to on_utterance(utterance) live with their
    speaker (e.g. to build the minutes while transcription is still running). speakers: optional hints for
    diarize() (num_speakers / min_speakers / max_speakers). audio_filters: ffmpeg filter chain for the
    conversion (see audio.CLEAN_FILTERS). timings: filled with the seconds of each stage.
    """
    timings = timings if timings is not None else {}
    with tempfile.TemporaryDirectory() as tmp:
        print("[1/3] Converting audio...", file=sys.stderr)
        t = time.perf_counter()
        wav = to_wav16k(Path(audio), Path(tmp) / "input.wav", audio_filters)
        timings["convert"] = round(time.perf_counter() - t, 1)
        turns, ready = [], threading.Event()

        def detect():
            t = time.perf_counter()
            try:
                turns.extend(diarize(wav, **(speakers or {})))
                print(f"Found {len({t.speaker for t in turns})} speaker(s).", file=sys.stderr, flush=True)
            except RuntimeError as e:  # model not downloaded yet: still produce a transcript
                print(f"Warning: speaker detection unavailable, continuing without speakers.\n  {e}".split("\n")[0],
                      file=sys.stderr)
            finally:
                timings["speakers"] = round(time.perf_counter() - t, 1)
                ready.set()

        print("[2/3] Detecting speakers...", file=sys.stderr, flush=True)
        detector = threading.Thread(target=detect, daemon=True)
        detector.start()
        if not parallel:
            detector.join()
        print(f"[3/3] Transcribing the whole file with {Path(model).name}"
              f"{' (speakers are detected meanwhile)' if parallel else ''}...\n", file=sys.stderr, flush=True)
        pending = []  # Whisper segments that arrived before the speaker turns

        def emit(start, end, text):
            for u in build_dialog(segment_words(start, end, text), turns):
                if live:
                    print(to_text([u]), flush=True)
                if on_utterance:
                    on_utterance(u)

        def show(start, end, text):
            text = clean_text(text)
            if text:
                pending.append((start, end, text))
            if ready.is_set():
                while pending:
                    emit(*pending.pop(0))

        t = time.perf_counter()
        transcript = transcribe_wav(wav, Path(model), language, translate, beam_size=beam_size,
                                    on_segment=show if live or on_utterance else None)
        timings["transcribe"] = round(time.perf_counter() - t, 1)
        detector.join()
        while pending:
            emit(*pending.pop(0))
    # Final dialog uses Whisper's word timestamps (more precise than the live approximation);
    # segments that are only a Whisper artifact (subtitle credits, [BLANK_AUDIO]) are left out.
    words = [w for s in transcript.segments if clean_text(s.text) for w in s.words]
    dialog = build_dialog(words, turns)
    for u in dialog:
        u.text = collapse_repeats(u.text)
    print("[timing] " + " | ".join(f"{k} {v:.0f}s" for k, v in timings.items())
          + (" (speakers and transcription in parallel)" if parallel else ""), file=sys.stderr, flush=True)
    return dialog
