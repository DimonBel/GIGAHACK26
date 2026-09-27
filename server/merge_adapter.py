"""Merge the LoRA adapter into whisper-large-v3-turbo -> a normal Hugging Face model folder (for MLX / ggml conversion).

  pip install torch transformers peft
  python merge_adapter.py adapter merged
"""
import sys

from peft import PeftModel
from transformers import WhisperForConditionalGeneration, WhisperProcessor

BASE = "openai/whisper-large-v3-turbo"
adapter, out = sys.argv[1], sys.argv[2]

model = PeftModel.from_pretrained(WhisperForConditionalGeneration.from_pretrained(BASE), adapter).merge_and_unload()
model.generation_config.forced_decoder_ids = None
model.save_pretrained(out, safe_serialization=True)
WhisperProcessor.from_pretrained(BASE).save_pretrained(out)
print("merged model saved to", out)
