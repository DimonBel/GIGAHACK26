"""Build the trilingual ICD-10 and the DRG dictionaries in mom/medical/data/ from public sources.

  .venv/bin/python scripts/build_medical_dicts.py [--cache build/dicts]

Run once when a source changes; the app itself only reads the TSV files (no network at run time).
Needs pdftotext (brew install poppler).

Sources (downloaded into the cache folder):
  ro  Lista tabelară a bolilor ICD-10-AM, Romanian (Școala Națională de Sănătate Publică / DRG Romania)
  ru  МКБ-10, Russian (official text of the Russian Ministry of Health), parsed CSV of github.com/KindYAK/mkb-10-parsed
  en  ICD-10-CM 2026 code descriptions (US CMS / CDC, public domain); WHO ICD-10 and ICD-10-CM agree at 3-4 chars
  drg Grupele DRG (AR-DRG and RO-DRG codes, category, relative value), medicode.ro list of the official CNAS groups;
      Moldova groups with AR-DRG v6, whose codes and group names match these
"""
import argparse
import csv
import re
import subprocess
import urllib.request
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent
OUT = SERVER / "mom" / "medical" / "data"
SOURCES = {
    "ro_boli.pdf": "https://drg.inmss.ro/DocDRG/ListaTabelara_Boli_ICD_10_AM.pdf",
    "ru_mkb.csv": "https://raw.githubusercontent.com/KindYAK/mkb-10-parsed/master/mkb-parsed.csv",
    "en_icd10cm.zip": "https://www.cms.gov/files/zip/2026-code-descriptions-tabular-order.zip",
    "drg.pdf": "https://www.lexmed.ro/doc/Grupe_DRG_2015_04_ambele_coduri_de_grupa.pdf",
}
UA = {"User-Agent": "Mozilla/5.0 (Macintosh) dictionary-build"}
CODE = re.compile(r"^([A-Z]\d{2}(?:\.\d{1,2})?)[†*]?\s+(\S.*)$")


def fetch(cache: Path) -> dict:
    cache.mkdir(parents=True, exist_ok=True)
    paths = {}
    for name, url in SOURCES.items():
        path = cache / name
        if not path.exists():
            print("downloading", url)
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
                path.write_bytes(r.read())
        paths[name] = path
    return paths


def pdf_text(path: Path, mode: str) -> str:
    return subprocess.run(["pdftotext", mode, str(path), "-"], capture_output=True, text=True, check=True).stdout


def clean(label: str) -> str:
    label = re.sub(r"\([A-Z]\d{2}(\.\d+)?[*†]?(-[A-Z]\d{2}(\.\d+)?[*†]?)?\)", "", label)  # dagger/asterisk refs
    return re.sub(r"\s+", " ", label).strip(" .;,")


def romanian(path: Path) -> dict:
    """Code -> Romanian name, from the tabular list (a name can continue on the next line)."""
    names, last = {}, None
    for line in pdf_text(path, "-raw").splitlines():
        line = line.strip()
        m = CODE.match(line)
        if m:
            last = m[1]
            names.setdefault(last, clean(m[2]))
        elif last and line and line[0].islower() and len(names[last]) < 120:
            names[last] = clean(names[last] + " " + line)  # wrapped name
        else:
            last = None
    return names


def russian(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return {r["code"]: clean(r["name"]) for r in csv.DictReader(f) if re.fullmatch(r"[A-Z]\d{2}(\.\d{1,2})?", r["code"])}


def english(path: Path) -> dict:
    import zipfile
    names = {}
    with zipfile.ZipFile(path) as z:
        order = next(n for n in z.namelist() if re.search(r"icd10cm_order_\d{4}\.txt$", n))
        for line in z.read(order).decode("utf-8").splitlines():
            code, long_name = line[6:13].strip(), line[77:].strip()
            if 3 <= len(code) <= 5:
                names[code if len(code) == 3 else f"{code[:3]}.{code[3:]}"] = clean(long_name)
    return names


DRG_LINE = re.compile(r"^\s*(\d{1,2})\s+([MCA])\s+([A-Z]\d{4})\s+([A-Z0-9]{3}[A-Z])\s+(?:(\D.*?)\s+)?(\d+,\d+)\s")


def drg(path: Path) -> list:
    """AR-DRG code, RO-DRG code, MDC, type (M medical, C surgical, A other), Romanian name, relative value."""
    rows, above, open_row = [], [], None
    for line in pdf_text(path, "-layout").splitlines():
        m = DRG_LINE.match(line)
        if m:
            mdc, kind, ro_code, ar_code, name, rv = m.groups()
            row = {"ar_drg": ar_code, "ro_drg": ro_code, "mdc": int(mdc), "type": kind, "name": (name or "").strip(),
                   "relative_value": rv.replace(",", ".")}
            if not row["name"]:  # a long name is printed around the code line: first half above, rest below
                row["name"] = " ".join(above)
                open_row = row
            else:
                open_row = None
            rows.append(row)
            above = []
        elif line.strip() and not re.search(r"\d,\d{2,}|Grupele|medicode|Pagina|MDC", line):
            text = line.strip()
            if open_row is not None:
                open_row["name"] = f"{open_row['name']} {text}".strip()
                open_row = None
            else:
                above = [text]
    for r in rows:
        r["name"] = re.sub(r"\s+", " ", r["name"]).strip()
    return rows


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--cache", type=Path, default=SERVER / "build" / "dicts")
    args = p.parse_args()
    src = fetch(args.cache)
    ro, ru, en = romanian(src["ro_boli.pdf"]), russian(src["ru_mkb.csv"]), english(src["en_icd10cm.zip"])
    codes = sorted(set(ro) | set(ru) | {c for c in en if len(c) <= 5 and (c in ro or c in ru or len(c) <= 5)})
    # Only codes of ICD-10 itself (known in RO or RU) plus their 3-character parents; drop US-only subdivisions.
    codes = [c for c in codes if c in ro or c in ru]
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / "icd10.tsv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t", lineterminator="\n")
        w.writerow(["code", "ro", "ru", "en"])
        for c in codes:
            w.writerow([c, ro.get(c, ""), ru.get(c, ""), en.get(c, en.get(c[:5], ""))])
    groups = drg(src["drg.pdf"])
    with (OUT / "drg.tsv").open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(groups[0]), delimiter="\t", lineterminator="\n")
        w.writeheader()
        w.writerows(groups)
    have = lambda d: sum(1 for c in codes if d.get(c))
    print(f"icd10.tsv: {len(codes)} codes (ro {have(ro)}, ru {have(ru)}, en {have(en)}) | drg.tsv: {len(groups)} groups")


if __name__ == "__main__":
    main()
