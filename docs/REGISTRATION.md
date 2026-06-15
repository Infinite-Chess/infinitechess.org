# Registration & Account Verification

How an infinitechess.org account is created, end to end. Read this before touching anything
under `/register`, `/register/awaiting`, or `/verify/:token`.

## The core idea: verify-first

Submitting the register form does **not** create a `members` row. It creates a row in
`pending_registrations` and emails a verification link. The account becomes a real member only
when that link is verified. Consequences worth internalizing:

- A username/email is **taken** if held by a `members` row _or_ a non-expired
  `pending_registrations` row, so two people can't claim the same name mid-verification.
- Anyone who just wants to play uses guest play, so gating account creation on email
  verification costs nothing.

## The two secrets

A pending registration is identified by two deliberately-separate secrets, both 32 random bytes
base64url-encoded:

- **`claim_token`** — lives **only** in the httpOnly cookie `pending_registration` (set on the
  register browser, `sameSite: lax`, `secure`, 24h `maxAge`). Scopes the poll and change-email
  endpoints to their own registration. **This cookie is the only thing that ever gets logged in.**
- **`verification_token`** — lives **only** in the emailed link (`/verify/<token>`). Valid until
  the pending row's 24h `expires_at`. Rotated on every email change, so a
  link to an old address stops working. New tokens reset their expiry, but the cookie isn't extended.

## Routes

Page routes (SSR via Nunjucks, in [root.ts](../src/server/routes/root.ts)) and API routes (in
[register.ts](../src/server/routes/register.ts) mounted at `/api/register`, plus the verify POST
in [api.ts](../src/server/routes/api.ts)) are distinct — the page is the HTML, the `/api/*`
endpoint is the action the page's script calls.

| Route                                      | What it does                                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `GET /register`                            | Renders the form. **If the pending cookie is active, redirects to `/register/awaiting`** (re-navigating mid-wait is safe). |
| `POST /api/register`                       | Validates, stages the pending row, emails the link, sets the cookie. **Creates no member.**                                |
| `GET /api/register/availability?username=` | On-blur username availability check. (Only username; no email check, to reduce account enumeration)                        |
| `GET /register/awaiting`                   | The "check your email" page. **If no active pending registration, redirects to `/register`.**                              |
| `GET /api/register/awaiting/status`        | Polled by the awaiting page while it waits; returns the pending registration's status.                                     |
| `PUT /api/register/awaiting/email`         | Change-email recovery.                                                                                                     |
| `GET /verify/:token`                       | **Inert** landing page. Shows a "Verify my account" button.                                                                |
| `POST /api/verify/:token`                  | The actual promotion: creates the `members` row.                                                                           |

## End-to-end flow

### 1. Submit — `POST /api/register`

Checks run in this exact order (each failure sends its own response):

1. Body structural check — `username`, `email`, `password`, `cf-turnstile-response` all
   non-empty strings.
2. **Two-tab guard** — if this browser already holds an active pending registration, return
   `200` immediately (no second row). The page just lands on `/register/awaiting` for the
   existing one. Lets a stale second tab self-heal.
3. Username format, email format (incl. blacklist + MX-record check), password format.
4. Username taken-or-pending, email taken-or-pending.
5. **Turnstile verified** — token spent. Doesn't fail open. Errors send `resetTurnstile: true`.
   For bot protection. Verified server-side in [turnstile.ts](../src/server/middleware/turnstile.ts);
   the widget's **Managed mode** is configured in the Cloudflare dashboard, not in code.
6. bcrypt-hash the password, generate both tokens,
   clear any expired rows blocking the UNIQUE constraints, `INSERT`, email the link, set the
   cookie, return `201`.

The email send is **fire-and-forget** (not awaited, swallows its own errors): delivery failure
never fails the request, leaving recovery to the change-email/resend path.

On success (`201` or the guard's `200`) the client navigates to `/register/awaiting`.
Field-attributable errors carry a `field` and render under that input; systemic errors render
form-level. The client re-issues a Turnstile token only when the server set `resetTurnstile`
(i.e. only on failures after the token was spent).

### 2. Verify — `GET` then `POST /api/verify/:token`

`GET /verify/:token` is **inert**: verifies nothing on load. It renders one of three SSR
states ([verifyAccountController.ts](../src/server/controllers/verifyAccountController.ts)):
`prompt` (live, unverified → shows the button), `verified` (already promoted → confirmation),
`invalid` (unknown or expired token). It's inert (requiring real button click) because email
security scanners GET every link in a message, which would otherwise let a scanner activate
the account prematurely without the email owner's consent.

Clicking the button → `POST /api/verify/:token` → looks up the pending row by
`verification_token` and **promotes** it: atomically creates the `members` row and sets the
pending row's `member_user_id` (see `promotePendingRegistration`). Idempotent — a second POST on
an already-promoted token returns `200`. A dead token returns `400`. **This side does not create a
session**; it swaps to "head back to where you signed up."

### 3. Sign in — `GET /api/register/awaiting/status` (the poll)

The register browser's awaiting page ([register-awaiting.ts](../src/client/scripts/esm/views/register-awaiting.ts))
polls `GET /api/register/awaiting/status` on a backoff schedule. The poll returns one of four
statuses: `pending` → keep waiting; `expired`/`blacklisted` → reload (the server re-renders
the right variant); `verified` → queue a toast and redirect home. On `verified` the server
— because _this_ browser holds the `claim_token` cookie — issues it a session ([sessionManager.ts](../src/server/controllers/authenticationTokens/sessionManager.ts)
`createNewSession`) and clears the pending cookie. This is the only place a session is issued.
The browser that entered the password is typically the device the user wants to be logged in
on, not the one they checked their emails with.

## The `pending_registrations` table

Schema in [databaseTables.ts](../src/server/database/databaseTables.ts); all SQL in
[pendingRegistrationManager.ts](../src/server/database/pendingRegistrationManager.ts).

| Column                      | Notes                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `claim_token`               | **Primary key.** httpOnly-cookie secret; never changes.                                                                |
| `verification_token`        | UNIQUE. Email-link secret; rotated on email change.                                                                    |
| `username`                  | UNIQUE, `COLLATE NOCASE`.                                                                                              |
| `email`                     | UNIQUE. Always stored lowercase.                                                                                       |
| `hashed_password`           | bcrypt hash                                                                                                            |
| `created_at` / `expires_at` | Unix ms. Valid for **24h** (`PENDING_REGISTRATION_EXPIRY_MILLIS`).                                                     |
| `member_user_id`            | NULL until verified; set to the new member's id on promotion. **Doubles as the "verified" flag** (non-null = verified) |

**A verified pending row is not deleted on verification.** Keeping it lets a refreshed/duplicate
waiting tab poll again and still see `verified` (not `expired`). It's harmless because `members`
already enforces the username/email. A periodic sweep
([cleanupTasks.ts](../src/server/database/cleanupTasks.ts) →
`deleteExpiredPendingRegistrations`) deletes rows past `expires_at`. Separately,
`deleteExpiredPendingRegistrationsFor` clears any expired row blocking a specific
username/email's UNIQUE constraint right before an insert/email-change.

## Recovery & deliverability

**Change email** — On the awaiting page, a "Check email correctness" toggle reveals a field prefilled with the
pending address. Clicking "Update it" submits `PUT /api/register/awaiting/email` (cookie-scoped). The
server re-runs the full email checks (format, blacklist, MX), rejects a real member's email or
_another_ party's pending email, rotates `verification_token`, refreshes `expires_at`, and re-sends.
Success **reloads the page**; errors render inline. Re-submitting the same address acts as a resend.

**Undeliverable / blacklisted** — hard bounces and spam complaints are recorded in `email_blacklist`
([blacklistManager.ts](../src/server/database/blacklistManager.ts)), populated from AWS SES bounce/complaint
webhooks ([awsWebhook.ts](../src/server/controllers/awsWebhook.ts); permanent bounces and complaints
only). The server refuses to send to a blacklisted address. - The awaiting page has a dedicated **blacklisted variant**:
when the pending address is blacklisted, the SSR template omits `data-awaiting` (so the client **doesn't poll**),
the page displays "Bad address" and shows the change-email field **expanded by default** — changing it is the onl
way forward. - The poll returns `blacklisted` (distinct from `pending`) if the address gets blacklisted
while waiting; the client reloads to pick up the blacklisted variant.

## Rate limits

In [rateLimiters.ts](../src/server/middleware/rateLimiters.ts):

| Endpoint                            | Limiter                                                     | Cap        |
| ----------------------------------- | ----------------------------------------------------------- | ---------- |
| `POST /api/register`                | `createAccountAttemptLimiter` (counts failures only)        | 20 / 5 min |
| `POST /api/register`                | `createAccountLimiter` (counts successes only — email sent) | 6 / 24h    |
| `PUT /api/register/awaiting/email`  | `verificationEmailLimiter`                                  | 8 / 1h     |
| `GET /api/register/availability`    | `usernameAvailabilityLimiter`                               | 30 / 1 min |
| `GET /api/register/awaiting/status` | none                                                        | —          |

## Local dev & testing

When the form is submitted and no email credentials are configured in .env (the case for most devs),
the server logs the verification URL to the console instead of sending an actual email.

`generateAccount()` in [registerController.ts](../src/server/controllers/registerController.ts) can bypass
the normal flow and create a **verified member directly** via `addMember`. It exists only for dev seeding and tests.

## File map

| Concern                                                              | File                                                                                                                                                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Register POST, awaiting page-state, poll, change-email, availability | [registerController.ts](../src/server/controllers/registerController.ts)                                                                                                                         |
| Verify page-state + promotion                                        | [verifyAccountController.ts](../src/server/controllers/verifyAccountController.ts)                                                                                                               |
| Pending-table SQL & TTL constant                                     | [pendingRegistrationManager.ts](../src/server/database/pendingRegistrationManager.ts)                                                                                                            |
| Pending-table schema                                                 | [databaseTables.ts](../src/server/database/databaseTables.ts)                                                                                                                                    |
| `addMember` / `promotePendingRegistration` / availability reads      | [memberManager.ts](../src/server/database/memberManager.ts)                                                                                                                                      |
| Field validation (format, blacklist, MX)                             | [accountValidation.ts](../src/server/controllers/accountValidation.ts)                                                                                                                           |
| Verification email                                                   | [emailController.ts](../src/server/controllers/emailController.ts)                                                                                                                               |
| Turnstile verification                                               | [turnstile.ts](../src/server/middleware/turnstile.ts)                                                                                                                                            |
| Email blacklist                                                      | [blacklistManager.ts](../src/server/database/blacklistManager.ts) / [awsWebhook.ts](../src/server/controllers/awsWebhook.ts)                                                                     |
| Session issuance (poll only)                                         | [sessionManager.ts](../src/server/controllers/authenticationTokens/sessionManager.ts)                                                                                                            |
| Page routes / API routes                                             | [root.ts](../src/server/routes/root.ts) / [register.ts](../src/server/routes/register.ts), [api.ts](../src/server/routes/api.ts)                                                                 |
| SSR templates                                                        | `src/server/views/register.njk`, `register-awaiting.njk`, `verify.njk`                                                                                                                           |
| Client scripts                                                       | [register.ts](../src/client/scripts/esm/views/register.ts), [register-awaiting.ts](../src/client/scripts/esm/views/register-awaiting.ts), [verify.ts](../src/client/scripts/esm/views/verify.ts) |
| Expiry sweep                                                         | [cleanupTasks.ts](../src/server/database/cleanupTasks.ts)                                                                                                                                        |
