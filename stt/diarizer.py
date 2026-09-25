"""Speaker diarization ("who spoke when") with pyannote 3.1, running locally."""
import os
import warnings
from dataclasses import dataclass
from pathlib import Path

PIPELINE_NAME = "pyannote/speaker-diarization-3.1"
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


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


def diarize(wav: Path) -> list:
    """Return speaker turns for a 16 kHz mono WAV. The number of speakers is detected automatically."""
    warnings.filterwarnings("ignore", module="pyannote")
    warnings.filterwarnings("ignore", module="torchaudio")
    warnings.filterwarnings("ignore", module="speechbrain")
    warnings.filterwarnings("ignore", module="lightning_fabric")
    # pyannote 3.x checkpoints (from the official pyannote HF repos) predate PyTorch 2.6's
    # weights_only=True default; allow full loading so they can be read.
    os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")
    import soundfile as sf
    import torch
    from pyannote.audio import Pipeline

    # from_pretrained returns None (or raises) when the model isn't cached and the token is missing/invalid.
    pipeline, reason = None, "model not downloaded yet"
    try:
        pipeline = Pipeline.from_pretrained(PIPELINE_NAME, use_auth_token=_hf_token())
    except Exception as e:
        reason = str(e).splitlines()[0]
    if pipeline is None:
        raise RuntimeError(
            f"Could not load {PIPELINE_NAME} ({reason}).\n"
            "If this is a download/token problem (first run only): create a free token at https://huggingface.co/settings/tokens, accept the terms at\n"
            "  https://huggingface.co/pyannote/speaker-diarization-3.1 and\n"
            "  https://huggingface.co/pyannote/segmentation-3.0\n"
            "then put HF_TOKEN=hf_... in the .env file (or export HF_TOKEN). After that it runs offline."
        )
    pipeline.to(torch.device("mps" if torch.backends.mps.is_available() else "cpu"))

    # Pass the audio in memory, so pyannote doesn't need its own audio decoder.
    audio, sample_rate = sf.read(str(wav), dtype="float32", always_2d=True)
    waveform = torch.from_numpy(audio.T)  # (channels, samples)
    annotation = pipeline({"waveform": waveform, "sample_rate": sample_rate})

    # Rename SPEAKER_00, SPEAKER_01... to SPEAKER 1, SPEAKER 2... in order of first appearance.
    names = {}
    turns = []
    for segment, _, label in annotation.itertracks(yield_label=True):
        name = names.setdefault(label, f"SPEAKER {len(names) + 1}")
        turns.append(Turn(segment.start, segment.end, name))
    return turns
