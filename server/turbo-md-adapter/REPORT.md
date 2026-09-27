# Whisper large-v3-turbo fine-tuned for Moldovan / Romanian (run turbo-md, 2026-09-26)

LoRA fine-tune of `openai/whisper-large-v3-turbo` following `docs/finetuning.md`, trained on public data only
(ROMPAR, no hospital recordings).

## Contents

| Path | What |
|---|---|
| `merged/` | (full package only) Fine-tuned model, LoRA merged in, Hugging Face format; or run `python merge_adapter.py adapter merged` (`model.safetensors` fp32 + tokenizer / processor files). Use this for inference or conversion to MLX / ggml. |
| `adapter/` | The LoRA adapter only (epoch 3, 107 MB): apply with `PeftModel.from_pretrained(base, "adapter")`, or continue training from it. |
| `checkpoint-432/` | (full package only) Last Trainer checkpoint (adapter + optimizer / scheduler state) for an exact resume. |
| `finetune_whisper.py` | Training + evaluation script (resumable; `--help` for options). |
| `eval_fleurs.py` | Stock vs adapter WER on FLEURS Romanian (speakers not in ROMPAR), CPU. |
| `run_finetune.sh` | The exact command used, with automatic retry / resume. |
| `results.json`, `train.log`, `fleurs_epoch1.json` | All scores, the training log and the FLEURS evaluation. |

## Settings

- Base `openai/whisper-large-v3-turbo`, language `ro`, task `transcribe`
- Data: ROMPAR train (11,912 utterances, 14.9 h), utterances of the same record packed into ≤28 s clips with 0.3 s
  silence → 2,297 clips; bracketed unspoken word parts removed ("popu[lației]" → "popu"); ş/ţ → ș/ț
- LoRA r=32, alpha=64, dropout 0.05 on q/k/v/out_proj, fc1, fc2 of encoder **and** decoder (27.9 M trainable, 3.3%)
- lr 1e-4, 100 warm-up steps, linear decay, effective batch 16 (batch 1 × 16 accumulation), bf16, no gradient
  checkpointing, 3 epochs (432 steps)
- Hardware: 1 × RTX 3060 12 GB; training time 63 min (~8 s / step); peak ~10.7 GB VRAM
- Best epoch by validation WER: 3 (validation WER after epochs 1 / 2 / 3: 10.99 / 10.48 / 10.47%)

## Results (word error rate, lower-cased, punctuation removed; greedy decoding)

| Set | Stock turbo | Fine-tuned | Note |
|---|---|---|---|
| ROMPAR validation (330 clips) | 17.70% (md 18.42, ro 17.18) | 10.47% (md 12.84, ro 8.74) | same speakers as training |
| ROMPAR test (359 clips) | 19.69% (md 20.81, ro 18.84) | **9.93%** (md 11.96, ro 8.39) | same speakers as training |
| FLEURS Romanian, 100 utterances, **new speakers** | 11.26% | 10.16% (epoch-1 adapter) | read standard Romanian |

**Important caveat:** ROMPAR's validation and test utterances come from the same 169 recordings / speakers as
the training set (161/161 validation and 167/167 test records also appear in train). The ROMPAR gains therefore
include adaptation to those speakers and overstate what to expect on new speakers. On unseen speakers (FLEURS)
the gain is real but modest (~10% relative), and standard Romanian did not get worse.

## Suggested next steps

1. Evaluate `merged/` on the full FLEURS ro test set (883 utterances) and on real Medpark-like meetings
   (the opening "pe data de unșpe … infarct miocardic …").
2. Retrain with a **speaker-disjoint** split (hold out ~15 whole ROMPAR records for validation / test) and mix in
   20–30% Common Voice Romanian, as `docs/finetuning.md` recommends.
3. The biggest expected gain: 1–10 h of real Moldovan colloquial / hospital speech with corrected transcripts
   (numbers as digits, medical terms spelled correctly, Russian in Cyrillic), trained on-premise.
4. Use the model only for the Romanian pass (`--ro-model`); it was trained on Romanian only and may write Russian
   speech as Romanian-looking words.

Reproduce: `python finetune_whisper.py --out runs/turbo-md --cache runs/cache --epochs 3 --val-clips 330 --batch 1
--accum 16 --no-grad-ckpt` (Python 3.12, torch 2.6 cu124, transformers 4.57, peft 0.21, datasets 5).
