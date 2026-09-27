"""ICD-10 / DRG suggestions for the Medpark minutes, against a reference coding of the three patients.

  python bench/eval_coding.py out/bench/Medpark_audio.cmp-turbo-md-q8.lex1.minutes.json [more.json ...]

The reference is a clinical reading of the recording (not a certified coder's). Scored at the 3-character
category: `core` groups must be found (any code of a group counts), `accepted` codes are right but optional;
anything else is a wrong code. Codes that do not exist in ICD-10 are counted separately.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from mom.medical.coding import mdc_of, patient_facts, suggest, suggest_unguided  # noqa: E402
from mom.medical.dictionary import icd10  # noqa: E402

REFERENCE = {
    # patient: (find the topic, [core groups], accepted extras, expected MDC)
    "Bed 8": (lambda n, i: "8" in n or i == 0,
              [{"I21", "I22", "I25"}, {"I34"}],  # acute / recent MI with three-vessel disease; mitral insufficiency
              {"I21", "I22", "I25", "I34", "I50", "R57", "E86", "N17", "F05", "G93", "R50", "I95", "I51", "R00"}, 5),
    "Bed 9": (lambda n, i: "9" in n,
              [{"J96"}, {"E87"}],  # hypercapnic respiratory failure; metabolic alkalosis
              {"J96", "E87", "J44", "J81", "R06", "R09", "I50", "E88", "J98"}, 4),
    "Box": (lambda n, i: "box" in n.lower(),
            [{"N13"}, {"N39", "B96", "N30", "N10"}, {"B37"}],  # hydronephrosis; Klebsiella UTI; candiduria
            {"N13", "N39", "B96", "N30", "N10", "B37", "C78", "J90", "J91", "J94", "J98", "D64", "D62", "R57",
             "N28", "R59", "A41", "T83", "Z96"}, 11),
}
METHODS = {"unguided LLM": lambda f: suggest_unguided(f), "dictionary (words)": lambda f: suggest(f, guided=False),
           "guess + verify + words": lambda f: suggest(f, guided=True)}


def score(result, core, accepted):
    codes = [c for c in [result["principal"], *result["secondary"]] if c]
    heads = {c[:3] for c in codes}
    return {"core": sum(bool(g & heads) for g in core), "core_of": len(core),
            "wrong": sum(1 for c in codes if c[:3] not in accepted), "invalid": sum(1 for c in codes if c not in icd10()),
            "codes": codes}


def main():
    totals = {m: {"core": 0, "core_of": 0, "wrong": 0, "invalid": 0, "n": 0, "seconds": 0, "mdc_ok": 0, "drg": 0}
              for m in METHODS}
    for path in sys.argv[1:]:
        minutes = json.loads(Path(path).read_text(encoding="utf-8"))
        topics = minutes["topics"]
        print(f"== {Path(path).name}")
        for patient, (find, core, accepted, mdc) in REFERENCE.items():
            topic = next((t for i, t in enumerate(topics) if find(t["name"], i)), None)
            if not topic:
                print(f"  {patient}: topic not found")
                continue
            facts = patient_facts(topic, minutes)
            for method, run in METHODS.items():
                r = run(facts)
                s = score(r, core, accepted)
                t = totals[method]
                for k in ("core", "core_of", "wrong", "invalid"):
                    t[k] += s[k]
                t["n"] += len(s["codes"])
                t["seconds"] += r["seconds"]
                if r.get("drg"):
                    t["drg"] += 1
                    t["mdc_ok"] += r["drg"]["mdc"] == mdc
                drg = f" | DRG {r['drg']['family']} {r['drg']['name'][:50]}" if r.get("drg") else ""
                print(f"  {patient:6} {method:23} core {s['core']}/{s['core_of']} wrong {s['wrong']} invalid "
                      f"{s['invalid']} {r['seconds']:4.1f}s  {' '.join(s['codes'])}{drg}")
    print("\n== total")
    for method, t in totals.items():
        drg = f", DRG in the right MDC {t['mdc_ok']}/{t['drg']}" if t["drg"] else ""
        print(f"  {method:23} core found {t['core']}/{t['core_of']}, wrong {t['wrong']}/{t['n']}, "
              f"invalid {t['invalid']}, {t['seconds']:.0f} s{drg}")


if __name__ == "__main__":
    main()
