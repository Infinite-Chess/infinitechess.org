# Password Reset

How a user who forgot their password gets a new one: the forgot-password request, the emailed
single-use token, and the set-new-password page that updates the password and logs them in.
Covers the anti-enumeration rules, token storage/expiry, the `password_reset_tokens` table, and
session teardown.

## The core idea

A reset is proven by control of the account's inbox. Requesting a reset stores a single-use,
expiring **token** (only its hash, server-side) and emails the plain token as a link. Clicking
the link opens a page that, only after the user submits a new password, updates the password and
**logs that browser in**. No session is created on the request side.

Two anti-enumeration rules drive the whole design:

- **`POST /api/forgot-password` always returns the same generic `200`** — unknown email,
  real email, and blacklisted email are indistinguishable from the response. The client swaps in
  a generic "check your email" confirmation regardless.
- Client-side email-format validation on the forgot page is **UX only** — it never reveals
  whether an address is registered.

## The token

One secret, 32 random bytes (`crypto.randomBytes(32)`) base64url-encoded:

- Lives **only** in the emailed link (`/reset-password/<token>`). The DB stores **only its
  SHA-256 hash** — a DB leak can't recover the token.
- **SHA-256, not bcrypt**, on purpose: 256 bits of entropy can't be brute-forced regardless of
  hash speed, and a fast deterministic hash lets us look the row up by indexed equality
  (`hashed_token` is the PRIMARY KEY) instead of scanning + comparing. See `hashResetToken`.
- Valid for **1 hour** (`PASSWORD_RESET_TOKEN_EXPIRY_MILLIS`).
- **At most one live token per user**: issuing a new one first `DELETE`s any existing rows for
  that `user_id`. Consuming is atomic in the reset transaction. Expiry is enforced in live
  queries (`expires_at > ?`), not just by the sweep.

## Routes

Page routes (SSR via Nunjucks, [root.ts](/src/server/routes/root.ts)) are distinct from the API
routes ([password.ts](/src/server/routes/password.ts), mounted at `/api`) the page scripts call.

| Route                        | What it does                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /forgot-password`       | Renders the email-entry form. No state, no token.                                                              |
| `POST /api/forgot-password`  | Issues + emails a reset token if the email maps to a member and isn't blacklisted. **Always generic `200`.**   |
| `GET /reset-password/:token` | SSRs `valid` (token live → password form) or `invalid` (set-`Referrer-Policy: no-referrer`). Consumes nothing. |
| `POST /api/reset-password`   | Validates token + new password, updates password, kills sessions, logs this browser in, emails a receipt.      |

## End-to-end flow

### 1. Request — `POST /api/forgot-password`

[passwordResetController.ts](/src/server/controllers/passwordResetController.ts) `handleForgotPasswordRequest`:

1. Body check — `email` a non-empty string.
2. Look up member by email (`COLLATE NOCASE`). If none → log, fall through to the generic `200`.
3. If found: `DELETE` any old tokens for the user. Then **blacklist gates only the send**: a
   blacklisted address logs and skips the email but still falls through to the same `200`, so it
   can't be told apart. Otherwise generate the token, store its hash + `expires_at`, build
   `${baseUrl}/reset-password/<plainToken>`, and **fire-and-forget** the email
   (`sendPasswordResetEmail`).
4. **Always `res.sendStatus(200)`.** Only a DB error returns non-200 (`500`).

The client ([forgotpassword.ts](/src/client/scripts/esm/views/forgotpassword.ts)) hides the form
and shows the generic confirmation on any `2xx`; a non-OK surfaces the server's message inline
(e.g. the 429 rate-limit message).

### 2. Open the link — `GET /reset-password/:token`

Inert. `getResetPasswordPageState` hashes the `:token` param and checks for a matching unexpired
row **without consuming it**, returning `{ state: 'valid' | 'invalid' }`. `valid` → renders the
set-new-password form; `invalid`/expired → a dead-link card linking back to `/forgot-password`.
The route sets `Referrer-Policy: no-referrer` so the token in the URL doesn't leak via `Referer`
to third-party resources.

The GET is read-only and consumes nothing, so an email scanner pre-fetching it does no harm. There is no risk of verifying their account like on the registration's verify page. The token is only spent when the user submits a new password.

### 3. Set the password — `POST /api/reset-password`

`handleResetPassword` (body `{ token, password }`):

1. `verifyBodyHasResetPasswordData` — both non-empty strings.
2. `doPasswordFormatChecks` — server-side strength re-check (client checks are UX only).
3. Fast pre-check (`findUnexpiredResetTokenRecord`) — no match → `400 { tokenInvalid: true }`.
   **This flag tells the client to reload**, re-SSRing the expired-link card. This avoids doing
   bcrypt work for obviously invalid/expired tokens.
4. bcrypt-hash the new password.
5. In **one transaction**: consume the token atomically (with the same expiry guard), then
   `UPDATE members ...`. If the token was consumed by a concurrent request between pre-check and transaction, the delete returns no row and the request returns `400 { tokenInvalid: true }`.
6. `deleteAllRefreshTokensForUser` — terminate **all** the user's other sessions.
7. Mint a fresh session for **this** browser (`createNewSession`) — it just proved control of
   the account — and fire-and-forget `sendPasswordChangedEmail` (an out-of-band "your password
   "your password changed" security receipt).
8. `res.sendStatus(200)`. The session cookie is now set, so the client
   ([resetpassword.ts](/src/client/scripts/esm/views/resetpassword.ts)) queues a toast and
   navigates to `/`. `tokenInvalid` → reload; any other non-OK → inline error.

## The `password_reset_tokens` table

Schema in [databaseTables.ts](/src/server/database/databaseTables.ts); all SQL lives inline in
the controller.

| Column         | Notes                                                                            |
| -------------- | -------------------------------------------------------------------------------- |
| `hashed_token` | **Primary key.** SHA-256 hex of the emailed token. Looked up by equality.        |
| `user_id`      | `REFERENCES members(user_id) ON DELETE CASCADE`. Indexed; only one row per user. |
| `expires_at`   | Unix ms. 1h after issue. Indexed.                                                |
| `created_at`   | Unix ms, defaulted by SQLite.                                                    |

A daily sweep ([cleanupTasks.ts](/src/server/database/cleanupTasks.ts) →
`deleteExpiredPasswordResetTokens`) deletes rows past `expires_at`. This is only hygiene — the
`expires_at > ?` guard in the lookup is what actually enforces expiry.

## Rate limits

`POST /api/forgot-password` → `forgotPasswordLimiter`
([rateLimiters.ts](/src/server/middleware/rateLimiters.ts)): **8 / hour**. `POST
/api/reset-password` has **no** limiter (the 256-bit token is the gate).

## Local dev

With no email credentials in `.env` (most devs), the server logs the password reset URL to the console instead of sending an actual email.

## File map

| Concern                                                    | File                                                                                                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Both API handlers, page-state, token hash/lookup           | [passwordResetController.ts](/src/server/controllers/passwordResetController.ts)                                                                            |
| API routes (`/api/forgot-password`, `/api/reset-password`) | [password.ts](/src/server/routes/password.ts)                                                                                                               |
| Page routes (`/forgot-password`, `/reset-password/:token`) | [root.ts](/src/server/routes/root.ts)                                                                                                                       |
| Reset + changed emails                                     | [emailController.ts](/src/server/controllers/emailController.ts)                                                                                            |
| Password format rules / salt rounds                        | [accountValidation.ts](/src/server/controllers/accountValidation.ts)                                                                                        |
| Session issuance / session teardown                        | [sessionManager.ts](/src/server/controllers/authenticationTokens/sessionManager.ts) / [refreshTokenManager.ts](/src/server/database/refreshTokenManager.ts) |
| Email blacklist                                            | [blacklistManager.ts](/src/server/database/blacklistManager.ts)                                                                                             |
| Table schema                                               | [databaseTables.ts](/src/server/database/databaseTables.ts)                                                                                                 |
| Expiry sweep                                               | [cleanupTasks.ts](/src/server/database/cleanupTasks.ts)                                                                                                     |
| SSR templates                                              | `src/server/views/forgotpassword.njk`, `resetpassword.njk`                                                                                                  |
| Client scripts                                             | [forgotpassword.ts](/src/client/scripts/esm/views/forgotpassword.ts), [resetpassword.ts](/src/client/scripts/esm/views/resetpassword.ts)                    |
