"""The approved minutes as an email: subject, Markdown (plain-text part and attachment) and HTML.

The HTML uses inline styles only — no images, web fonts or tracking pixels — so opening the email makes no
request outside the hospital. The only link is to the minutes in the web app.
"""
import re
import time
from dataclasses import dataclass
from html import escape

INK, MUTED, LINE, PRIMARY, CANVAS, WARN = "#1c2624", "#5c6b67", "#e5e2da", "#1b6b5e", "#faf9f5", "#8a5a12"
FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
PRIORITY = {"high": "High", "medium": "Medium", "low": "Low"}


@dataclass
class Rendered:
    subject: str
    markdown: str
    html: str


def _day(unix: float) -> str:
    return time.strftime("%d.%m.%Y", time.localtime(unix))


def _length(seconds) -> str:
    if not seconds:
        return ""
    minutes = round(seconds / 60)
    return f"{minutes} min" if minutes < 60 else f"{minutes // 60} h {minutes % 60:02d} min"


def _person(name: str) -> set:
    """Name words without titles: "Dr. Natalia Popescu" -> {"natalia", "popescu"}."""
    return {w for w in re.findall(r"[^\W\d_]+", name.lower()) if w not in {"dr", "prof", "doctor"}}


def is_owner(owner: str, name: str) -> bool:
    """The task's owner is this person: same name, or their surname ("Popescu", "Dr. Popescu")."""
    theirs, mine = _person(owner), _person(name)
    return bool(theirs) and (theirs == mine or (len(theirs) == 1 and theirs <= mine and len(mine) > 1))


def _item_text(item: dict) -> str:
    text = item.get("text", "").strip() or "—"
    if item.get("unverified"):
        text += f" (not verified: {item['unverified']})"
    return text


def _task_line(t: dict) -> str:
    parts = [t.get("owner") or "no owner"]
    if t.get("deadline"):
        parts.append(t["deadline"])
    parts.append(PRIORITY.get(t.get("priority"), "Medium") + " priority")
    return " · ".join(parts)


def _tasks_for(doc: dict, name: str) -> list:
    return [(topic["title"], t) for topic in doc.get("topics", []) for b in topic.get("blocks", [])
            if b["kind"] == "tasks" for t in b.get("items", []) if not t.get("done") and is_owner(t.get("owner", ""), name)]


def render(meeting: dict, doc: dict, recipient: dict, approved_by: str, link: str, attendees: list) -> Rendered:
    title = doc.get("title") or meeting["title"]
    facts = [meeting["type"].capitalize(), _day(meeting["created"]), _length(meeting.get("duration"))]
    facts = " · ".join(f for f in facts if f)
    approved = f"Approved {_day(meeting['approved'] or time.time())}" + (f" by {approved_by}" if approved_by else "")
    mine = _tasks_for(doc, recipient["name"])
    subject = f"Minutes: {title} — {_day(meeting['created'])}"
    return Rendered(subject, _markdown(doc, title, facts, approved, mine, link, attendees),
                    _html(doc, title, facts, approved, mine, link, recipient, attendees))


# --- Markdown (plain-text part and the attachment) ---

def _markdown(doc, title, facts, approved, mine, link, attendees) -> str:
    out = [f"# {title}", f"{facts}  ", approved, ""]
    if doc.get("summary"):
        out += [doc["summary"], ""]
    if mine:
        out += ["## Your tasks"] + [f"- {t['text']} ({topic}) — {_task_line(t)}" for topic, t in mine] + [""]
    if attendees:
        out += ["## Attendees", ", ".join(attendees), ""]
    for i, topic in enumerate(doc.get("topics", []), 1):
        out += [f"## {i}. {topic.get('title') or 'Untitled topic'}" + (f" ({topic['time']})" if topic.get("time") else ""), ""]
        for b in topic.get("blocks", []):
            out.append(f"**{b['label']}**")
            if b["kind"] == "text":
                out += [b.get("text", "").strip() or "—"]
            elif b["kind"] == "tasks":
                out += [f"- [{'x' if t.get('done') else ' '}] {_item_text(t)} — {_task_line(t)}" for t in b["items"]] or ["—"]
            elif b["kind"] == "codes":
                out += [f"- {c['code']} {c.get('label', '')} ({c['system']})" for c in b["items"]] or ["—"]
            else:
                out += [f"- {_item_text(x)}" + (f" — {x['who']}" if x.get("who") else "") for x in b["items"]] or ["—"]
            out.append("")
    nxt = doc.get("next") or {}
    if any(nxt.get(k) for k in ("date", "time", "place", "agenda")):
        when = " ".join(x for x in (nxt.get("date"), nxt.get("time")) if x)
        out += ["## Next meeting", " · ".join(x for x in (when, nxt.get("place")) if x), nxt.get("agenda", ""), ""]
    out += ["---", f"Open the minutes: {link}", "Sent from the hospital's internal minutes system."]
    return "\n".join(out).strip() + "\n"


# --- HTML ---

def _h2(text: str) -> str:
    return (f'<h2 style="margin:28px 0 8px;font-size:18px;line-height:24px;color:{INK};font-weight:700">'
            f"{escape(text)}</h2>")


def _label(text: str) -> str:
    return (f'<div style="margin:16px 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;'
            f'color:{MUTED};font-weight:600">{escape(text)}</div>')


def _p(text: str, size=14, color=INK) -> str:
    return f'<p style="margin:0 0 8px;font-size:{size}px;line-height:1.55;color:{color}">{escape(text)}</p>'


def _ul(items: list) -> str:
    li = "".join(f'<li style="margin:0 0 6px">{i}</li>' for i in items)
    return f'<ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.5;color:{INK}">{li}</ul>'


def _item_html(item: dict) -> str:
    html = escape(item.get("text", "").strip() or "—")
    if item.get("who"):
        html += f' <span style="color:{MUTED}">— {escape(item["who"])}</span>'
    if item.get("unverified"):
        html += f' <span style="color:{WARN}">(not verified: {escape(item["unverified"])})</span>'
    return html


def _task_html(t: dict, topic: str = None) -> str:
    text = escape(t.get("text", "").strip() or "—")
    if t.get("done"):
        text = f'<s style="color:{MUTED}">{text}</s>'
    meta = escape(_task_line(t) + (f" · {topic}" if topic else ""))
    return f'{text}<br><span style="font-size:12px;color:{MUTED}">{meta}</span>'


def _html(doc, title, facts, approved, mine, link, recipient, attendees) -> str:
    body = [
        _p(f"Dear {recipient['name']},", 14, MUTED),
        _p("The minutes of a meeting you attended were approved. They are below, and attached as a file.", 14, MUTED),
        f'<h1 style="margin:20px 0 4px;font-size:24px;line-height:30px;color:{INK};font-weight:700">{escape(title)}</h1>',
        _p(f"{facts} · {approved}", 13, MUTED),
    ]
    if doc.get("summary"):
        body.append(f'<div style="margin:16px 0 0">{_p(doc["summary"], 16)}</div>')
    if mine:
        rows = "".join(f'<li style="margin:0 0 8px">{_task_html(t, topic)}</li>' for topic, t in mine)
        body.append(f'<div style="margin:20px 0 0;padding:14px 16px;border-radius:8px;background:#e0ede8">'
                    f'<div style="font-size:13px;font-weight:700;color:{PRIMARY};margin:0 0 8px">Your tasks</div>'
                    f'<ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.5;color:{INK}">{rows}</ul></div>')
    if attendees:
        body += [_label("Attendees"), _p(", ".join(attendees))]
    for i, topic in enumerate(doc.get("topics", []), 1):
        heading = f"{i}. {topic.get('title') or 'Untitled topic'}"
        body.append(f'<div style="border-top:1px solid {LINE};margin-top:24px"></div>' + _h2(heading))
        for b in topic.get("blocks", []):
            body.append(_label(b["label"] or "Notes"))
            items = b.get("items", [])
            if b["kind"] == "text":
                body += [_p(part) for part in re.split(r";\s+", b.get("text", "").strip()) if part] or [_p("—")]
            elif b["kind"] == "tasks":
                body.append(_ul([_task_html(t) for t in items]) if items else _p("—"))
            elif b["kind"] == "codes":
                body.append(_ul([f"<b>{escape(c['code'])}</b> {escape(c.get('label', ''))} "
                                 f'<span style="color:{MUTED}">{escape(c["system"])}</span>' for c in items])
                            if items else _p("—"))
            else:
                body.append(_ul([_item_html(x) for x in items]) if items else _p("—"))
    nxt = doc.get("next") or {}
    if any(nxt.get(k) for k in ("date", "time", "place", "agenda")):
        when = " ".join(x for x in (nxt.get("date"), nxt.get("time")) if x)
        body += [f'<div style="border-top:1px solid {LINE};margin-top:24px"></div>', _h2("Next meeting"),
                 _p(" · ".join(x for x in (when, nxt.get("place")) if x)), _p(nxt.get("agenda", ""))]
    button = (f'<a href="{escape(link, quote=True)}" style="display:inline-block;margin-top:28px;padding:10px 18px;'
              f'border-radius:6px;background:{PRIMARY};color:#ffffff;text-decoration:none;font-size:14px;'
              f'font-weight:600">Open the minutes</a>')
    return (f'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
            f"<title>{escape(title)}</title></head>"
            f'<body style="margin:0;padding:24px 12px;background:{CANVAS};font-family:{FONT}">'
            f'<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid {LINE};border-radius:12px;'
            f'padding:28px 28px 32px">'
            f'<div style="font-size:18px;font-weight:800;color:{INK};margin:0 0 20px">Verbal</div>'
            + "".join(body) + button
            + f'<p style="margin:28px 0 0;font-size:12px;color:{MUTED}">Sent from the hospital\'s internal minutes '
              f"system. Reply to reach the moderator.</p></div></body></html>")
