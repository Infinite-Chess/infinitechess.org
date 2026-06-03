# Chunk 03 — Front-end: register page redesign + verify page + polling

**Read `00_OVERVIEW.md` first. Requires chunk `01`** (it consumes the routes/contracts
from `01`). Independent of chunk `02`. **No Turnstile yet** — that is chunk `04`, which
adds the widget to the form you build here.

The register page is **mid-redesign**: `src/server/views/register.njk` is a `<main></main>`
stub and `src/client/scripts/esm/views/register.ts` references old elements. The **login
page is the finished reference** — match its structure, classes, and conventions exactly.
Read these before starting:
- `src/server/views/login.njk`, `src/client/scripts/esm/views/login.ts`,
  `src/client/css/login.css`, `translation/login/en-US.toml`
- `dev-utils/REDESIGN/NEW_PAGE_GUIDE.md` and `dev-utils/REDESIGN/TRANSLATION_SYSTEM.md`

## Scope (do)

### A. Redesign the register page (`register.njk` + `register.ts` + `register.css`)
- Rebuild `register.njk` like `login.njk`: `{% set t = templateT('register') %}`, the
  `bg-checkerboard` main + overlay, a `login-card`-style card (reuse shared classes;
  add register-specific CSS only where needed), fields for **username, email, password**,
  an inline error element per field, and a `btn-primary` submit. Ship script strings via a
  `{% block head %}` `window.t` assignment exactly like `login.njk`.
- Create `translation/register/en-US.toml` mirroring `translation/login/en-US.toml`
  (template strings + a `[script]` table). English only.
- Rewrite `register.ts` to the login.ts style: use `serverFetch`; keep the existing live
  validation behavior (username/email/password format via `shared/util/validators.js`,
  plus the on-blur availability checks to `/register/username/:username` and
  `/register/email/:email`), but modernize it to match the cleaner login.ts patterns.
  Keep the submit disabled until the form is valid.
- **On submit:** `serverFetch('/register', { POST, json body })`. On success, **swap the
  card in place** to the "Check your email" state (see B) — do **not** navigate. On a
  validation/conflict error, show it inline (no more `window.location = '/409'` redirect).

### B. "Check your email" state + polling + come-alive
- Build the post-submit state (same `/register` page): a calm "Check your email at
  `<masked email>`" message replacing the form. This must be renderable **two ways**:
  1. client-side swap immediately after a successful submit, and
  2. via **SSR** when the page loads with the pending cookie present (chunk `01` passes an
     `awaitingVerification` flag + masked email to `register.njk`). Branch in the template
     on that flag so reload / direct navigation is safe; no cookie → render the form.
- While in this state, **poll** `GET /register/poll` (from `01`) on an interval
  (~3s; cap the total duration, e.g. stop after ~20–30 min or back off):
  - `{ status: 'pending' }` → keep waiting.
  - `{ status: 'verified' }` → the session cookie is now set by the server; **redirect to
    `/`** and show the success toast (use `components/toast.ts`; you may pass the toast
    via a query param or sessionStorage so it shows after the navigation — match any
    existing toast-after-redirect pattern in the codebase, else a simple sessionStorage
    flag read on the home page).
  - `{ status: 'expired' }` → show a "your link expired, please register again" state with
    a way back to the form.

### C. The verify page (`GET /verify/:token`)
- New SSR page (follow `NEW_PAGE_GUIDE.md`): template `src/server/views/verify.njk`, CSS
  `src/client/css/verify.css`, TS entry `src/client/scripts/esm/views/verify.ts`, a render
  route in `root.ts` for `GET /verify/:token`, and esbuild entries in `build/client.ts`.
  Add a `translation/verify/en-US.toml`.
- The GET page is **inert**: it shows a short message and a **"Verify my account"**
  `btn-primary` button. It must perform **no** verification on load.
- Set a strict **`Referrer-Policy`** (e.g. `no-referrer`) on this page so the token does
  not leak via `Referer` when assets/links load. (Set it on the response in the route, or
  via a `<meta name="referrer" content="no-referrer">` — prefer the header.)
- On a **real button click** (never auto-submit on load), `serverFetch` the
  `POST /verify/:token` from `01`. On success, **swap the text in place** to a
  device-agnostic confirmation: "✓ Your email is verified! Head back to where you signed
  up and you'll be logged in." Optionally include a "Log in here" link (`/login`) for the
  cross-device user who wants to use the current device. **Never set a session / never
  redirect to home from this page.**
- On error (invalid/expired token) show a clear message with a link back to `/register`.

### D. Wire build + routes
- `build/client.ts`: uncomment/add `src/client/scripts/esm/views/register.ts`, add
  `src/client/css/register.css`, and add the new `verify.ts` + `verify.css` entries.
- `root.ts`: `GET /register` already renders `register.njk` (chunk `01` supplies the SSR
  flag); add `GET /verify/:token` → `res.render('verify.njk', { ... })` with the
  Referrer-Policy header. (The `POST /verify/:token` and poll routes are API routes from
  `01` in `middleware.ts`.)

## Out of scope
- Turnstile widget/keys — chunk `04` (it will add the widget to the form and disable
  submit until a token exists).
- Backend promotion/poll/session logic, pending table — chunk `01`.
- `is_verified` removal — chunk `02`.

## Acceptance criteria
- `npm run type-check --silent` and `npm run lint --silent` both pass; the page builds.
- `/register` renders a redesigned form consistent with the login page; live validation
  and availability checks work; submit swaps to "check your email" without navigating.
- Reloading `/register` mid-wait (pending cookie present) re-renders the "check your email"
  state via SSR; without the cookie it renders the form.
- Clicking the email link shows the inert verify page with a button; clicking the button
  verifies and swaps to the confirmation text in place (no redirect, not logged in on that
  device).
- After verifying, the original register tab's poll redirects it to `/` with a success
  toast, logged in.
- Verify it for real with the `verify` skill / by running the app: same-browser (two tabs)
  and a simulated cross-device case (verify in a different browser/incognito while the
  register tab polls in the first).

## Gotchas
- Don't reintroduce a `window.location` redirect on register submit — the whole point is
  the in-place swap + poll.
- Keep verify-page copy device-agnostic (never "return to your tab").
- Use `serverFetch` (not raw `fetch`) so the `is-fetch-request` header is sent.
- Mask the email in the "check your email" message (e.g. `j•••@gmail.com`) — don't echo it
  verbatim into the DOM from an untrusted source without escaping.
