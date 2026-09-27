"""The `mom` pipeline as the job runner uses it. Tests pass a fake with the same three methods instead."""
import sys
from pathlib import Path
from typing import Callable, Protocol


class MinutesSession(Protocol):
    def feed(self, utterance) -> None: ...
    def finish(self) -> dict: ...
    def topic_count(self) -> int: ...


class Pipeline(Protocol):
    def transcribe(self, audio: Path, language: str, speakers, on_utterance: Callable,
                   progress: Callable, on_text: Callable = None) -> list: ...
    def minutes(self, meeting_type: str) -> MinutesSession: ...
    def roles(self, utterances: list, meeting_type: str) -> dict: ...
    def codes(self, minutes: dict, meeting_type: str) -> dict: ...


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

    def transcribe(self, audio, language, speakers, on_utterance, progress, on_text=None):
        # Imported here: pyannote / torch take seconds to load and the API should start at once.
        from mom.config import DEFAULT_WHISPER_MODEL
        from mom.pipeline import transcribe_dialog_file

        hints = {"num_speakers": speakers} if speakers else {}
        return transcribe_dialog_file(audio, model=DEFAULT_WHISPER_MODEL, language=language, live=False,
                                      on_utterance=on_utterance, speakers=hints, progress=progress,
                                      on_text=on_text)

    def minutes(self, meeting_type):
        return _LiveMinutes(meeting_type)

    def roles(self, utterances, meeting_type):
        from mom.minutes.participants import label_roles

        return label_roles(utterances, meeting_type)

    def codes(self, minutes, meeting_type):
        """Suggested ICD-10 codes + DRG family per patient ({topic name: suggestion}); medical meetings only."""
        if meeting_type != "medical":
            return {}
        from concurrent.futures import ThreadPoolExecutor

        from mom.medical.coding import patient_facts, suggest

        def one(topic):
            try:
                return topic["name"], suggest(patient_facts(topic, minutes))
            except Exception as e:  # noqa: BLE001 - codes are optional, the minutes are not
                print(f"codes for {topic['name']} skipped: {e}", file=sys.stderr)
                return topic["name"], None
        # Two at a time: Ollama decodes two requests together (OLLAMA_NUM_PARALLEL=2).
        with ThreadPoolExecutor(2) as pool:
            return {name: r for name, r in pool.map(one, minutes.get("topics", [])) if r and r["principal"]}
