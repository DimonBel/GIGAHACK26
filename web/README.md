# Secure MOM web app

React 19 + TypeScript + Vite + Mantine 9, React Router 8 and TanStack Query. It talks only to the backend under
`/api` (contract: [docs/api.md](../docs/api.md)); everything is bundled, so it works without internet (system fonts,
no CDN, no analytics).

```bash
cd web
npm ci                 # once
npm run dev            # http://127.0.0.1:5173, /api is proxied to the backend on 127.0.0.1:8000
npm run build          # type check + production build into web/dist (served by the backend)
npm run lint           # ESLint + Prettier check
npm test               # Vitest (no backend needed)
```

`SMOM_API_URL=http://127.0.0.1:8765 npm run dev` proxies to a backend on another port.

In production the backend serves `web/dist` with a fallback to `index.html` for client-side routes. Its
Content-Security-Policy allows inline styles (`style-src 'self' 'unsafe-inline'`) because Mantine injects its theme
variables and responsive layout rules as `<style>` elements; scripts stay `'self'` only. The Vite dev server
doesn't apply that policy, so check a change to styling or loading with the build served by the backend.

## Pages

| Role             | Pages                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| moderator, admin | Meetings, New meeting (upload or record), meeting page: live progress, then Minutes (edit, "I agree", reopen), Transcript (search, playback), Send (lists, colleagues, CC, email preview) |
| admin            | Users, Distribution lists, Settings, Audit log                                                                                                                                            |
| user             | My minutes (read-only, printable)                                                                                                                                                         |
| everyone         | Change password (account menu); the only page while signing in with a password an admin chose                                                                                             |

## Layout

```
src/api/         fetch client (CSRF header, 401 -> login), typed models, one function per endpoint, React Query hooks
src/auth/        session check on load, login / logout, role guard
src/components/  app shell, badges, minutes view, recorder, shared states
src/hooks/       leave-page guard, microphone level, clock
src/lib/         formatting, meeting labels, recipients, minutes form values, search
src/pages/       one folder per area: meetings, admin, my
```
