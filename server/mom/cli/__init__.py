"""Command-line interface: `python -m mom transcribe | record | dialog ...`."""
import sys
from pathlib import Path

from .commands import run_dialog, run_record, run_transcribe
from .parser import build_parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        if args.cmd == "transcribe":
            run_transcribe(Path(args.file), args)
        elif args.cmd == "dialog":
            run_dialog(Path(args.file), args)
        else:
            run_record(args)
    except (RuntimeError, FileNotFoundError) as e:
        sys.exit(f"Error: {e}")
