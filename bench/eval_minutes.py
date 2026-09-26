"""Score Minutes of Meeting (Markdown) of Medpark_dialog.txt against a reference checklist.

  python bench/eval_minutes.py out/minutes_gemma4.md [more.md ...]

Each patient fact must appear in the section of the right patient (found by an anchor fact), so a fact
filed under the wrong patient does not count. Hallucinations seen in earlier runs cost one point each.
"""
import re
import sys
from pathlib import Path

# patient -> (anchor that identifies its "### " section, [(fact label, regex), ...])
PATIENTS = {
    "Bed 8": (r"80/40|0\.22", [
        ("named Bed 8", r"### bed 8\b"),
        ("myocardial infarction", r"myocardial infarction|\bSTEMI\b|\bMI\b"),
        ("mitral regurgitation grade 3", r"mitral[^\n]{0,60}(\b3\b|III)|(\b3\b|III)[^\n]{0,30}mitral"),
        ("three-vessel disease", r"three.vessel|3.vessel|triple.vessel|trivascular|multi.?vessel"),
        ("BP 80/40", r"80/40"),
        ("noradrenaline 0.22", r"0\.22"),
        ("dobutamine 4", r"dobutamine\D{0,20}\b4\b"),
        ("echo: empty ventricles / hypovolemia", r"empty|hypovol|underfill"),
        ("volume loading", r"volume|fluid"),
        ("arterial line", r"arterial line"),
        ("creatinine 240 (was 90)", r"creatinine[^\n]{0,80}240|240[^\n]{0,60}creatinine"),
        ("thromboprophylaxis", r"thromboprophyla"),
        ("antiplatelets", r"antiplatelet|antiaggreg"),
        ("encephalopathy / delirium", r"delirium|encephalopath"),
        ("vasopressors being reduced", r"(wean|reduc|taper|decreas|lower)\w*[^\n]{0,50}(vasopress|noradren|norepi|pressor)"
                                       r"|(vasopress|noradren|norepi|pressor)\w*[^\n]{0,50}(wean|reduc|taper|decreas|lower)"),
    ]),
    "Bed 9": (r"hypercap|92.94", [
        ("named Bed 9", r"### bed 9\b"),
        ("respiratory failure", r"respirator\w* (failure|insufficiency)"),
        ("SpO2 92-94", r"92"),
        ("pCO2 69", r"\b69\b"),
        ("mobilized", r"mobili"),
        ("Forxiga stopped", r"(stop|discontinu|withdr|remov|cancel)\w*[^\n]{0,40}(forxiga|dapagliflozin)"
                            r"|(forxiga|dapagliflozin)[^\n]{0,40}(stop|discontinu|withdr|remov|cancel)"),
        ("Diacarb started", r"diacarb|acetazolamide"),
        ("metabolic alkalosis", r"alkalo"),
        ("cardiologist Daniela Ivanov", r"daniela|ivanov"),
        ("BiPAP / NIV", r"bipap|non.?invasive|\bNIV\b"),
        ("ask Matei about BiPAP", r"matei"),
    ]),
    "Box patient": (r"hydronephrosis|600", [
        ("pleural fluid 600 / 300", r"600[^\n]{0,60}300"),
        ("lung nodules / metastases", r"nodul|metasta"),
        ("hydronephrosis grade 2", r"hydronephrosis[^\n]{0,20}(2|II)|(grade 2|II)[^\n]{0,20}hydronephrosis"),
        ("urologist Butnari", r"butnari"),
        ("stent vs nephrostomy", r"nephrostom"),
        ("meropenem + amikacin", r"meropenem[\s\S]{0,300}amikacin|amikacin[\s\S]{0,300}meropenem"),
        ("meropenem adjusted to renal clearance", r"meropenem[^\n]{0,100}(twice|two doses|2 doses|clearance|renal)"),
        ("fluconazole", r"fluconazole"),
        ("Klebsiella + Candida", r"klebsiella[\s\S]{0,200}candida|candida[\s\S]{0,200}klebsiella"),
        ("Hb 86 -> transfusion", r"\b86\b[\s\S]{0,900}transfus|transfus[\s\S]{0,900}\b86\b"),
        ("TEE: no endocarditis", r"endocarditis"),
        ("pacemaker rate 80", r"(pacemaker|EKS|paced|pacing)[^\n]{0,80}\b80\b|\b80\b[^\n]{0,60}(pacemaker|EKS|pacing)"),
        ("oncologist awaited", r"oncolog"),
        ("histology available", r"histolog"),
        ("palliative question", r"palliat"),
    ]),
}

OTHER = [  # anywhere in the document
    ("drain closed since morning", r"drain[^\n]{0,60}clos|clos\w*[^\n]{0,30}drain"),
    ("right side weaker than left", r"right[^\n]{0,40}weak"),
    ("expected ICU admissions", r"(admission|admit)[\s\S]{0,300}(adrenalectomy|laparotomy)"
                                r"|(adrenalectomy|laparotomy)[\s\S]{0,300}(admission|admit)"),
]

HALLUCINATIONS = [
    ("blood gas ordered", r"blood gas ordered"),
    ("Swan-Ganz", r"swan"),
    ("CT ordered (it was done)", r"\bCT[^\n]{0,15}ordered"),
    ("noradrenaline started (already running)", r"(start|administer|initiat)\w*[^\n]{0,20}(noradren|norepi)"),
    ("'None' item", r"^\s*- (`[\d:]+` )?none\.?$"),
    ("empty item", r"^\s*-\s*$"),
    ("dose 'for one year'", r"one year"),
    ("thrombolysis (it was thromboprophylaxis)", r"thromboly"),
    ("endocarditis suspected (TEE: none)", r"(?<!no )endocarditis (is )?(suspected|present|confirmed|seen)"),
    ("expected admissions listed as a patient", r"### (?!Expected admissions)[^\n]*\n\*\*Status:\*\*[^\n]*(adrenalectomy|laparotomy)"),
]


def sections(md: str) -> list:
    """Patient sections, each with the action-item rows and open issues filed under that patient."""
    patients = re.split(r"^## (?!Patients)", re.split(r"^## Patients\n", md, flags=re.M)[-1], flags=re.M)[0]
    out = []
    for sec in re.split(r"(?=^### )", patients, flags=re.M)[1:]:
        name = re.match(r"### (.+?)\s+`", sec)
        name = name[1] if name else sec.splitlines()[0][4:].strip()
        rows = [r for r in md.splitlines() if r.startswith("|") and f"| {name} |" in r]
        issues = [r for r in md.splitlines() if r.startswith(f"- {name}: ")]
        out.append("\n".join([sec] + rows + issues))
    return out


def score(md: str):
    hits, total, lines = 0, 0, []
    secs = sections(md)
    used = {}
    for patient, (anchor, facts) in PATIENTS.items():
        sec = next((s for s in secs if re.search(anchor, s, re.I)), "")
        header = sec.splitlines()[0] if sec else "(not found)"
        used.setdefault(header, []).append(patient)
        got = [label for label, rx in facts if re.search(rx, sec, re.I | re.M)]
        hits += len(got)
        total += len(facts)
        lines.append(f"  {patient:12} {len(got):2}/{len(facts)}  in {header!r}; missing: "
                     f"{', '.join(label for label, _ in facts if label not in got) or '-'}")
    got = [label for label, rx in OTHER if re.search(rx, md, re.I | re.M)]
    hits += len(got)
    total += len(OTHER)
    lines.append(f"  {'other':12} {len(got):2}/{len(OTHER)}  missing: "
                 f"{', '.join(label for label, _ in OTHER if label not in got) or '-'}")
    merged = [ps for h, ps in used.items() if len(ps) > 1 and h != "(not found)"]
    bad = [label for label, rx in HALLUCINATIONS if re.search(rx, md, re.I | re.M)]
    penalty = len(bad) + 2 * len(merged)
    lines.append(f"  hallucinations: {', '.join(bad) or '-'}" + (f"; merged patients: {merged}" if merged else ""))
    return hits, total, penalty, lines


if __name__ == "__main__":
    for path in sys.argv[1:]:
        hits, total, penalty, lines = score(Path(path).read_text(encoding="utf-8"))
        print(f"{path}: {hits}/{total} facts, -{penalty} penalty => {hits - penalty}")
        print("\n".join(lines))
