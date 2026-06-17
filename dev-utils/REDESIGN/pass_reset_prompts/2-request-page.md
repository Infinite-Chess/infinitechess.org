# Prompt 2 — "Request a password reset" page

You are working on the infinitechess.org redesign. Assume the backend changes from prompt 1 are
already complete and working. Your job is to build the **page where a user requests a reset
link** by entering their email. Do **not** touch the set-password page (`/reset-password/:token`)
— that's the next prompt.

Read `CLAUDE.md` and `docs/systems/REGISTRATION.md` for conventions. The **login page** and the
**register page** are your design and structural references.

## Context

- The login card already has a "reset password" link, but it currently points to the **broken**
  `/resetpassword` (no such route). You will fix it.
- The backend endpoint `POST /api/forgot-password` already exists, is rate-limited, and is
  **anti-enumeration**: it returns an identical generic success response whether or not an
  account exists for that email. (`src/server/controllers/passwordResetController.ts`.)
- Sibling pages to imitate for structure/markup/CSS conventions:
  - `src/server/views/login.njk` + `src/client/scripts/esm/views/login.ts` + `src/client/css/login.css`
  - `src/server/views/register.njk` + `src/client/scripts/esm/views/register.ts`
  - The page route helper `page('…', …)` lives in `src/server/routes/root.ts`.
  - Client fetch helper: `serverFetch` (`src/client/util/serverFetch.js`).
  - Shared format validators: `shared/util/validators.js` (has email validation).

## Decisions already made

- The page asks for **email only** (never username — usernames aren't private, so accepting one
  would let anyone spam reset emails at a target).
- After submitting, there is **no polling and no separate "awaiting" page**. The page simply
  swaps its own content **in place** to a generic confirmation ("If an account exists for that
  email, we've sent a reset link"). No new route, no cookie. This is correct because the device
  that completes the reset is the one that clicks the email link, not this one.

## Requirements

1. Add a page route `GET /forgot-password` in `root.ts` that renders this page, with these
   filenames (the existing `resetpassword.njk` stub is a *different* page — the set-password
   landing at `/reset-password/:token`, owned by the next prompt — so don't reuse it here):
   - Template: `src/server/views/forgotpassword.njk`
   - Stylesheet: `src/client/css/forgotpassword.css`
   - Client script: `src/client/scripts/esm/views/forgotpassword.ts`
2. Build the page: a single email field and a submit button, inside the same `auth-card` /
   `bg-checkerboard` / header+footer structure the login and register pages use, with its
   stylesheet wired through the manifest like the siblings do.
3. On submit, POST the email to `/api/forgot-password` via `serverFetch`, then:
   - **`2xx`** → swap the card to the **generic confirmation** ("If an account exists for that
     email, we've sent a reset link") — identical wording in every success case, to preserve
     anti-enumeration. The server already returns the same generic `200` whether or not the
     account exists.
   - **non-`2xx`** (e.g. rate-limited `429`, or a blacklist/server message) → display the
     server-provided `message` inline (fall back to a generic "please try again later" if none),
     the way the login/register pages surface server errors. Reveal nothing beyond what the
     server chose to return.
   - **network/transport failure** → show the **same** network-error message the sibling auth
     pages use (login/register render `t.shared.errors.network`, i.e. "Network error. Please try
     again."), for consistency.
4. Validate email **format** client-side with the shared validators before sending (for UX);
   never reveal whether the address is registered.
5. Fix the login page's reset link to point to `/forgot-password`.
6. Strings stay **hardcoded English** for now (localization is a later prompt).

You own the actual page design — lay out the markup, states, and styling yourself in the spirit
of the sibling pages. The above is requirements, not a layout.

When done, ensure `npm run type-check --silent` and `npm run lint --silent` both pass, and check
for any redundancy you introduced against the sibling pages.
