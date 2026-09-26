# GIGAHACK26 — Local Speech-to-Text

Offline speech-to-text with **Whisper**: on Apple Silicon Whisper Large V3 Turbo with **MLX** (the Apple GPU),
elsewhere **whisper.cpp** with Whisper Large V3. Everything runs locally — no cloud APIs.

## Setup

```bash
brew install whisper-cpp ffmpeg
mkdir -p models
curl -L -o models/ggml-large-v3.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
curl -L -o models/ggml-silero-v5.1.2.bin https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin
brew install python@3.12
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/download_models.py   # English accent model (~83 MB)
.venv/bin/python scripts/download_models.py --mlx   # Apple Silicon: Whisper for MLX (~4.6 GB)
```

Optional, faster model (Whisper Large V3 Turbo, 8-bit, ~870 MB), used with `--model models/ggml-large-v3-turbo-q8_0.bin`:

```bash
curl -L -o models/ggml-large-v3-turbo-q8_0.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin
```

## Usage

Transcribe a file (mp3, m4a, wav, mp4, ogg, ...):

```bash
.venv/bin/python main.py transcribe audio.mp3
.venv/bin/python main.py transcribe audio.mp3 --format json --out audio.json   # every word with its language
.venv/bin/python main.py transcribe audio.mp3 --lang ro --format srt --out audio.srt
.venv/bin/python main.py transcribe audio.mp3 --translate        # translate to English
```

Record from the microphone, then transcribe:

```bash
.venv/bin/python main.py record --seconds 10
```

Options: `--lang auto|en|ro|ru|...`, `--format txt|srt|timestamps|json`, `--out FILE`, `--model PATH`,
`--engine mlx|whisper.cpp` (default: mlx on Apple Silicon), `--ro-model PATH` (another model for the Romanian
pass), `--no-fix-words` (keep misheard words as Whisper wrote them).

## Languages: Romanian, Russian, English and the Moldovan mix

With `--lang auto` (default) the language is detected for every sentence, not once per file, so a
meeting that switches between Romanian, Russian and English is transcribed in the right language
throughout. Every line is tagged:

```
[ro] Bună ziua! Începem ședința de azi cu situația pacienților.
[ru] Хорошо, давайте сначала посмотрим анализы из реанимации.
[en, American] The deadline for the report is Friday.
[ro+ru] Bine, deci pacientul din salonul 8, короче, are nevoie de transfer.
```

How it works (all local, `stt/transcriber.py`):
1. Silero VAD finds the speech (`stt/segments.py`). Up to 28 s of speech, with the pauses cut out,
   makes one chunk: every Whisper run costs the same for any clip up to 30 s, so fewer, fuller chunks
   are faster. Times are mapped back to the recording.
2. Every chunk is transcribed in **Romanian**, the meetings' language, once. Whisper itself writes a
   clear Russian or English sentence as such, and Russian words Moldovans insert are written back in
   Cyrillic (step 5): for most chunks that is all.
3. Language ID doesn't settle the rest: Whisper's own guess and acoustic models (we tried SpeechBrain's
   VoxLingua107) call Moldovan-accented Romanian Russian, Ukrainian or Lithuanian, and Whisper forced
   into another language often *translates*, confidently. So another language only replaces a sentence
   when it is the same speech:
   - a sentence that is mostly not Romanian words (Russian heard as Latin-letter nonsense, "Cărășo,
     davaite") is compared with the chunk transcribed in Russian; the Russian sentence replaces it if
     Whisper is sure of it, it is real Russian, and it *sounds like* the nonsense (a translation
     doesn't);
   - when Whisper was unsure of a whole chunk, its language guess is asked (~2 s): at ≥ 0.9 Russian
     (Moldovan Romanian stays below 0.8) or English first, that language is tried;
   - Russian and English must also be clearly more confident than Romanian (`HANDICAP`).
4. Whisper's loops and inventions are cut: a phrase repeated 3+ times is kept once, a repeated sentence
   and subtitle phrases ("Субтитры сделал…", "Nu uitați să dați like…") are dropped.
5. Every word gets a language (`stt/codeswitch.py`). Russian words inside Romanian speech, which
   Whisper writes in Latin letters ("cisto", "Căroce", "Davai"), are written in Cyrillic ("чисто",
   "короче", "давай"): every chunk is also transcribed in Russian (with MLX that costs little, the audio
   is encoded once), and a word that isn't Romanian becomes the common Russian word said at the same
   moment that sounds the same; words in `stt/russianisms.txt`, the Russian words Moldovans commonly
   insert (add more there), are rewritten even without it. English terms inside Romanian ("deadline",
   "meeting") are tagged `en`.
6. Misheard Romanian words are corrected (`stt/spelling.py`): a word that is no word at all becomes the
   closest real or medical word, where vowels count as closer than consonants ("Pocentul" → "Pacientul",
   "metrala" → "mitrala", "gluconazol" → "fluconazol"). Medical terms are in `stt/medical_ro.txt`: add
   your ward's. In doubt a word stays as it was.
7. English speech gets its accent (American, British, Australian, Canadian, Indian, Irish, Scottish,
   ... 16 in total) from the local CommonAccent model (`stt/accent.py`).

`--format json` lists every word with its language. With `--lang ro` (or `ru`, `en`) every chunk is
transcribed once in that language (fastest), and words are still tagged.

Speed and accuracy on an Apple M5 (16 GB), measured on 15 minutes of Moldovan speakers with human
transcripts (ROMPAR, `scripts/benchmark.py`; word error rate, lower is better):

| Engine and model | Word errors | Speed |
|---|---|---|
| whisper.cpp, Large V3, beam 5 | 16.6% | 4.6x real time |
| **MLX, Large V3 Turbo, beam 5 (default on Apple Silicon)** | **14.7%** | **17.2x real time** |
| MLX, Large V3 Turbo, greedy | 15.8% | 22.8x real time |

The 11.7-minute Medpark meeting takes about 90 s to transcribe with MLX (246 s with whisper.cpp Large V3);
speaker detection runs at the same time. The runs are counted at the end. Other models tried: NVIDIA
Canary-1B-v2 and Parakeet-TDT-0.6B-v3 were not better on Medpark; a Whisper turbo fine-tuned on Moldovan
lessons (FraPiz, `--ro-model`) was worse on ROMPAR (22%) and writes Russian speech as Romanian-looking words
that can't be caught. Adapting the model to Moldovan speech needs a GPU server: see
[docs/finetuning.md](docs/finetuning.md).

Known limits: a sentence that switches language in the middle ("Poți să spui – самые дешевые
ноутбуки") comes out in one language; Russian speech that Whisper translates into fluent Romanian stays
Romanian unless Whisper's guess is very sure it is Russian; very similar accents get confused
(US/Canadian); a Russian word that is also Romanian ("vot" = vote / "вот") stays in Latin letters.

## Speaker dialog (who said what)

Detects the different speakers with **pyannote 3.1** (local, Apple GPU) and writes the
transcript as a dialog:

```
[00:00:00 - 00:00:03] SPEAKER 1 [ro]: Bună ziua. Cum vă simțiți azi? Aveți dureri în piept?
[00:00:03 - 00:00:07] SPEAKER 2 [ro+ru]: Da, de aseară, короче, mă doare în partea stângă.
[00:00:07 - 00:00:10] SPEAKER 1 [ro]: Bine. Facem un ECG și verificăm troponina.
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
stt/transcriber.py   speech chunks -> Whisper in the language it is most confident in, per sentence
stt/mlx_backend.py   Whisper on Apple Silicon (MLX), each chunk encoded once, beam search
stt/segments.py      Silero VAD speech segments (whisper-vad-speech-segments)
stt/codeswitch.py    word-level language tags, Russian words back to Cyrillic
stt/russianisms.txt  Russian words Moldovans insert into Romanian (extend it)
stt/spelling.py      corrects misheard Romanian words to the closest real word
stt/medical_ro.txt   medical terms for the spelling check (extend it)
stt/accent.py        English accent ID
stt/whisper_server.py keeps Whisper loaded in a local whisper-server
stt/diarizer.py      pyannote 3.1 speaker detection
stt/dialog.py        assigns words to speakers, dialog txt/srt/json output
stt/pipeline.py      convert -> diarize -> transcribe -> align
scripts/download_models.py  one-time download of the English accent model (--mlx: Whisper for MLX)
scripts/benchmark.py word error rate and speed on Moldovan speech (ROMPAR), to compare setups
scripts/evaluate.py  word error rate of a transcript against your own reference
tests/               unit tests (.venv/bin/python -m pytest tests)
stt/recorder.py      microphone recording (sounddevice)
stt/llm.py           optional Ollama summarization
models/              model files (gitignored)
```
