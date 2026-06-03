# Build the inert verify landing page (`GET /verify/:token`)

**Atomic task.** Adds the page the email link opens — an inert page with a button that, when
clicked, calls the promotion endpoint and confirms in place.

## Current state
`POST /verify/:token` promotes a pending row (idempotent) and returns JSON; it sets no session.
There is no `GET` page for the link, so clicking the email link has no UI. The login page is
the styling reference, and `dev-utils/REDESIGN/NEW_PAGE_GUIDE.md` describes how to add an SSR
page (template, CSS, TS entry, route, esbuild entry).

## Do
- New SSR page: `src/server/views/verify.njk`, `src/client/css/verify.css`,
  `src/client/scripts/esm/views/verify.ts`, a `GET /verify/:token` render route in
  `src/server/routes/root.ts`, esbuild entries in `build/client.ts`, and
  `translation/verify/en-US.toml`.
- The GET page is **inert** — no DB writes, no token consumption. It reads the token only to
  choose what to render:
  - **token exists (valid)** → a **"Verify my account"** `btn-primary` button. An
    already-verified token **also** shows the button; clicking it hits the **idempotent**
    `POST /verify/:token`, which just succeeds — so there is no separate "already verified"
    state to build.
  - **unknown / expired** → a "link expired or invalid" message with a link to `/register`.
- Set **`Referrer-Policy: no-referrer`** on the response (prefer the header over a `<meta>`).
- On a **real button click** (never auto-submit on load), `serverFetch` the
  `POST /verify/:token` (returns JSON). On success, **swap the text in place** to a
  device-agnostic confirmation: "✓ Your email is verified — head back to where you signed up
  and you'll be logged in." **No login link.** **Never set a session / never redirect home.**
- On error (invalid/expired token) show a clear message with a link back to `/register`.

## Out of scope
- The promotion endpoint, the poll, and Turnstile — separate tasks.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass; the page builds.
- The email link shows the inert page with a button; clicking it verifies and swaps to the
  confirmation in place (no redirect, not logged in on that device); a register tab polling
  elsewhere then logs in; an invalid/expired token shows the error state; `Referrer-Policy` is
  set on the response.
