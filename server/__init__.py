"""Secure MOM backend: FastAPI over the local speech pipeline (stt/), SQLite storage, n8n / SMTP delivery."""
from stt.config import offline

offline()  # before anything imports a Hugging Face library: they read these variables at import
