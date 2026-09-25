# GIGAHACK26 — Local Speech-to-Text

Offline speech-to-text using **whisper.cpp** with the **Whisper Large V3** model.
Everything runs locally on your Mac (Metal GPU acceleration) — no cloud APIs.

## Setup

```bash
brew install whisper-cpp ffmpeg
mkdir -p models
curl -L -o models/ggml-large-v3.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt   # only needed for microphone recording
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
stt/transcriber.py   runs whisper-cli (Large V3), parses JSON segments
stt/recorder.py      microphone recording (sounddevice)
stt/llm.py           optional Ollama summarization
models/              ggml model files (gitignored)
```
