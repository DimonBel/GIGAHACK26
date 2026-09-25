"""Full dialog pipeline: convert audio -> detect speakers (pyannote) -> transcribe live with speakers."""
import sys
import tempfile
from pathlib import Path

from .audio import to_wav16k
from .dialog import build_dialog, segment_words, to_text
from .diarizer import diarize
from .transcriber import DEFAULT_MODEL, transcribe_wav


def transcribe_dialog(audio: Path, model: Path = DEFAULT_MODEL, language: str = "auto",
                      translate: bool = False, live: bool = True):
    """Return (language, dialog utterances) for any audio/video file.

    Speakers are detected first, so with live=True every line is printed to stdout with its
    speaker as soon as Whisper recognizes it.
    """
    with tempfile.TemporaryDirectory() as tmp:
        print("[1/3] Converting audio...", file=sys.stderr)
        wav = to_wav16k(Path(audio), Path(tmp) / "input.wav")
        print("[2/3] Detecting speakers with pyannote...", file=sys.stderr, flush=True)
        turns = diarize(wav)
        print(f"Found {len({t.speaker for t in turns})} speaker(s).", file=sys.stderr)
        print("[3/3] Transcribing with Whisper Large V3...\n", file=sys.stderr, flush=True)

        def show(start, end, text):
            for u in build_dialog(segment_words(start, end, text), turns):
                print(to_text([u]), flush=True)

        transcript = transcribe_wav(wav, model, language, translate, on_segment=show if live else None)
    # Final dialog uses Whisper's word timestamps (more precise than the live approximation).
    return transcript.language, build_dialog(transcript.words, turns)
