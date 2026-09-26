"""Word error rate and speed of a Whisper setup on Moldovan speech with human transcripts: ROMPAR's test split
(Romanian and Moldovan parliament speakers, huggingface.co/datasets/avramandrei/rompar), Moldovan speakers only.
Utterances are joined into clips of up to 28 s like the pipeline's chunks and transcribed in Romanian, so
models, engines and settings can be compared on the same audio.

    .venv/bin/pip install pyarrow
    mkdir -p data/rompar && curl -L -o data/rompar/test.parquet \\
        https://huggingface.co/datasets/avramandrei/rompar/resolve/main/data/test-00000-of-00001.parquet
    .venv/bin/python scripts/benchmark.py --minutes 15                                   # whisper.cpp, Large V3
    .venv/bin/python scripts/benchmark.py --engine mlx --model models/ggml-large-v3-turbo-q8_0.bin --beam 1

References write numbers in digits, like Whisper; a model that spells them out scores worse than it is.
"""
import argparse
import importlib.util
import io
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stt.audio import wav_bytes  # noqa: E402
from stt.asr.decode import parse_verbose  # noqa: E402
from stt.config import DEFAULT_MODEL, offline  # noqa: E402

spec = importlib.util.spec_from_file_location("evaluate", ROOT / "scripts/evaluate.py")
evaluate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluate)

SR, GAP, MAX_CLIP = 16000, 0.3, 28.0


def clips(parquet: Path, dialect: str, minutes: float) -> list:
    """[(audio, reference text)]: consecutive utterances joined with GAP s of silence, at most MAX_CLIP s each."""
    import pyarrow.parquet as pq

    data = pq.read_table(parquet).to_pydict()
    out, current, total = [], [], 0.0
    for audio, text, who in zip(data["audio"], data["transcript"], data["dialect"]):
        if not who.startswith(dialect):
            continue
        speech, _ = sf.read(io.BytesIO(audio["bytes"]), dtype="float32")
        if current and sum(len(a) for a, _ in current) / SR + GAP * len(current) + len(speech) / SR > MAX_CLIP:
            out.append(current)
            current = []
        current.append((speech, text))
        total += len(speech) / SR
        if minutes and total >= minutes * 60:
            break
    out.append(current)
    gap = np.zeros(int(GAP * SR), dtype="float32")
    return [(np.concatenate([x for a, _ in c for x in (a, gap)][:-1]), " ".join(t for _, t in c)) for c in out if c]


def main():
    offline()
    p = argparse.ArgumentParser()
    p.add_argument("--engine", choices=["whisper.cpp", "mlx"], default="whisper.cpp")
    p.add_argument("--model", default=str(DEFAULT_MODEL))
    p.add_argument("--beam", type=int, default=5, help="mlx only (whisper.cpp always uses 5): 1 = greedy")
    p.add_argument("--prompt", help="mlx only: Romanian text to prime Whisper with (see mlx_backend.MlxWhisper)")
    p.add_argument("--minutes", type=float, default=15, help="minutes of speech to use (0 = all ~49)")
    p.add_argument("--dialect", default="moldavian", help="moldavian, romanian, or '' for both")
    p.add_argument("--data", default=str(ROOT / "data/rompar/test.parquet"))
    p.add_argument("--show", type=int, default=8, help="how many of the worst stretches to print")
    p.add_argument("--out", help="save the transcripts (one clip per line)")
    args = p.parse_args()

    if args.engine == "mlx":
        from stt.asr import mlx as mlx_backend
        mlx_backend.BEAM_SIZE = args.beam if args.beam > 1 else None
        server = mlx_backend.MlxWhisper(args.model, prompts={"ro": args.prompt} if args.prompt else None)
    elif args.prompt:
        p.error("--prompt needs --engine mlx")
    else:
        from stt.asr.whisper_cpp import WhisperServer
        server = WhisperServer(Path(args.model))

    test = clips(Path(args.data), args.dialect, args.minutes)
    speech = sum(len(a) for a, _ in test) / SR
    print(f"{len(test)} clips, {speech / 60:.1f} min of speech", file=sys.stderr, flush=True)
    hyps = []
    with server:
        server.transcribe_verbose(wav_bytes(test[0][0], SR), "ro")  # warm-up
        start = time.time()
        for i, (audio, _) in enumerate(test):
            result = server.transcribe_verbose(wav_bytes(audio, SR), "ro")
            hyps.append(" ".join(w.text for _, _, words in parse_verbose(result, 0.0) for w in words))
            print(f"\r{i + 1}/{len(test)}", end="", file=sys.stderr, flush=True)
        seconds = time.time() - start
    print(file=sys.stderr)
    if args.out:
        Path(args.out).write_text("\n".join(hyps) + "\n", encoding="utf-8")

    for label, diacritics in (("WER", True), ("WER without diacritics", False)):
        errors = words = 0
        for (_, ref), hyp in zip(test, hyps):
            r = evaluate.words(ref, diacritics)
            errors += evaluate.word_errors(r, evaluate.words(hyp, diacritics))
            words += len(r)
        print(f"{label:22} {errors / max(words, 1):6.1%}  ({errors} errors / {words} reference words)")
    beam = 5 if args.engine == "whisper.cpp" else args.beam
    print(f"{'Speed':22} {speech / seconds:5.1f}x realtime ({seconds:.0f} s; {args.engine}, "
          f"{Path(args.model).name}, beam {beam})")
    worst = [op for (_, ref), hyp in zip(test, hyps)
             for op in evaluate.worst_stretches(evaluate.words(ref), evaluate.words(hyp), args.show)]
    worst.sort(key=lambda op: max(len(op[0].split()), len(op[1].split())), reverse=True)
    print("\nWorst stretches (reference -> transcript):")
    for said, written in worst[:args.show]:
        print(f"  - {said or '(nothing)'}\n    {written or '(nothing)'}")


if __name__ == "__main__":
    main()
