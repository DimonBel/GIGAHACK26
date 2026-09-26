"""Local LLM access (Ollama): structured chat, schema helpers, summaries."""
from .ollama import chat, ping
from .summary import summarize

__all__ = ["chat", "ping", "summarize"]
