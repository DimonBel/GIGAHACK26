"""Transcript normalization before the LLM: known ASR errors, ICU slang, spoken numbers, drug names."""
import re

# Spoken numbers (Romanian, Russian), used to read and to verify bed numbers.
NUMBER_WORDS = {
    "1": "unu|unul|una|один", "2": "doi|două|doua|два", "3": "trei|три", "4": "patru|четыре",
    "5": "cinci|пять", "6": "șase|sase|шесть", "7": "șapte|sapte|семь", "8": "opt|восемь",
    "9": "nouă|noua|девять", "10": "zece|десять", "11": "unsprezece", "12": "doisprezece",
    "13": "treisprezece", "14": "paisprezece", "15": "cincisprezece", "16": "șaisprezece",
    "17": "șaptesprezece", "18": "optsprezece", "19": "nouăsprezece", "20": "douăzeci",
}
WORD_TO_NUMBER = {w: n for n, words in NUMBER_WORDS.items() for w in words.split("|")}

# Known ASR errors and ICU slang, fixed in the transcript before any LLM call: small models copy misspelled
# drug names instead of correcting them, and confuse abbreviations ("nor" 0.22 vs "DOB" 4) with each other.
MEDICAL_LEXICON = [
    (r"\bnorodrenal\w*", "noradrenalină"),
    (r"\b(di)?nor(ul|ului|u|i)?\b", "noradrenalină"),
    (r"\bdob(-ul|ul|u)?\b", "dobutamină"),
    (r"\bm[ie]rop[ie]n[ae]m\w*", "meropenem"),
    (r"\bamica?cin\w*", "amikacină"),
    (r"\b[bf]uconazol\w*", "fluconazol"),
    (r"\bclepsiell\w*|\bklepsiel\w*", "Klebsiella"),
    (r"\bne(p|f)r[ao]st[oa](m|r)\w*", "nefrostomă"),
    (r"\bhidronifer\w*|\bhidronefr\w*", "hidronefroză"),
    (r"\btrombopro(f|fl)\w*", "tromboprofilaxie (thromboprophylaxis)"),
    (r"\bantiagreg\w*", "antiagregante (antiplatelets)"),
    (r"\btrombe?aspira\w*", "tromboaspirație"),
    (r"\btrivascular\w*", "trivascular (boală coronariană trivasculară)"),
    (r"\bmitrala (trei|3)\b", "insuficiență mitrală gradul 3"),
    (r"\bdiacar[bp]\w*", "Diacarb (acetazolamidă)"),
    (r"\bforxiga\b", "Forxiga (dapagliflozin)"),
    (r"\btr[aâ]ns ?(s?u|e?s?o)?f[aă]g[ei]an\w*|\btrans ?duracec\w*", "ecografie transesofagiană (ETE)"),
    (r"\btr[aâ]ns ?t[uo]racic\w*", "ecografie transtoracică (ETT)"),
    (r"\bi?endocardi\w*\s+te\s+ie?rnu\s+ved\w*", "endocardită nu se vede (no endocarditis)"),
    (r"\bi?endocardi(?!t[ăa] nu se vede|tis\b)\w*", "endocardită"),
    (r"\b(pune\w*) (o )?arti?er[aăe]\w*", r"\1 linie arterială"),
    (r"\beco\b", "ecocardiografie"),
    (r"\bEKS\b", "EKS (pacemaker)"),
    (r"\bpea?cemaker\w*", "pacemaker"),
    (r"\bcre?t[ie]nin\w*", "creatinină"),
    (r"\buria\b", "uree"),
    (r"\bde oameni\b", "µmol/l"),  # "200 de micromoli" heard as "200 de oameni"
    (r"\bclerus\w*", "clearance"),
    (r"\blictizi\w*", "atelectazie"),
    (r"\b(en)?cefalopat\w*", "encefalopatie"),
    (r"\bechilibr\w*", "gazometrie"),
    (r"\bvolemnic\b", "volemic"),
    (r"\bg[aâ]nd de s[aâ]nge\b", "concentrat eritrocitar (transfuzie)"),
    (r"\bdremul\b", "drenul"),
    (r"\bm[âa]șc[ăa]\b", "mască"),
    (r"\bne ?invaziv\w*", "ventilație neinvazivă"),
    (r"\btensiun\w*", "tensiunea arterială"),
    (r"\b(\d{2,3})%? pe (\d{2,3})\b%?", r"\1/\2"),  # "80 pe 40", "80% pe 40%" -> "80/40"
    (r"\balcalotic\w*", "alcaloză metabolică"),
    (r"\bcuiepidur\w*", "cu epidurală"),
]

# Small models translate the same drug differently from chunk to chunk; one name per drug lets duplicates merge.
CANONICAL = [
    (r"\bnorepinephrine\b", "noradrenaline"),
    (r"\bnoradrenalin(?!e)\b", "noradrenaline"),
]


def normalize(text: str) -> str:
    for pattern, replacement in MEDICAL_LEXICON:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text
