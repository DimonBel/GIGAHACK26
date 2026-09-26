"""Minutes built while the transcript is still being produced."""
import queue
import threading

from .builder import MinutesBuilder
from .transcript import clock, format_line


class LiveMinutes:
    """Runs a MinutesBuilder in a background thread, so transcription is never blocked by the LLM.

    Feed dialog utterances while Whisper is running; finish() waits for the remaining chunks and finalizes.
    """

    def __init__(self, builder: MinutesBuilder):
        self.builder, self.queue = builder, queue.Queue()
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def feed(self, utterance):
        line = format_line(clock(utterance.start), utterance.speaker, utterance.text)
        if line:
            self.queue.put(line)

    def _run(self):
        while (line := self.queue.get()) is not None:
            self.builder.add_line(line)

    def finish(self) -> dict:
        self.queue.put(None)
        self.thread.join()
        return self.builder.finalize()
