"""Transcribe with Whisper (whisper.cpp) locally, in the right language for every sentence.

Whisper keeps one language per 30 s window, and forced into a language it doesn't hear it either writes
the speech in that language's letters ("Cărășo, davai" for "Хорошо, давай") or translates it. Language
ID doesn't settle it: Whisper's own guess and acoustic models call Moldovan-accented Romanian Russian,
Ukrainian or Lithuanian. Medpark meetings are Romanian with Russian and English mixed in, so:
  1. Silero VAD finds the speech (segments.py); up to 28 s of it, pauses left out, makes one chunk.
  2. whisper-server (the model stays loaded), or MLX on Apple Silicon (mlx_backend.py), transcribes every
     chunk in Romanian, optionally with another model for this pass (romanian_model: turbo, faster, or the
     Moldovan fine-tune ROMANIAN_MODEL). Whisper itself writes a clear Russian or English sentence as such,
     and Russian words Moldovans insert are written back in Cyrillic (codeswitch.py): that is the whole job
     for most chunks.
  3. A sentence that isn't real Romanian (Russian heard as Latin-letter nonsense) is compared with the
     chunk transcribed in Russian; the Russian sentence replaces it if Whisper is sure of it and it sounds
     like the nonsense, i.e. is not a translation (transcribe_chunk). When Whisper was unsure of a chunk,
     its language guess is asked too: very sure Russian, or English, gets that language tried.
English speech also gets the speaker's accent (accent.py).
"""
import io
import json
import math
import re
import sys
import tempfile
import zlib
from contextlib import nullcontext
from dataclasses import dataclass, field
from pathlib import Path

from .audio import to_wav16k

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
DEFAULT_MODEL = MODELS_DIR / "ggml-large-v3.bin"
FAST_MODEL = MODELS_DIR / "ggml-large-v3-turbo-q8_0.bin"  # with --engine mlx: mlx-community/whisper-large-v3-turbo
# Whisper large-v3-turbo fine-tuned on 70 h of Moldovan Romanian (FraPiz/whisper-large-v3-turbo-moldovan-romanian),
# converted for whisper.cpp; see README. Used for the Romanian pass, DEFAULT_MODEL for the rest.
ROMANIAN_MODEL = MODELS_DIR / "ggml-frapiz-md-turbo-f16.bin"
VAD_MODEL = MODELS_DIR / "ggml-silero-v5.1.2.bin"
MAX_COMPRESSION = 2.4  # a transcript that compresses this well (zlib) is a Whisper loop, as in OpenAI's Whisper
LANGUAGES = ("ro", "ru", "en")  # --lang auto: the first is the meeting's language, transcribed first
MAX_CHUNK = 28.0   # seconds of speech per chunk; Whisper's window is 30 s
PAD = 0.15         # seconds of context around each piece of speech so first/last syllables aren't cut
CONFIDENT = -0.3   # mean log-probability of Whisper's words above which a transcript is trusted (see confidence)
UNSURE = -0.6      # below this for a whole chunk, Whisper's language guess is asked (it costs ~2 s)
SURE_RUSSIAN = 0.9  # Whisper's guess for Russian at which a chunk is taken as Russian (Moldovan Romanian: <0.8)
MIN_ROMANIAN_WORDS = 0.55  # a Romanian sentence with fewer real words is Russian written in Latin letters
                           # (noisy medical Romanian: ~0.56+, Russian in Latin letters: 0.3-0.5)
MIN_RUSSIAN_WORDS = 0.5   # a Russian sentence counts only if at least this share of it is real Russian words
SOUNDS_ALIKE = 0.6  # garbled and Russian sentence must sound this alike (a translation doesn't: see sounds_alike)
# How much more confident Whisper must be in a language than in Romanian to choose it.
HANDICAP = {"ro": 0.0, "ru": 0.3, "en": 0.3}
MIN_RECHECK = 1.0  # sentences shorter than this ("Da.", "Ok") keep their chunk's language: too short to judge
# Letters that are neither Latin (with Romanian ă â î ș ț) nor Cyrillic.
OTHER_SCRIPTS = re.compile(r"[^\W\d_A-Za-zÀ-ɏḀ-ỿЀ-ӿ]")
# Phrases Whisper invents on noise or unclear speech (learned from subtitles): such a sentence is dropped.
HALLUCINATIONS = re.compile(r"субтитр|продолжение следует|спасибо за просмотр|подпишитесь на канал|subtitr|"
                            r"mulțum\w* (pentru|de) vizionare|nu uitați să (dați like|vă abonați)|abonați-vă|"
                            r"thanks? (you )?for watching|please subscribe|like and subscribe", re.IGNORECASE)


@dataclass
class Word:
    start: float  # seconds
    end: float    # seconds
    text: str
    lang: str = ""          # ro / ru / en, once tagged
    prob: float = 1.0       # Whisper's confidence (the lowest of the word's tokens)
    segment_lang: str = ""  # the language of its sentence ("ro" for a Russian word inside a Romanian sentence)

    def to_dict(self) -> dict:
        return {"text": self.text, "start": round(self.start, 2), "end": round(self.end, 2), "lang": self.lang}


@dataclass
class Segment:
    start: str
    end: str
    text: str
    lang: str = ""    # the sentence's language
    accent: str = ""  # English accent label ("us", "england", ...), see accent.py
    words: list = field(default_factory=list)

    @property
    def tag(self) -> str:
        return language_tag(self.words, self.accent)


@dataclass
class Transcript:
    language: str  # the recording's main language
    segments: list
    words: list = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(s.text for s in self.segments).strip()

    def to_text(self) -> str:
        return "\n".join(_tagged(s) for s in self.segments)

    def to_timestamps(self) -> str:
        return "\n".join(f"[{s.start} --> {s.end}] {_tagged(s)}" for s in self.segments)

    def to_srt(self) -> str:
        blocks = []
        for i, s in enumerate(self.segments, 1):
            blocks.append(f"{i}\n{s.start.replace('.', ',')} --> {s.end.replace('.', ',')}\n{_tagged(s)}\n")
        return "\n".join(blocks)

    def to_json(self) -> str:
        return json.dumps({"language": self.language, "segments": [
            {"start": s.start, "end": s.end, "language": s.lang, "accent": s.accent, "text": s.text,
             "words": [w.to_dict() for w in s.words]} for s in self.segments]}, ensure_ascii=False, indent=2)


def _tagged(s: Segment) -> str:
    return f"[{s.tag}] {s.text}" if s.tag else s.text


def word_languages(words: list) -> list:
    """The languages of the words, most frequent first (e.g. ["ro", "ru"])."""
    counts = {}
    for w in words:
        if w.lang:
            counts[w.lang] = counts.get(w.lang, 0) + 1
    return sorted(counts, key=counts.get, reverse=True)


def language_tag(words: list, accent: str = "") -> str:
    """Display tag: "ro", "ro+ru" (a Romanian line with Russian words), "en, Australian"."""
    from .accent import ACCENT_NAMES

    tag = "+".join(word_languages(words))
    if accent and tag.startswith("en"):
        tag += f", {ACCENT_NAMES.get(accent, accent)}"
    return tag


def timestamp(seconds: float, sep: str = ".") -> str:
    """"HH:MM:SS.mmm" (sep="," for SRT)."""
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def transcribe(audio: Path, model: Path = DEFAULT_MODEL, language: str = "auto", translate: bool = False,
               romanian_model: Path = None, engine: str = "whisper.cpp", fix_words: bool = True) -> Transcript:
    """Transcribe any audio/video file (converted to 16 kHz WAV first)."""
    with tempfile.TemporaryDirectory() as tmp:
        wav = to_wav16k(Path(audio), Path(tmp) / "input.wav")
        return transcribe_wav(wav, model, language, translate, romanian_model=romanian_model, engine=engine,
                              fix_words=fix_words)


def transcribe_wav(wav: Path, model: Path = DEFAULT_MODEL, language: str = "auto", translate: bool = False,
                   on_segments=None, accents: bool = True, romanian_model: Path = None,
                   engine: str = "whisper.cpp", fix_words: bool = True) -> Transcript:
    """Transcribe a 16 kHz mono WAV. language="auto" picks Romanian, Russian or English for every sentence;
    another language code is used for the whole recording (words are still tagged).

    on_segments(segments) is called with each chunk's segments as soon as they are transcribed (default:
    print them to stderr). accents: find the accent of English speech. romanian_model: a second model for the
    Romanian pass (ROMANIAN_MODEL); a chunk where it loops is redone with model. engine: "whisper.cpp"
    (whisper-server) or "mlx" (Apple Silicon, faster: mlx_backend.py). fix_words: correct misheard Romanian
    words ("Pocentul" -> "Pacientul", spelling.py).
    """
    import numpy as np
    import soundfile as sf

    from .accent import load_accent_id
    from .codeswitch import tag_words
    from .spelling import correct_words
    from .segments import speech_segments
    from .whisper_server import WhisperServer
    if engine == "mlx":
        from .mlx_backend import MlxWhisper as WhisperServer

    audio, sr = sf.read(str(wav), dtype="float32")
    chunks = plan_chunks(pad_segments(speech_segments(wav)))
    if not chunks:
        return Transcript(language="" if language == "auto" else language, segments=[])
    langs = LANGUAGES if language == "auto" else (language,)
    print(f"Transcribing {len(chunks)} chunk(s) of speech...", file=sys.stderr, flush=True)
    accent_id = load_accent_id() if accents and not translate and "en" in langs else None
    show = on_segments or _print_segments
    result, seconds, runs, fixed = Transcript(language="", segments=[]), {}, {}, 0
    use_romanian = (romanian_model is not None and "ro" in langs and not translate
                    and Path(romanian_model) != Path(model))
    with WhisperServer(model, "auto", translate) as server, \
            (WhisperServer(romanian_model) if use_romanian else nullcontext(server)) as ro_server:
        def decode(chunk, lang, quick=False):
            runs[lang] = runs.get(lang, 0) + 1
            clip, timeline = chunk_audio(chunk, audio, sr)
            data = wav_bytes(clip, sr)
            if lang == "ro" and ro_server is not server:
                verbose = ro_server.transcribe_verbose(data, lang, quick)
                if _looping(verbose):
                    runs["ro loop redone"] = runs.get("ro loop redone", 0) + 1
                    verbose = server.transcribe_verbose(data, lang)
            else:
                verbose = server.transcribe_verbose(data, lang, quick)
            segments = parse_verbose(verbose, 0.0)
            if lang in LANGUAGES:  # Greek or Korean letters in a Romanian/Russian/English meeting are invented
                segments = [s for s in segments if not OTHER_SCRIPTS.search(_plain(s[2]))]
            return _to_recording(segments, timeline)

        def detect(chunk):
            runs["language guess"] = runs.get("language guess", 0) + 1
            return server.detect_language(wav_bytes(chunk_audio(chunk, audio, sr)[0], sr))

        sentence_start = True
        for chunk in chunks:
            new, english = [], []
            for start, end, lang, words in transcribe_chunk(decode, chunk, langs, detect):
                sentence_start = _capitalize(words, sentence_start)
                lang = tag_words(words, "en" if translate else lang)  # the sentence's language; a translation is English
                if fix_words and not translate:
                    fixed += correct_words(words)
                new.append(Segment(timestamp(start), timestamp(end), _plain(words), lang, "", words))
                result.words.extend(words)
                seconds[lang] = seconds.get(lang, 0.0) + end - start
                if lang == "en":
                    english.append(audio[int(start * sr):int(end * sr)])
            if accent_id and english:  # one accent for the chunk's English, judged from all of it
                accent = accent_id.accent(np.concatenate(english))
                for s in new:
                    s.accent = accent if s.lang == "en" else ""
            result.segments.extend(new)
            show(new)
    result.language = max(seconds, key=seconds.get) if seconds else ""
    _report(seconds, runs, fixed)
    return result


def transcribe_chunk(decode, chunk, langs: tuple, detect=None) -> list:
    """[(start, end, lang, words)] for every Whisper segment (~ sentence) of one chunk of speech.

    decode(chunk, lang) transcribes the chunk in a language; detect(chunk) gives Whisper's guess at its
    language ({code: probability}, costs ~2 s). The chunk is transcribed in the meeting's language
    (langs[0]). Another language is tried only (a) when a sentence isn't real words of that language
    (Russian heard as Latin-letter nonsense), or (b) when Whisper was unsure of the whole chunk and its
    guess is very sure of Russian or ranks English first. A sentence of the other transcript replaces the
    first one if Whisper is sure of it, it is real words, it wins after HANDICAP, and it is the same speech:
    for (a) it must sound like the nonsense it replaces, as Whisper forced into another language often
    translates instead.
    """
    from .codeswitch import romanian_word_share, russian_words_heard, sounds_alike

    def garbled(words):
        return base == "ro" and romanian_word_share(words) < MIN_ROMANIAN_WORDS

    base = langs[0]
    decodes = {base: decode(chunk, base)}
    if len(langs) == 1:
        return [(start, end, base, words) for start, end, words in decodes[base]]
    any_garbled = any(end - start >= MIN_RECHECK and garbled(words) for start, end, words in decodes[base])
    guess = detect(chunk) if detect and confidence(_words(decodes[base])) < UNSURE else {}
    sure_russian = guess.get("ru", 0.0) >= SURE_RUSSIAN
    for lang in langs[1:]:
        if (lang == "ru" and (any_garbled or sure_russian)) or (lang == "en" and guess and _sounds_english(guess)):
            decodes[lang] = decode(chunk, lang)
    # Russian words inside Romanian sentences come out in Latin letters: the chunk in Russian shows which.
    russian = _words(decodes["ru"] if "ru" in decodes else decode(chunk, "ru", quick=True)) if "ru" in langs else []
    if not decodes[base]:  # nothing kept (e.g. an invented subtitle phrase dropped): take the other language's
        for lang in langs[1:]:
            if decodes.get(lang) and confidence(_words(decodes[lang])) >= CONFIDENT and _plausible(lang, _words(decodes[lang])):
                return [(start, end, lang, words) for start, end, words in decodes[lang]]
    pieces = []
    for start, end, words in decodes[base]:
        lang, chosen = base, words
        nonsense = garbled(words)  # wrong whatever Whisper's confidence (the Moldovan model is sure of its spellings)
        if end - start >= MIN_RECHECK and (nonsense or confidence(words) < CONFIDENT):
            for other, segments in decodes.items():
                alt = [w for w in _words(segments) if start <= (w.start + w.end) / 2 < end]
                same_speech = other != "ru" or sure_russian or (nonsense and sounds_alike(words, alt) >= SOUNDS_ALIKE)
                to_beat = float("-inf") if nonsense and chosen is words else _adjusted(lang, confidence(chosen))
                if (other != base and same_speech and confidence(alt) >= CONFIDENT and _plausible(other, alt)
                        and _adjusted(other, confidence(alt)) > to_beat):
                    lang, chosen = other, alt
        if lang == base == "ro" and russian:
            russian_words_heard(chosen, russian)
        pieces.append((start, end, lang, chosen))
    return pieces


def _plausible(lang: str, words: list) -> bool:
    """False for Romanian speech that Whisper, forced into Russian, wrote in Cyrillic letters."""
    from .codeswitch import russian_word_share

    return lang != "ru" or russian_word_share(words) >= MIN_RUSSIAN_WORDS


def _words(segments: list) -> list:
    return [w for _, _, ws in segments for w in ws]


def _adjusted(lang: str, score: float) -> float:
    return score - HANDICAP.get(lang, 0.0)


def _sounds_english(probs: dict) -> bool:
    """Whisper's language guess ranks English above the meeting's other languages."""
    return probs.get("en", 0.0) >= max(probs.get(lang, 0.0) for lang in LANGUAGES if lang != "en")


def confidence(words: list) -> float:
    """How sure Whisper was of a transcript: the mean log-probability of its words (-inf if there are none).
    Around -0.1 in the right language; forced into a wrong one, Whisper hesitates or translates: below -0.3."""
    if not words:
        return float("-inf")
    return sum(math.log(max(w.prob, 1e-6)) for w in words) / len(words)


@dataclass
class Chunk:
    pieces: list  # [(start, end)] of the recording, joined into one clip; the pauses between them left out

    @property
    def speech(self) -> float:
        return sum(end - start for start, end in self.pieces)


def pad_segments(segments: list, pad: float = PAD) -> list:
    """Each speech segment with pad seconds of context on both sides, but at most half the pause to its
    neighbours, so no word is heard twice."""
    padded = []
    for i, (start, end) in enumerate(segments):
        before = start - segments[i - 1][1] if i else 2 * pad
        after = segments[i + 1][0] - end if i + 1 < len(segments) else 2 * pad
        padded.append((max(0.0, start - min(pad, max(0.0, before) / 2)), end + min(pad, max(0.0, after) / 2)))
    return padded


def plan_chunks(segments: list, max_chunk: float = MAX_CHUNK) -> list:
    """Group speech segments into chunks of at most max_chunk seconds of speech. The pauses between them are
    left out of the clip, so every Whisper run (which costs the same for any clip up to 30 s) hears more."""
    chunks = []
    for start, end in segments:
        if chunks and chunks[-1].speech + end - start <= max_chunk:
            chunks[-1].pieces.append((start, end))
        else:
            chunks.append(Chunk([(start, end)]))
    return chunks


def chunk_audio(chunk: Chunk, audio, sr: int) -> tuple:
    """(the chunk's pieces of audio joined, timeline): the timeline lists (clip time, recording time) where
    each piece starts, to move times in the clip back to the recording."""
    import numpy as np

    parts, timeline, t = [], [], 0.0
    for start, end in chunk.pieces:
        part = audio[int(start * sr):int(end * sr)]
        parts.append(part)
        timeline.append((t, start))
        t += len(part) / sr
    return np.concatenate(parts), timeline


def _to_recording(segments: list, timeline: list) -> list:
    """Move Whisper segments and their words from the joined clip's time to the recording's time."""
    def move(t):
        clip_t, rec_t = max((p for p in timeline if p[0] <= t), default=timeline[0])
        return rec_t + t - clip_t

    for seg in segments:
        seg[0], seg[1] = move(seg[0]), move(seg[1])
        for w in seg[2]:
            w.start, w.end = move(w.start), move(w.end)
    return segments


def parse_verbose(result: dict, offset: float) -> list:
    """whisper-server verbose_json -> [[start, end, [Word]]] per Whisper segment, shifted by offset seconds.

    Tokens are merged into words: a token starting with a space, or following a bare " " token, begins a
    new word (Whisper has no " ț" token, so "țesut" comes as " ", "ț", "esut"). Whisper sometimes starts a
    segment in the middle of a word; then the word stays in the previous segment. Whisper's repetition loops
    are cut: a phrase repeated 3+ times in a row is kept once, and a segment that repeats one of the last
    three is dropped. Empty segments and invented subtitle phrases (HALLUCINATIONS) are dropped too.
    """
    out, new_word = [], False
    for seg in result.get("segments", []):
        words = []
        for tok in seg.get("words", []):
            text = tok["word"]
            if text.strip().startswith("[_"):  # [_BEG_], [_TT_n]
                continue
            if not text.strip():
                new_word = True
                continue
            start, end = offset + tok["start"], offset + tok["end"]
            if not (new_word or text.startswith(" ")) and (words or out):
                prev = words[-1] if words else out[-1][2][-1]
                prev.text += text
                prev.end = end
                prev.prob = min(prev.prob, tok["probability"])
                if not words:
                    out[-1][1] = max(out[-1][1], end)
            else:
                words.append(Word(start, end, text.strip(), prob=tok["probability"]))
            new_word = False
        words = _collapse_repeats(words)
        recent = {_key(ws) for _, _, ws in out[-3:]}
        if words and not HALLUCINATIONS.search(_plain(words)) and _key(words) not in recent:
            out.append([offset + seg["start"], offset + seg["end"], words])
    return out


def _looping(verbose: dict) -> bool:
    """Whisper got stuck repeating a phrase (each time spelled a little differently, so _collapse_repeats
    can't cut it): its text compresses far better than speech does."""
    text = "".join(tok["word"] for seg in verbose.get("segments", []) for tok in seg.get("words", [])
                   if not tok["word"].strip().startswith("[_")).encode()
    return len(text) / max(len(zlib.compress(text)), 1) > MAX_COMPRESSION


def _capitalize(words: list, sentence_start: bool) -> bool:
    """Capitalize the words that start a sentence (the Moldovan model often writes them in lowercase), given
    whether the words before ended one. Returns whether the last word ends a sentence."""
    for w in words:
        if sentence_start and w.text[:1].islower():
            w.text = w.text[0].upper() + w.text[1:]
        sentence_start = w.text.endswith((".", "?", "!", "…"))
    return sentence_start


def _collapse_repeats(words: list, min_repeats: int = 3, max_len: int = 8) -> list:
    """Keep once a phrase of up to max_len words repeated min_repeats+ times in a row (Whisper looping);
    the last copy is kept, as it has the closing punctuation."""
    keys = [re.sub(r"\W", "", w.text.lower()) for w in words]
    out, i = [], 0
    while i < len(words):
        for n in range(1, min(max_len, (len(words) - i) // min_repeats) + 1):
            repeats = 1
            while keys[i + repeats * n:i + (repeats + 1) * n] == keys[i:i + n]:
                repeats += 1
            if repeats >= min_repeats:
                out.extend(words[i + (repeats - 1) * n:i + repeats * n])
                i += repeats * n
                break
        else:
            out.append(words[i])
            i += 1
    return out


def _key(words: list) -> str:
    """A segment's text without case and punctuation, to spot repeats."""
    return re.sub(r"\W+", " ", _plain(words).lower()).strip()


def wav_bytes(audio, sr: int) -> bytes:
    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def _plain(words: list) -> str:
    return " ".join(w.text for w in words)


def _report(seconds: dict, runs: dict, fixed: int = 0):
    total = sum(seconds.values()) or 1.0
    shares = ", ".join(f"{lang} {s / total:.0%}" for lang, s in sorted(seconds.items(), key=lambda x: -x[1]))
    counts = ", ".join(f"{what} {n}" for what, n in runs.items())
    print(f"Speech by language: {shares or 'none'}. Whisper runs: {counts}. Misheard words corrected: {fixed}.",
          file=sys.stderr, flush=True)


def _print_segments(segments: list):
    for s in segments:
        print(f"  [{s.start[:8]}] {_tagged(s)}", file=sys.stderr, flush=True)
