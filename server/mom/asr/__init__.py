"""Speech-to-text: whisper-cli over a whole file, or clip engines (whisper-server, Gemma via Ollama)."""
from .engines import ENGINES, make_engine
from .language import choose_language, main_language
from .types import Segment, Transcript, Word
from .whisper_cli import transcribe, transcribe_wav

__all__ = ["ENGINES", "Segment", "Transcript", "Word", "choose_language", "main_language", "make_engine",
           "transcribe", "transcribe_wav"]
