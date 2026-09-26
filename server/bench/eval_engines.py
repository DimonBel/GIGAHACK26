"""Compare speech-to-text engines on identical speaker turns: speed + lost numbers/medical terms.

    .venv/bin/python bench/eval_engines.py recording.wav --lang ro [--engines whisper whisper-turbo gemma]

Speaker detection runs once and is cached in bench/<name>.turns.json, so every engine gets the same clips.
Results go to bench/<name>.<engine>.txt; the first engine is the reference for the "lost tokens" check.
"""
import argparse
import json
import re
import sys
import time
from contextlib import ExitStack
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mom.asr.engines import ENGINES, make_engine  # noqa: E402
from mom.diarization import Turn, diarize  # noqa: E402
from mom.dialog import Utterance, clean_text, speaker_blocks, to_text  # noqa: E402
from mom.pipeline.parallel import transcribe_clips  # noqa: E402
from mom.pipeline.per_turn import PAD  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "bench"


def critical_tokens(text: str) -> set:
    """Numbers and long words (drug names, medical terms) - the things that must not get lost."""
    words = re.findall(r"\d+(?:[.,]\d+)?|\w{7,}", text.lower())
    return set(words)


def run_engine(variant, blocks, audio, sr, language):
    """variant: an engine name, optionally with ":N" = number of parallel workers (default 1)."""
    name, _, n = variant.partition(":")
    clips = [audio[max(0, int((b.start - PAD) * sr)):int((b.end + PAD) * sr)] for b in blocks]
    texts, t0 = [""] * len(blocks), time.time()
    with ExitStack() as stack:
        servers = [stack.enter_context(make_engine(name, language)) for _ in range(int(n or 1))]
        t_ready = time.time()
        for i, raw in enumerate(transcribe_clips(servers, clips, sr)):
            texts[i] = clean_text(raw)
            print(f"\r  {variant}: {i + 1}/{len(blocks)}", end="", file=sys.stderr, flush=True)
    total = time.time() - t0
    print(file=sys.stderr)
    lines = [Utterance(b.start, b.end, b.speaker, t) for b, t in zip(blocks, texts)]
    return lines, total, time.time() - t_ready


def main():
    p = argparse.ArgumentParser()
    p.add_argument("wav", help="16 kHz mono WAV")
    p.add_argument("--lang", default="ro")
    p.add_argument("--engines", nargs="+", default=["whisper", "whisper:2"],
                   help=f"engines {ENGINES}, add ':N' for N parallel workers (default: %(default)s)")
    args = p.parse_args()

    import soundfile as sf

    wav = Path(args.wav)
    OUT.mkdir(exist_ok=True)
    cache = OUT / f"{wav.stem}.turns.json"
    if cache.exists():
        turns = [Turn(**t) for t in json.loads(cache.read_text())]
        print(f"speaker turns: cached ({cache.name})")
    else:
        t = time.time()
        turns = diarize(wav)
        print(f"speaker detection: {time.time() - t:.1f}s")
        cache.write_text(json.dumps([t.__dict__ for t in turns]))
    blocks = speaker_blocks(turns)
    audio, sr = sf.read(str(wav), dtype="int16")
    duration = len(audio) / sr

    results = {}
    for name in args.engines:
        lines, total, asr = run_engine(name, blocks, audio, sr, args.lang)
        results[name] = (lines, total, asr)
        (OUT / f"{wav.stem}.{name.replace(':', '-')}.txt").write_text(to_text([u for u in lines if u.text]) + "\n")

    ref_name = args.engines[0]
    ref = results[ref_name][0]
    print(f"\n{'engine':15} {'total':>8} {'per clip':>9} {'x realtime':>11} {'lost vs ' + ref_name:>18}")
    for name, (lines, total, asr) in results.items():
        lost = sum(len(critical_tokens(r.text) - critical_tokens(c.text)) for r, c in zip(ref, lines))
        ref_total = sum(len(critical_tokens(r.text)) for r in ref)
        print(f"{name:15} {total:7.1f}s {asr / len(blocks):8.2f}s {duration / total:10.1f}x "
              f"{lost:>8}/{ref_total} tokens")

    print("\nside by side (first 25 turns):")
    for i, b in enumerate(blocks[:25]):
        print(f"\n[{b.start:6.1f}-{b.end:6.1f}] {b.speaker}")
        for name, (lines, _, _) in results.items():
            print(f"  {name:14} {lines[i].text}")


if __name__ == "__main__":
    main()
