# Step-by-step guide for the tester (Mac)

About 30-45 minutes in total, most of it recording. You don't need to know programming: copy the commands into
**Terminal** exactly as written. Everything runs on your Mac, offline; nothing is uploaded anywhere.

What you will do:

| Step | What | Time |
|---|---|---|
| 1 | Install Python (only if you don't have it) | 5 min |
| 2 | Set up this folder | 5 min |
| 3 | Check that it works (Russian sample) | 1 min |
| 4 | Record the test script (`TEST_SCRIPT.md`) and run it | 15-20 min |
| 5 | Record 2-3 minutes of Romanian only and run it | 5 min |
| 6 | (Optional) run it on a longer real meeting, for the speed | 5 min |
| 7 | Fill in `RESULTS_TEMPLATE.md` and send it back | 5 min |

---

## 1. Install Python 3.12 (skip if `python3.12 --version` already works)

1. Open **Terminal** (Cmd + Space, type "Terminal", Enter).
2. Type `python3.12 --version` and press Enter. If it prints `Python 3.12.x`, go to step 2.
3. Otherwise download the macOS installer of **Python 3.12** from https://www.python.org/downloads/macos/
   (the "macOS 64-bit universal2 installer"), open it and click through. Then close and reopen Terminal.
   (With Homebrew instead: `brew install python@3.12`.)

Use 3.12 (3.10 and 3.11 also work). Not 3.13 or newer: some packages are not ready for it.

## 2. Set up the folder (once)

1. Unzip `lid_mac_test.zip` (double-click it), e.g. into your Downloads folder.
2. In Terminal, go into the folder. Type `cd ` (with a space), drag the `lid_mac_test` folder from Finder onto the
   Terminal window, press Enter.
3. Create a private Python environment and install the packages (a few hundred MB, mostly PyTorch; 3-5 minutes):

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

If macOS asks to install "command line developer tools", click Install and run the second command again.

## 3. Check that it works

```bash
.venv/bin/python run_lid.py samples/russian_sova.wav
```

The first run takes up to a minute (loading PyTorch). You should see stretches marked `ru` and at the end a line like:

```
Time: reading audio 0.0 s, loading the model 5.1 s, language ID 1.2 s = 0.040 x real time (arm64, macOS-...)
```

About 21 of the 28 seconds should be `ru`. That's expected: short, unsure stretches keep the meeting's
language (Romanian), so Moldovan Romanian isn't taken for Russian.

## 4. Record the test script and run it

This is the main test: a mock ward meeting where people switch between Romanian, Russian and English. The script
says for every line which language it is, so we know the right answer.

1. Open `TEST_SCRIPT.md` and read the recording tips there.
2. Record it with **Voice Memos** or **QuickTime Player** (File → New Audio Recording), in a normal room, the
   Mac or phone 1-2 m from the speakers. Save/export it as e.g. `script_take1.m4a` into the `lid_mac_test`
   folder.
3. Run:

```bash
.venv/bin/python run_lid.py script_take1.m4a --json script_take1.json
```

4. Compare the printed `ru` / `en` stretches with the script: the `[RU]` and `[EN]` lines should appear, in
   order, and no `[RO]` line should be listed. Note the result in `RESULTS_TEMPLATE.md`.

If you can, record it a second time with some background noise (door open, people talking, a fan) as
`script_take2.m4a` and run it the same way.

## 5. Romanian only

Record 2-3 minutes of ordinary Romanian conversation (any topic, two people talking naturally, as you would in a
meeting). Then:

```bash
.venv/bin/python run_lid.py romanian_only.m4a --json romanian_only.json
```

Ideally it prints `Everything heard as 'ro'`, or only a few seconds of `ru`/`en`. Note how many seconds.

## 6. (Optional) speed on a long recording

If you have a longer recording (30-60 min) you are allowed to use, run it the same way and note the `Time:` line.
**Don't send us that recording if it contains patient or personal information**: the printed output is enough.

## 7. Send back

- `RESULTS_TEMPLATE.md`, filled in;
- the `.json` files from steps 4-6;
- the script recordings from step 4 (`script_take1.m4a`, `script_take2.m4a`) and the Romanian-only recording, if
  everyone who speaks on them agrees. They contain only the script, so no patient data, and we will use them
  to test the whole speech-to-text pipeline too.

## Troubleshooting

| Problem | Fix |
|---|---|
| `command not found: python3.12` | Step 1; close and reopen Terminal after installing. |
| `No such file or directory: run_lid.py` | You are not in the folder: redo step 2.2 (`cd ` + drag the folder). |
| pip error while installing torch | Check `python3.12 --version`; with Python 3.13+ install 3.12 and redo step 2.3. |
| `Can't read this format` | Export the recording as m4a or WAV from Voice Memos / QuickTime. |
| Very slow (more than 0.3 x real time) | Close other heavy apps and run it again; note it in the results anyway. |
| Anything else | Copy the whole Terminal output into the results file. |
