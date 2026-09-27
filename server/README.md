# Server — local speech-to-text and Minutes of Meeting

Offline speech-to-text using **whisper.cpp** with the **Whisper Large V3** model, speaker detection with
pyannote, and Minutes of Meeting with a local LLM (Ollama).
Everything runs locally on your Mac (Metal GPU acceleration) — no cloud APIs.

All commands below run from this `server/` folder. Recordings go in `data/`, results in `out/` (both gitignored).

## Setup

```bash
brew install whisper-cpp ffmpeg ollama python@3.12
cd server
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

`main.py` and `python -m mom` are the same command line: `.venv/bin/python -m mom dialog ...` works everywhere below.

## Models to install

Models are not in git (`models/` is gitignored). Download them once:

| Model | Used for | Size | Required? |
|---|---|---|---|
| `models/ggml-large-v3.bin` (Whisper Large V3) | speech-to-text (`--engine whisper`), source of the 8-bit copy | 3.1 GB | yes |
| `models/ggml-turbo-md-q8_0.bin` (Turbo fine-tuned on Moldovan / Romanian, 8-bit) | `dialog` / web app / `transcribe` default when present — see [Fine-tuned Whisper](#fine-tuned-whisper-for-moldovan--romanian-turbo-md) | 0.9 GB | recommended (`scripts/build_turbo_md.sh`) |
| `models/ggml-large-v3-q8_0.bin` (Large V3, 8-bit) | `dialog` default without the file above (`--engine whisper-file`), ~20% faster than f16 | 1.6 GB | recommended (made from the file above) |
| `models/ggml-large-v3-turbo-q8_0.bin` (Large V3 Turbo, 8-bit) | `transcribe` default (`--engine whisper-turbo`) | 0.8 GB | for `transcribe` |
| `models/ggml-silero-v5.1.2.bin` (Silero VAD) | skips silence, fewer hallucinated words | 0.9 MB | recommended (used automatically if present) |
| pyannote community-1 (Hugging Face) | who said what (`dialog`) | ~30 MB | for `dialog` — see [Speaker dialog](#speaker-dialog-who-said-what) |
| `gemma4:e4b` (Ollama) | Minutes of Meeting; also `--engine gemma` (speech-to-text) | 9.6 GB | for `--minutes` / `mom.minutes` |
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
3. Copy `.env.example` to `.env` (in `server/`) and put your token in it: `HF_TOKEN=hf_...`

```bash
.venv/bin/python main.py dialog data/Medpark_audio.m4a --lang ro --out data/Medpark_dialog.txt
.venv/bin/python main.py dialog data/Medpark_audio.m4a --lang ro --format srt --out out/Medpark.srt
.venv/bin/python main.py record --seconds 30 --dialog --engine whisper-file
```

`dialog` uses the **fine-tuned Turbo** (`models/ggml-turbo-md-q8_0.bin`, see below) when it is built, else
**Whisper Large V3 in 8-bit** (`models/ggml-large-v3-q8_0.bin`, falls back to `ggml-large-v3.bin` if missing);
`--model large` / `--model turbo` pick a stock model. Create the 8-bit Large V3 once (5 seconds, 1.6 GB):

```bash
whisper-quantize models/ggml-large-v3.bin models/ggml-large-v3-q8_0.bin q8_0
```

How it works (default, `--engine whisper-file`): pyannote finds who speaks when while Whisper transcribes
the whole file in one run (silence skipped by VAD); every sentence / Whisper segment goes to the speaker who
talks most during it. Lines are shown live as soon as the speakers are known. The final line shows the time
of each stage. `--beam-size 5` is a bit more careful (~35% slower Whisper).

Measured on an Apple M4 MacBook Air (16 GB) for the 11m 43s Medpark recording (transcript only, no minutes;
timings vary ±20% as the fanless Mac heats up, so variants were run back to back):

| Setting | Time | Minutes facts found (of 44) |
|---|---|---|
| speakers, then Whisper (old order) | 200–204 s | 28 |
| speakers and Whisper in parallel (default) | 194–198 s | 28 |
| `--model turbo` (Large V3 Turbo, 8-bit) | 97 s | 19 — 2x faster, clearly worse on Romanian |
| `--clean-audio highpass` / `norm` / `denoise` | same | 18 / 16 / 16 — worse, off by default |

Audio cleanup before transcription does not pay off here: Whisper is trained on raw, noisy audio and every
ffmpeg filter tried (rumble high-pass, loudness levelling, noise reduction) cost facts, and speaker detection
found the same speakers with or without it. `--clean-audio` stays available for other recordings. pyannote
batch sizes above 32 were slower (128: 10x slower, GPU memory).

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
.venv/bin/python bench/eval_speakers.py data/meeting.m4a --samples out/speakers
```

Limitations: when two people talk at the same time, words in the overlap may go to either speaker; labels
(SPEAKER 1, 2...) are per file.

## Fine-tuned Whisper for Moldovan / Romanian (`turbo-md`)

`turbo-md-adapter/` holds a LoRA adapter for Whisper Large V3 Turbo, trained on public Romanian / Moldovan
parliament speech (ROMPAR, 15 h; details and training scores in `turbo-md-adapter/REPORT.md`). Build the
whisper.cpp model from it once (downloads the 1.6 GB base model and the converter sources):

```bash
.venv/bin/pip install transformers peft     # only needed for the build
scripts/build_turbo_md.sh                   # -> models/ggml-turbo-md-q8_0.bin (0.9 GB)
```

It is then the default everywhere (`--model turbo-md` explicitly; `--model large` for the old default).
Measured on the 11.7-min Medpark ICU handover (`dialog --lang ro`, then `mom.minutes`, scored with
`bench/eval_minutes.py`; the minutes step varies from run to run, so several runs each):

| Whisper model | medical lexicon | minutes facts (of 44) per run | mean | transcription | size |
|---|---|---|---|---|---|
| Large V3, 8-bit (previous default) | before | 25 · 25 · 26 | 25.3 | 151 s | 1.7 GB |
| Large V3 Turbo, 8-bit (stock) | before | 19 · 19 · 15 | 17.7 | 110 s | 0.9 GB |
| Turbo fine-tuned (turbo-md), 8-bit | before | 24 · 24 · 26 | 24.7 | 108 s | 0.9 GB |
| **Turbo fine-tuned (turbo-md), 8-bit** | **updated** | 30 · 30 · 27 · 27 · 28 · 30 | **28.7** | **108 s** | 0.9 GB |
| Large V3, 8-bit | updated | 26 · 27 · 26 · 24 (+ 2 runs at 17) | 25.8 | 151 s | 1.7 GB |

The fine-tuned model hears the drug names but spells them its own way ("miropineam", "amecacin", "clepsielă",
"deacarpul", "norodrimonina"), so `mom/minutes/lexicon.py` was widened to those spelling variants (tested in
`tests/test_lexicon.py`; Large V3's transcript only gained from it). The two Large V3 runs at 17 lost the whole
Bed 8 section: the scorer finds a patient by an anchor value (80/40 or 0.22), and when the minutes leave both out
all 15 facts count as missing; that part of the transcript is identical with the old and new lexicon.
Net: **+13% facts over the previous default at ~30% less transcription time**, and +62% over stock Turbo.
The lexicon was tuned on the same recording it is scored on, so expect a smaller gain on other meetings. In the first minute alone, stock Turbo skipped 28 s and hallucinated
"Să vă mulțumesc pentru vizionare", while the fine-tuned model wrote that part out ("infarct miocardic",
"trombospirația", "trivascular", "ruptura de cordaș"; drug names are still garbled, e.g. "norodrimonina", which
`mom/minutes/lexicon.py` then has to fix). English (CRCOG committee) comes out the same as stock Turbo and is still
detected as English; a Russian medical test sentence is still transcribed as Russian.

Limits: it was trained on formal parliament speech only (no hospital recordings, no Russian); one real meeting is
a small test set. The biggest further gain would be a few hours of real Moldovan ward speech with corrected
transcripts, trained on-premise — see "Suggested next steps" in `turbo-md-adapter/REPORT.md`.

## Minutes model and chunking (measured)

Compared with `bench/eval_minutes_models.py` on the Medpark transcript (fine-tuned Turbo, 44-fact check, 2 runs each)
and on `data/Medpark_audio_60min.mp3` (7,694 words, ~15k tokens — note: it is the 11.7-min handover repeated
about five times in shuffled pieces, so the same 44 facts apply and patients come back out of order).

| Model | chunking | 11.7 min: facts | LLM time | 60 min: facts | wait after transcript (60 min) |
|---|---|---|---|---|---|
| **gemma4:e4b** (default) | **cut at bed cues, ≤420 words, 4k context** | **28–31** | **72–76 s** | 21 | **42 s** |
| gemma4:e4b | cut at bed cues, ≤1200 words, 8k | 16 · 25 | ~70 s | 21 | 34 s |
| gemma4:e4b | 2000-word windows, model separates patients | 18 · 17 | ~58 s | – | – |
| gemma4:e4b | whole meeting in one call (32k context) | 22 · 17 | 41–73 s | 9 | 153 s |
| gemma4:e4b | ≤420 words + 2 samples merged | 29 · 30 | 141–166 s | – | – |
| gemma4:e4b | ≤420 words + patients re-identified by content | 25 · 26 | ~83 s | 22 · 22 | 46–48 s |
| qwen3:8b | cut at bed cues, ≤420 words | 21 · 21 | 140–174 s | – | – |
| qwen3:8b | whole meeting | 15 · 15 | 99–142 s | – | – |
| qwen3:4b | cut at bed cues, ≤420 words | 22 · 21 | 62–88 s | – | – |
| qwen3:4b | whole meeting | 4 · 9 | 39–59 s | – | – |

Conclusions: bigger chunks and one long call are **less** accurate with every model that fits in 16 GB (they
report fewer details per patient and merge patients), and one long call makes the user wait for all of it after
the transcript. Short chunks cut at bed changes are extracted **while Whisper is still running** (live mode), so
for 60 minutes of audio only ~42 s of the ~7 min of LLM work remains after the transcript; the hour itself is
dominated by speaker detection (709 s) and transcription (726 s). Qwen3 is weaker than Gemma 4 E4B on this Romanian
data (Qwen3 8B also 2x slower). Two samples per chunk: +1 fact for 2x the time. Content re-identification of
patients (`MinutesBuilder(reidentify=True)`): +1 on the shuffled hour, −4 on the normal meeting, so it stays off.
The real weakness on long meetings is patient identity when a patient is discussed again without a bed number
being said (21 facts on the hour vs ~29 on the single meeting).

### Where the time goes, and live minutes

Pyannote alone is linear (12 min of audio 57 s, 24 min 113 s; 95% of it computing voice embeddings), and Whisper
(fine-tuned Turbo) alone needs ~43 s for 12 min. Both run on the same Apple GPU, and together with the minutes
LLM they slow each other down (Whisper takes ~118 s for 12 min next to pyannote). Speakers first, then Whisper
(`--sequential`) is not faster for 12 min (116 vs 118 s) but is for 60 min (629 vs 730 s).

Whisper's encoder on the Neural Engine instead (whisper.cpp built with Core ML, `WHISPER_CLI=/path/to/whisper-cli`,
encoder converted from the fine-tuned model) freed the GPU for pyannote (65 vs 96 s) but was slower itself
(116 vs 101 s for 12 min: 2.6 s per 30 s window on the Neural Engine) and changed the words slightly (fp16), so the
Metal build stays the default on an M4 Air.

Speaker detection gates every speaker-labelled line, so minutes built from those lines only started once pyannote
was done. The minutes now get Whisper's text as soon as it is recognized (`transcribe_dialog_file(on_text=...)`;
the speakers are not needed for the facts: 28 · 27 · 29 facts without speaker labels vs 28–31 with them).
Measured end to end (`bench/eval_live_minutes.py`):

| | minutes fed with | audio stages | minutes still running after them | total | facts |
|---|---|---|---|---|---|
| 11.7 min | speaker-labelled lines (before) | 146 s | 83 s | 230 s | 29 |
| 11.7 min | **Whisper's text at once** | 179 s | **34 s** | **212 s** | 29 |
| 60 min | speaker-labelled lines (before) | 666 s | 412 s | 1078 s | 16 |
| 60 min | **Whisper's text at once** | 839 s | **177 s** | **1016 s** | 19 |

## Medical dictionaries: ICD-10 (RO / RU / EN) and DRG

`mom/medical/data/icd10.tsv` (11,998 ICD-10 codes with Romanian, Russian and English names) and `drg.tsv`
(659 DRG groups, AR-DRG codes as used in Moldova, Romanian names, MDC, relative value) are built from public
sources by `scripts/build_medical_dicts.py` (sources listed in the script); the app only reads the files.

- **Code suggestions in the minutes** (medical meetings): per patient, a "Diagnosis codes (suggested)" block with
  the principal + secondary ICD-10 diagnoses and an estimated DRG family (`mom/medical/coding.py`). The LLM names
  the conditions and guesses codes, the dictionary turns the guesses into codes that exist and adds the codes whose
  names match (in all three languages), then the LLM chooses — only among real codes. The DRG family comes from the
  principal diagnosis' major diagnostic category; the A/B/C split needs a real grouper and is left to the coder.
- **Code search** in the editor (`GET /api/codes?q=`): by code prefix or words in any of the three languages,
  tolerant to case endings ("дыхательной недостаточности", "insuficientei respiratorii" -> J96).

Measured on the Medpark minutes (3 minutes runs × 3 patients; `bench/eval_coding.py`, reference coding by a
clinical reading of the recording, not by a certified coder):

| Coding method | core diagnoses found | wrong codes | codes that do not exist | time / patient |
|---|---|---|---|---|
| LLM alone | 8/21 | 18/34 (53%) | 13 | ~4 s |
| dictionary word match + LLM choice | 13/21 | 20/36 (56%) | 0 | ~9 s |
| **LLM guess, verified by the dictionary + word match** | **14/21** | **7/38 (18%)** | **0** | ~9 s |

Adds ~30 s to the Medpark processing (4 topics, 2 at a time; topics that are not a patient are skipped).

Tried and rejected (measured on Medpark, fine-tuned Turbo + lexicon = 28.7 facts):
- **Vocabulary prompt for Whisper** (ICU terms from the dictionaries, `bench/eval_pipeline.py --prompt`): 20.0
  facts. whisper.cpp only applies a prompt with text context, and with context Turbo merged a 42 s stretch into one
  garbled line — exactly the loss `-mc 0` prevents. Spelling of a few drugs improved, the rest got worse.
- **Correcting transcript words against the dictionary** (fuzzy match of rare words to ICD names): loose settings
  changed correct Romanian word forms ("antibioticul" -> "antibiotice", "metrala" -> "mentala"); strict settings
  changed one word in the whole meeting. Romanian and Russian inflection make a disease list a poor spelling
  dictionary; the targeted rules in `mom/minutes/lexicon.py` stay.

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
.venv/bin/python -m mom.minutes meeting_dialog.txt --type medical --out out/meeting
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

How it works (`mom/minutes/`, overview in `builder.py`): the transcript is normalized with a medical lexicon of ASR errors (e.g.
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

## Web app API (`python -m api`)

The web app in `../frontend` talks to this server over HTTP. The API calls the same pipeline as
`dialog --minutes` (whole-file Whisper + pyannote in parallel, minutes built live) and keeps everything in
`storage/` (gitignored: it holds recordings, transcripts and patient data).

```bash
.venv/bin/python -m api                 # http://127.0.0.1:8000  (--host / --port to change)
cd ../frontend && npm run dev           # http://localhost:5173, forwards /api to the server
```

Sign-in is email + password; the session is an HttpOnly cookie (12 h, extended while used). On first start the
four demo accounts (Elena Rusu, Ion Bivol, Natalia Popescu, Igor Munteanu, `@medpark.md`) are created with the
password from `SEED_PASSWORD` in `.env` (default `demo`) — change it before real use.

| Route | Who | What |
|---|---|---|
| `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/logout` | everyone | sign in, restore after reload, sign out |
| `POST /api/meetings` (multipart `file`, `title`, `type`, `language`, `speakers`) | moderator | upload; queued for processing |
| `GET /api/meetings` · `GET /api/meetings/{id}` | everyone | participants only see ready minutes |
| `GET /api/meetings/{id}/progress?after=N` | moderator | stages, % transcribed, transcript lines after N |
| `POST /api/meetings/{id}/retry` · `DELETE /api/meetings/{id}` | moderator | after a failure (only the minutes are redone when the transcript exists) |
| `GET` / `PUT /api/meetings/{id}/minutes` | read: everyone · save: moderator | the editable document; `PUT` needs the current `version` (409 otherwise) |
| `POST /api/meetings/{id}/approve` | moderator | locks the minutes and emails the attendees |
| `GET /api/meetings/{id}/deliveries` · `POST …/deliveries/retry` | moderator | email status per attendee, resend failed |
| `GET /api/users` · `GET /api/meetings/{id}/attendees` | moderator · everyone who can open it | directory, who attended |
| `GET /api/meetings/{id}/transcript` · `/audio` | everyone who can open it | dialog lines, the recording |
| `GET` / `POST /api/meetings/{id}/suggestions` · `POST …/{sid}/resolve` | participants suggest, moderator resolves | |

### Emailing the approved minutes (local Mailpit only)

When the moderator approves minutes, every attendee (ticked in the Participants section) gets them by email:
HTML with the summary, their own tasks and every topic, a plain-text copy and the minutes as a `.md` file.
Mail only ever goes to a **local** relay: [Mailpit](https://mailpit.axllent.org) on this computer catches it and
shows it in a web inbox, nothing leaves the machine.

```bash
brew install mailpit        # once
scripts/mailpit.sh          # SMTP 127.0.0.1:1025, inbox http://127.0.0.1:8025 (both bound to this computer)
```

`SMTP_HOST` / `SMTP_PORT` / `MAIL_FROM` / `APP_URL` in `.env` change the relay, the sender and the link in the
email. The API **refuses to start** with a relay that is not local (loopback, private network, or a `.local` /
`.internal` name that also resolves to a local address): Gmail, Outlook, SendGrid or any other external SMTP
would be an external call. If the relay is down, the emails show as failed in the minutes header and can be
retried there (`POST /api/meetings/{id}/deliveries/retry`).

Participants see only the meetings they are ticked as attendees of.

Meetings are processed one at a time (the GPU is shared), in upload order. The minutes are stored as a
document of topics, each with blocks (text, list, tasks, codes) that the moderator edits in the browser;
`api/convert.py` turns the `mom` minutes into that shape (status, findings, decisions, tasks, open issues;
values not found in the transcript are marked). If Ollama is down, the transcript is kept and the meeting can be
retried once it is back. Interactive API docs: http://127.0.0.1:8000/docs.

## Code layout

The code is the `mom` package, in layers. A layer only imports the layers below it, so the building blocks
can be reused (by the CLI today, by an HTTP API for the frontend later) without pulling in the CLI.

```
cli/  api/      command line · HTTP API for the web app (api/ is its own package next to mom/)
  ↓
pipeline/       audio file -> transcript / speaker dialog      minutes/   dialog -> Minutes of Meeting
  ↓                                                               ↓
asr/            speech-to-text engines     diarization/  who spoke when     dialog/  words + turns -> lines
llm/            Ollama client + JSON-schema helpers        audio/        convert, record, cut clips
  ↓
config.py       paths, model files, settings (.env)
```

```
server/
├── main.py                   shortcut for `python -m mom`
├── api/                      HTTP API (python -m api): app · routes/ · db (SQLite) · jobs (queue) · convert
│                             mailer (local-only SMTP) · email_render (minutes -> email)
├── scripts/                  mailpit.sh (local mail catcher) · build_turbo_md.sh (fine-tuned Whisper -> models/) ·
│                             build_medical_dicts.py (ICD-10 / DRG dictionaries -> mom/medical/data/)
├── turbo-md-adapter/         LoRA adapter + training / evaluation scripts of the fine-tuned Whisper
├── storage/                  web app data: app.db + meetings/<id>/ (gitignored, patient data)
├── pyproject.toml            pytest settings
├── requirements.txt
├── .env.example              HF_TOKEN (copy to .env)
├── mom/
│   ├── config.py             model paths, Ollama host, default models, .env reader
│   ├── cli/                  parser.py (arguments) · commands.py (transcribe / dialog / record) · output.py
│   ├── pipeline/
│   │   ├── whole_file.py     default dialog: one whisper-cli run + pyannote in parallel, live lines
│   │   ├── per_turn.py       dialog with every speaker turn transcribed on its own
│   │   ├── plain.py          transcript without speakers, automatic language per piece
│   │   └── parallel.py       several engines side by side, results in order
│   ├── asr/
│   │   ├── whisper_cli.py    whisper-cli over a whole file, word timestamps
│   │   ├── whisper_server.py keeps Whisper loaded for many short clips
│   │   ├── gemma.py          Gemma 4 speech-to-text via Ollama
│   │   ├── engines.py        engine names -> engine objects
│   │   ├── language.py       main language of a RO/RU/EN recording
│   │   └── types.py          Word, Segment, Transcript
│   ├── diarization/
│   │   ├── pyannote.py       pyannote community-1 on the Apple GPU
│   │   └── turns.py          Turn, merging fragment speakers, SPEAKER N labels
│   ├── dialog/
│   │   ├── align.py          whole-file words -> speaker lines, sentence by sentence
│   │   ├── blocks.py         speaker turns -> blocks to transcribe (per-turn mode)
│   │   ├── cleanup.py        Whisper artifacts and repetition loops
│   │   ├── formats.py        txt / srt / json
│   │   └── types.py          Block, Utterance
│   ├── minutes/
│   │   ├── builder.py        MinutesBuilder: chunk -> extract -> merge -> finalize
│   │   ├── live.py           LiveMinutes: builds the minutes while Whisper still runs
│   │   ├── cues.py           where a new patient / agenda item starts
│   │   ├── lexicon.py        medical ASR fixes, spoken numbers, drug names
│   │   ├── matching.py       filler removal, duplicates, value checks, timestamps
│   │   ├── prompts.py        system prompts and answer schemas
│   │   ├── transcript.py     read dialog .txt, lines for the LLM
│   │   ├── participants.py   speaker roles guessed by the LLM, legend
│   │   ├── markdown.py       minutes -> Markdown
│   │   └── __main__.py       python -m mom.minutes
│   ├── medical/              dictionary.py (ICD-10 RO/RU/EN + DRG, search) · coding.py (codes per patient) · data/
│   ├── llm/                  ollama.py (client) · schema.py · summary.py (--summarize)
│   └── audio/                convert.py (ffmpeg) · record.py (microphone) · clips.py (split, WAV bytes)
├── tests/                    unit tests: .venv/bin/python -m pytest
├── bench/                    eval_minutes / eval_speakers / eval_pipeline / eval_engines + their results
├── models/                   Whisper / VAD model files (gitignored, see Models to install)
├── data/                     recordings and transcripts (gitignored, may contain patient data)
└── out/                      results (gitignored)
```
