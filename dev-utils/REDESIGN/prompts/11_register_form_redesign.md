# Redesign the register page form

**Atomic task.** Rebuilds the register page's form (markup, styles, client script,
translations) to match the finished login page, with live validation and availability checks,
submitting via `fetch`.

## Current state
`src/server/views/register.njk` is a `<main></main>` stub and
`src/client/scripts/esm/views/register.ts` references old elements; `src/client/css/register.css`
exists. In `build/client.ts`, `register.ts` is commented out and `register.css` is not listed.
The **login page is the finished reference** — `src/server/views/login.njk`,
`src/client/scripts/esm/views/login.ts`, `src/client/css/login.css`,
`translation/login/en-US.toml` — match its structure, classes, and conventions.
`POST /register` accepts the form and returns success JSON (or inline validation/conflict
errors).

## Do
- Rebuild `register.njk` like `login.njk`: `{% set t = templateT('register') %}`, the
  `bg-checkerboard` main + overlay, a `login-card`-style card (reuse shared classes; add
  register-specific CSS only where needed), fields for **username, email, password**, an inline
  error element per field, and a `btn-primary` submit. Ship script strings via a
  `{% block head %}` `window.t` assignment exactly like `login.njk`.
- Create `translation/register/en-US.toml` mirroring `translation/login/en-US.toml` (template
  strings + a `[script]` table; English only).
- Rewrite `register.ts` in the `login.ts` style: use `serverFetch`; keep live validation
  (username/email/password format via `shared/util/validators.js`, plus on-blur availability
  checks to `/register/username/:username` and `/register/email/:email`); keep the submit
  disabled until the form is valid.
- **On submit:** `serverFetch('/register', { POST, json body })`. On success, **swap the card
  in place** to a simple static "Check your email" message — do **not** navigate (no
  `window.location = '/409'`). On a validation/conflict error, show it inline.
- `build/client.ts`: uncomment/add `register.ts` and add `register.css`.

## Out of scope
- Making the "Check your email" state poll, come alive, or re-render on reload — separate task.
- Resend / "Wrong email?" controls, the verify page, and Turnstile — separate tasks.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass; the page builds.
- `/register` renders a redesigned form consistent with the login page; live validation and
  availability checks work; submit swaps to a static "Check your email" message without
  navigating; errors show inline.
