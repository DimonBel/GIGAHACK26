"""Dialog pipeline: convert audio -> detect speakers -> transcribe each speaker turn separately.

Transcribing every turn on its own (instead of the whole file, then guessing who said which word)
means each line's text comes only from that speaker's audio, so fast exchanges and interruptions
are attributed correctly, and short clips give Whisper less room for repetition loops.

Speed: short clips don't saturate the GPU, so WORKERS clips are transcribed at the same time by
separate whisper-server processes (results are still returned in order, so live output stays ordered).
"""
import io
import queue
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from pathlib import Path

from .audio import to_wav16k
from .dialog import Utterance, clean_text, is_duplicate, speaker_blocks, to_text
from .diarizer import diarize
from .engines import make_engine

PAD = 0.15   # seconds of context added around each clip so first/last syllables aren't cut
WORKERS = 2  # parallel whisper-server processes (each holds a copy of the model: ~3.5 GB RAM)


def transcribe_dialog(audio: Path, engine: str = "whisper", language: str = "auto",
                      translate: bool = False, live: bool = True, workers: int = WORKERS):
    """Return the dialog (list of Utterance) for any audio/video file.

    With live=True every line is printed to stdout, with its speaker, as soon as it's transcribed.
    """
    import soundfile as sf

    with tempfile.TemporaryDirectory() as tmp:
        print("[1/3] Converting audio...", file=sys.stderr)
        wav = to_wav16k(Path(audio), Path(tmp) / "input.wav")
        audio_data, sr = sf.read(str(wav), dtype="int16")
        print("[2/3] Detecting speakers...", file=sys.stderr, flush=True)
        turns = diarize(wav)
    blocks = speaker_blocks(turns)
    print(f"Found {len({t.speaker for t in turns})} speaker(s), {len(blocks)} turns.", file=sys.stderr)
    print(f"[3/3] Transcribing each turn with {engine}...\n", file=sys.stderr, flush=True)

    clips = [audio_data[max(0, int((b.start - PAD) * sr)):int((b.end + PAD) * sr)] for b in blocks]
    dialog = []
    engines = [make_engine(engine, language, translate) for _ in range(1 if engine.startswith("gemma") else workers)]
    with ExitStack() as stack:
        servers = [stack.enter_context(e) for e in engines]
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
    return dialog


def transcribe_clips(servers: list, clips: list, sr: int, call=lambda server, wav: server.transcribe(wav)):
    """Yield call(engine, clip WAV) for each clip, in order, spreading the work over the given engines."""
    free = queue.Queue()
    for s in servers:
        free.put(s)

    def work(clip):
        server = free.get()  # whichever engine is idle
        try:
            return call(server, wav_bytes(clip, sr))
        finally:
            free.put(server)

    with ThreadPoolExecutor(max_workers=len(servers)) as pool:
        yield from pool.map(work, clips)


def transcribe_auto_language(servers: list, pieces: list, sr: int) -> list:
    """Transcribe pieces of a recording whose language(s) aren't known: detect per piece, then redo the
    pieces whose detection was too weak in the recording's main language (see engines.choose_language)."""
    from .engines import choose_language, main_language

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


def wav_bytes(audio, sr: int) -> bytes:
    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def transcribe_plain(audio: Path, engine: str = "whisper-turbo", language: str = "auto",
                     translate: bool = False, workers: int = WORKERS) -> str:
    """Plain text, no speaker detection: cut the audio into <=28 s pieces at quiet moments and
    transcribe them on `workers` engines at once, printing each piece (in order) as soon as it's done.

    With language="auto" (Whisper engines) the language is detected automatically: the recording's
    main language from all pieces, and per piece where Whisper is confident (see transcribe_auto_language)."""
    import soundfile as sf

    from .engines import GEMMA_MAX_SECONDS, split_audio

    with tempfile.TemporaryDirectory() as tmp:
        wav = to_wav16k(Path(audio), Path(tmp) / "input.wav")
        audio_data, sr = sf.read(str(wav), dtype="int16")
    pieces = split_audio(audio_data, sr, GEMMA_MAX_SECONDS)
    engines = [make_engine(engine, language, translate) for _ in range(1 if engine.startswith("gemma") else workers)]
    with ExitStack() as stack:
        servers = [stack.enter_context(e) for e in engines]
        if language == "auto" and not translate and hasattr(servers[0], "transcribe_detect"):
            raws = transcribe_auto_language(servers, pieces, sr)
        else:
            raws = []
            for n, raw in enumerate(transcribe_clips(servers, pieces, sr), 1):
                raws.append(raw)
                print(f"  [{n}/{len(pieces)}] {clean_text(raw)}", file=sys.stderr, flush=True)
    return "\n".join(t for t in map(clean_text, raws) if t)
