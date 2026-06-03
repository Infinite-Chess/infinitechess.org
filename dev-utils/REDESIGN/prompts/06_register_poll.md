# Add the `GET /register/poll` endpoint

**Atomic task.** Adds the endpoint the register browser polls so that, once its pending
registration is verified, that browser (and only that browser) gets logged in.

## Current state
`POST /register` sets the httpOnly pending cookie (`claim_token`), and `POST /verify/:token`
promotes a pending row (setting its `member_user_id`). Nothing yet lets the
register browser detect the verification or receive a session.
`createNewSession(req, res, user_id, username, roles, keepLoggedIn)` in
`src/server/controllers/authenticationTokens/sessionManager.ts` is how a session is issued.

## Do
Add `GET /register/poll` (in `src/server/middleware/middleware.ts`):
- Read the pending cookie (`claim_token`). No cookie → `{ status: 'expired' }`.
- Look up the pending row by `claim_token`. Missing/expired → `{ status: 'expired' }`.
- Not yet verified (`member_user_id` is null) → `{ status: 'pending' }`.
- Verified (`member_user_id` is set) → issue the session for that `member_user_id` via
  `createNewSession(req, res, user_id, username, roles, keepLoggedIn = false)` (fetch the
  member's roles the way `loginController` does), **clear the pending cookie**, and respond
  `{ status: 'verified' }`.
- **Idempotency:** do **not** delete the pending row on poll-success — leave it for the
  cleanup sweep, so a refreshed or duplicate waiting tab that polls again still sees
  `verified` and resolves cleanly.
- Only ever act on the pending row matching the cookie.

## Out of scope
- The client-side polling UI / redirect / toast — separate task.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- The poll returns `pending` before verification and `verified` (with a session cookie now
  set) after, and `expired` when the cookie is missing/invalid — acting only on the matching
  pending row.
