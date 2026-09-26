"""Word error rate of a transcript against a reference (a human-checked transcript of the same recording).

    .venv/bin/python scripts/evaluate.py reference.txt transcript.txt [--show 10]

Both files can be plain text or any of our outputs: timestamps, "SPEAKER n:", language tags like
"[ro+ru]" and punctuation are ignored, case too, and ş/ţ count as ș/ț. If the reference covers only
the start of the recording, the transcript is cut where the reference ends. Prints the word error rate
(WER: substituted + deleted + inserted words, per reference word), the same without diacritics, and
the stretches with the most errors, to see what to improve.
"""
import argparse
import difflib
import re
import unicodedata
from pathlib import Path


def words(text: str, diacritics: bool = True) -> list:
    text = re.sub(r"\[[^\]]*\]", " ", text)  # [00:00:01 - 00:00:05], [ro+ru], [en, American]
    text = re.sub(r"SPEAKER \d+:?", " ", text)
    text = text.lower().replace("ş", "ș").replace("ţ", "ț")
    if not diacritics:
        text = "".join(c for c in unicodedata.normalize("NFD", text) if not unicodedata.combining(c))
    return re.findall(r"\w+", text)


def word_errors(ref: list, hyp: list) -> int:
    """Levenshtein distance between two word lists."""
    previous = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        current = [i]
        for j, h in enumerate(hyp, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (r != h)))
        previous = current
    return previous[-1]


def cut_to_reference(ref: list, hyp: list) -> list:
    """The part of hyp that matches ref, when ref covers only the start of the recording."""
    matcher = difflib.SequenceMatcher(None, ref, hyp, autojunk=False)
    last = max((b.b + b.size for b in matcher.get_matching_blocks() if b.size), default=len(hyp))
    return hyp[:min(len(hyp), last + 5)]


def worst_stretches(ref: list, hyp: list, show: int) -> list:
    matcher = difflib.SequenceMatcher(None, ref, hyp, autojunk=False)
    wrong = [op for op in matcher.get_opcodes() if op[0] != "equal"]
    wrong.sort(key=lambda op: max(op[2] - op[1], op[4] - op[3]), reverse=True)
    return [(" ".join(ref[i1:i2]), " ".join(hyp[j1:j2])) for _, i1, i2, j1, j2 in wrong[:show]]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("reference")
    p.add_argument("transcript")
    p.add_argument("--show", type=int, default=10, help="how many of the worst stretches to print")
    args = p.parse_args()
    ref_text = Path(args.reference).read_text(encoding="utf-8")
    hyp_text = Path(args.transcript).read_text(encoding="utf-8")

    for label, diacritics in (("WER", True), ("WER without diacritics", False)):
        ref = words(ref_text, diacritics)
        hyp = cut_to_reference(ref, words(hyp_text, diacritics))
        errors = word_errors(ref, hyp)
        print(f"{label:22} {errors / max(len(ref), 1):6.1%}  ({errors} errors / {len(ref)} reference words)")

    ref, hyp = words(ref_text), words(hyp_text)
    print("\nWorst stretches (reference -> transcript):")
    for said, written in worst_stretches(ref, cut_to_reference(ref, hyp), args.show):
        print(f"  - {said or '(nothing)'}\n    {written or '(nothing)'}")


if __name__ == "__main__":
    main()
