"""English accent ID (American, British, Australian, Indian, ...) with the local CommonAccent ECAPA model."""
import sys
import warnings

import numpy as np

from .transcriber import MODELS_DIR

ACCENT_MODEL = MODELS_DIR / "speechbrain" / "accent-id-commonaccent_ecapa"
ACCENT_NAMES = {
    "us": "American", "england": "British", "australia": "Australian", "canada": "Canadian",
    "indian": "Indian", "scotland": "Scottish", "ireland": "Irish", "wales": "Welsh", "african": "African",
    "newzealand": "New Zealand", "malaysia": "Malaysian", "singapore": "Singaporean", "hongkong": "Hong Kong",
    "philippines": "Filipino", "bermuda": "Bermudian", "southatlandtic": "South Atlantic",
}
SCALE = 30.0        # the classifier outputs cosine scores; softmax(SCALE * score) turns them into probabilities
MIN_SECONDS = 2.0   # less English speech than this is not enough to judge an accent
MAX_SECONDS = 30.0  # enough audio for a stable guess; more only costs time
SAMPLE_RATE = 16000


def load_classifier(path):
    """Load a SpeechBrain EncoderClassifier from a local folder; it never touches the network."""
    if not (path / "hyperparams.yaml").exists():
        raise FileNotFoundError(f"Model not found: {path}\n"
                                "Download it once with: .venv/bin/python scripts/download_models.py")
    warnings.filterwarnings("ignore", module="speechbrain")
    warnings.filterwarnings("ignore", module="torchaudio")
    from speechbrain.inference.classifiers import EncoderClassifier

    # hyperparams.yaml points its weights at the Hugging Face repo; point them at the local folder instead.
    model = EncoderClassifier.from_hparams(source=str(path), savedir=None, overrides={"pretrained_path": str(path)},
                                           run_opts={"device": "cpu"})
    labels = model.hparams.label_encoder
    labels.expect_len(len(labels))  # silences SpeechBrain's "expect_len was never called" warning
    return model


class AccentID:
    def __init__(self):
        self.model = load_classifier(ACCENT_MODEL)
        labels = self.model.hparams.label_encoder
        self.labels = [labels.ind2lab[i] for i in range(len(labels))]

    def probabilities(self, audio) -> dict:
        """{accent label: probability} for float32 samples at 16 kHz."""
        import torch

        clip = np.ascontiguousarray(audio[:int(MAX_SECONDS * SAMPLE_RATE)], dtype=np.float32)
        with torch.no_grad():
            scores = self.model.classify_batch(torch.from_numpy(clip).unsqueeze(0))[0][0]
        return dict(zip(self.labels, torch.softmax(scores * SCALE, dim=0).tolist()))

    def accent(self, audio) -> str:
        """Most likely accent label ("us", "england", ...), or "" when there is too little speech."""
        if len(audio) < MIN_SECONDS * SAMPLE_RATE:
            return ""
        probs = self.probabilities(audio)
        return max(probs, key=probs.get)


def load_accent_id():
    """The accent model, or None (with a warning) when it isn't downloaded: accents are optional."""
    try:
        return AccentID()
    except FileNotFoundError as e:
        print(f"Accent detection skipped: {e}", file=sys.stderr)
        return None


def label_speakers(dialog: list, audio, sr: int = SAMPLE_RATE, accent_id: AccentID = None):
    """Set .accent on English utterances: one accent per speaker, judged from all of their English speech."""
    english = {}
    for u in dialog:
        if u.lang == "en":
            english.setdefault(u.speaker, []).append(audio[int(u.start * sr):int(u.end * sr)])
    accent_id = (accent_id or load_accent_id()) if english else None
    if accent_id is None:
        return
    for speaker, clips in english.items():
        accent = accent_id.accent(np.concatenate(clips))
        for u in dialog:
            if u.speaker == speaker and u.lang == "en":
                u.accent = accent
