"""Pipelines: audio file -> transcript or speaker dialog (the steps from audio/, asr/, diarization/, dialog/)."""
from .per_turn import transcribe_dialog
from .plain import transcribe_plain
from .whole_file import transcribe_dialog_file

__all__ = ["transcribe_dialog", "transcribe_dialog_file", "transcribe_plain"]
