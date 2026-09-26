"""Minutes of Meeting from a speaker dialog, with a local LLM (see builder.py for how)."""
from .builder import DEFAULT_MODEL, MinutesBuilder
from .live import LiveMinutes
from .markdown import to_markdown
from .prompts import MEETING_TYPES
from .transcript import parse_dialog

__all__ = ["DEFAULT_MODEL", "MEETING_TYPES", "LiveMinutes", "MinutesBuilder", "parse_dialog", "to_markdown"]
