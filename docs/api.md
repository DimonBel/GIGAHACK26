# Secure MOM — API contract

The web app (`web/`, React) talks only to the backend (`server/`, FastAPI) under `/api`. The backend runs the
speech pipeline (`stt/`) and hands approved minutes to n8n (`automation/`), which emails them through MailHog.
Everything listens on 127.0.0.1 unless configured otherwise. JSON everywhere except the audio upload.

## Roles

| Role | Can |
|---|---|
| `admin` | everything: users, distribution lists, settings, audit log, all meetings |
| `moderator` | create meetings (upload / record), see their own meetings' progress, transcript and minutes, edit, approve, send; read the minutes other moderators sent to them |
| `user` | read the minutes that were sent to them |
| anonymous | only `POST /api/auth/login` and the login page |

Every endpoint checks the role on the server: a role that may never use an endpoint gets 403 (a `user` calling a
moderator endpoint). A moderator gets 404 (not 403) for a meeting that is neither theirs nor sent to them. A user
whose `must_change_password` is true gets `403 {"detail": "Change your password first"}` everywhere outside
`/api/auth` until they change it.

## Auth

- `POST /api/auth/login` `{email, password}` (JSON) → `200 {user, csrf_token}` and a session cookie `smom_session`
  (httpOnly, SameSite=Strict, Secure when served over HTTPS). A session ends after 8 h without a request and 12 h
  after the login however active it is (then `401`). `401` on bad credentials or a deactivated account, `429`
  with `Retry-After` after 5 failures for that email, or 30 from that client address, within 15 minutes (locked
  for 15 minutes; the address limit is higher because every client on this machine is 127.0.0.1). A successful
  login resets the email's count, not the address's.
- `POST /api/auth/logout` → `204`, session deleted server-side.
- `GET /api/auth/me` → `200 {user, csrf_token}` or `401`.
- `POST /api/auth/password` `{current, new}` → `200 {user, csrf_token}` (the same session and token): the signed-in
  user's new password (12–256 characters, not the current one). Signs the user out everywhere else and clears
  `must_change_password`. `400` for a wrong `current` (`"current: the password is wrong"`) or an invalid `new`;
  wrong guesses count like failed logins of that email, not of the address (`429` after 5, for the login too).
  Guesses sent at the same time are checked one after the other, so none of them escapes the count.
- `must_change_password` is true while the user signs in with a password someone else chose: an admin (new
  account, reset) or `create-user` on the command line. The web app then shows only the change-password page.
- Every non-GET request of a signed-in user (logout included) needs the header `X-CSRF-Token: <csrf_token>` (else
  `403`).
- The first admin is created on the command line: `python -m server.cli create-admin --email ... --name ...`
  (asks for the password; `--password-stdin` for scripts). There are no default accounts.

`User`:
```json
{"id": 1, "email": "ana@medpark.md", "full_name": "Ana Popescu", "position": "Cardiologist",
 "role": "moderator", "active": true, "must_change_password": false, "created_at": "2026-09-26T18:00:00Z"}
```
Times are UTC, `YYYY-MM-DDTHH:MM:SSZ`. Email addresses are stored in lower case; internal domains such as
`medpark.local` are valid, quotes, spaces, commas and angle brackets are not.

## Users (admin)

- `GET /api/users` → `[User]` (by name)
- `POST /api/users` `{email, full_name, position, role, password}` → `201 User` (password 12–256 characters,
  `must_change_password` true); `409` if the email exists
- `PATCH /api/users/{id}` any of `{full_name, position, role, active, password}` → `User`. A new password or
  deactivation signs that user out everywhere (an admin changing their own password keeps the current session).
  A new password sets `must_change_password`, except on the admin's own account.
- `DELETE /api/users/{id}` → `204` (deactivates and signs out; users are never deleted: meetings and the audit log
  refer to them)
- The last active admin can't be demoted or deactivated: `409`.
- `GET /api/directory` (moderator, admin) → `[{id, full_name, position, email}]` of active users, for picking
  recipients
- `GET /api/directory/domains` (moderator, admin) → the domains minutes may be sent to, the
  `allowed_recipient_domains` setting (`["medpark.md", "medpark.local"]`; `[]`: any)

## Distribution lists (admin writes, moderator reads)

`DistributionList`:
```json
{"id": 3, "name": "Medical board", "meeting_type": "medical",
 "members": [{"user_id": 1, "email": "ana@medpark.md", "name": "Ana Popescu", "kind": "to"},
             {"user_id": null, "email": "quality@medpark.md", "name": "", "kind": "cc"}]}
```
`meeting_type` is `medical`, `executive`, `administrative` or `null` (any). A member is a user (`user_id`; email
and name come from the user record, deactivated users are left out) or an external address (`email`); `kind` is
`to` or `cc`.

- `GET /api/lists` (moderator, admin) → `[DistributionList]` by name; `?meeting_type=medical` returns the lists
  for that type and the ones for any type
- `POST /api/lists` `{name, meeting_type, members: [{user_id, kind} | {email, kind}]}` → `201`; each address
  once; `400` for an unknown `user_id` or an external address outside `allowed_recipient_domains`
  (`"Not in an allowed recipient domain (medpark.md, medpark.local): guest@gmail.com"`), `409` if the name exists
- `PATCH /api/lists/{id}` any of `{name, meeting_type, members}` (members are replaced) → `DistributionList`;
  `DELETE /api/lists/{id}` → `204`

## Settings (admin)

- `GET /api/settings` → the settings; `PUT /api/settings` any subset of them (unknown keys `400`) → all of them:
```json
{"asr_engine": "mlx", "asr_model": "models/ggml-large-v3-turbo-q8_0.bin", "llm_model": "gemma4:e4b",
 "language": "auto", "delivery": "n8n", "n8n_webhook_url": "http://127.0.0.1:5678/webhook/secure-mom",
 "smtp_host": "127.0.0.1", "smtp_port": 1025, "mail_from": "secure-mom@medpark.local",
 "allowed_recipient_domains": ["medpark.md", "medpark.local"], "keep_audio_days": 0, "max_upload_mb": 500,
 "max_duration_min": 240}
```
The defaults are MLX with the turbo model on Apple Silicon, whisper.cpp with `models/ggml-large-v3.bin`
elsewhere. `asr_engine` + `asr_model` must work on this machine (the whisper.cpp file exists, MLX is available and
knows the model), else `400`. `delivery` is `n8n` (default) or `smtp` (direct, fallback). `n8n_webhook_url` and
`smtp_host` must be 127.0.0.1 / localhost unless the server runs with `SECURE_MOM_ALLOW_REMOTE_DELIVERY=1`.
`allowed_recipient_domains` are the domains minutes may be sent to (`send` and the external addresses of
distribution lists): exact matches (a subdomain is its own entry), at most 100, lower-cased and deduplicated; `[]`
allows any domain. `keep_audio_days: 0` deletes the audio once processed (the transcript and minutes stay);
`max_upload_mb` is 1–10240, `max_duration_min` (the longest recording accepted) 1–1440.

## Meetings

`Meeting`:
```json
{"id": "6f1c…", "title": "Medical board 26.09", "meeting_type": "medical", "status": "processing",
 "progress": {"stage": "transcribing", "done": 12, "total": 27, "message": "Transcribing 12/27"},
 "created_by": {"id": 2, "full_name": "Ion Rusu"}, "created_at": "…", "duration_s": 703.2,
 "language": "ro", "error": null, "approved_by": null, "approved_at": null, "sent_at": null,
 "recipients": {"to": [], "cc": []},
 "timings": {"transcription_s": 92.1, "minutes_s": 140.3, "total_s": 240.0}}
```
`status`: `queued` → `processing` → `ready` (draft minutes) → `approved` → `sent`; or `failed` (`error` says why,
`progress.message` is "Failed" and `progress.stage` stays where it failed).
`progress.stage`: `queued`, `converting`, `transcribing`, `speakers`, `minutes`, `done`.
`approved_by` is `{id, full_name}` like `created_by`; `recipients` are the addresses the minutes were sent to
(empty until sent); every `timings` value is `null` until known; `duration_s` is `null` while ffprobe can't tell
it (then set from the transcript); `language` is the main language once transcribed. `error` is a fixed text
(e.g. "The local LLM (Ollama) is not reachable. Is it running?", or "Processing failed (KeyError); the server log
has the details"): paths, URLs and tracebacks go to the server log only. A meeting whose processing a server stop
interrupted stays `processing` and is processed again at the next start (once; then `failed`); stopping the
server also stops the transcription with everything it started (whisper-server).

- `POST /api/meetings` (moderator, admin) multipart: `file` (audio/video, also a browser recording
  `audio/webm`), `meeting_type`, `title` (optional) → `201 Meeting`; processing starts in the background, one
  meeting at a time (queue). The default title is "<Type> meeting dd.mm.yyyy HH:MM"; a title is one line of at
  most 200 characters. The file is stored under a random name. `400` for a malformed form, no or an empty file,
  or a bad `meeting_type`; `413` over `max_upload_mb`, with more than 64 KB of form fields and part headers
  around the file, or longer than `max_duration_min` (`"The recording is longer than 240 minutes"`, by the
  container's duration or else its last audio packet); `415` if ffprobe finds no audio stream or the container is
  not audio/video (wav, mp3, mp4/m4a/mov/3gp, webm/mkv, ogg, flac, aac, caf, aiff, asf, amr, avi, mpeg, ts, w64,
  au; playlists such as HLS or concat are refused); `429` while the uploader already has 3 meetings `queued` or
  `processing` (checked before the file is received).
- `GET /api/meetings` → `[Meeting]`: admin all, moderator their own and the ones sent to them, user the ones sent
  to them (newest first)
- `GET /api/meetings/{id}` → `Meeting` (poll every 2 s while `queued`/`processing`)
- `GET /api/meetings/{id}/transcript` (owner moderator, admin; `409` before it exists) →
```json
{"language": "ro", "utterances": [{"start": 3.1, "end": 29.9, "speaker": "SPEAKER 2",
  "role": "presents patients", "languages": ["ro", "ru"], "accent": "", "text": "Pacientul din patul 8, …"}]}
```
  `role` comes from the participants of the current (edited) minutes; `accent` is the English accent by name
  ("American", "British", …) or `""`.
- `GET /api/meetings/{id}/audio` (owner moderator, admin) → the recording for playback (Range requests: `206`);
  `404` once it is no longer kept. Each playback is audited (`view_audio`) by its first request: no `Range`, or
  `bytes=0-`.
- `GET /api/meetings/{id}/minutes` → `Minutes` (the edited version if there is one; `409` before they exist);
  recipients (users, other moderators) only after `sent`, each reading audited (`view_minutes`)
- `PUT /api/meetings/{id}/minutes` (owner moderator, admin; status `ready`) `Minutes` → `Minutes` as stored
- `POST /api/meetings/{id}/approve` (owner moderator, admin; status `ready`) → `Meeting` with status `approved`
  ("I agree": the minutes are frozen, the recipients step opens)
- `POST /api/meetings/{id}/reopen` (owner moderator, admin; status `approved`) → back to `ready` for more edits (`approved_by` cleared)
- `POST /api/meetings/{id}/send` (owner moderator, admin; status `approved`) `{to: [email], cc: [email]}` → `Meeting` with status
  `sent`. `to` must not be empty (at most 200 each); addresses are validated (`400`), lower-cased and
  deduplicated, and `cc` drops the ones already in `to`; every address must be in `allowed_recipient_domains`
  (`400 {"detail": "Not in an allowed recipient domain (medpark.md, medpark.local): ana@gmail.com"}`). Delivery
  goes through n8n (or SMTP if configured). If it fails: `502 {"detail": "The email could not be sent: n8n is not
  reachable"}` (a fixed reason; hosts, URLs and n8n's own answer go to the server log), the meeting stays
  `approved` and a `send_failed` audit entry gives the same reason.
- `DELETE /api/meetings/{id}` (owner moderator, admin) → `204`, deletes audio, transcript and minutes; `409` while
  it is `processing` (a `queued` meeting can be deleted)
- Actions in the wrong status answer `409`.

`Minutes` (as written by `stt.minutes.builder`, all fields editable):
```json
{"title": "…", "summary": "…", "suggestions": ["…"],
 "key_moments": [{"time": "04:12", "moment": "…"}],
 "topics": [{"name": "Bed 8", "time": "00:03", "status": "…", "findings": ["…"]}],
 "decisions": [{"decision": "…", "time": "01:32", "patient": "Bed 8"}],
 "action_items": [{"task": "…", "owner": "urologist Butnari", "deadline": "today", "priority": "high",
                   "time": "05:36", "patient": "Box"}],
 "open_issues": ["Bed 9: …"], "warnings": ["…"],
 "participants": {"SPEAKER 1": {"role": "leads the round", "name": "", "evidence": "…", "seconds": 312}}}
```
The server always returns every field. On `PUT` missing fields become empty, unknown fields are dropped, numbers
become text, `priority` is `high`, `medium` (default) or `low`; a field holds at most 4000 characters (the summary
20000) and a list at most 500 entries.

## Audit (admin)

- `GET /api/audit?meeting_id=…&limit=500` → newest first (`limit` 1–5000, default 500):
```json
[{"id": 42, "at": "2026-09-26T18:03:00Z", "user": "ion@medpark.md", "action": "send",
  "meeting_id": "6f1c…", "detail": "to: ana@medpark.md; cc: -"}]
```
`user` is the actor's email (for `login_failed` the email that was tried; `null` for the command line). Actions:
`login`, `login_failed`, `password_change`, `password_change_failed`, `upload`, `view_transcript`, `view_audio`,
`view_minutes` (by a recipient), `edit_minutes`, `approve`, `reopen`, `send`, `send_failed`, `delete` (the detail
is the meeting type, not the title: titles may name patients), `user_create`, `user_update`, `user_delete`,
`list_create`, `list_update`, `list_delete`, `settings`.

## n8n delivery

On `send`, the backend posts to `n8n_webhook_url` with the header `X-Secure-MOM-Token: <shared secret>` and a
60 s timeout:
```json
{"meeting_id": "6f1c…", "meeting_type": "medical", "subject": "[Medical] Medical board 26.09",
 "to": ["ana@medpark.md"], "cc": ["quality@medpark.md"], "html": "<html>…</html>", "text": "…",
 "from": "secure-mom@medpark.local"}
```
The subject is "[Medical|Executive|Administrative] <meeting title>". The shared secret is `SECURE_MOM_N8N_TOKEN`:
`automation/setup.sh` writes it to `automation/.env`, where the backend reads it (the process environment and
`server/.env` take precedence), and stores it in n8n as the webhook's Header Auth credential. The webhook
refuses a missing or wrong token with `403` (plain text, before the workflow runs); the workflow then routes on
`meeting_type` (it adds the subject prefix when it is missing, and a footer per type), sends the email through
MailHog's SMTP (`mailhog:1025` inside Docker) and answers `200 {"sent": true}`; otherwise `400 {"detail"}`
(payload or type) or `502 {"sent": false, "detail"}` (mail server down). A send only counts when n8n answers 2xx
and `sent` isn't `false`. MailHog's inbox and API are at http://127.0.0.1:8025 behind basic auth (`MAILHOG_USER`
/ `MAILHOG_PASSWORD` in `automation/.env`). The HTML is rendered by the backend from the minutes with escaping
(LLM output is untrusted); the text part is the same minutes in Markdown.

## Errors

`{"detail": "message"}` with the usual status codes: 400 invalid input (validation: `"field: problem"`, e.g.
`"to.0: 'x' is not a valid email address"`), 401 not logged in, 403 CSRF / role / password to change, 404 not
found (or not yours), 409 wrong status for the action or a duplicate (user email, list name), 413 (upload over
`max_upload_mb` or `max_duration_min`, other bodies over 1 MB), 415, 429 (login lockout, 3 meetings waiting),
502 (email delivery failed), 500.

## Hosting

The backend serves the web build (`web/dist`) on the same origin, with `index.html` for every path outside `/api`
(client-side routes). There is no `/docs` or `/openapi.json` (Swagger UI would load files from a CDN). Every
response carries `Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'
blob: data:; media-src 'self' blob: data:; object-src 'none'; base-uri 'none'; form-action 'self';
frame-ancestors 'none'` (inline styles: Mantine's theme `<style>` elements; scripts only from the server),
`nosniff`, `no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), geolocation=(),
microphone=(self)` (browser recording) and same-origin COOP/CORP; `/api` answers are `no-store`. Requests whose
`Host` is not 127.0.0.1, localhost or the configured host (`SECURE_MOM_HOST`, `SECURE_MOM_ALLOWED_HOSTS`) get
`400`. `X-Forwarded-For` and `X-Forwarded-Proto` are ignored: the client address (login lockout, audit log) is
the one the connection comes from.

The backend listens on 127.0.0.1:8000. It refuses to start on an address other machines can reach
(`SECURE_MOM_HOST` other than localhost or a loopback address) without HTTPS: either its own certificate,
`SECURE_MOM_TLS_CERT` and `SECURE_MOM_TLS_KEY` (PEM files; uvicorn serves HTTPS), or `SECURE_MOM_COOKIE_SECURE=1`
for a TLS proxy in front of it (e.g. nginx or Caddy terminating HTTPS for the hospital's hostname, which must
then be in `SECURE_MOM_ALLOWED_HOSTS`; best on the same machine, with the backend on 127.0.0.1). Over HTTPS, and whenever
`SECURE_MOM_COOKIE_SECURE=1`, the session cookie is Secure and every response carries
`Strict-Transport-Security: max-age=31536000`.
