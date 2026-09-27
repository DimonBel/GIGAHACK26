
import argparse
import io
import json
import math
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

BASE = "openai/whisper-large-v3-turbo"
SR = 16000
MAX_S, GAP_S = 28.0, 0.3


# ----------------------------------------------------------------------------------------------- data

def clean_transcript(text: str) -> str:
    """ROMPAR marks the unspoken part of a word cut at the clip edge with brackets: "popu[lației]" -> "popu"."""
    text = re.sub(r"\[[^\]]*\]", "", text)
    text = text.replace("ş", "ș").replace("Ş", "Ș").replace("ţ", "ț").replace("Ţ", "Ț")  # comma-below diacritics
    return re.sub(r"\s+", " ", text).strip()


def load_split(name: str):
    from datasets import Audio, load_dataset

    return load_dataset("avramandrei/rompar", split=name).cast_column("audio", Audio(decode=False))


def pack(ds, limit=None):
    """Utterances of the same record (same speaker) packed into <=28 s clips -> list of (audio, text, dialect).

    ROMPAR is not ordered by record, so utterances are grouped by record_id first (keeping dataset order within a
    record); otherwise almost every clip would be a single ~4 s utterance padded to Whisper's 30 s window.
    """
    clips, cur_audio, cur_text, cur_rec, cur_dialect, cur_len = [], [], [], None, None, 0.0
    gap = np.zeros(int(GAP_S * SR), dtype=np.float32)

    def flush():
        if cur_audio:
            clips.append((np.concatenate(cur_audio), " ".join(cur_text), cur_dialect))

    records = ds["record_id"]  # column only: no audio is read for the sort
    ds = ds.select(sorted(range(len(records)), key=lambda i: (records[i], i)))
    for ex in ds:
        x, sr = sf.read(io.BytesIO(ex["audio"]["bytes"]), dtype="float32")
        if x.ndim > 1:
            x = x.mean(axis=1)
        if sr != SR:
            import librosa
            x = librosa.resample(x, orig_sr=sr, target_sr=SR)
        text = clean_transcript(ex["transcript"])
        dur = len(x) / SR
        if not text or dur > MAX_S:
            continue
        if cur_rec != ex["record_id"] or cur_len + GAP_S + dur > MAX_S:
            flush()
            cur_audio, cur_text, cur_rec, cur_dialect, cur_len = [], [], ex["record_id"], ex["dialect"], 0.0
            if limit and len(clips) >= limit:
                return clips
        if cur_audio:
            cur_audio.append(gap)
            cur_len += GAP_S
        cur_audio.append(x)
        cur_text.append(text)
        cur_len += dur
    flush()
    return clips[:limit] if limit else clips


def cached_pack(split: str, cache: Path):
    """Packing decodes ~15 h of audio: done once, then loaded from an .npz cache."""
    path = cache / f"{split}.npz"
    if path.exists():
        z = np.load(path, allow_pickle=True)
        return list(zip(z["audio"], z["text"], z["dialect"]))
    t = time.time()
    clips = pack(load_split(split))
    cache.mkdir(parents=True, exist_ok=True)
    np.savez(path, audio=np.array([c[0] for c in clips], dtype=object), text=np.array([c[1] for c in clips]),
             dialect=np.array([c[2] for c in clips]))
    log(f"packed {split}: {len(clips)} clips, {sum(len(c[0]) for c in clips) / SR / 3600:.1f} h, "
        f"{time.time() - t:.0f}s")
    return clips


class ClipDataset(torch.utils.data.Dataset):
    def __init__(self, clips):
        self.clips = clips

    def __len__(self):
        return len(self.clips)

    def __getitem__(self, i):
        audio, text, _ = self.clips[i]
        return {"audio": audio, "text": str(text)}


@dataclass
class Collator:
    processor: object

    def __call__(self, batch):
        feats = self.processor.feature_extractor([b["audio"] for b in batch], sampling_rate=SR,
                                                 return_tensors="pt").input_features
        labels = self.processor.tokenizer([b["text"] for b in batch], padding=True, return_tensors="pt")
        ids = labels.input_ids.masked_fill(labels.attention_mask.ne(1), -100)
        start = self.processor.tokenizer.convert_tokens_to_ids("<|startoftranscript|>")
        if (ids[:, 0] == start).all():  # the model adds the start token itself
            ids = ids[:, 1:]
        return {"input_features": feats, "labels": ids}


# ----------------------------------------------------------------------------------------------- evaluation

def norm_for_wer(text: str) -> str:
    text = clean_transcript(text).lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


@torch.no_grad()
def evaluate(model, processor, clips, batch=8, label=""):
    """WER overall and per dialect, greedy decoding in Romanian."""
    import jiwer

    model.eval()
    refs, hyps, dialects = [], [], []
    t = time.time()
    for i in range(0, len(clips), batch):
        part = clips[i:i + batch]
        feats = processor.feature_extractor([c[0] for c in part], sampling_rate=SR,
                                            return_tensors="pt").input_features
        feats = feats.to(model.device, dtype=next(model.parameters()).dtype)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            out = model.generate(input_features=feats, language="ro", task="transcribe", max_new_tokens=440)
        hyps += processor.batch_decode(out, skip_special_tokens=True)
        refs += [str(c[1]) for c in part]
        dialects += [str(c[2]) for c in part]
    result = {"clips": len(clips), "seconds": round(time.time() - t, 1)}
    for name in ("all", "moldavian", "romanian"):
        idx = [k for k, d in enumerate(dialects) if name == "all" or d == name]
        if idx:
            r = [norm_for_wer(refs[k]) or "-" for k in idx]
            h = [norm_for_wer(hyps[k]) for k in idx]
            result[f"wer_{name}"] = round(100 * jiwer.wer(r, h), 2)
    result["examples"] = [{"ref": refs[k], "hyp": hyps[k], "dialect": dialects[k]} for k in range(min(3, len(refs)))]
    log(f"eval {label}: " + json.dumps({k: v for k, v in result.items() if k != "examples"}))
    model.train()
    return result


# ----------------------------------------------------------------------------------------------- main

LOG = None


def log(msg):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    if LOG:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")


def main():
    global LOG
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, default=Path("runs/turbo-md"))
    p.add_argument("--epochs", type=float, default=3)
    p.add_argument("--batch", type=int, default=2)
    p.add_argument("--accum", type=int, default=8)
    p.add_argument("--lr", type=float, default=1e-4)
    p.add_argument("--rank", type=int, default=32)
    p.add_argument("--decoder-only", action="store_true", help="LoRA on the decoder only (fallback for small GPUs)")
    p.add_argument("--val-clips", type=int, default=150, help="validation clips used to pick the best epoch")
    p.add_argument("--eval-only", action="store_true")
    p.add_argument("--limit", type=int, help="smoke test: use only this many train / test clips")
    p.add_argument("--cache", type=Path, help="folder for the packed data (default: OUT/data)")
    p.add_argument("--no-grad-ckpt", action="store_true",
                   help="disable gradient checkpointing: ~30%% faster, needs more GPU memory")
    args = p.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    LOG = args.out / "train.log"
    results_path = args.out / "results.json"
    results = json.loads(results_path.read_text()) if results_path.exists() else {}

    from peft import LoraConfig, PeftModel, get_peft_model
    from transformers import (Seq2SeqTrainer, Seq2SeqTrainingArguments, TrainerCallback,
                              WhisperForConditionalGeneration, WhisperProcessor)

    processor = WhisperProcessor.from_pretrained(BASE)
    processor.tokenizer.set_prefix_tokens(language="romanian", task="transcribe")
    cache = args.cache or args.out / "data"
    val = cached_pack("validation", cache)
    rng = np.random.default_rng(0)
    val_sub = [val[i] for i in sorted(rng.choice(len(val), min(args.val_clips, len(val)), replace=False))]
    merged_dir = args.out / "merged"

    if not args.eval_only and not merged_dir.exists():
        train = cached_pack("train", cache)[:args.limit]
        log(f"train {len(train)} clips, val subset {len(val_sub)} of {len(val)}")
        model = WhisperForConditionalGeneration.from_pretrained(BASE, torch_dtype=torch.float32).to("cuda")
        model.config.forced_decoder_ids = None
        model.generation_config.forced_decoder_ids = None
        if "stock_val" not in results:
            results["stock_val"] = evaluate(model, processor, val_sub, label="stock / validation")
            results_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))

        targets = ["q_proj", "k_proj", "v_proj", "out_proj", "fc1", "fc2"]
        if args.decoder_only:
            targets = [rf"model\.decoder\..*\.({'|'.join(targets)})"]
        lora = LoraConfig(r=args.rank, lora_alpha=2 * args.rank, lora_dropout=0.05,
                          target_modules=targets[0] if args.decoder_only else targets, bias="none")
        model = get_peft_model(model, lora)
        model.print_trainable_parameters()
        model.enable_input_require_grads()

        steps_per_epoch = math.ceil(len(train) / (args.batch * args.accum))
        targs = Seq2SeqTrainingArguments(
            output_dir=str(args.out / "checkpoints"), per_device_train_batch_size=args.batch,
            gradient_accumulation_steps=args.accum, learning_rate=args.lr, warmup_steps=100,
            num_train_epochs=args.epochs, bf16=True, gradient_checkpointing=not args.no_grad_ckpt,
            gradient_checkpointing_kwargs={"use_reentrant": False}, logging_steps=10, save_strategy="steps",
            save_steps=min(100, steps_per_epoch), save_total_limit=4, eval_strategy="no",
            dataloader_num_workers=6, remove_unused_columns=False, report_to=[], label_names=["labels"],
            lr_scheduler_type="linear", optim="adamw_torch")

        class EpochEval(TrainerCallback):
            """WER on the validation subset after every epoch; keeps the best LoRA adapter in OUT/best."""

            def on_epoch_end(self, a, state, control, **kw):
                ep = round(state.epoch)
                key = f"epoch{ep}_val"
                if key in results:
                    return
                results[key] = evaluate(model, processor, val_sub, label=f"epoch {ep} / validation")
                best = results.get("best_epoch")
                if best is None or results[key]["wer_all"] < results[f"epoch{best}_val"]["wer_all"]:
                    results["best_epoch"] = ep
                    model.save_pretrained(str(args.out / "best"))
                    log(f"new best: epoch {ep}")
                results_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))

            def on_log(self, a, state, control, logs=None, **kw):
                if logs and "loss" in logs:
                    log(f"step {state.global_step}/{state.max_steps} epoch {state.epoch:.2f} loss {logs['loss']:.4f} "
                        f"lr {logs.get('learning_rate', 0):.2e}")

        trainer = Seq2SeqTrainer(model=model, args=targs, train_dataset=ClipDataset(train),
                                 data_collator=Collator(processor), callbacks=[EpochEval()])
        ckpts = sorted((args.out / "checkpoints").glob("checkpoint-*"), key=lambda c: int(c.name.split("-")[1]))
        log(f"training: {steps_per_epoch} steps/epoch, resume from {ckpts[-1].name if ckpts else 'scratch'}")
        t = time.time()
        trainer.train(resume_from_checkpoint=str(ckpts[-1]) if ckpts else None)
        results["train_seconds"] = results.get("train_seconds", 0) + round(time.time() - t)
        results_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))

        log(f"merging best adapter (epoch {results['best_epoch']})")
        base = WhisperForConditionalGeneration.from_pretrained(BASE, torch_dtype=torch.float32)
        merged = PeftModel.from_pretrained(base, str(args.out / "best")).merge_and_unload()
        merged.generation_config.forced_decoder_ids = None
        merged.save_pretrained(str(merged_dir), safe_serialization=True)
        processor.save_pretrained(str(merged_dir))
        del model, trainer, merged, base
        torch.cuda.empty_cache()

    # Final report on the held-out test set: stock vs fine-tuned, per dialect.
    test = cached_pack("test", cache)[:args.limit]
    for name, path in (("stock_test", BASE), ("finetuned_test", str(merged_dir))):
        if name in results or (name == "finetuned_test" and not merged_dir.exists()):
            continue
        model = WhisperForConditionalGeneration.from_pretrained(path, torch_dtype=torch.bfloat16).to("cuda")
        model.generation_config.forced_decoder_ids = None
        results[name] = evaluate(model, processor, test, label=name)
        results_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))
        del model
        torch.cuda.empty_cache()
    log("done: " + json.dumps({k: {m: v[m] for m in v if m.startswith("wer")} for k, v in results.items()
                               if isinstance(v, dict)}))


if __name__ == "__main__":
    main()
