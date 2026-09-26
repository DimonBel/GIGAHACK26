"""Plain transcript, no speaker detection: <=28 s pieces cut at quiet moments, transcribed in parallel."""
import sys
import tempfile
from pathlib import Path

from ..asr.gemma import GEMMA_MAX_SECONDS
from ..asr.language import choose_language, main_language
from ..audio.clips import split_audio
from ..audio.convert import to_wav16k
from ..dialog import clean_text
from .parallel import WORKERS, engine_pool, transcribe_clips


def transcribe_plain(audio: Path, engine: str = "whisper-turbo", language: str = "auto",
                     translate: bool = False, workers: int = WORKERS) -> str:
    """Plain text: cut the audio into <=28 s pieces at quiet moments and transcribe them on `workers` engines
    at once, printing each piece (in order) as soon as it's done.

    With language="auto" (Whisper engines) the language is detected automatically: the recording's
    main language from all pieces, and per piece where Whisper is confident (see transcribe_auto_language)."""
    import soundfile as sf

    with tempfile.TemporaryDirectory() as tmp:
        wav = to_wav16k(Path(audio), Path(tmp) / "input.wav")
        audio_data, sr = sf.read(str(wav), dtype="int16")
    pieces = split_audio(audio_data, sr, GEMMA_MAX_SECONDS)
    with engine_pool(engine, language, translate, workers) as servers:
        if language == "auto" and not translate and hasattr(servers[0], "transcribe_detect"):
            raws = transcribe_auto_language(servers, pieces, sr)
        else:
            raws = []
            for n, raw in enumerate(transcribe_clips(servers, pieces, sr), 1):
                raws.append(raw)
                print(f"  [{n}/{len(pieces)}] {clean_text(raw)}", file=sys.stderr, flush=True)
    return "\n".join(t for t in map(clean_text, raws) if t)


def transcribe_auto_language(servers: list, pieces: list, sr: int) -> list:
    """Transcribe pieces of a recording whose language(s) aren't known: detect per piece, then redo the
    pieces whose detection was too weak in the recording's main language (see asr.language.choose_language)."""
    texts, probs = [], []
    for n, (text, p) in enumerate(transcribe_clips(servers, pieces, sr, lambda s, w: s.transcribe_detect(w)), 1):
        texts.append(text)
        probs.append(p)
        detected = max(p, key=p.get, default="?")
        print(f"  [{n}/{len(pieces)}] ({detected} {p.get(detected, 0):.0%}) {clean_text(text)}", file=sys.stderr, flush=True)
    main = main_language(probs)
    redo = [i for i, p in enumerate(probs) if choose_language(p, main) != max(p, key=p.get, default=None)]
    print(f"Main language: {main}. Re-transcribing {len(redo)} uncertain piece(s) in {main}...",
          file=sys.stderr, flush=True)
    redone = transcribe_clips(servers, [pieces[i] for i in redo], sr, lambda s, w: s.transcribe(w, main))
    for i, text in zip(redo, redone):
        texts[i] = text
        print(f"  [{i + 1}/{len(pieces)}] ({main}) {clean_text(text)}", file=sys.stderr, flush=True)
    return texts
