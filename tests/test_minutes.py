"""The minutes in the language the moderator chose (ro, ru, en), without Ollama: what the builder writes itself,
the speakers' roles and the Markdown."""
import copy
import re

import pytest

from stt.minutes import builder
from stt.minutes.builder import MINUTES_LANGUAGES, MinutesBuilder, _clean, _cue_name
from stt.minutes.markdown import SECTIONS, for_recipients, to_markdown
from stt.speakers import roles
from stt.speakers.dialog import Utterance

WEB_WARNING = re.compile(r"^\[(\d+:\d{2}(?::\d{2})?)\]\s*(.*)$", re.S)  # how the web app reads a warning's time
STATS = {"wall": 0.1, "prompt_tokens": 10, "prompt_s": 0.1, "output_tokens": 5, "output_s": 0.1}
HEADER = {"title": "Round", "summary": "One patient."}
LINE = "[00:03] S1: Pacientul din patul 9 are noradrenalină 0.22."
# What a small model extracts from LINE in each language: filler for the status, a creatinine nobody said, a plan
# that changes nothing, a care change and an urgent task without owner or deadline.
PART = {
    "en": {"name": "", "status": "Not specified", "findings": ["Noradrenaline 0.22", "Creatinine 240 µmol/l"],
           "decisions": ["Continue noradrenaline 0.22", "Stop dobutamine"],
           "tasks": [{"task": "Call the urologist", "owner": "", "deadline": "", "priority": "high"}],
           "open": ["Cause of the fever"]},
    "ro": {"name": "", "status": "nespecificat", "findings": ["Noradrenalină 0.22", "Creatinină 240 µmol/l"],
           "decisions": ["Se continuă noradrenalina 0.22", "Oprim dobutamina"],
           "tasks": [{"task": "Chemați urologul", "owner": "", "deadline": "", "priority": "high"}],
           "open": ["Cauza febrei"]},
    "ru": {"name": "", "status": "Не указано", "findings": ["Норадреналин 0.22", "Креатинин 240 мкмоль/л"],
           "decisions": ["Продолжить норадреналин 0.22", "Отменить добутамин"],
           "tasks": [{"task": "Вызвать уролога", "owner": "", "deadline": "", "priority": "high"}],
           "open": ["Причина лихорадки"]},
}


@pytest.mark.parametrize(("language", "topic", "owner", "deadline", "warning", "finding"), [
    ("en", "Bed 9", "ICU team", "Not specified", "value(s) 240 not found in the transcript: Creatinine 240 µmol/l",
     "Creatinine 240 µmol/l ⚠ unverified: 240"),
    ("ro", "Patul 9", "Echipa ATI", "Nespecificat",
     "valori negăsite în transcriere: 240 — Creatinină 240 µmol/l", "Creatinină 240 µmol/l ⚠ de verificat: 240"),
    ("ru", "Койка 9", "Команда ОРИТ", "Не указан",
     "значения, не найденные в транскрипте: 240 — Креатинин 240 мкмоль/л",
     "Креатинин 240 мкмоль/л ⚠ не проверено: 240"),
])
def test_what_the_builder_writes_is_in_the_minutes_language(monkeypatch, language, topic, owner, deadline, warning,
                                                            finding):
    """A whole run with a fake LLM: the prompts ask for the language, the topic is named from the cue, defaults,
    warnings and filler follow the language, "continue" is no key moment, and there are no AI suggestions."""
    prompts = []

    def chat(model, system, user, schema, **options):
        prompts.append(system)
        return copy.deepcopy({"topics": [PART[language]]} if schema is builder.CHUNK_SCHEMA else HEADER), dict(STATS)

    monkeypatch.setattr(builder, "chat", chat)
    minutes_builder = MinutesBuilder("medical", "gemma", language, verbose=False)
    minutes_builder.add_line(LINE)
    minutes = minutes_builder.finalize()
    name = MINUTES_LANGUAGES[language]
    assert f"Translate everything into {name};" in prompts[0] and f'(e.g. "{topic}")' in prompts[0]
    assert f"in {name}, from the facts" in prompts[1] and "suggestion" not in prompts[1]
    assert "suggestions" not in minutes and minutes["title"] == "Round" and minutes["attendees"] == []
    [t] = minutes["topics"]
    assert (t["name"], t["status"], t["findings"][1]) == (topic, "", finding)
    [action] = minutes["action_items"]
    assert (action["owner"], action["deadline"], action["patient"]) == (owner, deadline, topic)
    [note] = minutes["warnings"]
    assert WEB_WARNING.match(note).groups() == ("00:03", warning)
    part = PART[language]
    assert [k["moment"] for k in minutes["key_moments"]] == [f"{part['decisions'][1]} — {topic}",
                                                             f"{part['tasks'][0]['task']} — {topic}"]
    assert minutes["open_issues"] == [f"{topic}: {part['open'][0]}"]


def test_topics_are_named_from_the_cues_in_the_minutes_language():
    said = ["Trecem la pacientul din patul nouă.", "În boxa e pacientul cu Klebsiella.", "Primirile de azi.",
            "Punctul 3 de pe agendă.", "Койка 5, пациент стабилен."]
    assert [_cue_name(s, "en") for s in said] == ["Bed 9", "Box", "Expected admissions", "Item 3", "Bed 5"]
    assert [_cue_name(s, "ro") for s in said] == ["Patul 9", "Boxa", "Internări așteptate", "Punctul 3", "Patul 5"]
    assert [_cue_name(s, "ru") for s in said] == ["Койка 9", "Бокс", "Ожидаемые поступления", "Пункт 3", "Койка 5"]
    assert _cue_name("Bine, mergem mai departe.", "ro") is None


def test_unnamed_topics_are_numbered_in_the_minutes_language():
    minutes_builder = MinutesBuilder("medical", "gemma", "ru", verbose=False)
    minutes_builder.pool.shutdown()
    topic = {"name": "", "status": "Стабилен", "findings": [], "decisions": [], "tasks": [], "open": []}
    minutes_builder._merge({"topics": [topic]}, ["[01:10] S2: Следующий."], continues=False, cue_name=None)
    assert minutes_builder.topics[0]["name"] == "Пациент 1"


@pytest.mark.parametrize("filler", ["Not specified", "N/A", "nespecificat", "Nu este menționat.", "necunoscută",
                                    "Nu a fost precizat", "Не указано", "нет данных", "Неизвестно", "Н/Д"])
def test_filler_in_any_language_is_empty(filler):
    assert _clean(filler) == ""


def test_filler_sentences_and_drug_names_in_every_language():
    assert _clean("Stable. Dose not specified.") == "Stable."
    assert _clean("Stare stabilă. Detaliile nu au fost specificate.") == "Stare stabilă."
    assert _clean("Состояние стабильное. Дозировка не указана.") == "Состояние стабильное."
    assert _clean("norepinephrine 0.22") == "Noradrenaline 0.22"
    assert _clean("norepinefrina 0.22") == "Noradrenalina 0.22"
    assert _clean("норэпинефрин 0.1") == "Норадреналин 0.1"


def test_speakers_who_talk_briefly_need_no_llm(monkeypatch):
    monkeypatch.setattr(roles, "chat", lambda *args, **kwargs: pytest.fail("asked the LLM"))
    said = [Utterance(0.0, 10.0, "SPEAKER 1", "Bine."), Utterance(10.0, 15.0, "SPEAKER 2", "Da.")]
    for language, briefly in (("en", "speaks briefly"), ("ro", "vorbește puțin"), ("ru", "говорит мало")):
        labelled = roles.label_roles(said, "medical", "gemma", language)
        assert {s: r["role"] for s, r in labelled.items()} == {"SPEAKER 1": briefly, "SPEAKER 2": briefly}


def test_roles_the_llm_leaves_open_are_unclear_in_the_minutes_language(monkeypatch):
    prompts = []

    def chat(model, system, user, schema, **options):
        prompts.append(system)
        return {"speakers": [{"speaker": "SPEAKER 1", "role": " ", "name": "necunoscut",
                              "evidence": "pune întrebări"}]}, dict(STATS)

    monkeypatch.setattr(roles, "chat", chat)
    said = [Utterance(0.0, 40.0, "SPEAKER 1", "Ce facem cu patul 9?"), Utterance(40.0, 80.0, "SPEAKER 2", "Da.")]
    assert roles.label_roles(said, "medical", "gemma", "ro") == {
        "SPEAKER 1": {"role": "neclar", "name": "", "evidence": "pune întrebări", "seconds": 40},
        "SPEAKER 2": {"role": "neclar", "name": "", "evidence": "", "seconds": 40}}
    assert "in a few Romanian words" in prompts[0] and '"neclar" if you cannot tell' in prompts[0]


def test_roles_in_any_language_round_trip_through_the_dialog_legend():
    labelled = {"SPEAKER 1": {"role": "prezintă pacienții", "name": "Daniela", "evidence": "", "seconds": 0},
                "SPEAKER 2": {"role": "говорит мало", "name": "", "evidence": "", "seconds": 0}}
    assert roles.read_legend(roles.legend(labelled)) == labelled


def test_markdown_in_the_minutes_language():
    minutes = {"title": "Vizita", "summary": "Un pacient.", "key_moments": [],
               "topics": [{"name": "Patul 9", "time": "00:03", "status": "", "findings": []}], "decisions": [],
               "action_items": [{"task": "Chemați urologul", "patient": "Patul 9", "owner": "Echipa ATI",
                                 "deadline": "Nespecificat", "priority": "high", "time": "00:03"}],
               "open_issues": [], "warnings": [],
               "attendees": [{"user_id": 3, "name": "Ana Popescu", "job_title": "", "position": "Medic",
                              "specialty": "Cardiolog"}],
               "participants": {"SPEAKER 1": {"role": "vorbește puțin", "name": "", "seconds": 75}},
               "suggestions": ["From older minutes"]}
    md = to_markdown(minutes, "medical", "ro")
    assert md.startswith("# Vizita\n*Ședință medicală · Proces-verbal*\n\n## Rezumat\nUn pacient.\n\n")
    assert md.index("## Subiecte") < md.index("## Sarcini") < md.index("\n\n## Prezenți\n- Ana Popescu — Medic, Cardiolog")
    assert "## Participanți" not in md and "00:03" not in md  # the voices are off by default; no minute marks
    assert "## Subiecte\n### 1. Patul 9\n" in md
    assert "| # | Sarcină | Subiect | Responsabil | Termen | Prioritate |" in md
    assert "| 1 | Chemați urologul | Patul 9 | Echipa ATI | Nespecificat | ridicată |" in md
    voices = to_markdown(minutes, "medical", "ro", ["attendees", "participants"])
    assert "## Participanți\n- **SPEAKER 1** — vorbește puțin · 1 min 15 s" in voices
    assert "older minutes" not in md
    assert "## Topics" in to_markdown(minutes, "executive") and "## Темы" in to_markdown(minutes, "medical", "ru")


def test_markdown_follows_a_template():
    """A meeting type's template: its sections in its order, the others left out, and topics with its fields only;
    the decisions about no topic are listed on their own."""
    minutes = {"title": "Round", "summary": "One patient.", "key_moments": [{"time": "00:04", "moment": "Tests"}],
               "topics": [{"name": "Bed 8", "time": "00:03", "status": "Stable", "findings": ["38.5 °C"]}],
               "decisions": [{"decision": "Order tests", "time": "00:04", "patient": "Bed 8"},
                             {"decision": "Call cardiology", "time": "05:00", "patient": "Box"}],
               "action_items": [], "open_issues": ["Bed 8: cause of the fever"], "warnings": ["[00:03] check"],
               "attendees": [], "participants": {}}
    md = to_markdown(minutes, "medical", "en", ["open_issues", "topics", "other_decisions", "summary"], ["findings"])
    assert md == ("# Round\n*Medical meeting · Minutes*\n\n## Open issues\n- Bed 8: cause of the fever\n\n"
                  "## Topics\n### 1. Bed 8\n\n**Findings:**\n- 38.5 °C\n\n"
                  "## Other decisions\n- Call cardiology — Box\n\n## Summary\nOne patient.\n")
    notes = to_markdown(minutes, "medical", "en", ["key_moments", "warnings"])
    assert notes.endswith("## Key moments\n- Tests\n\n## Verification notes\n- check\n")


def test_the_template_instructions_reach_both_prompts(monkeypatch):
    """The instructions of the meeting type's template go with every chunk and with the header; without any, the
    prompts stay as they are."""
    prompts = []

    def chat(model, system, user, schema, **options):
        prompts.append(system)
        return copy.deepcopy({"topics": [PART["en"]]} if schema is builder.CHUNK_SCHEMA else HEADER), dict(STATS)

    monkeypatch.setattr(builder, "chat", chat)
    for instructions in ("  Name every patient by bed.\n", ""):
        minutes_builder = MinutesBuilder("medical", "gemma", "en", verbose=False, instructions=instructions)
        minutes_builder.add_line(LINE)
        minutes_builder.finalize()
    chunk, header, plain_chunk, plain_header = prompts
    added = "\n\nAdditional instructions from the hospital: Name every patient by bed."
    assert (chunk, header) == (plain_chunk + added, plain_header + added)
    assert "Additional instructions" not in plain_chunk + plain_header


@pytest.mark.parametrize("language", ["en", "ro", "ru"])
def test_recipients_do_not_read_the_notes_for_the_moderator(language):
    """The "⚠ unverified" note the builder writes (in each language) is for the moderator: the minutes people
    receive leave it out, also in the middle of a status made of several parts; the moderator's copy keeps it."""
    note = builder.WORDS[language]["unverified"].format(values="240, 2 g")
    minutes = {"topics": [{"name": "Bed 9", "time": "00:03", "status": f"Stable {note}; fever",
                           "findings": [f"Creatinine 240 {note}", "BP 120/80"]}],
               "decisions": [{"decision": f"Start 2 g {note}", "time": "00:04", "patient": "Bed 9"}],
               "action_items": [{"task": f"Recheck {note}", "owner": "", "deadline": "", "priority": "high",
                                 "time": "00:05", "patient": "Bed 9"}]}
    clean = for_recipients(minutes)
    assert clean["topics"][0]["status"] == "Stable; fever"
    assert clean["topics"][0]["findings"] == ["Creatinine 240", "BP 120/80"]
    assert clean["decisions"][0]["decision"] == "Start 2 g"
    assert clean["action_items"][0]["task"] == "Recheck"
    assert minutes["topics"][0]["findings"][0].endswith(note)


def test_the_markdown_leaves_out_empty_sections():
    """As the HTML email: only the summary shows when there is nothing else."""
    empty = {"title": "Round", "summary": "Nothing to report.", "key_moments": [], "topics": [], "decisions": [],
             "action_items": [], "open_issues": [], "warnings": [], "attendees": [], "participants": {}}
    assert to_markdown(empty, "medical", "en", SECTIONS) == ("# Round\n*Medical meeting · Minutes*\n\n"
                                                              "## Summary\nNothing to report.\n")


def test_the_minutes_report_what_they_have_found_as_they_go(monkeypatch):
    """After each part merged: the topics so far, and how many decisions and action items."""
    def chat(model, system, user, schema, **options):
        return copy.deepcopy({"topics": [PART["ro"]]} if schema is builder.CHUNK_SCHEMA else HEADER), dict(STATS)

    monkeypatch.setattr(builder, "chat", chat)
    found = []
    minutes_builder = MinutesBuilder("medical", "gemma", "ro", verbose=False, on_update=found.append)
    minutes_builder.add_line(LINE)
    minutes_builder.finalize()
    assert found == [{"topics": ["Patul 9"], "decisions": 2, "tasks": 1}]  # as merged, before the final pass


@pytest.mark.parametrize(("language", "said", "title"), [
    ("ro", "Minutes ale Ședinței Administrative", "Ședință administrativă: Patul 9"),
    ("ro", "Procesul-verbal al ședinței", "Ședință administrativă: Patul 9"),
    ("ru", "Протокол совещания отдела", "Административное совещание: Койка 9"),
    ("en", "Minutes of the Administrative Meeting", "Administrative meeting: Bed 9"),
    ("ro", "Bugetul trimestrial și instruirea personalului", "Bugetul trimestrial și instruirea personalului"),
    ("ro", "Protocolul de tratament al sepsisului", "Protocolul de tratament al sepsisului"),
    ("ru", "Протокол лечения сепсиса", "Протокол лечения сепсиса"),
])
def test_a_title_that_only_names_the_document_is_replaced(monkeypatch, language, said, title):
    """Small models write "Minutes" whatever the language; the header already says it: the meeting type and its
    first topics say more. A real topic that starts like it (a treatment protocol) stays."""
    def chat(model, system, user, schema, **options):
        if schema is builder.CHUNK_SCHEMA:
            return copy.deepcopy({"topics": [PART[language]]}), dict(STATS)
        assert "Never start it with a word for" in system  # the prompt asks for a real title first
        return {**HEADER, "title": said}, dict(STATS)

    monkeypatch.setattr(builder, "chat", chat)
    minutes_builder = MinutesBuilder("administrative", "gemma", language, verbose=False)
    minutes_builder.add_line(LINE)
    assert minutes_builder.finalize()["title"] == title
