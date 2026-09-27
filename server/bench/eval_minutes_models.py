"""Minutes models and chunking strategies side by side, on one dialog transcript.

  python bench/eval_minutes_models.py out/bench/Medpark_audio.cmp-turbo-md-q8.txt --runs 2 \\
      --models gemma4:e4b qwen3:8b --strategies cues-420 cues-1200 whole [--score]

Prints per run: facts (with --score, the 44-fact Medpark check), LLM calls, total seconds and seconds after the
end of the transcript (the part the user waits for when minutes are built live), patients found. Writes
out/bench/compare/<transcript>.<model>.<strategy>.<run>.md and a results JSON next to them.
"""
import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "bench"))

from mom.minutes import MinutesBuilder, parse_dialog, to_markdown  # noqa: E402

# name -> (chunk words, context tokens, cut where the speakers move to another bed)
STRATEGIES = {
    "cues-420": (420, 4096, True),      # current default
    "cues-1200": (1200, 8192, True),    # fewer, longer chunks; still one patient per chunk start
    "window-2000": (2000, 12288, False),  # plain 2000-word windows, the model separates patients
    "whole": (100000, 32768, False),    # the whole meeting in one call
    "cues-420-reid": (420, 4096, True),  # current + patients matched by content (MinutesBuilder reidentify)
    "cues-420-x2": (420, 4096, True),    # current + 2 samples per chunk merged (self-consistency)
}


def run(lines, model, strategy, meeting_type):
    words, ctx, cues = STRATEGIES[strategy]
    t = time.perf_counter()
    b = MinutesBuilder(meeting_type, model, verbose=False, chunk_words=words, num_ctx=ctx, cut_at_cues=cues,
                       reidentify=strategy.endswith("-reid"), samples=2 if strategy.endswith("-x2") else 1)
    for line in lines:
        b.add_line(line)
    minutes = b.finalize()
    total = time.perf_counter() - t
    maps = [c for c in b.calls if c["step"] == "map"]
    after_end = (maps[-1]["wall"] if maps else 0) + b.calls[-1]["wall"]
    return minutes, {"seconds": round(total, 1), "after_end": round(after_end, 1), "calls": len(b.calls),
                     "prompt_tokens": sum(c.get("prompt_tokens", 0) for c in b.calls),
                     "output_tokens": sum(c.get("output_tokens", 0) for c in b.calls),
                     "topics": len(minutes["topics"])}


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("dialog", type=Path)
    p.add_argument("--models", nargs="+", default=["gemma4:e4b"])
    p.add_argument("--strategies", nargs="+", default=list(STRATEGIES), choices=list(STRATEGIES))
    p.add_argument("--runs", type=int, default=1)
    p.add_argument("--type", default="medical")
    p.add_argument("--score", action="store_true", help="score with bench/eval_minutes.py (Medpark 11.7 min only)")
    args = p.parse_args()
    lines = parse_dialog(args.dialog)
    out = ROOT / "out" / "bench" / "compare"
    out.mkdir(parents=True, exist_ok=True)
    results = []
    if args.score:
        from eval_minutes import score
    for model in args.models:
        for strategy in args.strategies:
            for r in range(1, args.runs + 1):
                try:
                    minutes, stats = run(lines, model, strategy, args.type)
                except Exception as e:  # noqa: BLE001 - one failing configuration must not stop the comparison
                    print(f"{model:12} {strategy:12} run {r}: FAILED {str(e).splitlines()[0][:120]}", flush=True)
                    results.append({"model": model, "strategy": strategy, "run": r, "error": str(e)[:300]})
                    continue
                md = to_markdown(minutes, args.type)
                name = f"{args.dialog.stem}.{model.replace(':', '-')}.{strategy}.{r}"
                (out / f"{name}.md").write_text(md, encoding="utf-8")
                if args.score:
                    hits, _, penalty, _ = score(md)
                    stats["facts"] = hits - penalty
                results.append({"model": model, "strategy": strategy, "run": r, **stats})
                facts = f"facts {stats['facts']:2}  " if args.score else ""
                print(f"{model:12} {strategy:12} run {r}: {facts}calls {stats['calls']:3}  {stats['seconds']:6.1f} s "
                      f"(after end {stats['after_end']:5.1f} s)  topics {stats['topics']:2}  "
                      f"tokens in {stats['prompt_tokens']:6} out {stats['output_tokens']:5}", flush=True)
    (out / f"{args.dialog.stem}.results.json").write_text(json.dumps(results, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
