"""Who the speakers are: their role in the meeting (and name, if addressed by it), guessed by the local LLM."""
import re
import sys

from ..minutes.builder import EMPTY, MINUTES_LANGUAGES, _text
from ..minutes.ollama import DEFAULT_MODEL, chat

MAIN_SECONDS = 30   # speakers who talk less get "speaks briefly" (in the minutes' language) without asking the LLM
LINES_PER_SPEAKER = 8
LINE_CHARS = 200
PROMPT_CHARS = 7000  # fits the minutes' 4096-token context: a different num_ctx makes Ollama reload the model,
                     # and while the minutes keep it busy that reload can wait forever (seen on a 60-min run)
TIMEOUT = 120        # seconds; the roles are optional, so they may never hold up the transcript or minutes
LEGEND = re.compile(r"^# (?P<speaker>SPEAKER \d+) = (?P<role>.*?)(?: \((?P<name>[^()]*)\))?(?: — AI guess)?$")

SYSTEM = """You identify the participants of a {meeting_type} meeting at Medpark hospital (Moldova) from a \
noisy speech-recognition transcript in Romanian. Speaker labels come from voice detection. For each speaker:
- role: their function in this meeting in a few {language} words, from what they do (who asks and decides, who \
reports patients, who answers about one topic), e.g. {examples}. "{unclear}" if you cannot tell.
- name: the speaker's own name only if another speaker addresses them by it or they introduce themselves, \
else "". A name that is only mentioned (e.g. a colleague to call) is not the speaker's name.
- evidence: a short reason in {language}, at most 15 words.
Use only the transcript. Do not invent names."""
# What label_roles writes itself, and the prompt's examples, per language of the minutes.
ROLE_WORDS = {
    "en": {"briefly": "speaks briefly", "unclear": "unclear",
           "examples": '"leads the round", "presents patients", "nurse", "cardiologist (consultant)"'},
    "ro": {"briefly": "vorbește puțin", "unclear": "neclar",
           "examples": '"conduce vizita", "prezintă pacienții", "asistent medical", "cardiolog (consultant)"'},
    "ru": {"briefly": "говорит мало", "unclear": "неясно",
           "examples": '"ведёт обход", "докладывает о пациентах", "медсестра", "кардиолог (консультант)"'},
}


def talk_time(utterances: list) -> dict:
    seconds = {}
    for u in utterances:
        seconds[u.speaker] = seconds.get(u.speaker, 0.0) + u.end - u.start
    return seconds


def label_roles(utterances: list, meeting_type: str = "medical", model: str = DEFAULT_MODEL,
                language: str = "en") -> dict:
    """{speaker: {"role", "name", "evidence", "seconds"}} for every speaker of the dialog, the roles written in
    language (ro, ru or en).

    Returns {} (after a warning) when Ollama is not available, so the transcript is never lost over it.
    """
    words = ROLE_WORDS[language]
    seconds = talk_time(utterances)
    main = sorted((s for s, v in seconds.items() if v >= MAIN_SECONDS), key=lambda s: -seconds[s])
    roles = {s: {"role": words["briefly"], "name": "", "evidence": "", "seconds": round(v)}
             for s, v in seconds.items() if s not in main}
    if not main:
        return roles
    parts = []
    per_line = min(LINE_CHARS, PROMPT_CHARS // (len(main) * LINES_PER_SPEAKER))
    for s in main:
        lines = sorted((u for u in utterances if u.speaker == s), key=lambda u: u.start - u.end)[:LINES_PER_SPEAKER]
        said = "\n".join(f"- {u.text[:per_line]}" for u in sorted(lines, key=lambda u: u.start))
        turns = sum(1 for u in utterances if u.speaker == s)
        parts.append(f"{s} (talks {seconds[s] / 60:.1f} min in {turns} turns). Longest lines:\n{said}")
    item = {"type": "object", "required": ["speaker", "role", "name", "evidence"],
            "properties": {"speaker": {"type": "string", "enum": main}, "role": _text(60), "name": _text(40),
                           "evidence": _text(120)}}
    schema = {"type": "object", "required": ["speakers"],
              "properties": {"speakers": {"type": "array", "items": item, "minItems": len(main),
                                          "maxItems": len(main)}}}
    system = SYSTEM.format(meeting_type=meeting_type, language=MINUTES_LANGUAGES[language],
                           examples=words["examples"], unclear=words["unclear"])
    try:
        answer, _ = chat(model, system, "\n\n".join(parts), schema, num_predict=60 * len(main) + 100, retry=False,
                          timeout=TIMEOUT)
    except (RuntimeError, ValueError) as e:  # Ollama down, model missing, or no valid JSON after a retry
        print(f"Warning: speaker roles skipped ({str(e).splitlines()[0]})", file=sys.stderr)
        return {}
    for a in answer["speakers"]:
        if a["speaker"] in main and a["speaker"] not in roles:
            name = a["name"].strip()
            roles[a["speaker"]] = {"role": a["role"].strip() or words["unclear"], "evidence": a["evidence"].strip(),
                                   "name": "" if EMPTY.match(name) else name,  # "unknown", "necunoscut", ...
                                   "seconds": round(seconds[a["speaker"]])}
    for s in main:
        roles.setdefault(s, {"role": words["unclear"], "name": "", "evidence": "", "seconds": round(seconds[s])})
    return dict(sorted(roles.items(), key=lambda x: -x[1]["seconds"]))


def legend(roles: dict) -> str:
    """Header lines for the dialog .txt: "# SPEAKER 1 = leads the round (Daniela) — AI guess"."""
    return "\n".join(f"# {s} = {r['role']}" + (f" ({r['name']})" if r["name"] else "") + " — AI guess"
                     for s, r in roles.items())


def read_legend(text: str) -> dict:
    """Roles back from a dialog .txt written with a legend."""
    roles = {}
    for line in text.splitlines():
        m = LEGEND.match(line.strip())
        if m:
            roles[m["speaker"]] = {"role": m["role"], "name": m["name"] or "", "evidence": "", "seconds": 0}
    return roles
