# Language ID test (Romanian / Russian / English), for a Mac

The language detector of the GIGAHACK26 speech-to-text pipeline, on its own: it says **which language is spoken
when** in a recording. Everything runs offline, on the CPU, nothing is uploaded.

**Tester: start with [`GUIDE.md`](GUIDE.md)**: step by step what to install, record, run and send back.

| File | What |
|---|---|
| `GUIDE.md` | step-by-step instructions (setup, tests, what to send back, troubleshooting) |
| `TEST_SCRIPT.md` | a 3-minute ward handover in Romanian, Russian and English to record, with the right answers |
| `RESULTS_TEMPLATE.md` | the form to fill in and send back |
| `run_lid.py` | the program you run |
| `samples/russian_sova.wav` | a Russian sample to check that the setup works |

- `stt/lid.py`: the same file the pipeline uses.
- `models/lang-id-voxlingua107-ecapa/`: SpeechBrain VoxLingua107 (ECAPA embeddings, 85 MB).
- `models/lid/lid_head.npz`: our Romanian / Russian / English head on top of it, trained with Moldovan speakers
  (ROMPAR) and room noise. Accuracy on held-out data in `models/lid/lid_report.json`: on 3 s windows it is right on
  ~96% of Moldovan Romanian and ~98% of Russian and English.

## Setup (once, ~5 min)

Python 3.10-3.12 (`brew install python@3.12` if needed):

```bash
cd lid_mac_test
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Run

```bash
.venv/bin/python run_lid.py samples/russian_sova.wav        # check that it works: Russian
.venv/bin/python run_lid.py /path/to/meeting.m4a --json meeting_lid.json
```

Any audio/video format works (m4a/mp3/mp4 are converted with macOS's built-in `afconvert`). The first run takes
longer (loading PyTorch).

Expected on the sample (3 clips of spontaneous Russian, 28 s): about 21 s heard as `ru`. The rest stays `ro`
on purpose: a short or unsure stretch keeps the meeting's language (`--main`, default `ro`), so that Moldovan
Romanian is not taken for Russian.

## What we want to know

1. **Speed on the Mac**: the last line, `language ID ... = X x real time`. On a Windows laptop CPU it is
   ~0.05-0.1 x real time; in the pipeline it runs next to Whisper, so it should stay well below Whisper's time.
   Please send the line together with the Mac model (e.g. MacBook Pro M4, 16 GB).
2. **Is it right?** On a recording where people switch between Romanian and Russian (or English): do the
   `[start - end] ru/en` stretches match where Russian/English is really spoken? And on an all-Romanian recording:
   nothing (or almost nothing) should be listed.

Send back the printed output (or the `--json` file) and a note on what was actually said where.

Sample audio: SOVA RuDevices test set (CC-BY-4.0, https://github.com/sovaai/sova-dataset); its text is in
`samples/russian_sova.json`.
