# GIGAHACK26 — Local Speech-to-Text

Offline speech-to-text using **whisper.cpp** with the **Whisper Large V3** model.
Everything runs locally on your Mac (Metal GPU acceleration) — no cloud APIs.

## Setup

```bash
brew install whisper-cpp ffmpeg ollama python@3.12
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Models to install

Models are not in git (`models/` is gitignored). Download them once:

| Model | Used for | Size | Required? |
|---|---|---|---|
| `models/ggml-large-v3.bin` (Whisper Large V3) | speech-to-text | 3.1 GB | yes |
| `models/ggml-silero-v5.1.2.bin` (Silero VAD) | skips silence, fewer hallucinated words | 0.9 MB | recommended (used automatically if present) |
| pyannote 3.1 (Hugging Face) | who said what (`dialog`) | ~30 MB | for `dialog` — see [Speaker dialog](#speaker-dialog-who-said-what) |
| `gemma4:e4b` (Ollama) | Minutes of Meeting | 9.6 GB | for `--minutes` / `stt.minutes` |
| `llama3.1:8b` (Ollama) | short summary (`--summarize`) | 4.9 GB | optional |

```bash
mkdir -p models
curl -L -o models/ggml-large-v3.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
curl -L -o models/ggml-silero-v5.1.2.bin \
  https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin

brew services start ollama        # or: ollama serve &
ollama pull gemma4:e4b            # minutes
ollama pull llama3.1:8b           # optional, only for --summarize
ollama list                       # check what is installed
```

Other models work too: `--model PATH` for Whisper, `--minutes-model` / `--model` for the minutes (any Ollama
model, e.g. `gemma3:4b`). If a download stops on a bad connection, run the same `ollama pull` again — it
resumes.

## Usage

Transcribe a file (mp3, m4a, wav, mp4, ogg, ...):

```bash
.venv/bin/python main.py transcribe audio.mp3
.venv/bin/python main.py transcribe audio.mp3 --lang ro --format srt --out audio.srt
.venv/bin/python main.py transcribe audio.mp3 --translate        # translate to English
```

Record from the microphone, then transcribe:

```bash
.venv/bin/python main.py record --seconds 10
```

Options: `--lang auto|en|ro|ru|...`, `--format txt|srt|timestamps`, `--out FILE`, `--model PATH`.

## Speaker dialog (who said what)

Detects the different speakers with **pyannote 3.1** (local, Apple GPU) and writes the
transcript as a dialog:

```
[00:00:00 - 00:00:03] SPEAKER 1: Good morning. How are you feeling today? Any chest pain?
[00:00:03 - 00:00:07] SPEAKER 2: Yes. Since yesterday evening I have had pain on the left side.
[00:00:07 - 00:00:10] SPEAKER 1: Okay. We will do an ECG and check your troponin.
```

**One-time setup** (only to download the model; afterwards it works offline):
1. Create a free token at https://huggingface.co/settings/tokens (type "Read").
2. Accept the terms on https://huggingface.co/pyannote/speaker-diarization-3.1
   and https://huggingface.co/pyannote/segmentation-3.0.
3. Create a `.env` file in the project folder containing `HF_TOKEN=hf_...`

```bash
.venv/bin/python main.py dialog Medpark_audio.m4a --lang ro --out Medpark_dialog.txt
.venv/bin/python main.py dialog Medpark_audio.m4a --lang ro --format srt --out Medpark.srt
.venv/bin/python main.py record --seconds 30 --dialog
```

The number of speakers is detected automatically. Limitations: when two people talk at the
same time, the words go to the dominant speaker; labels (SPEAKER 1, 2...) are per file.

## Optional: summarize with a local LLM (Ollama)

```bash
brew install ollama && ollama serve &
ollama pull llama3.1:8b
.venv/bin/python main.py transcribe audio.mp3 --summarize
```

## Minutes of Meeting (local LLM)

Structured minutes (per patient / agenda item: status, findings, decisions; action items with owner and
deadline; key moments, open issues, AI suggestions) in English, generated locally with **gemma4:e4b** via Ollama.

```bash
ollama pull gemma4:e4b
# from audio: minutes are extracted chunk by chunk while Whisper is still transcribing
.venv/bin/python main.py dialog meeting.m4a --lang ro --minutes medical --out meeting.txt
# from an existing dialog transcript
.venv/bin/python -m stt.minutes meeting_dialog.txt --type medical --out out/meeting
```

Output: `out/meeting.md` (for people), `out/meeting.json` (for automation), `out/meeting.meta.json` (timings).
Meeting types: `medical`, `executive`, `administrative`.

Optional speed-up: let Ollama decode 2 chunks at once (about 1.4x faster on an M4 with 16 GB; 4 was slower):

```bash
OLLAMA_NUM_PARALLEL=2 ollama serve
```

How it works (`stt/minutes.py`): the transcript is normalized with a medical lexicon of ASR errors (e.g.
"nor" -> noradrenaline, "80 pe 40" -> 80/40, "200 de oameni" -> 200 µmol/l). Code cuts it where the speakers
move to another bed or room ("patul 9", "boxa") and names that patient, so the model never has to guess who is
who. The model extracts each chunk's facts filed per patient; code merges them, checks that doses / lab values
occur in the transcript (else "⚠ unverified") and finds each item's timestamp. One short final call writes
title, summary and suggestions.

Measured on an Apple M4 (16 GB) for the 11.7-min Medpark ICU handover: 34-37 of 44 reference facts under the
right patient (before: 18 with 8 invented facts), ~80 s in total, ~20-25 s after the end of the transcript in
live mode. Score an output with `python3 bench/eval_minutes.py out/meeting.md`.

## Project layout

```
main.py              CLI entry point
stt/audio.py         ffmpeg → 16 kHz mono WAV
stt/transcriber.py   runs whisper-cli (Large V3), parses segments + word timestamps
stt/diarizer.py      pyannote 3.1 speaker detection
stt/dialog.py        assigns words to speakers, dialog txt/srt/json output
stt/pipeline.py      convert -> transcribe -> diarize -> align
tests/               unit tests (.venv/bin/python -m pytest tests)
stt/recorder.py      microphone recording (sounddevice)
stt/llm.py           optional Ollama summarization
stt/minutes.py       Minutes of Meeting (chunked extraction with gemma4:e4b)
models/              Whisper / VAD model files (gitignored, see Models to install)
bench/eval_minutes.py scores minutes against the Medpark reference facts
```
