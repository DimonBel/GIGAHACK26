"""Full dialog pipeline: convert audio -> transcribe (Whisper) and detect speakers (pyannote) at the same time
-> give every sentence to the speaker who talks most during it."""
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .audio import to_wav16k
from .dialog import build_dialog
from .diarizer import diarize
from .transcriber import DEFAULT_MODEL, transcribe_wav


def transcribe_dialog(audio: Path, model: Path = DEFAULT_MODEL, language: str = "auto", translate: bool = False,
                      romanian_model: Path = None, engine: str = "whisper.cpp", fix_words: bool = True):
    """Return (main language, dialog utterances) for any audio/video file.

    pyannote runs in a background thread while whisper-server (its own process) transcribes, so the
    speaker detection costs almost no extra time. The transcript is shown on stderr as it is made.
    """
    import soundfile as sf

    from .accent import label_speakers

    with tempfile.TemporaryDirectory() as tmp:
        print("[1/3] Converting audio...", file=sys.stderr)
        wav = to_wav16k(Path(audio), Path(tmp) / "input.wav")
        print("[2/3] Detecting speakers (pyannote) while transcribing (Whisper)...\n", file=sys.stderr, flush=True)
        with ThreadPoolExecutor(max_workers=1) as pool:
            speakers = pool.submit(diarize, wav)
            transcript = transcribe_wav(wav, model, language, translate, accents=False,
                                       romanian_model=romanian_model, engine=engine, fix_words=fix_words)
            turns = speakers.result()
        print(f"[3/3] Found {len({t.speaker for t in turns})} speaker(s); matching sentences to speakers.",
              file=sys.stderr, flush=True)
        dialog = build_dialog(transcript.words, turns)
        if not translate:
            audio_data, sr = sf.read(str(wav), dtype="float32")
            label_speakers(dialog, audio_data, sr)  # one English accent per speaker, from all their English
    return transcript.language, dialog
