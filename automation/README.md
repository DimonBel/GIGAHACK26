# Secure MOM delivery: n8n + MailHog

Approved minutes leave the backend through a self-hosted n8n workflow and land in MailHog, a local mail
catcher. Nothing reaches the internet: every port is published on 127.0.0.1 only, and n8n's telemetry,
update checks, templates, banners and other calls home are switched off.

## Setup

Needs Docker with Compose v2.23 or newer (on macOS: Docker Desktop, `open -a Docker`), `openssl` and `curl`.
The images (`n8nio/n8n` 2.40.7, `mailhog/mailhog` v1.0.1) are pinned by digest in `docker-compose.yml` and
pulled once; after that it all works offline.

```bash
./automation/setup.sh
```

It creates `automation/.env` (gitignored, mode 600) with a random `SECURE_MOM_N8N_TOKEN`, the n8n editor login
and the MailHog login, starts both containers, imports the SMTP credential, the token credential and the
workflow with the n8n CLI, publishes the workflow, restarts n8n and checks that the webhook refuses a call
without the token and MailHog one without its login. The n8n editor password is printed once, at the end of
the first run, and only its bcrypt hash is kept: note it down. Re-running is safe: `.env` and `n8n_data/`
(n8n's database) are kept and the credentials and the workflow are re-imported (delivery pauses ~15 s).

| What | Where |
|---|---|
| Webhook | `POST http://127.0.0.1:5678/webhook/secure-mom`, header `X-Secure-MOM-Token` |
| n8n editor | http://127.0.0.1:5678, login `N8N_OWNER_EMAIL` and the password `setup.sh` printed |
| MailHog inbox and API | http://127.0.0.1:8025 (`/api/v2/messages`), basic auth `MAILHOG_USER` / `MAILHOG_PASSWORD` from `.env` |
| SMTP | `127.0.0.1:1025` (`mailhog:1025` inside Docker), no auth, no TLS |

The backend (`python -m server`) reads `SECURE_MOM_N8N_TOKEN` from this `.env` unless its own environment or
`server/.env` sets it.

## The workflow

`n8n/secure-mom.workflow.json`: Receive minutes (webhook with Header Auth: the credential "Secure MOM token"
holds `SECURE_MOM_N8N_TOKEN`, imported by `setup.sh`) → Payload complete? → Meeting type → subject prefix and
footer of that type → Compose email → Attachment to file (base64 → PDF binary) → Send email (credential
"MailHog SMTP", `n8n/credentials.json`) → answer. The request is the one in `docs/api.md` ("n8n delivery"):

```bash
SECURE_MOM_N8N_TOKEN=$(sed -n 's/^SECURE_MOM_N8N_TOKEN=//p' automation/.env)
curl -X POST http://127.0.0.1:5678/webhook/secure-mom \
  -H "X-Secure-MOM-Token: $SECURE_MOM_N8N_TOKEN" -H 'Content-Type: application/json' \
  -d '{"meeting_id": "6f1c", "meeting_type": "medical", "language": "ro", "subject": "Medical board 26.09",
       "to": ["ana@medpark.md"], "cc": ["quality@medpark.md"], "html": "<html><body>…</body></html>",
       "text": "…", "from": "secure-mom@medpark.local",
       "attachment": {"filename": "Proces-verbal - Raport de gardă — ATI - 24.09.2026.pdf",
                       "content_type": "application/pdf", "data": "<base64 of the PDF bytes>"}}'
```

| Status | Body | When |
|---|---|---|
| 200 | `{"sent": true}` | MailHog accepted the email |
| 400 | `{"detail": "…"}` | `from`, `to` (non-empty list), `subject`, `html`, `text` or `attachment` (`filename`/`data` non-empty strings, `content_type` `application/pdf` if given) missing, `cc` not a list, or `meeting_type` not `medical`, `executive`, `administrative` |
| 403 | `Authorization data is wrong!` (text) | missing or wrong token; the workflow does not run |
| 422 | n8n's own error | the body is not JSON |
| 502 | `{"sent": false, "detail": "mail server error: …"}` | MailHog is down; this can take ~40 s (TCP timeout), so call with a 60 s timeout |

`attachment.filename` can contain non-ASCII (Romanian diacritics, Cyrillic, an em dash); it must not contain
`/ \ : * ? " < > |`. `attachment.data` is standard-alphabet base64 with no line breaks; n8n's default 16 MB
body limit (`N8N_PAYLOAD_SIZE_MAX`) comfortably covers a base64'd PDF (typically 20–200 KB before encoding).

Per type the subject gets `[Medical]`, `[Executive]` or `[Administrative]` in front (unless it already starts
with it) and a footer in the minutes' `language` (`ro`, `ru`, else English): above `</body>` in the HTML, after a
`-- ` line in the text.

## Test

```bash
python3 automation/smoke_test.py
```

It checks that MailHog refuses its inbox and its relay API without the login, posts without and with a wrong
token (403), an unknown type, an empty `to`, a missing `attachment` and an `attachment` with empty `data`
(400), one email per meeting type (200, each with a hand-built PDF attached, one filename Romanian and one
Cyrillic), then reads MailHog's API with the login and checks To, CC, subject prefix, footers, UTF-8 (Romanian
and Russian), the attached PDF (MIME type, decoded filename, exact bytes) and that nothing else arrived.

## Offline and privacy

- Only `127.0.0.1:5678`, `:8025` and `:1025` are published: nothing is reachable from the network.
- n8n: diagnostics, version and "what's new" checks, templates, dynamic banners, personalization, the hiring
  banner, community packages, the public API and the `mcp-registry` module (it polls api.n8n.io) are off.
  A packet capture on the Docker VM during setup, deliveries and restarts saw no DNS query and no connection
  from either container to anything outside their network; the n8n editor and the MailHog UI load only
  local assets.
- n8n keeps no copy of delivered minutes: successful runs are not saved (workflow settings) and are purged
  from its database within a minute; failed runs are kept 7 days for debugging, in `n8n_data/`, which only
  your user can open (700). MailHog keeps mail in memory only: restarting it
  (`docker compose -f automation/docker-compose.yml restart mailhog`) empties it.
- The editor login is provisioned from `.env`, so nobody can claim the instance on the sign-up page; `.env`
  keeps only its bcrypt hash.
- Workflows can't read environment variables (`N8N_BLOCK_ENV_ACCESS_IN_NODE=true`). The token is an n8n
  credential, encrypted in n8n's database; the webhook checks it before the workflow runs.
- MailHog's inbox and API (the UI uses the API) need the login: `MAILHOG_USER`:bcrypt hash, written by Compose
  into the container only (`/home/mailhog/auth`, mode 400, `MH_AUTH_FILE`). Other programs on this machine can
  still hand mail to its SMTP port, not read it.
- MailHog has no `Host` check: a web page can reach 127.0.0.1:8025 through DNS rebinding, but not past the login.
  The browser then asks for the login on the attacker's site name: never type it anywhere but
  http://127.0.0.1:8025.

### Limit: MailHog can relay mail

MailHog's API can "release" a caught email to any SMTP server, named in the request
(`POST /api/v1/messages/{id}/release`), and this can't be switched off. The login closes it to other programs
and web pages, but whoever has the MailHog login can forward stored minutes to an outside server whenever
Docker can reach one. MailHog is a demo catcher: a hospital deployment must not keep minutes in it. Use instead

- the hospital's internal mail relay: point the "MailHog SMTP" credential of the workflow (host, port, login,
  TLS) at it, or the backend's direct SMTP delivery (`smtp_host`, with `SECURE_MOM_ALLOW_REMOTE_DELIVERY=1`
  when it is another machine), and drop MailHog; or
- Mailpit (`axllent/mailpit`, pinned by digest) if a catcher is needed: `MP_UI_AUTH_FILE` for the UI and API,
  `MP_SMTP_AUTH_FILE` for SMTP, and no `MP_SMTP_RELAY_CONFIG`, so release stays off.

## Operate

```bash
docker compose -f automation/docker-compose.yml ps          # both "healthy"
docker compose -f automation/docker-compose.yml logs -f n8n
docker compose -f automation/docker-compose.yml down        # stop (data stays in n8n_data/)
```

- New token, editor password or MailHog login: empty `SECURE_MOM_N8N_TOKEN`, `N8N_OWNER_PASSWORD_HASH` or
  `MAILHOG_PASSWORD_HASH` in `.env` and re-run `setup.sh` (it prints a new editor password once; a new MailHog
  login recreates the MailHog container, which empties its inbox), then restart the backend so it reads a new
  token.
- Newer images: pull the tag, read its digest with
  `docker image inspect --format '{{index .RepoDigests 0}}' n8nio/n8n:<tag>` and put it in
  `docker-compose.yml` with the tag in the comment.
- On Linux n8n runs as uid 1000: `sudo chown -R 1000:1000 automation/n8n_data` if it can't write there
  (then `sudo chmod 700 automation/n8n_data`: setup.sh keeps it private only while you own it).
- n8n logs that Python is missing for its task runner: harmless, the workflow has no Code node.
