#!/bin/bash
# Fine-tuning with automatic resume from the last checkpoint after a crash (up to 20 attempts).
cd ~/test2
export HF_HUB_DISABLE_PROGRESS_BARS=1
for attempt in $(seq 1 20); do
  echo "=== attempt $attempt $(date)" >> finetune.out
  .venv/bin/python finetune_whisper.py --out runs/turbo-md --cache runs/cache --epochs 3 --val-clips 330 \
      --batch 1 --accum 16 --no-grad-ckpt >> finetune.out 2>&1 && { echo "=== finished $(date)" >> finetune.out; touch FINISHED; exit 0; }
  echo "=== exited with error, retrying in 60 s" >> finetune.out; sleep 60
done
echo "=== gave up after 20 attempts" >> finetune.out
