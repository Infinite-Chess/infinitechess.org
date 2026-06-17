# Prompt 3 — "Set a new password" page (the email-link landing)

You are working on the infinitechess.org redesign. Assume prompts 1 and 2 are already complete
and working. Your job is to build the page the **reset email link lands on**
(`/reset-password/:token`), where the user enters their new password.

Read `CLAUDE.md` and `docs/systems/REGISTRATION.md` for conventions. The **verify page** is the
closest precedent (it's the other URL-token landing page) — study its multi-state SSR approach
for inspiration, but design your own markup.

## Context

- The page route `page('/reset-password/:token', …)` already exists in `root.ts`. After prompt 1,
  it now computes a **token-validity state** and passes it into the render (the way
  `/verify/:token` passes `getVerifyPageState(req)` into `verify.njk`). The current template
  `resetpassword.njk` is a 9-line stub — this is the template you flesh out.
- The endpoint `POST /api/reset-password` already exists. After prompt 1, a successful reset:
  invalidates all of the user's sessions, sets the new password, **then logs THIS browser in**
  (a session cookie is now set), and sends a receipt email.
- There is **old, pre-redesign code to remove/replace**: `src/client/scripts/esm/views/resetpassword.ts`
  (old global-`translations` style; it redirected to `/login`) and the old EJS view
  `src/client/views/resetpassword.ejs`. Replace the client script with a redesign-style one and
  delete the dead EJS view.
- References: `verify.njk` + `src/client/scripts/esm/views/verify.ts`; `login.css` / `verify.css`
  for styling conventions; `serverFetch`; shared validators (`shared/util/validators.js`) for
  password format.

## Decisions already made

- The page renders **two states** off the SSR token-validity state from prompt 1:
  - **valid** → a "set new password" form (new password + confirm password).
  - **invalid/expired** → a clear "this link is invalid or has expired" message with a link to
    request a new one (`/forgot-password`, the page from prompt 2).
- On a successful reset the user is now **logged in on this device**, so send them to the
  **home page** (`/`), not to `/login`. Before redirecting, queue a brief success toast with
  `flashToast.queue(...)` (`src/client/scripts/esm/util/flashToast.js`) — it survives the
  navigation; `register-awaiting.ts` does exactly this before its redirect home.

## Requirements

1. Flesh out the existing `src/server/views/resetpassword.njk` stub to render the two states
   described above, using the same `auth-card` / `bg-checkerboard` / header+footer structure as
   the sibling auth pages. Add a `src/client/css/resetpassword.css` stylesheet wired through the
   manifest, and keep the client logic at `src/client/scripts/esm/views/resetpassword.ts`
   (rewriting the old file there — see below).
2. Build the redesign client script: read the token from the URL path. The new-password field
   must enforce the **same requirements as the register page's password field** — the same shared
   `validators.validatePassword`, the same min-length error feedback (the `t.shared.account.password_short`
   message register uses), and the same `maxlength="72"` on the input. Also require the
   confirm-password field to match. Surface validation errors inline, and only submit
   `{ token, password }` to `/api/reset-password` via `serverFetch` once valid. (The backend
   independently re-checks the format via `doPasswordFormatChecks`, so also handle a
   format error message returned from the server.)
3. On success → redirect to `/`. On failure (e.g. the token expired between page-load and
   submit, or a server error) → show the error inline; don't navigate.
4. Remove the dead old code noted above.
5. Strings stay **hardcoded English** for now (localization is a later prompt).

You own the page design — the above is requirements and context, not a layout. Don't copy the
verify markup verbatim; build what this page needs.

When done, ensure `npm run type-check --silent` and `npm run lint --silent` both pass, and check
for redundancy against the sibling pages.
