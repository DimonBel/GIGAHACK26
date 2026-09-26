"""The minutes as `mom` writes them (minutes.json) -> the editable document of the web app (schemas.MinutesDoc).

`mom` files every fact under its patient / agenda item; here each topic gets one block per kind of fact
(status, findings, decisions, tasks, open issues), which the moderator can then edit, add, remove or reorder.
"""
import re
import secrets

UNVERIFIED = re.compile(r"\s*⚠ unverified: (?P<values>[^;]+)$")
NOT_SPECIFIED = {"not specified", "none", "n/a", "-"}


def new_id(prefix: str) -> str:
    return prefix + secrets.token_hex(4)


def list_item(text: str, time: str = None) -> dict:
    m = UNVERIFIED.search(text)
    return {"id": new_id("i"), "text": text[:m.start()] if m else text, "time": time,
            "unverified": m["values"].strip() if m else None}


def _issues_by_topic(issues: list, names: list) -> dict:
    """"Bed 9: Ask about the mask" -> {"Bed 9": ["Ask about the mask"]} (longest matching name wins)."""
    out = {}
    by_length = sorted(names, key=len, reverse=True)
    for issue in issues:
        name = next((n for n in by_length if issue.startswith(n + ": ")), None)
        text = issue[len(name) + 2:] if name else issue
        out.setdefault(name if name else (names[0] if names else ""), []).append(text)
    return out


def minutes_doc(minutes: dict, meeting_type: str) -> dict:
    """A MinutesDoc (as a dict) from the output of MinutesBuilder.finalize() plus its "participants"."""
    names = [t["name"] for t in minutes.get("topics", [])]
    issues = _issues_by_topic(minutes.get("open_issues", []), names)
    facts = "Findings" if meeting_type == "medical" else "Key facts"
    topics = []
    for t in minutes.get("topics", []):
        name, blocks = t["name"], []
        if t.get("status"):
            blocks.append({"id": new_id("b"), "kind": "text", "label": "Status", "text": t["status"]})
        if t.get("findings"):
            blocks.append({"id": new_id("b"), "kind": "list", "label": facts,
                           "items": [list_item(f) for f in t["findings"]]})
        decisions = [list_item(d["decision"], d.get("time")) for d in minutes.get("decisions", [])
                     if d.get("patient") == name]
        if decisions:
            blocks.append({"id": new_id("b"), "kind": "list", "label": "Decisions", "items": decisions})
        tasks = []
        for a in minutes.get("action_items", []):
            if a.get("patient") != name:
                continue
            item = list_item(a["task"], a.get("time"))
            deadline = a.get("deadline", "")
            tasks.append({**item, "owner": a.get("owner", ""), "priority": a.get("priority", "medium"),
                          "deadline": "" if deadline.strip().lower() in NOT_SPECIFIED else deadline})
        if tasks:
            blocks.append({"id": new_id("b"), "kind": "tasks", "label": "Tasks", "items": tasks})
        if issues.get(name):
            blocks.append({"id": new_id("b"), "kind": "list", "label": "Open issues",
                           "items": [list_item(i) for i in issues[name]]})
        topics.append({"id": new_id("t"), "title": name, "time": t.get("time"), "blocks": blocks})

    participants = [{"speaker": speaker, "name": r.get("name", ""), "role": r.get("role", ""),
                     "seconds": r.get("seconds", 0)}
                    for speaker, r in (minutes.get("participants") or {}).items()]
    return {
        "version": 1,
        "title": minutes.get("title", ""),
        "summary": minutes.get("summary", ""),
        "keyMoments": [{"time": m["time"], "text": m["moment"]} for m in minutes.get("key_moments", [])],
        "aiSuggestions": list(minutes.get("suggestions", [])),
        "warnings": list(minutes.get("warnings", [])),
        "participants": participants,
        "topics": topics,
    }
