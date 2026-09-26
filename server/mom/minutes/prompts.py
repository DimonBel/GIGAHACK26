"""What the minutes model is asked (system prompts per meeting type) and the JSON it must answer."""
from ..llm.schema import objs, strs, text

MEETING_TYPES = ("medical", "executive", "administrative")

# Every fact is filed under its patient / agenda item, so nothing is written twice (the old schema had a plan
# per topic plus global decision / action lists that repeated it) and code knows whose each item is.
# No "time" fields: code finds each item's transcript line (locate), and every generated token costs time.
CHUNK_SCHEMA = {
    "type": "object",
    "properties": {
        "topics": objs(max_items=3, min_items=1, name=text(40), status=text(300),
                        findings=strs(7, max_len=160), decisions=strs(6, max_len=160),
                        tasks=objs(max_items=4, task=text(160), owner=text(60), deadline=text(40),
                                    priority={"type": "string", "enum": ["high", "medium", "low"]}),
                        open=strs(2, max_len=160)),
    },
    "required": ["topics"],
}

FINAL_SCHEMA = {
    "type": "object",
    "properties": {
        "title": text(80),
        "summary": text(600),
        "suggestions": strs(2, max_len=120),
    },
    "required": ["title", "summary", "suggestions"],
}

GLOSSARY = """The transcript is noisy speech recognition of Romanian (with Russian and Latin medical terms); \
speaker labels may be wrong. "gol" means the ventricles are empty (hypovolemia), not low ejection fraction. \
"secundare" nodules means metastases. "scan" means CT scan. "stent"/"stentare" with "hidronefroză" means a \
ureteral stent. "ruptura de cordaj" = chordae tendineae rupture. "reanimare" = ICU. "boxa" = isolation room. \
"suport presor" = vasopressors. "descărcat volemic" = fluid removed with diuretics. "am scos" = stopped, \
"am introdus" = started."""

CHUNK_SYSTEM = """You extract facts for the Minutes of a {meeting_type} meeting at Medpark hospital (Moldova) \
from one part of the transcript. Translate everything into {language}; write short phrases.

""" + GLOSSARY + """

topics: {topics_hint} For each:
- name: the bed / room exactly as said (e.g. "Bed 9"), or "" if not said.
- status: {status_hint}
- findings: {findings_hint}
- decisions: what was decided or done in this meeting: {decisions_hint}
- tasks: what must still be done, asked, awaited or watched, saying exactly what (e.g. "Watch for delirium", \
"Ask Matei about the BiPAP mask"). owner = the named person or specialist who must act, only if said in \
this part (e.g. "urologist Butnari"), else "". deadline only if said (e.g. "this evening"), else "". \
priority: high = patient safety / urgent, medium = today, low = other.
- open: unresolved questions.
Use only what is said in this part. Never invent values, names, owners or deadlines. Keep doses and lab \
values exact. Leave out words you cannot understand instead of copying or guessing them. Empty lists are fine."""

HINTS = {
    "medical": dict(
        topics_hint="one entry per patient discussed in this part, in order. Start a new entry only when the "
                    "speakers clearly move to another bed / patient.",
        status_hint="diagnosis, history and current state (therapy running with doses, consciousness), at "
                    "most 30 words; lab / imaging values go in findings, not here. For a topic that is not a "
                    "patient (e.g. expected admissions): what was said.",
        findings_hint="every vital sign (blood pressure, SpO2, heart rate), lab value, blood gas, imaging, "
                      "echocardiography or culture result mentioned, with exact values and trend (e.g. "
                      "\"creatinine 240 µmol/l, was 90\").",
        decisions_hint="the treatment plan: drugs started, stopped, changed (with the dose) or continued, "
                       "procedures, lines, scans, transfusions, consults ordered."),
    "executive": dict(
        topics_hint="one entry per agenda item, in order.",
        status_hint="where it stands, with key figures, at most 35 words.",
        findings_hint="every figure, result or fact reported.",
        decisions_hint="what was approved, rejected or changed."),
    "administrative": dict(
        topics_hint="one entry per agenda item, in order.",
        status_hint="where it stands, at most 35 words.",
        findings_hint="every figure, result or fact reported.",
        decisions_hint="what was approved, rejected or changed."),
}

FINAL_SYSTEM = """You write the header of the Minutes of a {meeting_type} meeting at Medpark hospital, in \
{language}, from the facts already extracted below. Use only these facts.
- title: short, specific.
- summary: 2-3 sentences for a reader who missed the meeting: who was discussed and the main decisions.
- suggestions: at most 2 follow-ups the team may have overlooked (not already an open issue), based only \
on these facts, at most 12 words each.
Never add details that are not in the facts (no age, sex, diagnoses or numbers of your own)."""
