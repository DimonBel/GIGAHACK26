"""ICD-10 codes and a DRG group suggested for each patient of the minutes, chosen from the dictionaries.

1. Candidates: the ICD-10 codes whose names (RO / RU / EN) share the most rare word stems with the patient's
   facts - from the whole text and from each fact on its own, so a single finding is not drowned out.
2. The local LLM picks the principal diagnosis and up to 6 secondary ones - only from those candidates (enforced
   by the JSON schema), so it cannot write a code that does not exist.
3. DRG: the principal diagnosis gives the major diagnostic category (MDC); the LLM picks the medical DRG family
   of that MDC that fits. The split (A/B/C: with or without complications) needs a real grouper, so the family
   is reported with its variants. Everything is a suggestion for the coder.
"""
import re
import time

from ..config import MINUTES_MODEL
from ..llm.ollama import chat
from .dictionary import candidates, drg_groups, icd10, label

MAX_CANDIDATES = 40
PER_FACT = 4

# Principal diagnosis (ICD-10 range) -> MDC, following the AR-DRG allocation at chapter / block level.
MDC_RANGES = [
    ("F10", "F19", 20), ("F00", "F99", 19), ("I60", "I69", 1), ("G47", "G47", 4), ("G00", "G99", 1),
    ("C70", "C72", 1), ("H00", "H59", 2), ("H60", "H95", 3), ("J00", "J06", 3), ("J30", "J39", 3),
    ("C00", "C14", 3), ("C30", "C32", 3), ("C33", "C34", 4), ("C78", "C78", 4), ("A15", "A16", 4),
    ("J00", "J99", 4), ("R04", "R09", 4), ("R91", "R91", 4), ("I00", "I99", 5), ("R00", "R03", 5),
    ("R57", "R57", 5), ("K70", "K87", 7),
    ("C22", "C25", 7), ("K00", "K14", 3), ("K00", "K93", 6), ("C15", "C21", 6), ("R10", "R19", 6),
    ("M00", "M99", 8), ("L00", "L99", 9), ("C43", "C44", 9), ("C50", "C50", 9), ("N60", "N65", 9),
    ("E00", "E90", 10), ("N40", "N53", 12), ("C60", "C63", 12), ("N70", "N98", 13), ("C51", "C58", 13),
    ("N00", "N39", 11), ("C64", "C68", 11), ("R30", "R39", 11), ("O00", "O99", 14), ("P00", "P96", 15),
    ("D50", "D89", 16), ("C81", "C96", 17), ("D45", "D47", 17), ("T20", "T32", 22), ("S00", "T98", 21),
    ("A00", "B99", 18), ("R50", "R50", 18), ("Z00", "Z99", 23), ("R00", "R99", 23),
]

ICD_SYSTEM = """You are a clinical coder. From the facts of one patient discussed in an ICU meeting, choose the ICD-10 \
codes of the conditions that are stated or clearly shown by the facts. Choose only from the candidate list. \
principal: the main condition treated in the ICU. secondary: other current conditions (at most 6), most important \
first. Leave out conditions that are only suspected, ruled out or not current. Prefer the most specific code. \
When an infection's organism is named, add the organism code too (B95-B97)."""

DRG_SYSTEM = """You are a clinical coder. Choose the DRG family that fits the patient's episode, given the principal \
diagnosis and the facts. Choose only from the list; the families are the medical DRGs of the principal diagnosis' \
major diagnostic category (Romanian names; IMA = acute myocardial infarction, CC = complications)."""


def mdc_of(code: str):
    head = code[:3]
    return next((mdc for lo, hi, mdc in MDC_RANGES if lo <= head <= hi), None)


def drg_families(mdc: int) -> dict:
    """Medical DRG families of an MDC: "F60" -> {"name", "variants": ["F60A", ...]}"""
    families = {}
    for g in drg_groups():
        if g["mdc"] == mdc and g["type"] == "M":
            fam = families.setdefault(g["ar_drg"][:3], {"name": re.sub(r"\s+(cu|fara) CC.*$", "", g["name"]),
                                                          "variants": []})
            fam["variants"].append(g["ar_drg"])
    return families


def patient_facts(topic: dict, minutes: dict) -> str:
    """The English facts of one topic of `MinutesBuilder.finalize()` output, as one text."""
    name = topic["name"]
    parts = [topic.get("status", "")] + topic.get("findings", [])
    parts += [d["decision"] for d in minutes.get("decisions", []) if d.get("patient") == name]
    parts += [a["task"] for a in minutes.get("action_items", []) if a.get("patient") == name]
    return "\n".join(f"- {p}" for p in parts if p)


def icd_candidates(facts: str) -> list:
    found = list(candidates(facts, MAX_CANDIDATES // 2))
    for line in facts.splitlines():
        for code in candidates(line, PER_FACT):
            if code not in found:
                found.append(code)
    return found[:MAX_CANDIDATES]


def _choose(facts: str, cands: list, model: str) -> dict:
    """{"principal", "secondary": [...], "drg": {"family", "name", "variants", "mdc"} | None, "seconds"}"""
    t = time.perf_counter()
    if not cands:
        return {"principal": None, "secondary": [], "drg": None, "seconds": 0.0}
    listing = "\n".join(f"{c}: {label(c, 'en') or label(c, 'ro')}" for c in cands)
    schema = {"type": "object", "required": ["principal", "secondary"], "properties": {
        "principal": {"type": "string", "enum": cands},
        "secondary": {"type": "array", "maxItems": 6, "items": {"type": "string", "enum": cands}}}}
    answer, _ = chat(model, ICD_SYSTEM, f"Facts:\n{facts}\n\nCandidate codes:\n{listing}", schema,
                     num_predict=200, temperature=0.1)
    principal = answer["principal"]
    secondary = [c for c in dict.fromkeys(answer["secondary"]) if c != principal]
    drg = None
    mdc = mdc_of(principal)
    families = drg_families(mdc) if mdc else {}
    if families:
        options = "\n".join(f"{f}: {v['name']}" for f, v in families.items())
        schema = {"type": "object", "required": ["family"],
                  "properties": {"family": {"type": "string", "enum": list(families)}}}
        pick, _ = chat(model, DRG_SYSTEM, f"Principal diagnosis: {principal} {label(principal)}\nFacts:\n{facts}"
                                           f"\n\nDRG families:\n{options}", schema, num_predict=30, temperature=0.1)
        fam = pick["family"]
        drg = {"family": fam, "name": families[fam]["name"], "variants": families[fam]["variants"], "mdc": mdc}
    return {"principal": principal, "secondary": secondary, "drg": drg, "seconds": round(time.perf_counter() - t, 1)}


GUESS_SYSTEM = """You are a clinical coder. is_patient: true if the facts are about one specific patient currently \
in care, false for anything else (expected admissions, staff, organisation). If true, list the current conditions of \
this patient that are stated or clearly shown by the facts (not suspected or ruled out), most important first, each \
with a short standard English term and your ICD-10 code for it."""


def guided_candidates(facts: str, model: str = MINUTES_MODEL) -> list:
    """Guess, then verify: the LLM names the conditions and guesses codes; the dictionary turns every guess into
    real codes (the code itself if it exists, its category and the category's subdivisions) and adds the codes whose
    names match each condition term. The LLM knows the synonyms, the dictionary knows which codes exist."""
    code = {"type": "string", "pattern": r"^[A-Z][0-9]{2}(\.[0-9]{1,2})?$"}
    schema = {"type": "object", "required": ["is_patient", "conditions"], "properties": {
        "is_patient": {"type": "boolean"}, "conditions": {
        "type": "array", "maxItems": 8, "items": {"type": "object", "required": ["term", "code"],
                                                  "properties": {"term": {"type": "string"}, "code": code}}}}}
    answer, _ = chat(model, GUESS_SYSTEM, f"Facts:\n{facts}", schema, num_predict=300, temperature=0.1)
    if not answer["is_patient"]:
        return []
    codes, found = icd10(), []

    def add(c):
        if c in codes and c not in found:
            found.append(c)
    for cond in answer["conditions"]:
        guess = cond["code"].upper()
        add(guess)
        head = guess[:3]
        add(head)
        for c in sorted(codes):
            if c.startswith(head + "."):
                add(c)
        for c in candidates(cond["term"], PER_FACT):
            add(c)
    return found[:60]


def suggest(facts: str, model: str = MINUTES_MODEL, guided: bool = True) -> dict:
    """guided=True: candidates by guess-then-verify (see guided_candidates); False: word overlap only."""
    if not guided:
        return _choose(facts, icd_candidates(facts), model)
    # Guessed codes first (precise), then the word-overlap ones (they catch what the guess forgot).
    cands = guided_candidates(facts, model)
    if not cands:  # not a patient
        return {"principal": None, "secondary": [], "drg": None, "seconds": 0.0}
    cands += [c for c in icd_candidates(facts) if c not in cands]
    return _choose(facts, cands[:70], model)


def suggest_unguided(facts: str, model: str = MINUTES_MODEL) -> dict:
    """Baseline for comparison: the LLM writes codes on its own, without the dictionary."""
    t = time.perf_counter()
    code = {"type": "string", "pattern": r"^[A-Z][0-9]{2}(\.[0-9]{1,2})?$"}
    schema = {"type": "object", "required": ["principal", "secondary"], "properties": {
        "principal": code, "secondary": {"type": "array", "maxItems": 6, "items": code}}}
    system = ICD_SYSTEM.replace(" Choose only from the candidate list.", "")
    answer, _ = chat(model, system, f"Facts:\n{facts}", schema, num_predict=200, temperature=0.1)
    return {"principal": answer["principal"], "secondary": [c for c in answer["secondary"] if c != answer["principal"]],
            "drg": None, "seconds": round(time.perf_counter() - t, 1)}


def known(code: str) -> bool:
    return code in icd10()
