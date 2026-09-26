# Frontend — Verbal

React 19 + TypeScript + Tailwind CSS 4 (Vite). Demo data only, no backend calls yet.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # store + routing tests (Vitest)
npm run build      # typecheck + production build in dist/
npm run lint
```

Demo accounts are listed on the sign-in screen; any 6-digit code passes 2FA.

## Structure

```
src/
├── app/          router, route guards, screen registry (which page each /:cabinet/:screen shows)
├── features/     one folder per area: auth, shell, meetings, new-meeting, minutes, tasks, admin, account
├── stores/       zustand stores: all state and actions (session, minutes, processing, admin, …)
├── mocks/        demo data; only stores import it, so the API can replace it later
├── shared/
│   ├── ui/       design-system primitives (Button, Panel, Field, Segmented, Menu, PageHeader, …)
│   ├── config/   cabinets, their tabs and home screens
│   ├── i18n/     EN / RO / RU labels
│   ├── lib/      cn(), dates, colour tones
│   └── types/    domain model
└── styles/index.css   design tokens (@theme)
```

Features import `shared/` and `stores/`, never each other.

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
