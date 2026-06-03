# Switch `/register` to create a pending registration

**Atomic task.** Changes account registration so submitting the form creates a *pending
registration* (and emails a verification link) instead of a `members` row. After this, no
`members` row exists until the email is verified.

## Current state
`createNewMember` in `src/server/controllers/createAccountController.ts` validates the
submission and then creates a real `members` row immediately (via `generateAccount` /
`addUser`) and emails a verification link built from a `members`-based `verification_code`.
The `pending_registrations` table and `pendingRegistrationManager` exist, and availability
checks already treat non-expired pending rows as taken — but nothing creates pending rows yet.

## Do
1. Keep all existing validation (username/email/password format, profanity/blacklist, MX/DNS)
   and the bcrypt password hashing. Email is lowercased before storage/checks as today —
   preserve that.
2. Replace the account-creation step. On success:
   - Delete any **expired** pending row for this username/email first (so a freed name is not
     blocked by the `UNIQUE` constraint).
   - Insert a new `pending_registrations` row with a fresh `verification_token`, a fresh
     `claim_token`, and an `expires_at` 24 hours out.
   - Send the verification email (step 3).
   - Set an **httpOnly** pending cookie holding the `claim_token` (signed if the app signs
     cookies). Never put the `verification_token` in the cookie.
   - Return success JSON.
   - **Do not** call `generateAccount` / `addUser` — no `members` row is created here.
3. Point the verification email at the pending flow: in `sendEmailConfirmation`
   (`src/server/controllers/emailController.ts`), email the pending row's `verification_token`
   as a link to `GET /verify/:token`. Keep the existing blacklist check. Only fix the
   link/recipient/content here — the email's visual design is not part of this task.

## Out of scope
- The `GET`/`POST /verify/:token` endpoints and the poll — separate tasks. (After this task a
  verification link is emailed, but the route that consumes it is added separately.)
- Re-register / "change email" handling, resend, and blacklist *messaging* — separate tasks.
- Removing the old `members`-based verification code paths — separate task.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- `POST /register` with valid data creates a `pending_registrations` row, sends (or logs, in
  dev) a verification email linking to `/verify/:token`, sets the httpOnly pending cookie, and
  creates **no** `members` row.
- Submitting with a username/email held only by an expired pending row succeeds (the expired
  row is cleared first).
