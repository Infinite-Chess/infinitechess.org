# Prompt 1 — Password-reset backend changes

You are working on the infinitechess.org redesign. We are rebuilding the **password reset
flow**. The backend already implements the classic secure flow; your job is to make a handful
of targeted changes to it **before** any of the new pages are built. Do **not** build any
front-end pages — later prompts own those.

Read `CLAUDE.md` and `docs/systems/REGISTRATION.md` first for conventions. The registration /
verification flow is the sibling of this flow and is the precedent to imitate throughout.

## What already exists (reuse it, don't rebuild it)

- `src/server/controllers/passwordResetController.ts` — `handleForgotPasswordRequest`
  (`POST /api/forgot-password`, rate-limited, anti-enumeration) and `handleResetPassword`
  (`POST /api/reset-password`).
- `src/server/routes/password.ts` — mounts those two endpoints.
- `password_reset_tokens` table (`src/server/database/databaseTables.ts`). Tokens are 32 random
  bytes, **stored bcrypt-hashed**, single-use, 1-hour expiry. Each new request deletes the
  user's prior tokens, so a user has at most one outstanding token.
- `src/server/controllers/emailController.ts` — `sendPasswordResetEmail`.
- The page route `page('/reset-password/:token', …)` in `src/server/routes/root.ts` currently
  renders the stub `resetpassword.njk`.

## Decisions already made (these drive your changes)

1. The device that **clicks the email link and sets the new password** is the one that proved
   control, so on a successful reset it gets logged in. The device that merely *requested* the
   reset is never given a session.
2. The set-password page must be able to tell, **at page-load time**, whether the token is
   valid — so it can render an "invalid/expired link" state instead of a doomed form (mirrors
   how the verify page SSRs its states).
3. A "your password was changed" **receipt email** is sent after a successful reset.

## Your tasks

### A. Referrer-Policy on the set-password page route
The `/verify/:token` route in `root.ts` sets `Referrer-Policy: no-referrer` so the URL token
can't leak via the `Referer` header. The `/reset-password/:token` route does **not** — add the
same header there. Match the verify route's approach exactly.

### B. Issue a session on successful password reset
In `handleResetPassword`, after the password is updated and **after all of the user's sessions
are invalidated** (the existing `deleteAllRefreshTokensForUser` call — this kicks out a possible
attacker first), mint a fresh session for the requesting browser:

- Use `createNewSession(req, res, user_id, username, roles, false)` from
  `authenticationTokens/sessionManager.js` — `false` = non-persistent (there is no
  "keep me logged in" choice on this flow). The register flow does this in
  `registerController.ts` (~line 359) after a verified poll; imitate it, including the
  `roles` JSON parse.
- You'll need the member's `username` and `roles` (and `email` for task C). The controller only
  has `user_id` from the token; fetch what you need via `getMemberDataByCriteria` from
  `memberManager.js`.
- The success response no longer implies "go to the login page" — the client (built in prompt 3)
  will redirect home because the session cookie is now set. Keep the response body's
  message/shape sensible for that.

### C. Password-changed receipt email
Add a new send function to `emailController.ts`, `sendPasswordChangedEmail`, following the
existing functions' structure (the `createEmailHtmlWrapper`, the `mailer.send(...)` call, the
fire-and-forget error handling that logs and never throws into the caller). Wording is an
out-of-band security alert: the account's password was just changed; if it was them, no action
needed; if not, they should secure the account. Call it on a successful reset, **fire-and-forget**
(don't let an email failure fail the reset), the same way the other flows send mail.

### D. Token-validity check for SSR (for prompt 3 to consume)
Add a controller function that, given the `:token` from the URL, reports whether it currently
matches an **unexpired** token row **without consuming it** (read-only — no deletes, no password
change). It must compare against the bcrypt-hashed rows the same way `handleResetPassword` does
— i.e. select all unexpired rows **table-wide** (the token is hashed and carries no user id, so
you can't narrow to one row) and bcrypt-compare each. This is small in practice (app logic keeps
at most one row per user), but be aware it's a table scan, not a point lookup.
Then wire the `/reset-password/:token` page route in `root.ts` to compute this state and pass it
into `res.render(...)`, exactly the way `/verify/:token` calls `getVerifyPageState(req)` and
passes the result to `verify.njk`. Prompt 3 will read that state in the template. Keep the state
shape minimal (valid vs. invalid is all that's needed).

### E. Close the enumeration gap in forgot-password
`handleForgotPasswordRequest` currently returns a distinct `409` when the email belongs to a
real but **blacklisted** member, which reveals that the address is registered. Remove that leak:
the blacklist check must only gate whether the email is actually *sent* (skip the send and log
internally if blacklisted), and must **never** change the HTTP response. Every path — address
unknown, known-and-sendable, or known-but-blacklisted — returns the identical generic `200`.
(A later prompt stops blacklisting legitimate accounts entirely, but this guarantees no
enumeration regardless of blacklist state.)

## Constraints
- Preserve and strengthen the anti-enumeration behavior of `POST /api/forgot-password`: an
  identical generic response in **all** cases (see task E).
- Strings you add server-side may stay hardcoded English for now; localization is a later prompt.
- When done, ensure `npm run type-check --silent` and `npm run lint --silent` both pass, and
  watch for redundancy you may have introduced.
