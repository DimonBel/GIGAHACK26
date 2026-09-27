"""Which language a piece of speech is in (Romanian, Russian or English), from the sound, in a fraction of a
Whisper run.

Whisper's own guess calls Moldovan-accented Romanian Russian, and asking it costs an encoder pass. This uses
SpeechBrain's VoxLingua107 ECAPA embeddings (models/lang-id-voxlingua107-ecapa) with our ro/ru/en head
(models/lid/lid_head.npz, scripts/train_lid.py: trained with Moldovan speakers and room noise). On 3 s windows it
is right on 96% of Moldovan Romanian, 98% of Russian and English (models/lid/lid_report.json); the stock
VoxLingua107 calls a quarter of Moldovan Romanian Russian. The transcriber uses it to skip the Whisper runs a
chunk doesn't need (transcriber.transcribe_chunk).
"""
import sys
from pathlib import Path

import numpy as np

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
VOXLINGUA = MODELS_DIR / "lang-id-voxlingua107-ecapa"
HEAD = MODELS_DIR / "lid" / "lid_head.npz"
LANGS = ("ro", "ru", "en")
WINDOW, HOP = 3.0, 1.5  # seconds; 3 s windows are clearly more accurate than 1.5 s ones (lid_report.json)
MIN_PIECE = 1.0         # shorter speech isn't judged
SHORT, SURE = 4.0, 0.9  # a run of another language shorter than SHORT s counts only if heard with p >= SURE
                        # (on the all-Romanian Medpark sample, 3-5 s of Moldovan Romanian were heard as Russian at
                        # lower p; a real switch is a sentence, longer or clearly heard)
BATCH = 32


class LanguageID:
    def __init__(self, voxlingua: Path = VOXLINGUA, head: Path = HEAD):
        import torch
        from speechbrain.inference.classifiers import EncoderClassifier

        self.torch = torch
        self.clf = EncoderClassifier.from_hparams(source=str(voxlingua), savedir=str(voxlingua),
                                                  run_opts={"device": "cpu"})
        self.head = dict(np.load(head))

    def probs(self, pieces: list) -> np.ndarray:
        """p(ro, ru, en) for each 16 kHz audio piece: an array of shape (len(pieces), 3)."""
        out = []
        for i in range(0, len(pieces), BATCH):
            batch = pieces[i:i + BATCH]
            n = max(len(p) for p in batch)
            x = self.torch.zeros(len(batch), n)
            for k, p in enumerate(batch):
                x[k, :len(p)] = self.torch.from_numpy(np.ascontiguousarray(p))
            with self.torch.no_grad():
                e = self.clf.encode_batch(x, self.torch.tensor([len(p) / n for p in batch])).squeeze(1).numpy()
            e = e / np.linalg.norm(e, axis=1, keepdims=True)
            z = ((e - self.head["mean"]) / self.head["scale"]) @ self.head["coef"].T + self.head["intercept"]
            z = np.exp(z - z.max(axis=1, keepdims=True))
            out.append(z / z.sum(axis=1, keepdims=True))
        return np.concatenate(out)

    def heard(self, audio: np.ndarray, pieces: list, sr: int = 16000, main: str = "ro") -> list:
        """[(start, end, language)] runs of the recording for these (start, end) pieces of it.

        Every piece is judged in 3 s windows every 1.5 s, each window averaged with its neighbours. Another
        language than `main` (the meeting's) counts only where two windows in a row agree (one window in ~25 of
        Moldovan Romanian is heard as something else), and if shorter than SHORT seconds, only when sure."""
        base, runs = LANGS.index(main), []
        for start, end in pieces:
            clip = audio[int(start * sr):int(end * sr)]
            if len(clip) < MIN_PIECE * sr:
                continue
            win, hop = int(WINDOW * sr), int(HOP * sr)
            starts = list(range(0, max(1, len(clip) - win + 1), hop))
            ends = starts[1:] + [len(clip)]  # each window stands for the audio up to the next one
            p = self.probs([clip[s:s + win] for s in starts])
            p = np.array([p[max(0, i - 1):i + 2].mean(axis=0) for i in range(len(p))])
            groups = []  # [first window, last window, label] of windows in a row with the same label
            for i, lab in enumerate(p.argmax(axis=1)):
                if groups and groups[-1][2] == lab:
                    groups[-1][1] = i
                else:
                    groups.append([i, i, lab])
            for i0, i1, lab in groups:
                a, b = start + starts[i0] / sr, start + ends[i1] / sr
                lone = i0 == i1 and len(starts) > 1
                unsure = (b - a < SHORT or i0 == i1) and p[i0:i1 + 1, lab].mean() < SURE
                lang = LANGS[base if lab != base and (lone or unsure) else lab]
                if runs and runs[-1][2] == lang and abs(runs[-1][1] - a) < 1e-6:
                    runs[-1] = (runs[-1][0], b, lang)
                else:
                    runs.append((a, b, lang))
        return runs


def seconds(runs: list) -> dict:
    """{language: seconds} of heard() runs."""
    out = dict.fromkeys(LANGS, 0.0)
    for a, b, lang in runs:
        out[lang] += b - a
    return out


def spoken(runs: list, start: float, end: float) -> str:
    """The language heard for most of start..end ("" if none of it was judged)."""
    overlap = dict.fromkeys(LANGS, 0.0)
    for a, b, lang in runs:
        overlap[lang] += max(0.0, min(b, end) - max(a, start))
    best = max(overlap, key=overlap.get)
    return best if overlap[best] > 0 else ""


def load_language_id():
    """The language ID, or None (with a note) when its model files aren't there: it only makes things faster."""
    missing = [p for p in (VOXLINGUA / "embedding_model.ckpt", HEAD) if not p.exists()]
    if missing:
        print(f"Language ID skipped (not found: {', '.join(map(str, missing))}); every chunk is also "
              "transcribed in Russian.", file=sys.stderr)
        return None
    return LanguageID()
