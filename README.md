# GIGAHACK26 — Local Speech-to-Text

Offline speech-to-text using **whisper.cpp** with the **Whisper Large V3** model.
Everything runs locally on your Mac (Metal GPU acceleration) — no cloud APIs.

## Setup

```bash
brew install whisper-cpp ffmpeg
mkdir -p models
curl -L -o models/ggml-large-v3.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
brew install python@3.12
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Usage

Transcribe a file (mp3, m4a, wav, mp4, ogg, ...):

```bash
.venv/bin/python main.py transcribe audio.mp3
.venv/bin/python main.py transcribe audio.mp3 --lang ro --out audio.txt
.venv/bin/python main.py transcribe audio.mp3 --engine whisper-file --format srt --out audio.srt
.venv/bin/python main.py transcribe audio.mp3 --translate        # translate to English
```

Record from the microphone, then transcribe:

```bash
.venv/bin/python main.py record --seconds 10
```

Options: `--lang auto|en|ro|ru|...`, `--format txt|srt|timestamps`, `--out FILE`, `--model PATH`,
`--engine whisper-turbo|whisper|gemma|gemma-fast|whisper-file`.

`transcribe` uses **Whisper Large V3 Turbo** (8-bit, `models/ggml-large-v3-turbo-q8_0.bin`) by default. Create it once:

```bash
curl -L -o models/ggml-large-v3-turbo.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
whisper-quantize models/ggml-large-v3-turbo.bin models/ggml-large-v3-turbo-q8_0.bin q8_0
```

The audio is cut
into ≤28 s pieces at quiet moments and 2 whisper-servers transcribe them in parallel.

With `--lang auto` (default) the language is detected automatically — Romanian (incl. Moldovan), Russian
or English. Whisper's per-piece guess is unreliable for Moldovan speech (Romanian often guessed as Russian at
~50%), so the recording's main language is taken from all pieces together, a piece keeps a different
language only when Whisper is ≥80% sure, and uncertain pieces are re-transcribed in the main language.
`--format srt/timestamps` need `--engine whisper-file` (one whisper-cli run over the whole file).

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
.venv/bin/python main.py record --seconds 30 --dialog --engine whisper-file
```

`dialog` uses **Whisper Large V3 in 8-bit** (`models/ggml-large-v3-q8_0.bin`, falls back to
`ggml-large-v3.bin` if missing). Create it once (5 seconds, 1.6 GB):

```bash
whisper-quantize models/ggml-large-v3.bin models/ggml-large-v3-q8_0.bin q8_0
```

How it works (default, `--engine whisper-file`): pyannote first finds who speaks when; then Whisper
transcribes the whole file in one run (silence skipped by VAD), and every sentence / Whisper segment
goes to the speaker who talks most during it. On an Apple M4, 11m 43s of audio takes ~2m 50s
(~1 min speaker detection + ~2 min Whisper). `--beam-size 5` is a bit more careful (~35% slower Whisper).

Slower alternative (`--engine whisper`, `whisper-turbo`, `gemma`, `gemma-fast`): every speaker turn is
cut out and transcribed separately, so each line's text comes only from that speaker's audio and short
remarks made while the other person talks ("Da.") get their own line - but Whisper then runs once per
turn (~170 times for 12 minutes instead of ~25), which takes much longer.
Whisper artifacts (repetition loops, subtitle credits) are filtered out in both modes.

The number of speakers is detected automatically. Limitations: when two people talk at the
same time, words in the overlap may go to either speaker; labels (SPEAKER 1, 2...) are per file.

## Optional: summarize with a local LLM (Ollama)

```bash
brew install ollama && ollama serve &
ollama pull llama3.1:8b
.venv/bin/python main.py transcribe audio.mp3 --summarize
```

## Project layout

```
main.py              CLI entry point
stt/audio.py         ffmpeg → 16 kHz mono WAV
stt/transcriber.py   runs whisper-cli (Large V3) on a whole file
stt/diarizer.py      pyannote 3.1 speaker detection
stt/dialog.py        speaker turns -> blocks, text cleanup, dialog txt/srt/json output
stt/pipeline.py      convert -> diarize -> transcribe each turn
stt/whisper_server.py keeps Whisper loaded in a local whisper-server
tests/               unit tests (.venv/bin/python -m pytest tests)
stt/recorder.py      microphone recording (sounddevice)
stt/llm.py           optional Ollama summarization
models/              ggml model files (gitignored)
```
