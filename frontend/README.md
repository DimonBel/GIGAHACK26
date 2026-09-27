# Frontend — Verbal

React 19 + TypeScript + Tailwind CSS 4 (Vite). Meetings, minutes and sign-in come from the server
(`../server`, `python -m api`); the admin screens and My tasks still use demo data.

```bash
npm install
npm run dev        # http://localhost:5173 — /api is forwarded to http://127.0.0.1:8000 (API_URL to change)
npm test           # store + routing tests (Vitest)
npm run build      # typecheck + production build in dist/
npm run lint
```

Start the server first (`cd ../server && .venv/bin/python -m api`). Sign in with a demo account from the list
on the sign-in screen and the password set on the server (`SEED_PASSWORD`, default `demo`). Recording in the
browser needs `localhost` or HTTPS.

## Structure

```
src/
├── api/          the only code that calls the server: fetch/upload client, typed endpoints, response types
├── app/          router, route guards, screen registry (which page each /:cabinet/:screen[/:meetingId] shows)
├── features/     one folder per area: auth, shell, meetings, new-meeting, minutes, tasks, admin, account
├── stores/       zustand stores: all state and actions (session, meetings, processing, minutes + autosave, …)
├── mocks/        demo data of the screens not connected yet (admin, tasks)
├── shared/
│   ├── ui/       design-system primitives (Button, Panel, Field, Segmented, Menu, PageHeader, …)
│   ├── config/   cabinets, their tabs and home screens
│   ├── i18n/     EN / RO / RU labels
│   ├── lib/      cn(), dates, colour tones
│   └── types/    domain model
└── styles/index.css   design tokens (@theme)
```

Features import `shared/`, `stores/` and `api/` types, never each other. Stores call `api/`.

## Minutes

The server sends the minutes as a document: overview (title, summary, key moments, AI follow-ups, warnings),
participants (voices the moderator can name), topics, next meeting. Each topic is a list of **blocks** —
text, list, tasks or codes — that the moderator renames, reorders, adds and deletes in edit mode
(`features/minutes/blocks/`). Edits autosave 800 ms after the last change with the document's version; a newer
version on the server stops saving and offers a reload. Times in the minutes open the topic's transcript at that
line. A wrong meeting type is fixed by clicking the type in the header: the minutes are made again from the
saved transcript (the processing view shows the progress). Approving locks the document and emails it to the attendees chosen in Participants (through the server's
local Mailpit; the header shows when every email was sent, and offers a retry if one failed).

## Design rules

- **Colour 60-30-10:** 60 % neutral (canvas `#FAFAF8`, white, hairlines), 30 % ink `#17201E` (header, text),
  10 % teal `#1F5F55` (primary action, active state, focus). Amber / red / indigo only as small status signals.
  Tailwind's default palette is removed: only the tokens in `styles/index.css` exist.
- **Two typefaces:** Instrument Sans for everything you read and operate; Source Serif 4 as the accent
  (page and topic titles, summaries, quoted views). Numbers use `tabular-nums`.
- **Type scale by role:** `text-overline · caption · small · body · reading · lead · title · heading · display`.
- Every screen starts with a `PageHeader` (title, one line of context, its actions — the primary one teal).
- One primary button per view; icons from `lucide-react` at 16 px, stroke 1.75.
- Hairlines and whitespace instead of boxes and shadows; shadows only on floating menus.
- Keyboard first: visible focus ring on every control, menus close on Escape / outside click, forms submit on Enter.
