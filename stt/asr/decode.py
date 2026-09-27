"""Whisper output to words: token merging, loop and invention filters, confidence."""
import math
import re
import zlib

from .transcript import Word, plain_text

MAX_COMPRESSION = 2.4  # text that compresses this well is a Whisper loop (as in OpenAI's Whisper)
# Letters that are neither Latin (with ă â î ș ț) nor Cyrillic: invented in a ro/ru/en meeting.
OTHER_SCRIPTS = re.compile(r"[^\W\d_A-Za-zÀ-ɏḀ-ỿЀ-ӿ]")
# Phrases Whisper invents on noise (learned from subtitles).
HALLUCINATIONS = re.compile(r"субтитр|продолжение следует|спасибо за просмотр|подпишитесь на канал|subtitr|"
                            r"mulțum\w* (pentru|de) vizionare|nu uitați să (dați like|vă abonați)|abonați-vă|"
                            r"thanks? (you )?for watching|please subscribe|like and subscribe", re.IGNORECASE)


def parse_verbose(result: dict, offset: float) -> list:
    """verbose_json -> [[start, end, [Word]]] per Whisper segment, shifted by offset seconds.

    A token starting with a space, or after a bare " " token, starts a word ("țesut" comes as " ", "ț", "esut").
    Repeated phrases are kept once; a segment repeating one of the last three, empty segments and invented
    subtitle phrases are dropped."""
    out, new_word = [], False
    for seg in result.get("segments", []):
        words = []
        for tok in seg.get("words", []):
            text = tok["word"]
            if text.strip().startswith("[_"):  # [_BEG_], [_TT_n]
                continue
            if not text.strip():
                new_word = True
                continue
            start, end = offset + tok["start"], offset + tok["end"]
            if not (new_word or text.startswith(" ")) and (words or out):
                prev = words[-1] if words else out[-1][2][-1]
                prev.text += text
                prev.end = end
                prev.prob = min(prev.prob, tok["probability"])
                if not words:
                    out[-1][1] = max(out[-1][1], end)
            else:
                words.append(Word(start, end, text.strip(), prob=tok["probability"]))
            new_word = False
        words = collapse_repeats(words)
        recent = {_key(ws) for _, _, ws in out[-3:]}
        if words and not HALLUCINATIONS.search(plain_text(words)) and _key(words) not in recent:
            out.append([offset + seg["start"], offset + seg["end"], words])
    return out


def looping(verbose: dict) -> bool:
    """Whisper repeated a phrase, spelled a little differently each time: the text compresses too well."""
    text = "".join(tok["word"] for seg in verbose.get("segments", []) for tok in seg.get("words", [])
                   if not tok["word"].strip().startswith("[_")).encode()
    return len(text) / max(len(zlib.compress(text)), 1) > MAX_COMPRESSION


def capitalize(words: list, sentence_start: bool) -> bool:
    """Capitalize sentence starts; returns whether the last word ends a sentence."""
    for w in words:
        if sentence_start and w.text[:1].islower():
            w.text = w.text[0].upper() + w.text[1:]
        sentence_start = w.text.endswith((".", "?", "!", "…"))
    return sentence_start


def collapse_repeats(words: list, min_repeats: int = 3, max_len: int = 8) -> list:
    """Keep once (the last copy) a phrase of up to max_len words repeated min_repeats+ times in a row."""
    keys = [re.sub(r"\W", "", w.text.lower()) for w in words]
    out, i = [], 0
    while i < len(words):
        for n in range(1, min(max_len, (len(words) - i) // min_repeats) + 1):
            repeats = 1
            while keys[i + repeats * n:i + (repeats + 1) * n] == keys[i:i + n]:
                repeats += 1
            if repeats >= min_repeats:
                out.extend(words[i + (repeats - 1) * n:i + repeats * n])
                i += repeats * n
                break
        else:
            out.append(words[i])
            i += 1
    return out


def confidence(words: list) -> float:
    """Mean log-probability of the words (-inf if none): ~-0.1 in the right language, below -0.3 in a wrong one."""
    if not words:
        return float("-inf")
    return sum(math.log(max(w.prob, 1e-6)) for w in words) / len(words)


def _key(words: list) -> str:
    return re.sub(r"\W+", " ", plain_text(words).lower()).strip()
