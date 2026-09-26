"""Speaker diarization ("who spoke when") with pyannote community-1, running locally."""
import os
import warnings
from dataclasses import dataclass
from pathlib import Path

# community-1 (pyannote.audio 4) instead of 3.1: on a 60-min ICU round 8 speaker labels instead of 55, same speed
# and the same main voices (91% of seconds agree), see bench/eval_speakers.py.
PIPELINE_NAME = "pyannote/speaker-diarization-community-1"
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
DEVICE = os.environ.get("STT_DIARIZE_DEVICE", "mps")  # "mps" (Apple GPU) or "cpu"

# Diarization can still split one person into short extra "speakers" (pyannote 3.1: 55 labels for a 60-min ICU
# round, 52 of them with < 75 s; community-1: a few). A real participant talks for longer, so in automatic mode a
# label with little talk time is merged into the speaker whose voice it resembles most (pyannote's embeddings).
MIN_SPEAKER_SECONDS = 20.0  # less talk than this (and < MIN_SPEAKER_SHARE of all speech) = a fragment
MIN_SPEAKER_SHARE = 0.015
DISTINCT_BELOW = 0.1  # a fragment this unlike every main voice (cosine) is kept as its own speaker ...
DISTINCT_MIN_SECONDS = 8.0  # ... if it talks at least this long
SAME_ABOVE = 0.85  # two main speakers whose voices are this similar are one person
BATCH_SIZE = 32  # segmentation / embedding chunks per GPU batch (community-1 default)


@dataclass
class Turn:
    start: float  # seconds
    end: float    # seconds
    speaker: str


def _hf_token():
    """HuggingFace token: only needed the first time, to download the model into the local cache."""
    token = os.environ.get("HF_TOKEN")
    if token or not ENV_FILE.exists():
        return token
    for line in ENV_FILE.read_text().splitlines():
        key, _, value = line.partition("=")
        if key.strip() == "HF_TOKEN":
            return value.strip().strip('"').strip("'") or None
    return None


def diarize(wav: Path, device: str = DEVICE, num_speakers: int = None, min_speakers: int = None,
            max_speakers: int = None) -> list:
    """Return speaker turns for a 16 kHz mono WAV.

    The number of speakers is detected automatically (then fragments are merged, see MIN_SPEAKER_SECONDS),
    or fixed with num_speakers, or bounded with min_speakers / max_speakers.
    """
    turns, voices = diarize_raw(wav, device, num_speakers, min_speakers, max_speakers)
    if not num_speakers:
        turns = merge_fragments(turns, voices, min_speakers=min_speakers or 1)
    return renumber(turns)


def diarize_raw(wav: Path, device: str = DEVICE, num_speakers: int = None, min_speakers: int = None,
                max_speakers: int = None, batch_size: int = BATCH_SIZE):
    """pyannote's own result: (turns with its labels, {label: voice embedding centroid})."""
    warnings.filterwarnings("ignore", module="pyannote")
    warnings.filterwarnings("ignore", module="torchaudio")
    warnings.filterwarnings("ignore", module="speechbrain")
    warnings.filterwarnings("ignore", module="lightning_fabric")
    import soundfile as sf
    import torch
    from pyannote.audio import Pipeline

    # from_pretrained returns None (or raises) when the model isn't cached and the token is missing/invalid.
    pipeline, reason = None, "model not downloaded yet"
    try:
        pipeline = Pipeline.from_pretrained(PIPELINE_NAME, token=_hf_token())
    except Exception as e:
        reason = str(e).splitlines()[0]
    if pipeline is None:
        raise RuntimeError(
            f"Could not load {PIPELINE_NAME} ({reason}).\n"
            "If this is a download/token problem (first run only): create a free token at https://huggingface.co/settings/tokens, accept the terms at\n"
            "  https://huggingface.co/pyannote/speaker-diarization-community-1\n"
            "then put HF_TOKEN=hf_... in the .env file (or export HF_TOKEN). After that it runs offline."
        )
    if device == "mps" and not torch.backends.mps.is_available():
        device = "cpu"
    pipeline.to(torch.device(device))
    pipeline.segmentation_batch_size = pipeline.embedding_batch_size = batch_size

    # Pass the audio in memory, so pyannote doesn't need its own audio decoder.
    audio, sample_rate = sf.read(str(wav), dtype="float32", always_2d=True)
    waveform = torch.from_numpy(audio.T)  # (channels, samples)
    hints = {k: v for k, v in dict(num_speakers=num_speakers, min_speakers=min_speakers,
                                   max_speakers=max_speakers).items() if v}
    output = pipeline({"waveform": waveform, "sample_rate": sample_rate}, **hints)
    annotation, centroids = output.speaker_diarization, output.speaker_embeddings
    turns = [Turn(segment.start, segment.end, label)
             for segment, _, label in annotation.itertracks(yield_label=True)]
    # centroids rows follow annotation.labels()
    voices = {label: centroids[i] for i, label in enumerate(annotation.labels())} if centroids is not None else {}

    # Free the models' memory before transcription starts (16 GB Macs are tight with Whisper/Gemma loaded).
    del pipeline
    if device == "mps":
        torch.mps.empty_cache()
    return turns, voices


def _cosine(a, b) -> float:
    import numpy as np

    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    return float(np.dot(a, b) / (na * nb)) if na and nb else 0.0


def merge_fragments(turns: list, voices: dict, min_speakers: int = 1) -> list:
    """Merge labels with little talk time into the most similar main speaker (see MIN_SPEAKER_SECONDS).

    A fragment without a usable voice embedding goes to the main speaker talking closest to it in time.
    Main speakers with near-identical voices are merged as well, but never below min_speakers.
    """
    talk = {}
    for t in turns:
        talk[t.speaker] = talk.get(t.speaker, 0.0) + t.end - t.start
    total = sum(talk.values()) or 1.0
    main = [s for s, v in sorted(talk.items(), key=lambda x: -x[1])
            if v >= MIN_SPEAKER_SECONDS or v >= MIN_SPEAKER_SHARE * total]
    if not main:
        return turns
    target = {s: s for s in main}
    # Main speakers with (nearly) the same voice: the one who talks less joins the other.
    for i, s in enumerate(main):
        if len(set(target.values())) <= min_speakers:
            break
        for bigger in main[:i]:
            if target[bigger] == bigger and s in voices and bigger in voices and \
                    _cosine(voices[s], voices[bigger]) >= SAME_ABOVE:
                target[s] = bigger
                break
    kept = [s for s in main if target[s] == s]
    for s in talk:
        if s in target:
            continue
        sims = {m: _cosine(voices[s], voices[m]) for m in kept if s in voices and m in voices}
        if sims:
            best = max(sims, key=sims.get)
            if sims[best] < DISTINCT_BELOW and talk[s] >= DISTINCT_MIN_SECONDS:
                target[s] = s  # clearly another voice that says something: a real (short) participant
            else:
                target[s] = best
        else:  # no voice embedding: whoever talks closest in time
            mine = [t for t in turns if t.speaker == s]
            target[s] = min(kept, key=lambda m: min(abs((t.start + t.end) - (u.start + u.end))
                                                     for t in turns if t.speaker == m for u in mine))
    return [Turn(t.start, t.end, target[t.speaker]) for t in turns]


def renumber(turns: list) -> list:
    """SPEAKER_00, SPEAKER_07... -> SPEAKER 1, SPEAKER 2... in order of first appearance; merges adjacent turns
    of the same speaker that now touch or overlap."""
    names, out = {}, []
    for t in sorted(turns, key=lambda t: t.start):
        name = names.setdefault(t.speaker, f"SPEAKER {len(names) + 1}")
        if out and out[-1].speaker == name and t.start <= out[-1].end:
            out[-1].end = max(out[-1].end, t.end)
        else:
            out.append(Turn(t.start, t.end, name))
    return out
