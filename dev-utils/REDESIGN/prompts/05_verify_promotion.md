# Promote a pending registration on `POST /verify/:token`

**Atomic task.** Adds the endpoint that turns a verified pending registration into a real
`members` row.

## Current state
A verification email links to `GET /verify/:token`, but no route handles that token yet.
`src/server/controllers/verifyAccountController.ts` still contains the old `members`-based
verification logic (consuming a `members` `verification_code`). The `pending_registrations`
table/manager exist and `POST /register` creates pending rows.

## Do
1. Replace `verifyAccountController.ts` with promotion logic for **`POST /verify/:token`**
   (token in the URL param or body):
   - Look up the pending row by `verification_token`.
   - Missing/expired → respond with a clear error JSON.
   - Already verified (`verified_at` set) → respond success **idempotently**.
   - Otherwise **promote**: create the real account as already-verified (reuse
     `generateAccount` / `addUser` with `is_verified = 1`, `verification_code = null`,
     `is_verification_notified = 1` — these columns still exist), then mark the pending row
     verified (`verified_at`, `member_user_id`). **Do not create a session.** Return success
     JSON.
   - Handle the "just taken" race at promotion (`addUser` runs in a transaction and throws
     `SQLITE_CONSTRAINT_ERROR` on conflict).
2. Routes (`src/server/middleware/middleware.ts`): replace the old
   `app.get('/verify/:member/:code', ...)` with `POST /verify/:token`. Consider a sensible
   rate limiter on it.
3. Keep `manuallyVerifyUser` for the admin panel if it still has callers; if none remain after
   this change, remove it.

## Out of scope
- The inert `GET /verify/:token` page UI — separate task.
- The poll / session issuance — separate task. This endpoint sets no session.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- `POST /verify/:token` with the emailed token creates the real verified `members` row and
  marks the pending row verified; a second call is idempotent; an unknown/expired token errors
  cleanly. No session cookie is set by this endpoint.
