"""Speech to words: VAD chunks -> Whisper (whisper.cpp or MLX) -> language per sentence -> word fixes."""
import sys
import tempfile
from contextlib import nullcontext
from pathlib import Path

from ..audio import to_wav16k, wav_bytes
from ..config import DEFAULT_MODEL
from .chunks import chunk_audio, pad_segments, plan_chunks, to_recording
from .decode import OTHER_SCRIPTS, capitalize, looping, parse_verbose
from .languages import LANGUAGES, transcribe_chunk
from .transcript import Segment, Transcript, plain_text, tagged, timestamp


def transcribe(audio: Path, model: Path = DEFAULT_MODEL, language: str = "auto", translate: bool = False,
               romanian_model: Path = None, engine: str = "whisper.cpp", fix_words: bool = True) -> Transcript:
    """Transcribe any audio/video file."""
    with tempfile.TemporaryDirectory() as tmp:
        wav = to_wav16k(Path(audio), Path(tmp) / "input.wav")
        return transcribe_wav(wav, model, language, translate, romanian_model=romanian_model, engine=engine,
                              fix_words=fix_words)


def transcribe_wav(wav: Path, model: Path = DEFAULT_MODEL, language: str = "auto", translate: bool = False,
                   on_segments=None, accents: bool = True, romanian_model: Path = None,
                   engine: str = "whisper.cpp", fix_words: bool = True, on_progress=None) -> Transcript:
    """Transcribe a 16 kHz mono WAV.

    language: "auto" picks ro/ru/en per sentence, a code forces one language. on_segments(segments) gets each
    chunk's sentences as they are ready (default: printed). romanian_model: another model for the Romanian
    pass (a chunk it loops on is redone with model). engine: "whisper.cpp" or "mlx" (Apple Silicon).
    fix_words: correct misheard Romanian words. on_progress(done, total) after each chunk."""
    import numpy as np
    import soundfile as sf

    from ..speakers.accent import load_accent_id
    from ..text.codeswitch import tag_words
    from ..text.spelling import correct_words
    from .vad import speech_segments
    if engine == "mlx":
        from .mlx import MlxWhisper as Whisper
    else:
        from .whisper_cpp import WhisperServer as Whisper

    audio, sr = sf.read(str(wav), dtype="float32")
    chunks = plan_chunks(pad_segments(speech_segments(wav)))
    if not chunks:
        return Transcript(language="" if language == "auto" else language, segments=[])
    langs = LANGUAGES if language == "auto" else (language,)
    print(f"Transcribing {len(chunks)} chunk(s) of speech...", file=sys.stderr, flush=True)
    accent_id = load_accent_id() if accents and not translate and "en" in langs else None
    show = on_segments or print_segments
    result, seconds, runs, fixed = Transcript(language="", segments=[]), {}, {}, 0
    use_romanian = romanian_model is not None and "ro" in langs and not translate and \
        Path(romanian_model) != Path(model)
    with Whisper(model, "auto", translate) as server, \
            (Whisper(romanian_model) if use_romanian else nullcontext(server)) as ro_server:

        def decode(chunk, lang, quick=False):
            runs[lang] = runs.get(lang, 0) + 1
            clip, timeline = chunk_audio(chunk, audio, sr)
            data = wav_bytes(clip, sr)
            if lang == "ro" and ro_server is not server:
                verbose = ro_server.transcribe_verbose(data, lang, quick)
                if looping(verbose):
                    runs["ro loop redone"] = runs.get("ro loop redone", 0) + 1
                    verbose = server.transcribe_verbose(data, lang)
            else:
                verbose = server.transcribe_verbose(data, lang, quick)
            segments = parse_verbose(verbose, 0.0)
            if lang in LANGUAGES:
                segments = [s for s in segments if not OTHER_SCRIPTS.search(plain_text(s[2]))]
            return to_recording(segments, timeline)

        def detect(chunk):
            runs["language guess"] = runs.get("language guess", 0) + 1
            return server.detect_language(wav_bytes(chunk_audio(chunk, audio, sr)[0], sr))

        sentence_start = True
        for done, chunk in enumerate(chunks, 1):
            new, english = [], []
            for start, end, lang, words in transcribe_chunk(decode, chunk, langs, detect):
                sentence_start = capitalize(words, sentence_start)
                lang = tag_words(words, "en" if translate else lang)  # a translation is English
                if fix_words and not translate:
                    fixed += correct_words(words)
                new.append(Segment(timestamp(start), timestamp(end), plain_text(words), lang, "", words))
                result.words.extend(words)
                seconds[lang] = seconds.get(lang, 0.0) + end - start
                if lang == "en":
                    english.append(audio[int(start * sr):int(end * sr)])
            if accent_id and english:  # one accent for the chunk's English
                accent = accent_id.accent(np.concatenate(english))
                for s in new:
                    s.accent = accent if s.lang == "en" else ""
            result.segments.extend(new)
            show(new)
            if on_progress:
                on_progress(done, len(chunks))
    result.language = max(seconds, key=seconds.get) if seconds else ""
    _report(seconds, runs, fixed)
    return result


def _report(seconds: dict, runs: dict, fixed: int):
    total = sum(seconds.values()) or 1.0
    shares = ", ".join(f"{lang} {s / total:.0%}" for lang, s in sorted(seconds.items(), key=lambda x: -x[1]))
    counts = ", ".join(f"{what} {n}" for what, n in runs.items())
    print(f"Speech by language: {shares or 'none'}. Whisper runs: {counts}. Misheard words corrected: {fixed}.",
          file=sys.stderr, flush=True)


def print_segments(segments: list):
    for s in segments:
        print(f"  [{s.start[:8]}] {tagged(s)}", file=sys.stderr, flush=True)
