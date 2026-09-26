"""Whisper on Apple's MLX (the Apple GPU), in this process: the same Whisper models as whisper.cpp, faster on
Apple Silicon. Most of Whisper's cost is encoding a clip; whisper-server encodes it again for every request, here
it is encoded once for everything asked about it (the language guess, the Romanian and Russian transcripts,
retries, word timings). Same interface as whisper_server.WhisperServer.

Beam search like whisper.cpp (mlx-whisper itself only decodes greedily: _BeamSearch adds it), which keeps
noisy speech from looping. Apple Silicon only (pip install mlx-whisper); the models are downloaded once by
scripts/download_models.py.
"""
import dataclasses
import io
from pathlib import Path

BEAM_SIZE = 5
TEMPERATURES = (0.0, 0.2, 0.4)  # retries when a transcript loops; hotter sampling writes junk in other scripts

# whisper.cpp model file -> the same model for MLX, on Hugging Face
MLX_MODELS = {
    "ggml-large-v3.bin": "mlx-community/whisper-large-v3-mlx",
    "ggml-large-v3-q8_0.bin": "mlx-community/whisper-large-v3-mlx",
    "ggml-large-v3-turbo.bin": "mlx-community/whisper-large-v3-turbo",
    "ggml-large-v3-turbo-q8_0.bin": "mlx-community/whisper-large-v3-turbo",
}


def available() -> bool:
    try:
        import mlx_whisper  # noqa: F401
        return True
    except ImportError:
        return False


def mlx_model(model) -> str:
    """The MLX version of a model: a folder, a Hugging Face repo, or the MLX twin of a whisper.cpp file."""
    if Path(model).is_dir() or "/" in str(model) and not Path(model).suffix:
        return str(model)
    if Path(model).name not in MLX_MODELS:
        raise RuntimeError(f"No MLX version of {Path(model).name} (known: {', '.join(MLX_MODELS)})")
    return MLX_MODELS[Path(model).name]


class _EncodeOnce:
    """Stands in for the model's encoder and keeps the last clip's features: decoding the same clip again
    (another language, a retry at a higher temperature, word timings) doesn't encode it again."""

    def __init__(self, encoder):
        self.encoder, self.key, self.features = encoder, None, None

    def __call__(self, mel):
        import numpy as np

        key = (mel.shape, hash(np.array(mel).tobytes()))
        if key != self.key:
            self.key, self.features = key, self.encoder(mel)
        return self.features


class _BeamSearch:
    """OpenAI Whisper's beam search decoder (whisper/decoding.py) for mlx-whisper: at every step keep the
    BEAM_SIZE most likely sequences, until BEAM_SIZE of them have ended."""

    def __init__(self, beam_size: int, eot: int, inference, patience: float = None):
        self.beam_size, self.eot, self.inference = beam_size, eot, inference
        self.max_candidates = round(beam_size * (patience or 1.0))
        self.finished = None

    def reset(self):
        self.finished = None

    def update(self, tokens, logits, sum_logprobs):
        import mlx.core as mx
        import numpy as np

        n_audio = tokens.shape[0] // self.beam_size
        if self.finished is None:
            self.finished = [{} for _ in range(n_audio)]
        # The beam_size + 1 best next tokens of every beam, picked on the GPU: only those are copied to Python.
        logprobs = logits - mx.logsumexp(logits, axis=-1, keepdims=True)
        best = mx.argpartition(-logprobs, kth=self.beam_size, axis=-1)[:, :self.beam_size + 1]
        best_logprobs = mx.take_along_axis(logprobs, best, axis=-1)
        best, best_logprobs = np.array(best).tolist(), np.array(best_logprobs).tolist()
        prefixes, sums = np.array(tokens).tolist(), np.array(sum_logprobs).tolist()
        next_tokens, sources, next_sums = [], [], []
        for i in range(n_audio):
            scores, origin = {}, {}
            for idx in range(i * self.beam_size, (i + 1) * self.beam_size):
                for token, logprob in zip(best[idx], best_logprobs[idx]):
                    sequence = tuple(prefixes[idx] + [token])
                    scores[sequence], origin[sequence] = sums[idx] + logprob, idx
            kept = 0
            for sequence in sorted(scores, key=scores.get, reverse=True):
                if sequence[-1] == self.eot:
                    if len(self.finished[i]) < self.max_candidates:
                        self.finished[i][sequence] = scores[sequence]
                else:
                    next_tokens.append(sequence)
                    sources.append(origin[sequence])
                    next_sums.append(scores[sequence])
                    kept += 1
                    if kept == self.beam_size:
                        break
        self.inference.rearrange_kv_cache(sources)
        completed = all(len(f) >= self.max_candidates for f in self.finished)
        return mx.array(next_tokens), mx.array(completed), mx.array(next_sums, dtype=mx.float32)

    def finalize(self, tokens, sum_logprobs):
        """All finished sequences (topped up with the best unfinished ones), padded with EOT."""
        import mlx.core as mx
        import numpy as np

        tokens, sums = np.array(tokens), np.array(sum_logprobs)
        for i, finished in enumerate(self.finished):
            for j in np.argsort(sums[i])[::-1]:
                if len(finished) >= self.beam_size:
                    break
                finished[tuple(tokens[i, j].tolist()) + (self.eot,)] = float(sums[i, j])
        width = max(len(s) for f in self.finished for s in f)
        count = max(len(f) for f in self.finished)
        out = np.full((len(self.finished), count, width), self.eot, dtype=np.int32)
        scores = np.full((len(self.finished), count), -np.inf, dtype=np.float32)
        for i, finished in enumerate(self.finished):
            for j, (sequence, score) in enumerate(finished.items()):
                out[i, j, :len(sequence)], scores[i, j] = sequence, score
        return mx.array(out), mx.array(scores)


def _add_beam_search():
    """Teach mlx-whisper's DecodingTask to use _BeamSearch when a beam size is given (once)."""
    import mlx.core as mx
    from mlx_whisper import decoding

    if getattr(decoding.DecodingTask, "_beam_search", False):
        return
    greedy_init = decoding.DecodingTask.__init__

    def init(self, model, options):
        greedy_init(self, model, dataclasses.replace(options, beam_size=None))
        if options.beam_size:
            self.options, self.n_group = options, options.beam_size
            self.decoder = _BeamSearch(options.beam_size, self.tokenizer.eot, self.inference, options.patience)

    def rearrange_kv_cache(self, source_indices):
        """Reorder the beams' self-attention cache; the cross-attention to the audio is the same for all."""
        if source_indices != list(range(len(source_indices))):
            idx = mx.array(source_indices)
            self.kv_cache = [((kv[0][idx], kv[1][idx]), cross) for kv, cross in self.kv_cache]

    decoding.DecodingTask.__init__ = init
    decoding.Inference.rearrange_kv_cache = rearrange_kv_cache
    decoding.DecodingTask._beam_search = True


class MlxWhisper:
    """Context manager with WhisperServer's methods, running the model with MLX.

    prompts: {language code: text} that primes Whisper when it transcribes in that language, e.g. a sentence
    in the meeting's style; Whisper copies its style (spelling, digits) and leans towards its words."""

    def __init__(self, model, language: str = "auto", translate: bool = False, prompts: dict = None):
        self.repo = mlx_model(model)
        self.task = "translate" if translate else "transcribe"
        self.prompts = prompts or {}
        self.model = None

    def __enter__(self):
        import mlx.core as mx
        from huggingface_hub import snapshot_download
        from mlx_whisper.load_models import load_model

        _add_beam_search()
        path = self.repo if Path(self.repo).is_dir() else snapshot_download(self.repo, local_files_only=True)
        self.model = load_model(path, dtype=mx.float16)
        self.model.encoder = _EncodeOnce(self.model.encoder)
        return self

    def __exit__(self, *exc):
        self.model = None

    def transcribe_verbose(self, wav_bytes: bytes, language: str = None, quick: bool = False) -> dict:
        """The clip's segments with per-word times and probabilities, like whisper-server's verbose_json.
        quick: greedy and no retries, for a transcript only looked at for evidence."""
        import mlx.core as mx
        import mlx_whisper
        from mlx_whisper.transcribe import ModelHolder

        ModelHolder.model, ModelHolder.model_path = self.model, self.repo  # transcribe() uses this loaded model
        mx.random.seed(0)  # retries sample: the same audio gives the same transcript every run
        prompt = self.prompts.get(language) if self.task == "transcribe" else None  # a translation is English
        result = mlx_whisper.transcribe(_audio(wav_bytes), path_or_hf_repo=self.repo, language=language,
                                        task=self.task, word_timestamps=True, condition_on_previous_text=False,
                                        verbose=None, temperature=(0.0,) if quick else TEMPERATURES,
                                        beam_size=None if quick else BEAM_SIZE, best_of=BEAM_SIZE,
                                        initial_prompt=prompt)
        return {"segments": [{"start": s["start"], "end": s["end"], "words": [
            # a segment's first word starts a new word; later pieces without a space continue one ("3" ",6")
            {"word": " " + w["word"].lstrip() if i == 0 else w["word"], "start": w["start"], "end": w["end"],
             "probability": w["probability"]}
            for i, w in enumerate(s.get("words", []))]} for s in result["segments"]]}

    def detect_language(self, wav_bytes: bytes) -> dict:
        """Whisper's guess at the clip's language: {language code: probability}."""
        import mlx.core as mx
        from mlx_whisper.audio import N_FRAMES, N_SAMPLES, log_mel_spectrogram, pad_or_trim
        from mlx_whisper.decoding import detect_language

        # The same mel transcribe() makes, so the encoder's features are shared with the transcripts.
        mel = log_mel_spectrogram(_audio(wav_bytes), n_mels=self.model.dims.n_mels, padding=N_SAMPLES)
        clip = pad_or_trim(mel[:mel.shape[-2] - N_FRAMES], N_FRAMES, axis=-2).astype(mx.float16)
        return detect_language(self.model, clip)[1]


def _audio(wav_bytes: bytes):
    import soundfile as sf

    audio, _ = sf.read(io.BytesIO(wav_bytes), dtype="float32")
    return audio
