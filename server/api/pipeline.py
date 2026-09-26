"""The `mom` pipeline as the job runner uses it. Tests pass a fake with the same three methods instead."""
from pathlib import Path
from typing import Callable, Protocol


class MinutesSession(Protocol):
    def feed(self, utterance) -> None: ...
    def finish(self) -> dict: ...
    def topic_count(self) -> int: ...


class Pipeline(Protocol):
    def transcribe(self, audio: Path, language: str, speakers, on_utterance: Callable,
                   progress: Callable) -> list: ...
    def minutes(self, meeting_type: str) -> MinutesSession: ...
    def roles(self, utterances: list, meeting_type: str) -> dict: ...


class _LiveMinutes:
    def __init__(self, meeting_type: str):
        from mom.minutes import LiveMinutes, MinutesBuilder

        self.builder = MinutesBuilder(meeting_type, verbose=False)
        self.live = LiveMinutes(self.builder)

    def feed(self, utterance):
        self.live.feed(utterance)

    def finish(self) -> dict:
        return self.live.finish()

    def topic_count(self) -> int:
        return len(self.builder.topics)


class MomPipeline:
    """Whole-file Whisper + pyannote in parallel, minutes built live (as `python -m mom dialog --minutes`)."""

    def transcribe(self, audio, language, speakers, on_utterance, progress):
        # Imported here: pyannote / torch take seconds to load and the API should start at once.
        from mom.config import DEFAULT_WHISPER_MODEL
        from mom.pipeline import transcribe_dialog_file

        hints = {"num_speakers": speakers} if speakers else {}
        return transcribe_dialog_file(audio, model=DEFAULT_WHISPER_MODEL, language=language, live=False,
                                      on_utterance=on_utterance, speakers=hints, progress=progress)

    def minutes(self, meeting_type):
        return _LiveMinutes(meeting_type)

    def roles(self, utterances, meeting_type):
        from mom.minutes.participants import label_roles

        return label_roles(utterances, meeting_type)
