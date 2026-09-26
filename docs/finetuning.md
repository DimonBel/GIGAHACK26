# Fine-tuning Whisper for Moldovan meetings

What is needed to fine-tune the speech model on a GPU server, and how to bring the result back into the
pipeline. The pipeline itself doesn't need a GPU server: it runs on a Mac (MLX) or any machine (whisper.cpp).

## Why

Stock Whisper (large-v3-turbo, our default) mishears Moldovan-accented and colloquial Romanian. On the Medpark
meeting the opening "Pacientul patul 8, el a fost pe data de **unșpe** (11)…" comes out as "…pe data de
**ustra**…", and terms like "miocardic" as "meocardia". The misheard-word correction (`stt/spelling.py`) only
fixes words a letter or two off; a word misheard as a different sound needs the model itself adapted.

No public model covers this. The only Moldovan fine-tune we found,
[FraPiz/whisper-large-v3-turbo-moldovan-romanian](https://huggingface.co/FraPiz/whisper-large-v3-turbo-moldovan-romanian)
(70 h of Moldovan school lessons), did worse on Moldovan test speech (22% word errors against 16% for stock
Large V3, see the README): it spells numbers as words and dialect words the way they sound, and it writes
Russian speech as Romanian-looking words, which the pipeline can then no longer catch. The data and the way
its transcripts are written matter more than the model.

## Goal

A fine-tuned **whisper-large-v3-turbo** used for the pipeline's Romanian pass (`--ro-model`), which:
- makes clearly fewer word errors on Moldovan speech: at least 2 points below stock turbo on
  `scripts/benchmark.py` (stock: 14.7% on the 15-minute Moldovan set, MLX, beam 5);
- is not worse on standard Romanian (`scripts/benchmark.py --dialect romanian`);
- writes numbers as digits ("pe data de 11", "80 pe 40", "0,22"), medical terms correctly spelled, Russian
  words in Cyrillic;
- keeps turbo's speed (same architecture).

Stock turbo stays in use for the Russian and English passes, so Russian is not at risk.

## Server

| | Minimum | Recommended |
|---|---|---|
| GPU | 1 × NVIDIA, 16 GB (LoRA, 8-bit optimizer, gradient checkpointing, batch 4) | 1 × NVIDIA, 24–80 GB: L4, A10G, RTX 3090/4090, A100 |
| RAM | 32 GB | 64 GB |
| Disk | 100 GB free | 200 GB (datasets, checkpoints of ~3 GB each) |
| Software | Linux, CUDA 12, Python 3.10–3.12 | same |

Python packages: `torch` (CUDA build), `transformers>=4.45`, `peft`, `accelerate`, `datasets`, `soundfile`,
`pyarrow`, `jiwer`; `bitsandbytes` for an 8-bit optimizer on 16 GB cards.

Time (estimate, not measured): with utterances packed into clips of up to 28 s (Whisper pads everything to
30 s, so short clips waste compute), ROMPAR's training set is about 2,000 clips; LoRA takes roughly
15–30 minutes per epoch on a 24 GB card, 3–5 epochs.

**Privacy:** hospital recordings are patient data. Training on them has to run on a server the hospital
controls (on-premise), not on a cloud GPU, unless the hospital approves it.

## Data

| Data | What | Use |
|---|---|---|
| [ROMPAR](https://huggingface.co/datasets/avramandrei/rompar) train | 11,912 utterances, ~15 h of Romanian parliament speech, 46% Moldovan speakers, human transcripts | main training data |
| ROMPAR validation | 1,489 utterances | pick the best epoch |
| ROMPAR **test** | 1,490 utterances | **never train on it**: it is the benchmark (`scripts/benchmark.py`) |
| [Common Voice](https://commonvoice.mozilla.org) Romanian | read speech, CC0 | 20–30% of the mix, so standard Romanian isn't forgotten |
| Our own meetings | 2–10 h of Medpark-like meetings transcribed by staff | the most valuable data: the real accent, medical terms, colloquial numbers, Russian mixed in |

ROMPAR's license isn't stated on its card: check the paper ([arXiv 2606.15984](https://arxiv.org/abs/2606.15984))
or ask the authors before any commercial use.

How transcripts must be written (training teaches the model to write like this):
- numbers in digits, also colloquial ones: "unșpe" → "11", "optzeci pe patruzeci" → "80 pe 40";
- Romanian diacritics with comma below (ș, ț), not cedilla (ş, ţ);
- Russian words in Cyrillic, as said: "короче", "так", "чисто";
- medical terms and drug names spelled correctly (see `stt/medical_ro.txt`);
- normal sentence casing and punctuation.

For our own meetings: cut them into speech segments with the pipeline's VAD (`stt/segments.py`), let the
current pipeline produce a draft (`main.py transcribe --format srt`), and have staff correct the draft; that
is several times faster than transcribing from scratch.

## Method

1. Start from `openai/whisper-large-v3-turbo` (Hugging Face format), language `ro`, task `transcribe`.
2. Pack consecutive utterances into clips of up to 28 s (like `scripts/benchmark.py` does), joined with
   0.3 s of silence, with their transcripts joined.
3. LoRA on the attention (q, k, v, out) and feed-forward layers of **both** encoder and decoder (the accent is
   heard by the encoder): rank 32, alpha 64, dropout 0.05. On a 16 GB card, decoder-only LoRA is the fallback.
4. Learning rate 1e-4 with 100 warm-up steps, effective batch 16 (gradient accumulation), bf16/fp16, gradient
   checkpointing, 3–5 epochs; word error rate on ROMPAR validation after each epoch, keep the best.
5. Merge the LoRA weights into the model and save it (`save_pretrained`, safetensors).

## Bringing it back into the pipeline

On a Mac (MLX, the default engine):

```bash
git clone --depth 1 https://github.com/ml-explore/mlx-examples
python mlx-examples/whisper/convert.py --torch-name-or-path <merged model folder> --mlx-path models/mlx-turbo-md
.venv/bin/python main.py dialog meeting.m4a --ro-model models/mlx-turbo-md
```

For whisper.cpp (NVIDIA or CPU machines): convert with whisper.cpp's `models/convert-h5-to-ggml.py` (it needs
`vocab.json` and `added_tokens.json` from `openai/whisper-large-v3-turbo`, and `mel_filters.npz` from the
`openai/whisper` repository), then `--engine whisper.cpp --ro-model models/ggml-turbo-md.bin`.

## Acceptance check

```bash
.venv/bin/python scripts/benchmark.py --engine mlx --model models/mlx-turbo-md --minutes 0
.venv/bin/python scripts/benchmark.py --engine mlx --model models/mlx-turbo-md --minutes 0 --dialect romanian
```

Compare with the same commands for the stock model (`--model models/ggml-large-v3-turbo-q8_0.bin`), and listen
to the Medpark opening: it should read "Pacientul (din) patul 8, el a fost pe data de 11 … infarct miocardic …
tromboaspirație … mitrala 3 … fracția de 38-40". Deliver the merged model folder, the MLX and ggml exports, and a
short report: data used, settings, training time, and the word error rates before and after.
