"""Print results and save them next to --out (transcript, speaker roles, minutes, timing line)."""
import json
import sys
import time
from pathlib import Path

from ..audio.convert import duration
from ..minutes import to_markdown
from ..minutes.participants import legend


def save(path, text: str):
    Path(path).write_text(text + "\n", encoding="utf-8")
    print(f"\nSaved to {path}", file=sys.stderr)


def print_transcript(transcript, fmt: str, out: Path = None):
    if fmt == "srt":
        result = transcript.to_srt()
    elif fmt == "timestamps":
        result = "\n".join(f"[{s.start} --> {s.end}] {s.text}" for s in transcript.segments)
    else:
        result = transcript.text
    print(result)
    if out:
        save(out, result)


def _mmss(seconds: float) -> str:
    m, s = divmod(int(round(seconds)), 60)
    return f"{m}m {s:02d}s"


def report_time(t0: float, audio: Path, stages: dict = None):
    """Final line: total processing time, audio length and speed (and time per stage, if known)."""
    took, length = time.time() - t0, duration(audio)
    speed = f", {length / took:.1f}x faster than real time" if length and took else ""
    detail = " (" + ", ".join(f"{k} {_mmss(v)}" for k, v in stages.items()) + ")" if stages else ""
    print(f"\n=== Done. Total time: {_mmss(took)} for {_mmss(length)} of audio{speed}{detail} ===")


def write_roles(roles: dict, result: str, args):
    """Print the speaker legend; with --out, put it on top of the .txt and save <name>.speakers.json."""
    if not roles:
        return
    print("\n--- Speakers (roles guessed by the local LLM) ---\n" + legend(roles))
    if not args.out:
        return
    if args.format == "txt":
        Path(args.out).write_text(legend(roles) + "\n\n" + result + "\n", encoding="utf-8")
    base = str(Path(args.out).with_suffix(""))
    Path(base + ".speakers.json").write_text(json.dumps(roles, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved speaker roles to {base}.speakers.json", file=sys.stderr)


def write_minutes(minutes, args, t0: float, roles=None):
    t_end = time.time()
    print("\nFinishing the minutes...", file=sys.stderr, flush=True)
    result = minutes.finish()
    if roles:
        result["participants"] = roles.result()
    md = to_markdown(result, args.minutes)
    print(f"[minutes ready {time.time() - t_end:.1f}s after transcription | total {time.time() - t0:.1f}s]",
          file=sys.stderr)
    if not args.out:
        print("\n" + md)
        return
    base = str(Path(args.out).with_suffix(""))
    Path(base + ".minutes.md").write_text(md, encoding="utf-8")
    Path(base + ".minutes.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved minutes to {base}.minutes.md / .json", file=sys.stderr)
