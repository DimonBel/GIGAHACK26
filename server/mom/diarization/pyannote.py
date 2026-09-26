"""Speaker diarization ("who spoke when") with pyannote community-1, running locally."""
import warnings
from pathlib import Path

from ..config import DIARIZE_DEVICE as DEVICE
from ..config import env
from .turns import Turn, merge_fragments, renumber

# community-1 (pyannote.audio 4) instead of 3.1: on a 60-min ICU round 8 speaker labels instead of 55, same speed
# and the same main voices (91% of seconds agree), see bench/eval_speakers.py.
PIPELINE_NAME = "pyannote/speaker-diarization-community-1"
BATCH_SIZE = 32  # segmentation / embedding chunks per GPU batch (community-1 default)


def diarize(wav: Path, device: str = DEVICE, num_speakers: int = None, min_speakers: int = None,
            max_speakers: int = None) -> list:
    """Return speaker turns for a 16 kHz mono WAV.

    The number of speakers is detected automatically (then fragments are merged, see turns.MIN_SPEAKER_SECONDS),
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
        pipeline = Pipeline.from_pretrained(PIPELINE_NAME, token=env("HF_TOKEN"))
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


