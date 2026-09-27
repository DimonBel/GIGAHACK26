#!/bin/sh
# Build models/ggml-turbo-md-q8_0.bin (whisper.cpp) from the Moldovan / Romanian LoRA adapter:
#   LoRA adapter -> merged into openai/whisper-large-v3-turbo -> ggml f16 -> 8-bit (q8_0)
# Needs: .venv with torch, transformers, peft (pip install transformers peft), git, whisper-quantize (brew
# whisper-cpp). Downloads the base model (~1.6 GB) and the whisper.cpp / openai-whisper converter sources once.
set -e
cd "$(dirname "$0")/.."
ADAPTER=${1:-turbo-md-adapter/adapter}
WORK=${WORK:-build/turbo-md}
OUT=models/ggml-turbo-md-q8_0.bin
mkdir -p "$WORK"

echo "[1/4] merging $ADAPTER into whisper-large-v3-turbo"
.venv/bin/python turbo-md-adapter/merge_adapter.py "$ADAPTER" "$WORK/merged"
# The converter reads vocab.json / added_tokens.json; newer transformers only write tokenizer.json.
# LoRA does not touch the tokenizer, so the base model's files are the right ones.
.venv/bin/python - "$WORK/merged" <<'PY'
import shutil, sys
from huggingface_hub import hf_hub_download
for f in ("vocab.json", "added_tokens.json"):
    shutil.copy(hf_hub_download("openai/whisper-large-v3-turbo", f), f"{sys.argv[1]}/{f}")
PY

echo "[2/4] converter sources"
[ -d "$WORK/whisper.cpp" ] || git clone -q --depth 1 https://github.com/ggml-org/whisper.cpp.git "$WORK/whisper.cpp"
[ -d "$WORK/openai-whisper" ] || git clone -q --depth 1 https://github.com/openai/whisper.git "$WORK/openai-whisper"

echo "[3/4] converting to ggml (f16)"
.venv/bin/python "$WORK/whisper.cpp/models/convert-h5-to-ggml.py" "$WORK/merged" "$WORK/openai-whisper" "$WORK" > /dev/null

echo "[4/4] quantizing to 8-bit"
whisper-quantize "$WORK/ggml-model.bin" "$OUT" q8_0 > /dev/null 2>&1
echo "done: $OUT  (use: --model turbo-md)"
