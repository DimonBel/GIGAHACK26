"""Minutes as Markdown, for people and for the email."""


def to_markdown(m: dict, meeting_type: str) -> str:
    out = [f"# {m['title']}", f"*Meeting type: {meeting_type.capitalize()}*", "", "## Summary", m["summary"], ""]
    if m.get("participants"):
        out += ["## Participants (roles guessed by the local LLM from what each voice says)"]
        out += [f"- **{s}** — {r['role']}" + (f" ({r['name']})" if r.get("name") else "")
                + (f" · {r['seconds'] // 60} min {r['seconds'] % 60:02d} s" if r.get("seconds") else "")
                for s, r in m["participants"].items()] + [""]
    out += ["## Key moments"] + [f"- `{k['time']}` {k['moment']}" for k in m["key_moments"]] + [""]
    out.append("## Patients" if meeting_type == "medical" else "## Agenda items")
    for t in m["topics"]:
        out += [f"### {t['name']}  `{t['time']}`", f"**Status:** {t['status'] or '—'}"]
        if t["findings"]:
            out += ["", "**Findings:**"] + [f"- {f}" for f in t["findings"]]
        decisions = [d for d in m["decisions"] if d["patient"] == t["name"]]
        if decisions:
            out += ["", "**Decisions:**"] + [f"- `{d['time']}` {d['decision']}" for d in decisions]
        out.append("")
    head = "| # | Task | Patient | Owner | Deadline | Priority | Time |" if meeting_type == "medical" else \
        "| # | Task | Item | Owner | Deadline | Priority | Time |"
    out += ["## Action items", head, "|---" * head.count(" |") + "|"]
    order = {"high": 0, "medium": 1, "low": 2}
    for i, a in enumerate(sorted(m["action_items"], key=lambda a: order.get(a["priority"], 3)), 1):
        out.append(f"| {i} | {a['task']} | {a['patient']} | {a['owner']} | {a['deadline']} | {a['priority']} "
                   f"| {a['time']} |")
    if m["open_issues"]:
        out += ["", "## Open issues"] + [f"- {o}" for o in m["open_issues"]]
    if m["suggestions"]:
        out += ["", "## AI suggestions (not decided in the meeting)"] + [f"- {s}" for s in m["suggestions"]]
    if m.get("warnings"):
        out += ["", "## Verification warnings"] + [f"- {w}" for w in m["warnings"]]
    return "\n".join(out) + "\n"
