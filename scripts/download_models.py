"""Download the local models once (needs internet; afterwards they load offline).

    .venv/bin/python scripts/download_models.py          # English accent model (~83 MB)
    .venv/bin/python scripts/download_models.py --mlx    # also Whisper for --engine mlx (~4.6 GB, Apple Silicon)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from huggingface_hub import snapshot_download  # noqa: E402

from stt.config import ACCENT_MODEL  # noqa: E402

MODELS = {
    ACCENT_MODEL: "Jzuluaga/accent-id-commonaccent_ecapa",  # English accent ID, 16 accents (~83 MB)
}


def main():
    if "--mlx" in sys.argv:
        from stt.asr.mlx import MLX_MODELS
        for repo in sorted(set(MLX_MODELS.values())):
            print(f"{repo} -> Hugging Face cache")
            snapshot_download(repo)
    for folder, repo in MODELS.items():
        print(f"{repo} -> {folder}")
        # Only fetches files that are missing or incomplete, so re-running repairs an interrupted download.
        snapshot_download(repo, local_dir=str(folder), local_dir_use_symlinks=False,
                          allow_patterns=["*.yaml", "*.ckpt", "*.txt", "*.json"])
    print("Done. The models load without internet.")


if __name__ == "__main__":
    main()
