# Registration & Account Verification (Developer Reference)

How creating an infinitechess.org account works end to end — the server flow, the data, the
recovery paths, and the bot protection. Creating an account is a **two-step** process:
submitting the register form creates a *pending registration* and emails a verification link;
the account becomes a real member only after that link is verified.

## Why account creation is two-step
A submitted register form does not create a `members` row. It creates a row in the
`pending_registrations` table and emails a verification link; only verifying that link
promotes it into a real `members` row. Because the only way to become a member is to verify,
**every `members` row is verified by construction** — there is no "unverified account" state
and no `is_verified` flag anywhere. Visitors who just want to play a game without an account
use guest play, so requiring verification before an account exists costs nothing.

## The three participants
- **The register browser** — the browser/tab where the form was filled in. The server gives
  it an httpOnly cookie holding a secret `claim_token`. This cookie identifies the pending
  registration on later requests, and **this browser is the only one that is ever logged in.**
- **The verification link** — the link in the email, opened on any device. It carries a
  different secret, the `verification_token`. The cookie's `claim_token` and the email's
  `verification_token` are deliberately separate secrets.
- **The poll** — `GET /register/awaiting/poll`, a small endpoint the register browser's
  awaiting page quietly polls while it waits for the email to be verified.

## End-to-end flow

### 1. Submitting the form
`POST /register` (a `fetch` from the register page) validates the username/email/password and
the bot-protection token, then inserts a `pending_registrations` row, sends the verification
email, sets the httpOnly pending cookie (`claim_token`), and returns success JSON. **No
`members` row is created.** The page then navigates to **`/register/awaiting`** — a dedicated
page that shows the "check your email" state and polls. Visiting or reloading `/register` while
the pending cookie is present **redirects to `/register/awaiting`**, so re-navigating mid-wait
is safe; without the cookie `/register` renders the form. A `POST /register` that arrives while
the caller already holds an active pending registration does **not** create a second one — it
returns success so the page just lands on `/register/awaiting` for the existing registration
(this is what lets a stale second tab self-heal on its next action).

### 2. Verifying the email
The email link points at `GET /verify/:token`. This page is **inert** — it makes no database
changes and consumes no token; it only shows a **"Verify my account"** button. The user
clicks it → `POST /verify/:token` → the server looks up the pending row by its
`verification_token` and **promotes** it: it creates the real `members` row and marks the
pending row verified by recording the new `member_user_id`. The page then
swaps in place to "✓ Your email is verified — head back to where you signed up and you'll be
logged in." **This page never creates a session and shows no login link.**

### 3. Getting logged in
The register browser's poll notices the pending row is now verified. Because that browser
holds the pending cookie, the server issues *it* a session, and the page redirects to `/`
with a success toast. **Logging in happens only here, in the poll — nowhere else.**

## Why logging in lives only in the poll
Keeping session issuance in one place — the poll, gated on the pending cookie — gives a clean
security property: **a session is only ever handed to the browser that entered the password.**
A forwarded link, a shared inbox, or an automated email scanner that opens the verification
link can at most *verify* the account; it never receives a session. It simply causes the real
registrant's poll to log that registrant in. This is why the verify page is identical on every
device and never logs anyone in.

It is also why verification requires a real button click rather than happening on the link's
GET. Many email security scanners issue a GET to every link in a message. An inert GET that
verifies nothing means a scanner cannot prematurely verify the account (which would trip the
registrant's poll before they are ready); the scanner does not click buttons or submit forms.
The verify page additionally sends `Referrer-Policy: no-referrer` so the token in the URL is
never leaked through a `Referer` header.

## Same-browser vs cross-device
- **Same browser:** the still-open awaiting page polls and lights up → home + success toast.
  The verify tab shows the "verified, head back" message.
- **Cross-device** (registered on a desktop, verified on a phone): the desktop awaiting page
  polls → home + toast; the phone's verify page shows "verified, head back" and is **not**
  logged in. All verify-page copy is device-agnostic — "head back to where you signed up,"
  never "return to your tab," because the verifying device may have no such tab.

## The `pending_registrations` table
| Column | Purpose |
| --- | --- |
| `claim_token` | Secret stored in the httpOnly pending cookie; scopes the poll. **Primary key** — the row's stable identity and the most frequent lookup. |
| `verification_token` | Secret carried in the email link. Unique; rotated if the email is changed. |
| `username` | Unique, case-insensitive (`COLLATE NOCASE`). |
| `email` | Unique. |
| `hashed_password` | bcrypt hash, carried until promotion. |
| `created_at` / `expires_at` | A pending registration is valid for **24 hours** — long enough to cover one overnight regardless of the time of day. |
| `member_user_id` | Null until verification; set to the new member's id when the row is promoted. **Doubles as the "verified" flag** (non-null = verified), so there is no separate verified column. |

A username or email counts as **taken** if it is held by a `members` row **or** by a
non-expired `pending_registrations` row, so two people cannot claim the same name while one is
mid-verification.

A verified pending row is **not deleted immediately** on verification — it is kept so that a
refreshed or duplicated waiting tab that polls again still sees "verified" and resolves
cleanly instead of "expired." A periodic cleanup simply deletes rows once they pass their
`expires_at`; a verified row that lingers until then is harmless, because `members` already
enforces its username/email, and the poll's active window (~20–30 min) is far shorter than the
24-hour TTL.

## Recovery paths
The awaiting page offers a single recovery affordance — change-email — plus guidance, and the
server guards against undeliverable addresses. There is **no resend button**: changing the
email (even re-submitting the same address) rotates the token and re-sends, so a dedicated
resend is redundant. The page shows brief guidance instead: "Not seeing it? Check your spam
folder, and make sure your email address is correct."

- **Wrong email? / change email** — a "Wrong email?" button reveals a field prefilled with the
  pending address; editing it and clicking "Update it" calls `POST /register/awaiting/email`
  (cookie-scoped, rate-limited). The server re-validates the new address (format, blacklist,
  MX, taken-by-another), updates the pending row's email, rotates the `verification_token`,
  refreshes `expires_at`, and re-sends. **Success reloads the page** so the new state is shown;
  validation/conflict errors render **inline beneath the field** with no reload. A collision
  with someone *else's* non-expired pending row, or with a real member, is a genuine "already
  in use."
- **Undeliverable address** — addresses that have hard-bounced or filed a spam complaint are
  recorded in the email blacklist (`email_blacklist`, populated from AWS SES bounce/complaint
  webhooks). The server refuses to send to a blacklisted address and reports "This address
  can't receive mail." On the awaiting page the blacklisted variant shows the change-email
  field **expanded by default**, since changing the address is the only way forward. It reports
  an address as undeliverable **only when it actually declined to send** — it never claims to
  have sent a message it did not. The reason (bounce vs. complaint) is never shown.
- **Echoing the address** — the main waiting copy shows **no** email address; the change-email
  field is the sole, deliberate exception, displaying the pending address so the user can spot
  a typo.

## Bot protection
The register form is protected by **Cloudflare Turnstile in Managed mode** — invisible when
Cloudflare is confident, escalating to an interactive checkbox when suspicious. The widget on
the page is only UX; **the server is the gate.** `POST /register` verifies the Turnstile token
with Cloudflare's `siteverify` endpoint — passing the real client IP, which is available
because the site runs behind a Cloudflare Tunnel — and rejects any request whose token is
missing or invalid before any pending row is created. The site key and secret key come from
environment variables; in development they fall back to Cloudflare's published dummy test keys
so local development needs no real keys.

## Where it lives
| Concern | File |
| --- | --- |
| Pending-table schema | [databaseTables.ts](../../../src/server/database/databaseTables.ts) |
| Pending-row SQL | [pendingRegistrationManager.ts](../../../src/server/database/pendingRegistrationManager.ts) |
| Register POST, awaiting page-state, validation, availability, change-email | [createAccountController.ts](../../../src/server/controllers/createAccountController.ts) |
| Verify promotion (`POST /verify/:token`) | [verifyAccountController.ts](../../../src/server/controllers/verifyAccountController.ts) |
| Verification email | [emailController.ts](../../../src/server/controllers/emailController.ts) |
| Session issuance (used by the poll) | [sessionManager.ts](../../../src/server/controllers/authenticationTokens/sessionManager.ts) |
| Email blacklist | [blacklistManager.ts](../../../src/server/database/blacklistManager.ts) |
| Routes (`/register`, `/register/awaiting`, awaiting poll & change-email, `/verify/:token`) | [middleware.ts](../../../src/server/middleware/middleware.ts) |
| Cleanup sweep | [cleanupTasks.ts](../../../src/server/database/cleanupTasks.ts) |
