#!/bin/bash
# Build models/mlx-turbo-md (the MLX model the app uses by default) from the fine-tune's LoRA adapter.
#   scripts/install_finetuned.sh path/to/turbo-md-adapter.tar
# Needs internet once (base model and tools); uses a throwaway venv, the project's .venv is not touched.
set -euo pipefail
MLX_EXAMPLES_COMMIT=796f5b53cab69a3d48a44233ce21aae889e94a08 # ml-explore/mlx-examples, pinned: its convert.py runs here
ADAPTER_TAR="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
tar -xf "$ADAPTER_TAR"
python3.12 -m venv venv
venv/bin/pip install -q torch "transformers==4.57.*" "peft==0.21.*" safetensors numpy "mlx==0.32.2" tiktoken numba scipy more-itertools tqdm huggingface_hub
venv/bin/python merge_adapter.py adapter merged
git clone -q --filter=blob:none https://github.com/ml-explore/mlx-examples
git -C mlx-examples checkout -q "$MLX_EXAMPLES_COMMIT"
rm -rf "$ROOT/models/mlx-turbo-md"
venv/bin/python mlx-examples/whisper/convert.py --torch-name-or-path merged --mlx-path "$ROOT/models/mlx-turbo-md" --dtype float16
mv "$ROOT/models/mlx-turbo-md/model.safetensors" "$ROOT/models/mlx-turbo-md/weights.safetensors"
echo "Installed $ROOT/models/mlx-turbo-md"
