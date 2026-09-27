"""End to end: audio -> dialog -> minutes, feeding the minutes with speaker-labelled lines (old) or with Whisper's
text as soon as it is recognized (new). Reports total time, minutes wait after transcription, and facts.

  python bench/eval_live_minutes.py data/Medpark_audio.m4a --feed text utterance [--sequential] [--score]
"""
import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "bench"))

from mom.config import DEFAULT_WHISPER_MODEL  # noqa: E402
from mom.minutes import LiveMinutes, MinutesBuilder, to_markdown  # noqa: E402
from mom.pipeline import transcribe_dialog_file  # noqa: E402


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("audio", type=Path)
    p.add_argument("--lang", default="ro")
    p.add_argument("--feed", nargs="+", choices=["text", "utterance"], default=["text", "utterance"])
    p.add_argument("--sequential", action="store_true")
    p.add_argument("--score", action="store_true")
    args = p.parse_args()
    for feed in args.feed:
        t0 = time.perf_counter()
        minutes = LiveMinutes(MinutesBuilder("medical", verbose=False))
        timings = {}
        kw = {"on_text": minutes.feed} if feed == "text" else {"on_utterance": minutes.feed}
        transcribe_dialog_file(args.audio, model=DEFAULT_WHISPER_MODEL, language=args.lang, live=False,
                               parallel=not args.sequential, timings=timings, **kw)
        t_audio = time.perf_counter()
        result = minutes.finish()
        t_end = time.perf_counter()
        facts = ""
        if args.score:
            from eval_minutes import score
            hits, _, penalty, _ = score(to_markdown(result, "medical"))
            facts = f"facts {hits - penalty:2} | "
        print(f"feed={feed:9} {facts}audio stages {t_audio - t0:5.0f} s | minutes after them {t_end - t_audio:5.0f} s | "
              f"total {t_end - t0:5.0f} s  ({', '.join(f'{k} {v:.0f}s' for k, v in timings.items())})", flush=True)


if __name__ == "__main__":
    main()
