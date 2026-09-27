"""Time the dialog pipeline stage by stage and save its transcript, to compare settings back to back.

  python bench/eval_pipeline.py data/Medpark_audio.m4a --lang ro --clean norm --label norm [--sequential] [--model PATH]

Writes out/bench/<audio>.<label>.txt (dialog) and prints the stage timings. Transcript quality of a
Medpark run can then be scored through the minutes:
  python -m mom.minutes out/bench/Medpark_audio.norm.txt --out out/bench/Medpark_audio.norm.minutes
  python3 bench/eval_minutes.py out/bench/Medpark_audio.norm.minutes.md
"""
import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from mom import dialog as fmt  # noqa: E402
from mom.audio import CLEAN_FILTERS  # noqa: E402
from mom.config import DEFAULT_WHISPER_MODEL as DEFAULT_MODEL  # noqa: E402
from mom.pipeline import transcribe_dialog_file  # noqa: E402


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("audio", type=Path)
    p.add_argument("--lang", default="auto")
    p.add_argument("--clean", choices=CLEAN_FILTERS, default="none")
    p.add_argument("--sequential", action="store_true", help="speakers first, then Whisper (the old way)")
    p.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    p.add_argument("--label", required=True)
    p.add_argument("--prompt", help="Whisper vocabulary prompt (tested: hurts Turbo on Medpark, see README)")
    args = p.parse_args()
    timings = {}
    t = time.perf_counter()
    dialog = transcribe_dialog_file(args.audio, model=args.model, language=args.lang, live=False,
                                    audio_filters=CLEAN_FILTERS[args.clean], parallel=not args.sequential,
                                    timings=timings, prompt=args.prompt)
    timings["total"] = round(time.perf_counter() - t, 1)
    out = ROOT / "out" / "bench" / f"{args.audio.stem}.{args.label}.txt"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(fmt.to_text(dialog) + "\n", encoding="utf-8")
    speakers = {}
    for u in dialog:
        speakers[u.speaker] = speakers.get(u.speaker, 0) + u.end - u.start
    result = {"label": args.label, **timings, "lines": len(dialog), "words": sum(len(u.text.split()) for u in dialog),
              "n_speakers": len(speakers), "speakers_30s": sum(v >= 30 for v in speakers.values())}
    print(json.dumps(result))
    out.with_suffix(".timings.json").write_text(json.dumps(result), encoding="utf-8")


if __name__ == "__main__":
    main()
