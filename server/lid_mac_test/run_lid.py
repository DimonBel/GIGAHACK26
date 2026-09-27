"""Which language is spoken when (Romanian / Russian / English), with the GIGAHACK26 language ID (stt/lid.py).

    python run_lid.py recording.m4a              # any audio/video file
    python run_lid.py recording.wav --json out.json

Prints the stretches heard in another language than the meeting's (Romanian by default), the seconds per language,
and how long the analysis took (the speed is what matters on a Mac: it runs next to Whisper in the pipeline).
"""
import argparse
import json
import platform
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stt.lid import LANGS, LanguageID, seconds  # noqa: E402  (the same file as the pipeline's stt/lid.py)

SR = 16000


def load(path: Path) -> np.ndarray:
    """16 kHz mono float32. WAV/FLAC/OGG directly; other formats (m4a, mp3, mp4) through macOS's afconvert or
    ffmpeg."""
    try:
        audio, sr = sf.read(str(path), dtype="float32", always_2d=True)
    except RuntimeError:
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "audio.wav"
            if shutil.which("afconvert"):
                cmd = ["afconvert", "-f", "WAVE", "-d", f"LEI16@{SR}", "-c", "1", str(path), str(wav)]
            elif shutil.which("ffmpeg"):
                cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(path), "-ar", str(SR), "-ac", "1", str(wav)]
            else:
                sys.exit("Can't read this format: convert it to WAV, or install ffmpeg (brew install ffmpeg).")
            subprocess.run(cmd, check=True)
            audio, sr = sf.read(str(wav), dtype="float32", always_2d=True)
    audio = audio.mean(axis=1)
    if sr != SR:
        import torch
        import torchaudio

        audio = torchaudio.functional.resample(torch.from_numpy(audio), sr, SR).numpy()
    return audio


def speech_pieces(audio: np.ndarray, frame=0.03, min_silence=0.4) -> list:
    """(start, end) seconds of speech: frames clearly louder than the quietest ones (a simple stand-in for the
    pipeline's Silero VAD, so silence isn't judged)."""
    n = int(frame * SR)
    frames = audio[:len(audio) // n * n].reshape(-1, n)
    db = 10 * np.log10((frames ** 2).mean(axis=1) + 1e-10)
    speech = db > max(np.percentile(db, 10) + 12, db.max() - 50)
    pieces, start, silent = [], None, 0
    for i, s in enumerate(speech):
        t = i * frame
        if s:
            start, silent = (t if start is None else start), 0
        elif start is not None:
            silent += 1
            if silent * frame >= min_silence:
                pieces.append((start, t - (silent - 1) * frame))
                start, silent = None, 0
    if start is not None:
        pieces.append((start, len(speech) * frame))
    return pieces


def clock(t: float) -> str:
    return f"{int(t) // 3600:02d}:{int(t) % 3600 // 60:02d}:{t % 60:05.2f}"


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("audio")
    p.add_argument("--main", default="ro", choices=LANGS, help="the meeting's main language (default: ro)")
    p.add_argument("--json", help="also save the runs to this file")
    args = p.parse_args()

    t0 = time.time()
    audio = load(Path(args.audio))
    length = len(audio) / SR
    t1 = time.time()
    lid = LanguageID()
    t2 = time.time()
    pieces = speech_pieces(audio)
    runs = lid.heard(audio, pieces, SR, main=args.main)
    t3 = time.time()

    print(f"\n{Path(args.audio).name}: {length / 60:.1f} min of audio, {sum(e - s for s, e in pieces) / 60:.1f} min "
          f"of speech in {len(pieces)} pieces\n")
    other = [(a, b, lang) for a, b, lang in runs if lang != args.main]
    print(f"Heard in another language than '{args.main}':" if other else f"Everything heard as '{args.main}'.")
    for a, b, lang in other:
        print(f"  [{clock(a)} - {clock(b)}]  {lang}  ({b - a:.1f} s)")
    total = seconds(runs)
    print("\nSeconds per language: " + ", ".join(f"{lang} {s:.0f}" for lang, s in total.items()))
    print(f"\nTime: reading audio {t1 - t0:.1f} s, loading the model {t2 - t1:.1f} s, language ID {t3 - t2:.1f} s "
          f"= {(t3 - t2) / length:.3f} x real time ({platform.machine()}, {platform.platform()})")
    if args.json:
        Path(args.json).write_text(json.dumps({
            "file": Path(args.audio).name, "audio_seconds": round(length, 2), "id_seconds": round(t3 - t2, 2),
            "machine": platform.platform(), "runs": [{"start": round(a, 2), "end": round(b, 2), "lang": lang}
                                                     for a, b, lang in runs]}, indent=1), encoding="utf-8")
        print(f"Saved {args.json}")


if __name__ == "__main__":
    main()
