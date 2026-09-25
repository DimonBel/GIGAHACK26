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
models/              ggml model files (gitignored)
```
