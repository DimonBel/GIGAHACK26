"""Dialog output formats: txt, srt, json."""
import json
from dataclasses import asdict


def _ts(seconds: float, sep: str = ".") -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def to_text(dialog: list) -> str:
    return "\n".join(f"[{_ts(u.start)[:8]} - {_ts(u.end)[:8]}] {u.speaker}: {u.text}" for u in dialog)


def to_srt(dialog: list) -> str:
    return "\n".join(
        f"{i}\n{_ts(u.start, ',')} --> {_ts(u.end, ',')}\n{u.speaker}: {u.text}\n"
        for i, u in enumerate(dialog, 1)
    )


def to_json(dialog: list) -> str:
    return json.dumps([asdict(u) for u in dialog], ensure_ascii=False, indent=2)
