"""Minutes of Meeting from an existing dialog transcript:

  python -m mom.minutes data/Medpark_dialog.txt --type medical --out out/Medpark
"""
import argparse
import json
import sys
import time
from pathlib import Path

from . import DEFAULT_MODEL, MEETING_TYPES, MinutesBuilder, parse_dialog, to_markdown
from .participants import read_legend


def main():
    p = argparse.ArgumentParser(prog="python -m mom.minutes",
                                description="Minutes of Meeting from a dialog transcript (local LLM)")
    p.add_argument("dialog", type=Path)
    p.add_argument("--type", choices=MEETING_TYPES, default="medical")
    p.add_argument("--model", default=DEFAULT_MODEL, help="model for extracting facts from each chunk")
    p.add_argument("--final-model", help="model for title/summary/suggestions (default: --model)")
    p.add_argument("--samples", type=int, default=1,
                   help="extractions per chunk merged together (1-3); more = better recall, slower unless "
                        "OLLAMA_NUM_PARALLEL >= samples")
    p.add_argument("--language", default="English")
    p.add_argument("--chunk-words", type=int, default=420, help="words per chunk (hard cut)")
    p.add_argument("--ctx", type=int, default=4096, help="model context in tokens")
    p.add_argument("--no-cue-cuts", action="store_true",
                   help="do not cut chunks where the speakers move to another bed (the model separates patients)")
    p.add_argument("--threads", type=int, default=10)
    p.add_argument("--out", type=str, help="output path prefix (writes .json, .md, .meta.json)")
    args = p.parse_args()

    t0 = time.perf_counter()
    builder = MinutesBuilder(args.type, args.model, args.language, args.threads, final_model=args.final_model,
                             samples=args.samples, chunk_words=args.chunk_words, num_ctx=args.ctx,
                             cut_at_cues=not args.no_cue_cuts)
    for line in parse_dialog(args.dialog):
        builder.add_line(line)
    minutes = builder.finalize()
    # a dialog .txt written with --roles / --minutes starts with a legend
    minutes["participants"] = read_legend(args.dialog.read_text(encoding="utf-8"))
    total = time.perf_counter() - t0
    # With live transcription, everything except the last chunk and finalize runs during the meeting.
    maps = [c for c in builder.calls if c["step"] == "map"]
    after_end = (maps[-1]["wall"] if maps else 0) + builder.calls[-1]["wall"]
    stats = {"model": args.model, "final_model": builder.final_model, "total_seconds": round(total, 1),
             "seconds_after_transcript_end": round(after_end, 1), "map_calls": len(maps),
             "calls": builder.calls}
    md = to_markdown(minutes, args.type)
    print(md)
    print(json.dumps({k: v for k, v in stats.items() if k != "calls"}), file=sys.stderr)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out + ".json").write_text(json.dumps(minutes, ensure_ascii=False, indent=2), encoding="utf-8")
        Path(args.out + ".md").write_text(md, encoding="utf-8")
        Path(args.out + ".meta.json").write_text(json.dumps(
            {**stats, "dialog": str(args.dialog), "meeting_type": args.type}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
