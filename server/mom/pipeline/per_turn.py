"""Dialog, per-turn mode: every speaker turn is transcribed on its own, so each line's text comes only from that
speaker's audio - better for fast exchanges and interruptions, but much slower than whole_file.py."""
import sys
import tempfile
from pathlib import Path

from ..audio.convert import to_wav16k
from ..diarization import diarize
from ..dialog import Utterance, clean_text, is_duplicate, speaker_blocks, to_text
from .parallel import WORKERS, engine_pool, transcribe_clips

PAD = 0.15  # seconds of context added around each clip so first/last syllables aren't cut


def transcribe_dialog(audio: Path, engine: str = "whisper", language: str = "auto",
                      translate: bool = False, live: bool = True, workers: int = WORKERS, on_utterance=None,
                      speakers: dict = None):
    """Return the dialog (list of Utterance) for any audio/video file.

    With live=True every line is printed to stdout, with its speaker, as soon as it's transcribed;
    on_utterance(utterance) is called for every line as well (e.g. to build the minutes meanwhile).
    """
    import soundfile as sf

    with tempfile.TemporaryDirectory() as tmp:
        print("[1/3] Converting audio...", file=sys.stderr)
        wav = to_wav16k(Path(audio), Path(tmp) / "input.wav")
        audio_data, sr = sf.read(str(wav), dtype="int16")
        print("[2/3] Detecting speakers...", file=sys.stderr, flush=True)
        turns = diarize(wav, **(speakers or {}))
    blocks = speaker_blocks(turns)
    print(f"Found {len({t.speaker for t in turns})} speaker(s), {len(blocks)} turns.", file=sys.stderr)
    print(f"[3/3] Transcribing each turn with {engine}...\n", file=sys.stderr, flush=True)

    clips = [audio_data[max(0, int((b.start - PAD) * sr)):int((b.end + PAD) * sr)] for b in blocks]
    dialog = []
    with engine_pool(engine, language, translate, workers) as servers:
        for i, raw in enumerate(transcribe_clips(servers, clips, sr)):
            b, text = blocks[i], clean_text(raw)
            if not live:
                print(f"\r  {i + 1}/{len(blocks)} turns", end="", file=sys.stderr, flush=True)
            if not text or (b.inner and any(is_duplicate(text, u.text) for u in dialog[-3:])):
                continue
            u = Utterance(b.start, b.end, b.speaker, text)
            dialog.append(u)
            if live:
                print(to_text([u]), flush=True)
            if on_utterance:
                on_utterance(u)
    return dialog
