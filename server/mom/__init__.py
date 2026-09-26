"""mom: on-premise Minutes of Meeting - speech-to-text, speaker dialog and minutes, all local.

Layers (each one only imports the layers below it):
  cli/                 command line (python -m mom), writes results next to --out
  pipeline/ minutes/   use cases: audio -> dialog, dialog -> minutes
  asr/ diarization/ dialog/ llm/ audio/   building blocks (models, text processing, I/O)
  config.py            paths, model files, settings
"""
