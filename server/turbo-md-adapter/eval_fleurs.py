"""WER of stock whisper-large-v3-turbo vs stock + LoRA adapter on FLEURS Romanian (speakers not in ROMPAR).

Runs on the CPU so it can run next to a GPU training job:
  nice -n 19 python eval_fleurs.py --adapter runs/turbo-md/best_epoch1 --n 100 --threads 16
"""
import argparse
import io
import json
import sys
import time

import numpy as np
import soundfile as sf
import torch

sys.path.insert(0, ".")
from finetune_whisper import BASE, SR, norm_for_wer  # noqa: E402

URL = "hf://datasets/google/fleurs@refs/convert/parquet/ro_ro/test/0000.parquet"


def load_fleurs(n, seed=0):
    from datasets import Audio, load_dataset

    ds = load_dataset("parquet", data_files={"test": URL}, split="test").cast_column("audio", Audio(decode=False))
    idx = sorted(np.random.default_rng(seed).choice(len(ds), min(n, len(ds)), replace=False))
    out = []
    for i in idx:
        ex = ds[int(i)]
        x, sr = sf.read(io.BytesIO(ex["audio"]["bytes"]), dtype="float32")
        if x.ndim > 1:
            x = x.mean(axis=1)
        if sr != SR:
            import librosa
            x = librosa.resample(x, orig_sr=sr, target_sr=SR)
        out.append((x, ex["raw_transcription"]))
    return out


@torch.no_grad()
def transcribe(model, processor, clips, batch=4):
    hyps = []
    for i in range(0, len(clips), batch):
        feats = processor.feature_extractor([c[0] for c in clips[i:i + batch]], sampling_rate=SR,
                                            return_tensors="pt").input_features
        out = model.generate(input_features=feats, language="ro", task="transcribe", max_new_tokens=200)
        hyps += processor.batch_decode(out, skip_special_tokens=True)
    return hyps


def main():
    import jiwer
    from peft import PeftModel
    from transformers import WhisperForConditionalGeneration, WhisperProcessor

    p = argparse.ArgumentParser()
    p.add_argument("--adapter", required=True)
    p.add_argument("--n", type=int, default=100)
    p.add_argument("--threads", type=int, default=16)
    p.add_argument("--out", default="fleurs_eval.json")
    args = p.parse_args()
    torch.set_num_threads(args.threads)

    clips = load_fleurs(args.n)
    processor = WhisperProcessor.from_pretrained(BASE)
    refs = [norm_for_wer(c[1]) for c in clips]
    results = {"utterances": len(clips), "audio_seconds": round(sum(len(c[0]) for c in clips) / SR)}

    model = WhisperForConditionalGeneration.from_pretrained(BASE, dtype=torch.float32)
    model.generation_config.forced_decoder_ids = None
    model.eval()
    for name in ("stock", "finetuned"):
        if name == "finetuned":
            model = PeftModel.from_pretrained(model, args.adapter)
            model.eval()
        t = time.time()
        hyps = transcribe(model, processor, clips)
        results[name] = {"wer": round(100 * jiwer.wer(refs, [norm_for_wer(h) for h in hyps]), 2),
                         "seconds": round(time.time() - t),
                         "examples": [{"ref": clips[k][1], "hyp": hyps[k]} for k in range(4)]}
        print(f"{name}: WER {results[name]['wer']}% ({results[name]['seconds']} s)", flush=True)
    json.dump(results, open(args.out, "w", encoding="utf-8"), indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
