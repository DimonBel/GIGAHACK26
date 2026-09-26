# Secure MOM — on-premise meeting minutes for Medpark

Upload a meeting recording (or press **Rec**), pick the meeting type, and get a structured Minutes of Meeting:
summary, decisions, action items with owners and deadlines, per patient or agenda item. A moderator reviews and
edits it, clicks **I agree**, picks the recipients, and it is emailed through the hospital's own mail server.
Everything runs on one machine, with **zero calls to the internet**: speech recognition (Whisper), speaker
detection (pyannote), the minutes (a local LLM through Ollama), routing (n8n) and email (a local SMTP server,
MailHog for the demo).

Moldovan meetings mix Romanian, Russian and English inside one sentence, with medical terms. The speech pipeline
picks the language of every sentence, writes Russian words back in Cyrillic, corrects misheard medical words, and
uses a Whisper turbo fine-tuned on Moldovan speech.

## How it works

```
Browser (React)  ──>  FastAPI server (127.0.0.1:8000)  ──>  job queue, one meeting at a time
                                                              │  child process:
                                                              │   ffmpeg -> Silero VAD chunks -> Whisper (MLX / whisper.cpp)
                                                              │   -> language per sentence, Russian words, word fixes
                                                              │   -> pyannote speakers -> dialog -> minutes (Ollama, gemma4:e4b)
                  moderator edits, "I agree", To/CC  <────────┘
                                      │
                                      └──>  n8n workflow (route by meeting type)  ──>  SMTP (MailHog)  ──>  inbox
```

| Folder | What |
|---|---|
| `stt/` | the speech pipeline: `asr/` (Whisper, chunks, languages), `text/` (Russian words, spelling), `speakers/` (who spoke, dialog, roles), `minutes/` (MoM with the local LLM), `pipeline.py` |
| `server/` | FastAPI backend: accounts and roles, meetings, processing jobs, email |
| `web/` | React + TypeScript + Mantine web app, built into `web/dist` and served by the backend |
| `automation/` | n8n + MailHog with Docker compose, the n8n workflow |
| `docs/` | the API contract (`api.md`), fine-tuning requirements (`finetuning.md`) |
| `scripts/` | model downloads, the fine-tuned model installer, accuracy benchmark and word error rate tools |

## Setup (once, with internet)

Apple Silicon Mac (development) or a Linux server with a 16 GB GPU (or CPU-only, 32 GB RAM).

```bash
brew install whisper-cpp ffmpeg ollama python@3.12 node   # plus Docker Desktop
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
mkdir -p models
curl -L -o models/ggml-large-v3.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
curl -L -o models/ggml-silero-v5.1.2.bin https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin
.venv/bin/python scripts/download_models.py --mlx          # accent model; Whisper for MLX (Apple Silicon)
scripts/install_finetuned.sh path/to/turbo-md-adapter.tar  # Whisper fine-tuned on Moldovan speech (recommended)
ollama serve &  ollama pull gemma4:e4b                     # the local LLM for the minutes
(cd web && npm ci && npm run build)
./automation/setup.sh                                      # n8n + MailHog (Docker), token in automation/.env
```

Speaker detection (pyannote 3.1) is downloaded on first use: create a free token at
https://huggingface.co/settings/tokens, accept the terms of `pyannote/speaker-diarization-3.1` and
`pyannote/segmentation-3.0`, and put `HF_TOKEN=hf_...` into `.env`. After that it runs offline.

Create the first admin (there are no default accounts); add the other people in the web app:

```bash
.venv/bin/python -m server.cli create-admin --email admin@medpark.md --name "Ana Admin" --position IT
```

## Run (offline)

```bash
ollama serve                 # 127.0.0.1:11434
./automation/setup.sh        # n8n 127.0.0.1:5678, MailHog SMTP 127.0.0.1:1025
                             # inbox http://127.0.0.1:8025 (login MAILHOG_USER / MAILHOG_PASSWORD in automation/.env)
.venv/bin/python -m server   # http://127.0.0.1:8000
```

## Using the app

| Role | What they do |
|---|---|
| **Admin** | people (role, position, email), distribution lists per meeting type (To / CC), settings (models, delivery, audio retention), audit log |
| **Moderator** | **New meeting**: upload a file or record, pick Medical / Executive / Administrative → live progress → **Minutes**: edit everything (patients / agenda items, decisions, action items with owner, deadline and priority) → **I agree** → **Send**: lists fill To and CC, add members (To) and other people (CC) → emailed |
| **User** (doctors, staff) | **My minutes**: the minutes sent to them |

Not signed in: only the login page.

## Command line

The same pipeline without the web app:

```bash
.venv/bin/python main.py minutes meeting.m4a --type medical      # -> out/meeting.dialog.txt, .minutes.md, .minutes.json
.venv/bin/python main.py minutes out/meeting.dialog.txt          # minutes again from a saved transcript
.venv/bin/python main.py dialog meeting.m4a --format srt --out meeting.srt   # who said what
.venv/bin/python main.py transcribe meeting.m4a --format json    # every word with its language
.venv/bin/python main.py record --seconds 60 --then minutes
```

Options: `--engine mlx|whisper.cpp` (MLX by default on Apple Silicon), `--model` (default: the Moldovan
fine-tune, else Whisper turbo; Large V3 with whisper.cpp), `--lang auto|ro|ru|en`, `--no-fix-words`,
`--llm` (Ollama model). Results are saved readable only by you: they are patient data.

## Security

- **Offline:** every service listens on 127.0.0.1. Hugging Face libraries run offline with telemetry off; n8n's
  telemetry, update checks and templates are off; the web app loads nothing from CDNs; the LLM client only talks
  to Ollama on this machine; email goes only to local SMTP (the server refuses other hosts).
- **Accounts:** argon2 password hashes, server-side sessions (httpOnly, SameSite=Strict cookies), CSRF tokens on
  every change, login lockout, roles checked on every API call (another moderator's meeting is a 404).
- **Patient data:** uploads are checked with ffprobe and stored under random names; the database, recordings and
  outputs are readable only by the server's user; audio is deleted after processing by default; every view,
  edit, approval and sending is in the audit log; LLM output is escaped in the web app and in emails.
- **For production:** put TLS in front before opening the server to the hospital network, replace MailHog
  with the hospital's internal mail relay, and use full-disk encryption on the server.

## Speed

Measured end to end on the real stack (web API → pipeline → n8n → MailHog), Apple M5 MacBook Air with 16 GB,
MLX with the Moldovan turbo fine-tune, gemma4:e4b through Ollama, Docker Desktop limited to 3 GB:

| 11.7-minute Medpark meeting | Time |
|---|---|
| Transcript with speakers | 2 min 15 s |
| Minutes (local LLM, with the speakers' roles) | 1 min 46 s |
| Send → email in the inbox | 0.1 s |
| **Upload → email** | **4 min 4 s** |

A 60-minute meeting extrapolates to about 21 minutes on this laptop. With 32 GB or more (the target server:
16 GB GPU, 32 GB RAM) the minutes are written while the transcription runs, so they add little after it; with
16 GB the two would push each other into swap (tested), so they run one after the other.

## Accuracy

Word error rate on 15 minutes of Moldovan parliament speakers with human transcripts (ROMPAR test split,
`scripts/benchmark.py`):

| Setup | Word errors | Speed |
|---|---|---|
| whisper.cpp, Whisper Large V3 | 16.6% | 4.6x real time |
| MLX, Whisper turbo, beam 5 | 14.7% | 17.2x real time |
| Whisper turbo fine-tuned on Moldovan speech (see below) | 9.9% on the full test split | same as turbo |

The fine-tune's ROMPAR score is optimistic (the test speakers are also in its training data); on speakers it
never heard (FLEURS) it is about 10% better than stock turbo. On the Medpark meeting the difference is clear:
"pe data de **11** … infarct **miocardic** … **fracție de 38-40**" instead of "pe data de ustra … infarct
meocardia … fraccia de 3,6-3,4-10". How it was trained and how to improve it: `docs/finetuning.md`.

## Languages: Romanian, Russian, English and the Moldovan mix

Every line is tagged with its languages:

```
[ro] Bună ziua! Începem ședința de azi cu situația pacienților.
[ru] Хорошо, давайте сначала посмотрим анализы из реанимации.
[en, American] The deadline for the report is Friday.
[ro+ru] Bine, deci pacientul din salonul 8, короче, are nevoie de transfer.
```

1. Silero VAD finds the speech; up to 28 s of it, pauses cut out, makes one chunk (`stt/asr/chunks.py`).
2. Every chunk is transcribed in **Romanian**. Language ID doesn't settle the rest (Whisper calls Moldovan-accented
   Romanian Russian), and Whisper forced into another language often translates. So a sentence becomes Russian
   or English only when it isn't Romanian words and the other transcript is confident, real words, and *sounds
   like* it (`stt/asr/languages.py`).
3. Russian words inside Romanian sentences, written in Latin letters ("cisto", "davai"), are rewritten in
   Cyrillic when the chunk transcribed in Russian heard the same word at the same moment, or when they are in
   `stt/text/russianisms.txt` (`stt/text/codeswitch.py`).
4. Misheard words are corrected to the closest real or medical word ("Pocentul" → "Pacientul", "metrala" →
   "mitrala"; medical terms in `stt/text/medical_ro.txt`: add your ward's). In doubt a word stays as it was.
5. Loops, subtitle phrases and invented text in other alphabets are dropped (`stt/asr/decode.py`).

## Tests

```bash
.venv/bin/python -m pytest tests -q                               # pipeline and server (no models needed)
(cd web && npm run typecheck && npm run lint && npm test)
python3 automation/smoke_test.py                                  # n8n + MailHog delivery
.venv/bin/python scripts/benchmark.py --engine mlx --minutes 15   # accuracy on Moldovan speech (ROMPAR)
```
