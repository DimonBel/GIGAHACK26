"""Measure speaker detection without a ground truth: how much speech ends up in tiny "fragment" speakers.

  python bench/eval_speakers.py data/Medpark_audio.m4a data/Medpark_audio_60min.mp3 [--label base] [--samples out/speakers]
      [--speakers N | --min-speakers N --max-speakers N]

Real speakers of a meeting talk for minutes; a label with only a few seconds is almost always a piece of a real
speaker that was split off. So the numbers to watch are the speakers with >= 30 s and the share of speech in
labels with < 30 s. --samples writes a few clips per speaker, to check by ear that two labels are two people.
Turns are saved to bench/<audio>.<label>.turns.json.
"""
import argparse
import json
import pickle
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from mom import diarization as diarizer  # noqa: E402
from mom.audio import to_wav16k  # noqa: E402

MAJOR_SECONDS = 30


def wav_for(audio: Path) -> Path:
    """16 kHz WAV of the audio, cached next to this script (conversion of 60 min takes a while)."""
    wav = ROOT / "bench" / f"{audio.stem}.16k.wav"
    if not wav.exists() or wav.stat().st_mtime < audio.stat().st_mtime:
        to_wav16k(audio, wav)
    return wav


def report(turns: list, seconds: float) -> dict:
    talk = {}
    for t in turns:
        talk[t.speaker] = talk.get(t.speaker, 0.0) + t.end - t.start
    total = sum(talk.values()) or 1.0
    major = {s: v for s, v in talk.items() if v >= MAJOR_SECONDS}
    fragments = total - sum(major.values())
    top = sorted(talk.items(), key=lambda x: -x[1])[:6]
    return {"diarize_seconds": round(seconds, 1), "speakers": len(talk), "speakers_30s": len(major),
            "fragment_share": round(100 * fragments / total, 1),
            "top": [(s, round(v), f"{100 * v / total:.0f}%") for s, v in top]}


def export_samples(wav: Path, turns: list, out: Path, per_speaker=3, clip=6.0):
    import soundfile as sf

    audio, sr = sf.read(str(wav), dtype="int16")
    out.mkdir(parents=True, exist_ok=True)
    for speaker in {t.speaker for t in turns}:
        longest = sorted((t for t in turns if t.speaker == speaker), key=lambda t: t.start - t.end)[:per_speaker]
        for i, t in enumerate(sorted(longest, key=lambda t: t.start), 1):
            mid = (t.start + t.end) / 2
            a, b = max(t.start, mid - clip / 2), min(t.end, mid + clip / 2)
            name = f"{wav.stem.replace('.16k', '')}_{speaker.replace(' ', '_')}_{i}_{int(t.start)}s.wav"
            sf.write(str(out / name), audio[int(a * sr):int(b * sr)], sr)


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("audio", nargs="+", type=Path)
    p.add_argument("--label", default="base", help="name of this variant in the saved turns file")
    p.add_argument("--samples", type=Path, help="write a few clips per speaker to this folder")
    p.add_argument("--fresh", action="store_true", help="run pyannote again instead of using the cached result")
    p.add_argument("--speakers", type=int)
    p.add_argument("--min-speakers", type=int)
    p.add_argument("--max-speakers", type=int)
    args = p.parse_args()
    hints = {k: v for k, v in dict(num_speakers=args.speakers, min_speakers=args.min_speakers,
                                   max_speakers=args.max_speakers).items() if v}
    for audio in args.audio:
        wav = wav_for(audio)
        # pyannote's raw result is cached (340 s for 60 min), so merge settings can be tried in seconds.
        cache = ROOT / "bench" / f"{audio.stem}.{args.label}.raw.pkl"
        if cache.exists() and not args.fresh:
            raw, voices, seconds = pickle.loads(cache.read_bytes())
        else:
            t = time.perf_counter()
            raw, voices = diarizer.diarize_raw(wav, **hints)
            seconds = time.perf_counter() - t
            cache.write_bytes(pickle.dumps((raw, voices, seconds)))
        variants = {"raw": diarizer.renumber(raw)}
        if not args.speakers:
            variants["merged"] = diarizer.renumber(
                diarizer.merge_fragments(raw, voices, min_speakers=args.min_speakers or 1))
        for name, turns in variants.items():
            print(f"{audio.name} [{args.label}/{name}] {json.dumps(report(turns, seconds), ensure_ascii=False)}",
                  flush=True)
            saved = ROOT / "bench" / f"{audio.stem}.{args.label}-{name}.turns.json"
            saved.write_text(json.dumps([t.__dict__ for t in turns]), encoding="utf-8")
            if args.samples:
                export_samples(wav, turns, args.samples / f"{args.label}-{name}")


if __name__ == "__main__":
    main()
