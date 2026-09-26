"""Transcribe many short clips on several engines at once, results in order.

Short clips don't saturate the GPU, so WORKERS whisper-server processes run side by side (each holds a copy
of the model: ~3.5 GB RAM). Gemma runs as one engine: Ollama schedules its own requests.
"""
import queue
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack, contextmanager

from ..asr.engines import make_engine
from ..audio.clips import wav_bytes

WORKERS = 2


@contextmanager
def engine_pool(engine: str, language: str = "auto", translate: bool = False, workers: int = WORKERS):
    """Started engines of one kind (stopped on exit): `workers` for Whisper, one for Gemma."""
    count = 1 if engine.startswith("gemma") else workers
    engines = [make_engine(engine, language, translate) for _ in range(count)]
    with ExitStack() as stack:
        yield [stack.enter_context(e) for e in engines]


def transcribe_clips(servers: list, clips: list, sr: int, call=lambda server, wav: server.transcribe(wav)):
    """Yield call(engine, clip WAV) for each clip, in order, spreading the work over the given engines."""
    free = queue.Queue()
    for s in servers:
        free.put(s)

    def work(clip):
        server = free.get()  # whichever engine is idle
        try:
            return call(server, wav_bytes(clip, sr))
        finally:
            free.put(server)

    with ThreadPoolExecutor(max_workers=len(servers)) as pool:
        yield from pool.map(work, clips)
