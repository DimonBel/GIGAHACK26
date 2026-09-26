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
| `models/ggml-large-v3.bin` (Whisper Large V3) | speech-to-text (`--engine whisper`), source of the 8-bit copy | 3.1 GB | yes |
| `models/ggml-large-v3-q8_0.bin` (Large V3, 8-bit) | `dialog` default (`--engine whisper-file`), ~20% faster | 1.6 GB | recommended (made from the file above) |
| `models/ggml-large-v3-turbo-q8_0.bin` (Large V3 Turbo, 8-bit) | `transcribe` default (`--engine whisper-turbo`) | 0.8 GB | for `transcribe` |
| `models/ggml-silero-v5.1.2.bin` (Silero VAD) | skips silence, fewer hallucinated words | 0.9 MB | recommended (used automatically if present) |
| pyannote community-1 (Hugging Face) | who said what (`dialog`) | ~30 MB | for `dialog` — see [Speaker dialog](#speaker-dialog-who-said-what) |
| `gemma4:e4b` (Ollama) | Minutes of Meeting; also `--engine gemma` (speech-to-text) | 9.6 GB | for `--minutes` / `stt.minutes` |
| `gemma4:e2b` (Ollama) | `--engine gemma-fast` (speech-to-text) | 7.2 GB | optional |
| `llama3.1:8b` (Ollama) | short summary (`--summarize`) | 4.9 GB | optional |

```bash
mkdir -p models
curl -L -o models/ggml-large-v3.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
curl -L -o models/ggml-silero-v5.1.2.bin \
  https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin
whisper-quantize models/ggml-large-v3.bin models/ggml-large-v3-q8_0.bin q8_0            # 8-bit copy, seconds
curl -L -o models/ggml-large-v3-turbo.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
whisper-quantize models/ggml-large-v3-turbo.bin models/ggml-large-v3-turbo-q8_0.bin q8_0

brew services start ollama        # or: ollama serve &
ollama pull gemma4:e4b            # minutes (and --engine gemma)
ollama pull gemma4:e2b            # optional, only for --engine gemma-fast
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

Detects the different speakers with **pyannote community-1** (local, Apple GPU) and writes the
transcript as a dialog:

```
[00:00:00 - 00:00:03] SPEAKER 1: Good morning. How are you feeling today? Any chest pain?
[00:00:03 - 00:00:07] SPEAKER 2: Yes. Since yesterday evening I have had pain on the left side.
[00:00:07 - 00:00:10] SPEAKER 1: Okay. We will do an ECG and check your troponin.
```

**One-time setup** (only to download the model; afterwards it works offline):
1. Create a free token at https://huggingface.co/settings/tokens (type "Read").
2. Accept the terms on https://huggingface.co/pyannote/speaker-diarization-community-1.
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

### How many speakers, and who they are

The number of speakers is detected automatically. pyannote 3.1 split long recordings into many short
"speakers" (55 labels for a 60-min ICU round, 52 of them under 75 s); community-1 finds 8 there, at the same
speed, with the same main voices. Labels with little talk time left over are merged into the voice they
resemble most (pyannote's own voice embeddings; a short voice clearly unlike everyone else is kept as its own
speaker), which gives 7. If you know the count, say so:

```bash
.venv/bin/python main.py dialog meeting.m4a --lang ro --speakers 4 --out meeting.txt        # exactly 4
.venv/bin/python main.py dialog meeting.m4a --lang ro --min-speakers 3 --max-speakers 8 --out meeting.txt
```

`--roles` (always on with `--minutes`) asks the local LLM (gemma4:e4b) what each main speaker does in the
meeting, from their longest lines — e.g. "leads the round", "presents patients" — and their name only when
someone addresses them by it. Labels in the dialog stay `SPEAKER N`; the roles are a guess and are shown as one:
a legend at the top of the `.txt`, `<name>.speakers.json`, and a Participants section in the minutes.

Check speaker detection on your own recordings (no reference needed; `--samples` writes short clips of every
speaker so you can hear whether two labels are the same person):

```bash
.venv/bin/python bench/eval_speakers.py meeting.m4a --samples out/speakers
```

Limitations: when two people talk at the same time, words in the overlap may go to either speaker; labels
(SPEAKER 1, 2...) are per file.

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

Speed-up: let Ollama decode 2 chunks at once (about 1.4x faster on an M4 with 16 GB; 4 was slower). With
`brew services`, add it to the service's environment and reload the service:

```bash
plutil -insert EnvironmentVariables.OLLAMA_NUM_PARALLEL -string 2 ~/Library/LaunchAgents/sh.brew.ollama.plist
launchctl bootout gui/$(id -u)/sh.brew.ollama
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/sh.brew.ollama.plist
```

`brew services restart ollama` rewrites that file and drops the setting; run the lines above again after it.
Without brew services: `OLLAMA_NUM_PARALLEL=2 ollama serve`.

How it works (`stt/minutes.py`): the transcript is normalized with a medical lexicon of ASR errors (e.g.
"nor" -> noradrenaline, "80 pe 40" -> 80/40, "200 de oameni" -> 200 µmol/l). Code cuts it where the speakers
move to another bed or room ("patul 9", "boxa") and names that patient, so the model never has to guess who is
who. The model extracts each chunk's facts filed per patient; code merges them, checks that doses / lab values
occur in the transcript (else "⚠ unverified") and finds each item's timestamp. One short final call writes
title, summary and suggestions.

Measured on an Apple M4 (16 GB) with `OLLAMA_NUM_PARALLEL=2`, for the 11.7-min Medpark ICU handover: 33-35 of 44
reference facts under the right patient, 0-1 invented (first version: 18 with 8 invented), ~65 s in total
(first version: 123 s), ~20-25 s after the end of the transcript in live mode. Score an output with
`python3 bench/eval_minutes.py out/meeting.md`.

Tried and rejected (measured): a leaner output format and a shorter prompt (-20% tokens, but 4 facts fewer);
a follow-up question for missed facts (+3 facts, +25 s); 600-word chunks (faster, but skims long patients);
`gemma4:e2b` (2x faster, 19/44 facts).

## Project layout

```
main.py              CLI entry point
stt/audio.py         ffmpeg → 16 kHz mono WAV
stt/transcriber.py   runs whisper-cli (Large V3) on a whole file
stt/diarizer.py      pyannote community-1 speaker detection, merges fragment speakers
stt/speakers.py      speaker roles guessed by the local LLM
stt/dialog.py        speaker turns -> blocks, text cleanup, dialog txt/srt/json output
stt/pipeline.py      convert -> diarize -> transcribe (whole file, or each turn), feeds the live minutes
stt/engines.py       speech-to-text engines: whisper, whisper-turbo, gemma, gemma-fast
stt/whisper_server.py keeps Whisper loaded in a local whisper-server
tests/               unit tests (.venv/bin/python -m pytest tests)
stt/recorder.py      microphone recording (sounddevice)
stt/llm.py           optional Ollama summarization
stt/minutes.py       Minutes of Meeting (chunked extraction with gemma4:e4b)
models/              Whisper / VAD model files (gitignored, see Models to install)
bench/eval_minutes.py scores minutes against the Medpark reference facts
scripts/bench.py     speech-to-text engine benchmark
```
