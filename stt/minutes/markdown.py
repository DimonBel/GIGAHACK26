"""Minutes as Markdown, for people and for the email."""
import re

from .labels import LABELS

# The parts of the minutes in their default order, the email's; a meeting type's template may reorder or hide them.
SECTIONS = ("summary", "key_moments", "topics", "other_decisions", "action_items", "open_issues", "attendees",
            "participants", "warnings")
# Off in the built-in template: the timeline, the voices with the roles the AI guessed and the automatic check's
# notes are for the moderator, not for the people who receive the minutes.
OFF_BY_DEFAULT = ("key_moments", "participants", "warnings")
DEFAULT_SECTIONS = tuple(section for section in SECTIONS if section not in OFF_BY_DEFAULT)
TOPIC_FIELDS = ("status", "findings", "decisions")  # what a topic shows under its name
# The note the builder appends to a value it could not find in the transcript (builder.WORDS["unverified"], e.g.
# "⚠ de verificat: 2 g"): it is for the moderator, and ends at the next status part ("; ") or the end of the text.
UNVERIFIED = re.compile(r"\s*⚠ (?:unverified|de verificat|не проверено): [^;⚠\n]*")


def to_markdown(m: dict, meeting_type: str, language: str = "en", sections=DEFAULT_SECTIONS,
                topic_fields=TOPIC_FIELDS) -> str:
    """The minutes with their headings in language (ro, ru or en), the language they were written in: sections in
    this order (the others are left out), each topic with topic_fields only."""
    labels = LABELS[language]
    blocks = [[f"# {m['title']}", f"*{labels[meeting_type]} · {labels['minutes']}*"]]
    blocks += [_section(section, m, labels, topic_fields) for section in sections]
    return "\n\n".join("\n".join(block) for block in blocks if block) + "\n"


def _section(section: str, m: dict, labels: dict, topic_fields) -> list[str]:
    """One section's lines, [] when it has nothing to show (only the summary always shows), as in the HTML email."""
    if section == "summary":
        return [f"## {labels['summary']}", m["summary"]]
    if section == "key_moments" and m["key_moments"]:
        return _bullets(labels["key_moments"], [k["moment"] for k in m["key_moments"]])
    if section == "topics" and m["topics"]:
        lines = [f"## {labels['topics']}"]
        for i, t in enumerate(m["topics"]):
            if i:
                lines.append("")
            lines += _topic(i + 1, t, m, labels, topic_fields)
        return lines
    if section == "other_decisions" and (decisions := other_decisions(m)):
        return _bullets(labels["other_decisions"],
                        [d["decision"] + (f" — {d['patient']}" if d["patient"] else "")
                         for d in decisions])
    if section == "action_items" and m["action_items"]:
        columns = ["#", labels["task"], labels["topic"], labels["owner"], labels["deadline"], labels["priority"]]
        lines = [f"## {labels['action_items']}", "| " + " | ".join(columns) + " |", "|---" * len(columns) + "|"]
        order = {"high": 0, "medium": 1, "low": 2}
        for i, a in enumerate(sorted(m["action_items"], key=lambda a: order.get(a["priority"], 3)), 1):
            priority = labels["priorities"].get(a["priority"], a["priority"])
            lines.append(f"| {i} | {a['task']} | {a['patient']} | {a['owner']} | {a['deadline']} | {priority} |")
        return lines
    if section == "open_issues" and m["open_issues"]:
        return _bullets(labels["open_issues"], m["open_issues"])
    if section == "attendees" and m.get("attendees"):
        return _bullets(labels["present"], [attendee_line(a) for a in m["attendees"]])
    if section == "participants" and m.get("participants"):
        lines = [f"## {labels['participants']}"]
        for s, r in m["participants"].items():
            seconds = r.get("seconds")
            talk = " · " + labels["min_s"].format(m=seconds // 60, s=seconds % 60) if seconds else ""
            lines.append(f"- **{s}** — {r['role']}" + (f" ({r['name']})" if r.get("name") else "") + talk)
        return lines
    if section == "warnings" and m.get("warnings"):
        return _bullets(labels["verification"], [without_time(w) for w in m["warnings"]])
    return []


def _topic(number: int, t: dict, m: dict, labels: dict, fields) -> list[str]:
    lines = [f"### {number}. {t['name']}"]
    if "status" in fields:
        lines.append(f"**{labels['status']}:** {t['status'] or '—'}")
    if "findings" in fields and t["findings"]:
        lines += ["", f"**{labels['findings']}:**"] + [f"- {f}" for f in t["findings"]]
    decisions = [d for d in m["decisions"] if d["patient"] == t["name"]]
    if "decisions" in fields and decisions:
        lines += ["", f"**{labels['decisions']}:**"] + [f"- {d['decision']}" for d in decisions]
    return lines


def for_recipients(m: dict) -> dict:
    """The minutes as the people who receive them read them: without the builder's "⚠ unverified" notes."""
    return {**m,
            "topics": [{**t, "status": without_notes(t["status"]),
                        "findings": [without_notes(f) for f in t["findings"]]} for t in m["topics"]],
            "decisions": [{**d, "decision": without_notes(d["decision"])} for d in m["decisions"]],
            "action_items": [{**a, "task": without_notes(a["task"])} for a in m["action_items"]]}


def without_notes(text: str) -> str:
    """Text without the builder's "⚠ unverified: …" notes."""
    return UNVERIFIED.sub("", text)


def without_time(warning: str) -> str:
    """A warning of the automatic check without its "[mm:ss] ": the minutes carry no minute marks."""
    return re.sub(r"^\[\d+:\d{2}(?::\d{2})?\]\s*", "", warning)


def _bullets(heading: str, items: list) -> list[str]:
    return [f"## {heading}"] + [f"- {item}" for item in items]


def other_decisions(m: dict) -> list[dict]:
    """The decisions about none of the topics (the others are listed under their topic)."""
    names = {t["name"] for t in m["topics"]}
    return [d for d in m["decisions"] if d["patient"] not in names]


def attendee_line(a: dict) -> str:
    """Someone present: "Ana Popescu — Head of cardiology, Doctor, Cardiologist", without the parts not known."""
    details = ", ".join(part for part in (a["job_title"], a["position"], a["specialty"]) if part.strip())
    return f"{a['name']} — {details}" if details else a["name"]
