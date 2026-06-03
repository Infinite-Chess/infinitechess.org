# Chunk 01 — Backend: verify-first (Pattern B) flow

**Read `00_OVERVIEW.md` first.** This chunk is **backend only** — no page redesign, no
Turnstile. When it is done, the registration flow works end-to-end via API calls
(testable with `curl`), with accounts created **only on verification**.

To keep this chunk's diff focused, **leave the `is_verified` column and its machinery in
place** for now: when you promote a pending registration into `members`, insert it as
**already verified** (`is_verified = 1`, `verification_code = null`,
`is_verification_notified = 1`). Chunk `02` deletes the now-vestigial flag. Do not touch
the rated-game gating or sockets here.

## Scope (do)

1. **`pending_registrations` table** — add it in `databaseTables.ts` `generateTables()`,
   following the existing `members` table style. Use the recommended schema in
   `00_OVERVIEW.md` (firm parts: `UNIQUE` on `username` NOCASE and `email`; secret
   `verification_token` for the email link; separate `claim_token` for the cookie;
   `expires_at`; `verified_at` + `member_user_id` so the poll can resolve state).

2. **A `pendingRegistrationManager.ts`** in `src/server/database/` (mirror
   `memberManager.ts` conventions) exposing the operations the controllers need:
   create a pending row; look up by `verification_token`; look up by `claim_token`;
   check username/email present among **non-expired** pending rows; delete expired rows
   for a given username/email; mark a row verified (`verified_at`, `member_user_id`);
   and the cleanup-sweep query. Keep SQL here, not in controllers.

3. **Dual-table availability** — extend `isUsernameTaken` / `isEmailTaken` in
   `memberManager.ts` (or wrap them) so callers also catch non-expired pending rows.
   Prefer extending the existing helpers so **every** call site
   (`checkUsernameAvailable`, `checkEmailValidity`, `doUsernameValidation`,
   `doEmailValidation`) is covered without duplicating logic. Avoid redundancy.

4. **Rewrite `createNewMember`** (`createAccountController.ts`):
   - Keep all existing validation (`doUsernameValidation`, `doEmailValidation`,
     `doPasswordFormatChecks`, profanity, blacklist, MX/DNS) and the bcrypt hashing.
   - **Remove the honeypot** — delete the `recovery` honeypot block (and its logging) at
     the top of `createNewMember`. It must go **now**, before the chunk `03` redesign, so
     the rebuilt form is never created with a hidden honeypot field. Removing it ahead of
     Turnstile is safe because nothing deploys to production until chunk `04` lands, and
     `createAccountLimiter` rate limiting still applies in the interim.
   - **Resolve collisions via the pending cookie** before inserting:
     - If the request carries a pending cookie whose `claim_token` matches an existing
       pending row, treat this as that user's **own** registration: **update** that row in
       place (username/email/password, refreshed `expires_at`) and resend — do NOT report a
       conflict. This is the "change my email" path. **Rotate the `verification_token` only
       if the email changed**; on a same-address re-submit keep the existing token (so an
       already-delivered link still works).
     - Otherwise, a non-expired pending row (or `members` row) with the same username/email
       belonging to **someone else** is a genuine conflict → return the "already taken" error.
     - Clear any **expired** pending row for this username/email first so a freed name isn't
       blocked by the `UNIQUE` constraint.
   - On success (new or updated row): insert/update the `pending_registrations` row (with a
     `verification_token`, `claim_token`, and an `expires_at` of **24 hours** from creation —
     covers one overnight regardless of registration time; a refreshed re-submit/resend resets
     it), send the verification email,
     set/refresh the **httpOnly pending cookie** (`claim_token`), and return success JSON.
     **Do not call `generateAccount` / `addUser` here anymore** — no `members` row is created
     at registration time.
   - **Blacklist (honest-delivery rule):** the send path already checks `isBlacklisted`.
     Surface it instead of silently swallowing. Because sends are fire-and-forget, this only
     fires when the address was **already** blacklisted from prior history. Still
     create/reserve the pending row + cookie (so the name is claimed), but return a
     `blacklisted` signal so the client shows the generic **"This address can't receive
     mail."** message. **Never claim an email was sent for a blacklisted address** (see step
     8's SSR re-check). The blacklist reason (bounce vs. complaint) is never revealed.

5. **Rework the verification email** (`emailController.ts`) — `sendEmailConfirmation`
   currently emails a `members`-based `verification_code` link. Change it to email the
   pending row's `verification_token` link pointing at `GET /verify/:token`. Keep the
   blacklist check. **Only fix the link/content/recipient here — do NOT invest in the
   email's visual design; that is chunk `05`.** Keep it functional and plain. (The old
   "resend verification" endpoint `requestConfirmEmail` assumed a signed-in member; that
   model is gone — remove it and its wiring. **Replace it with a new cookie-scoped resend:**
   `POST /register/resend` reads the pending cookie and re-sends the verification email to
   that pending row **only** — no request body, so it can't be aimed at arbitrary addresses.
   It applies the same blacklist honest-delivery rule and is rate-limited by
   `resendAccountVerificationLimiter`. It does **not** rotate the token — token rotation
   happens only on the register-POST email-change path in step 4.)

6. **Replace `verifyAccountController.ts`** with the new promotion logic:
   - `POST /verify/:token` (token in URL param or body): look up the pending row by
     `verification_token`. If missing/expired → respond with a clear error JSON (the page
     shows "link invalid or expired"). If already verified → respond success idempotently.
     Otherwise **promote**: create the real account (reuse `generateAccount({ ...,
     autoVerify: true })` or `addUser(..., is_verified=1, verification_code=null,
     is_verification_notified=1)`), then mark the pending row verified (`verified_at`,
     `member_user_id`). **Do not create a session here.** Return success JSON.
   - Keep `manuallyVerifyUser` working for the admin panel if it is still used — but note
     it verifies a `members` row; under Pattern B that path is only meaningful for
     pre-existing members. If it has no remaining callers after this change, remove it.

7. **Poll endpoint** — add e.g. `GET /register/poll`:
   - Read the pending cookie (`claim_token`). No cookie → `{ status: 'expired' }`.
   - Look up the pending row by `claim_token`. Missing/expired → `{ status: 'expired' }`.
   - Not yet verified → `{ status: 'pending' }`.
   - Verified → issue the session for `member_user_id` via
     `createNewSession(req, res, user_id, username, roles, keepLoggedIn=false)` (fetch the
     member's roles like `loginController` does), **clear the pending cookie**, and respond
     `{ status: 'verified' }`. The client will then redirect to `/`.
     - **Idempotency:** do **not** delete the pending row on poll-success — leave it for the
       cleanup sweep. A refreshed or duplicate waiting tab that polls again then still sees
       `verified` and re-issues the session cleanly rather than getting `expired`.

8. **SSR state for `/register`** — in `root.ts`, when rendering `register.njk`, check the
   pending cookie and pass a flag (e.g. `awaitingVerification: true`) so the template can
   render the "check your email" state on reload/direct navigation. **Do not pass the email**
   — no address is echoed anywhere (see chunk `03`). **Also re-check `isBlacklisted` for the
   pending row's address** and pass a `blacklisted` flag when true, so the template renders
   the generic "This address can't receive mail" variant instead of a "we sent a link" claim.
   (The template itself is built in chunk `03`; here just supply the SSR context. If
   `register.njk` is still the stub, passing the flags is enough.)

9. **Cleanup sweep** — in `cleanupTasks.ts`, add a task that deletes expired
   `pending_registrations` (and verified ones older than a short retention — **~1 hour after
   `verified_at`**, so the poll's idempotency window is preserved). Wire it into the same
   scheduler as `removeOldUnverifiedMembers`. (Leave `removeOldUnverifiedMembers`
   itself for chunk `02`; with no new unverified members it simply finds nothing.)

10. **Routes** — in `middleware.ts`: change the old `app.get('/verify/:member/:code',
    verifyAccount)` to the new `POST /verify/:token`; add the poll route; add
    `POST /register/resend` (the new cookie-scoped resend) guarded by
    `resendAccountVerificationLimiter`; and remove the old `requestConfirmEmail` route. Keep
    `createAccountLimiter` on `/register`. Consider a sensible limiter on
    `POST /verify/:token`. **Bump `resendAccountVerificationLimiter` from 4 → 8 per hour per
    IP** in `rateLimiters.ts` (per-IP is shared by NAT/office/carrier users; the server limit
    is the only resend throttle — there is no client-side cooldown). Its `429` surfaces as
    "Please wait a little bit before resending" client-side.

11. **Update tests** — fix `createAccountController.unit.test.ts` for the new behavior
    (no `members` row on register; pending row created instead).

## Out of scope (do NOT do here)
- No removal of `is_verified` / `verification_code` / `is_verification_notified` columns
  or their other usages (sockets, MemberAPI, seeks, AdminPanel) — that is chunk `02`.
- No Turnstile — chunk `04`. (The honeypot **is** removed here; see step 4.)
- No register-page HTML/CSS/TS redesign, no verify page UI — chunk `03`. (You only supply
  the SSR context flag in step 8 and the JSON/route contracts.)

## Acceptance criteria
- `npm run type-check --silent` and `npm run lint --silent` both pass.
- `POST /register` with valid data creates a `pending_registrations` row, sends (or logs,
  in dev) the verification email, sets the pending cookie, and creates **no** `members` row.
- `POST /verify/:token` with the emailed token creates the real verified `members` row and
  marks the pending row verified; a second call is idempotent; an unknown/expired token
  errors cleanly.
- The poll endpoint returns `pending` before verification and `verified` (with a session
  cookie now set) after, and only for the matching cookie.
- Username/email that exists in a non-expired pending row is reported as taken by
  `/register/username/:username` and `/register/email/:email`.
- Manually exercise with `curl` (register → grab token from the logged link → POST verify
  → poll) and confirm the above.

## Gotchas
- Email is lowercased before storage/checks (see existing `createNewMember`). Preserve that.
- `addUser` runs in a transaction and throws `SQLITE_CONSTRAINT_ERROR` on conflict — keep
  handling the "just taken" race at promotion time.
- The pending cookie must be **httpOnly** and hold the `claim_token`, never the
  `verification_token` (which is in the email).
- Keep all SQL in the manager modules; controllers orchestrate, they don't query.
