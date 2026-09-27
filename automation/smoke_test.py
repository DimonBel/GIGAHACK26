"""Smoke test of the running delivery stack: posts to the n8n webhook and checks what MailHog caught.

Run after setup.sh: python3 automation/smoke_test.py (standard library only, exits 1 on a failure).
"""

from __future__ import annotations

import base64
import json
import sys
import time
import urllib.error
import urllib.request
import uuid
from email import message_from_string, policy
from email.message import EmailMessage
from pathlib import Path

ENV_FILE = Path(__file__).with_name(".env")
WEBHOOK_URL = "http://127.0.0.1:5678/webhook/secure-mom"
MAILHOG_URL = "http://127.0.0.1:8025"
MAILHOG_MESSAGES_URL = f"{MAILHOG_URL}/api/v2/messages?limit=200"
# The API call that forwards a caught email to any SMTP server: it must need the login too.
MAILHOG_RELEASE_URL = f"{MAILHOG_URL}/api/v1/messages/smoke-test/release"
SENDER = "secure-mom@medpark.local"
REQUEST_TIMEOUT_S = 60
MAIL_WAIT_S = 10
POLL_S = 0.5

# meeting type -> (subject prefix, footer start, To, CC). The medical minutes are in Romanian, the executive ones in
# Russian: their footers too; the administrative ones name no language: English.
EXPECTED = {
    "medical": ("[Medical]", "Proces-verbal al consiliului medical", ["ana.popescu@medpark.md", "ion.rusu@medpark.md"],
                ["quality@medpark.md"]),
    "executive": ("[Executive]", "Протокол совещания руководства", ["director@medpark.md"],
                  ["finance@medpark.md", "hr@medpark.md"]),
    "administrative": ("[Administrative]", "Administrative meeting minutes", ["admin@medpark.md"], []),
}
LANGUAGES = {"medical": "ro", "executive": "ru"}

# meeting type -> attachment filename. Romanian diacritics and Cyrillic exercise non-ASCII filename handling.
ATTACHMENT_FILENAMES = {
    "medical": "Proces-verbal - Ședință ATI.pdf",
    "executive": "Протокол - совещание руководства.pdf",
    "administrative": "Administrative minutes.pdf",
}


def minimal_pdf() -> bytes:
    """Builds a small valid one-page PDF by hand, with byte-exact xref offsets."""
    header = b"%PDF-1.4\n"
    objects = [
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n",
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n",
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n",
    ]
    body = b""
    offsets = []
    for obj in objects:
        offsets.append(len(header) + len(body))
        body += obj
    xref_offset = len(header) + len(body)
    xref = f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    xref += "".join(f"{offset:010d} 00000 n \n" for offset in offsets).encode()
    trailer = f"trailer<</Size {len(objects) + 1}/Root 1 0 R>>\nstartxref\n{xref_offset}\n%%EOF".encode()
    return header + body + xref + trailer


PDF_BYTES = minimal_pdf()

failures: list[str] = []


def check(ok: bool, what: str) -> None:
    """Prints one check result and remembers failures."""
    print(f"{'ok  ' if ok else 'FAIL'}  {what}")
    if not ok:
        failures.append(what)


def read_secrets() -> dict[str, str]:
    """Returns the token and the MailHog login from automation/.env."""
    lines = ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []
    values = {name: value.strip("'\"") for name, _, value in (line.partition("=") for line in lines)}
    secrets = {name: values.get(name, "") for name in ("SECURE_MOM_N8N_TOKEN", "MAILHOG_USER", "MAILHOG_PASSWORD")}
    missing = [name for name, value in secrets.items() if not value]
    if missing:
        sys.exit(f"{', '.join(missing)} missing in {ENV_FILE}: run automation/setup.sh first")
    return secrets


def status_of(request: urllib.request.Request) -> tuple[int, bytes]:
    """Sends a request; returns the status code and the body, also of an error answer."""
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_S) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def post(payload: dict, token: str | None) -> tuple[int, dict]:
    """Posts a payload to the webhook; returns the status code and the JSON answer ({} if it isn't JSON)."""
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["X-Secure-MOM-Token"] = token
    status, body = status_of(urllib.request.Request(WEBHOOK_URL, json.dumps(payload).encode(), headers, method="POST"))
    try:
        return status, json.loads(body)
    except ValueError:
        return status, {}


def mailhog_request(url: str, login: str | None, method: str = "GET") -> urllib.request.Request:
    """A request to MailHog's API, with the basic auth login "user:password" if given."""
    headers = {"Authorization": "Basic " + base64.b64encode(login.encode()).decode()} if login else {}
    return urllib.request.Request(url, data=b"{}" if method == "POST" else None, headers=headers, method=method)


def minutes(run: str, meeting_type: str) -> dict:
    """Builds a payload in the shape of docs/api.md "n8n delivery", with Romanian and Russian text."""
    prefix, _, to, cc = EXPECTED.get(meeting_type, EXPECTED["medical"])
    # The executive subject already carries its prefix: n8n must not add it twice.
    title = f"Smoke test {run} – ședința de dimineață"
    payload = {
        "meeting_id": f"smoke-{run}-{meeting_type}",
        "meeting_type": meeting_type,
        "subject": f"{prefix} {title}" if meeting_type == "executive" else title,
        "to": to,
        "cc": cc,
        "html": f"<html><body><h1>{title}</h1><p>Patul 8: consult urologic azi. Анализы готовы.</p></body></html>",
        "text": f"{title}\nPatul 8: consult urologic azi. Анализы готовы.",
        "from": SENDER,
        "attachment": {
            "filename": ATTACHMENT_FILENAMES.get(meeting_type, ATTACHMENT_FILENAMES["medical"]),
            "content_type": "application/pdf",
            "data": base64.b64encode(PDF_BYTES).decode(),
        },
    }
    if meeting_type in LANGUAGES:
        payload["language"] = LANGUAGES[meeting_type]
    return payload


def caught(run: str, expected_count: int, login: str) -> list[EmailMessage]:
    """Returns the emails of this run that MailHog caught, waiting until expected_count arrived."""
    deadline = time.monotonic() + MAIL_WAIT_S
    request = mailhog_request(MAILHOG_MESSAGES_URL, login)
    while True:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_S) as response:
            items = json.load(response)["items"]
        messages = [message_from_string(item["Raw"]["Data"], policy=policy.default) for item in items]
        mine = [message for message in messages if run in str(message["Subject"])]
        if len(mine) >= expected_count or time.monotonic() > deadline:
            return mine
        time.sleep(POLL_S)


def addresses(message: EmailMessage, header: str) -> list[str]:
    """Returns the addresses of a To/Cc header (empty if absent)."""
    value = message[header]
    return sorted(address.addr_spec for address in value.addresses) if value else []


def check_email(message: EmailMessage, meeting_type: str, run: str) -> None:
    """Checks recipients, subject prefix, footers and the absence of n8n's attribution."""
    prefix, footer, to, cc = EXPECTED[meeting_type]
    text = message.get_body(("plain",)).get_content().replace("\r\n", "\n")
    html = message.get_body(("html",)).get_content()
    check(str(message["Subject"]) == f"{prefix} Smoke test {run} – ședința de dimineață",
          f"{meeting_type}: subject {message['Subject']!r}")
    check(addresses(message, "To") == sorted(to) and addresses(message, "Cc") == sorted(cc),
          f"{meeting_type}: To {addresses(message, 'To')}, Cc {addresses(message, 'Cc')}")
    check(f"\n-- \n{footer}" in text and "Анализы готовы" in text, f"{meeting_type}: text footer and UTF-8")
    check(0 <= html.find(footer) < html.find("</body>"), f"{meeting_type}: HTML footer before </body>")
    check("n8n" not in text + html, f"{meeting_type}: no n8n attribution")


def check_attachment(message: EmailMessage, meeting_type: str) -> None:
    """Checks the PDF attachment: exactly one application/pdf part, its filename and its exact bytes."""
    pdfs = [part for part in message.iter_attachments() if part.get_content_type() == "application/pdf"]
    check(len(pdfs) == 1, f"{meeting_type}: one application/pdf attachment ({len(pdfs)} found)")
    if pdfs:
        check(pdfs[0].get_filename() == ATTACHMENT_FILENAMES[meeting_type],
              f"{meeting_type}: attachment filename {pdfs[0].get_filename()!r}")
        check(pdfs[0].get_content() == PDF_BYTES, f"{meeting_type}: attachment bytes match the one sent")


def main() -> None:
    secrets = read_secrets()
    token, login = secrets["SECURE_MOM_N8N_TOKEN"], f"{secrets['MAILHOG_USER']}:{secrets['MAILHOG_PASSWORD']}"
    run = uuid.uuid4().hex[:8]
    print(f"Smoke test run {run}")

    status, _ = status_of(mailhog_request(MAILHOG_MESSAGES_URL, None))
    check(status == 401, f"MailHog inbox without the login -> {status}")
    status, _ = status_of(mailhog_request(MAILHOG_MESSAGES_URL, f"{secrets['MAILHOG_USER']}:wrong-password"))
    check(status == 401, f"MailHog inbox with a wrong password -> {status}")
    status, _ = status_of(mailhog_request(MAILHOG_RELEASE_URL, None, "POST"))
    check(status == 401, f"MailHog release (relay) without the login -> {status}")

    status, _ = post(minutes(run, "medical"), None)
    check(status == 403, f"no token -> {status}")
    status, _ = post(minutes(run, "medical"), "wrong-token")
    check(status == 403, f"wrong token -> {status}")
    status, _ = post(minutes(run, "finance"), token)
    check(status == 400, f"meeting_type 'finance' -> {status}")
    status, _ = post({**minutes(run, "medical"), "to": []}, token)
    check(status == 400, f"empty 'to' -> {status}")
    payload = minutes(run, "medical")
    del payload["attachment"]
    status, _ = post(payload, token)
    check(status == 400, f"missing 'attachment' -> {status}")
    payload = minutes(run, "medical")
    payload["attachment"]["data"] = ""
    status, _ = post(payload, token)
    check(status == 400, f"'attachment' with empty data -> {status}")

    for meeting_type in EXPECTED:
        status, answer = post(minutes(run, meeting_type), token)
        check(status == 200 and answer == {"sent": True}, f"{meeting_type} -> {status} {answer}")

    messages = caught(run, len(EXPECTED), login)
    check(len(messages) == len(EXPECTED), f"MailHog caught {len(messages)} emails of this run (rejected ones none)")
    type_of_prefix = {expected[0]: meeting_type for meeting_type, expected in EXPECTED.items()}
    for message in messages:
        meeting_type = type_of_prefix.get(str(message["Subject"]).split(" ", 1)[0])
        if meeting_type is None:
            check(False, f"subject without a meeting type prefix: {message['Subject']!r}")
        else:
            check_email(message, meeting_type, run)
            check_attachment(message, meeting_type)

    print(f"\n{len(failures)} failed" if failures else "\nall checks passed")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
