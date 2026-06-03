# Treat a re-submit from the same browser as update-and-resend

**Atomic task.** Lets someone who already has a pending registration re-submit the form —
to resend, or to fix a mistyped email — without being told their own username/email is
"already taken."

## Current state
`createNewMember` inserts a fresh `pending_registrations` row on each submit and reports
"already taken" whenever the username/email collides with any non-expired pending or `members`
row — **including the caller's own pending row**. That makes a re-submit (e.g. after a typo) a
dead end. The request already carries the httpOnly pending cookie (`claim_token`) when one
exists.

## Do
In `createNewMember`, before treating a collision as "taken", consult the pending cookie:
- If the request carries a pending cookie whose `claim_token` matches an existing pending row,
  treat the submission as **that user's own** registration: **update that row in place**
  (username/email/password, refreshed `expires_at`) and re-send, instead of reporting a
  conflict. **Rotate the `verification_token` only if the email changed**; on a same-email
  re-submit keep the existing token (so an already-delivered link still works).
- A collision with a non-expired pending row, or a `members` row, belonging to **someone else**
  remains a genuine "already taken".

## Out of scope
- The `POST /register/resend` endpoint and the front-end "Resend" / "Wrong email?" controls —
  separate tasks. This is the server logic that makes the "change email" path work.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- Re-submitting with the same pending cookie updates the caller's own pending row and re-sends,
  with no false "already taken"; changing the email rotates the `verification_token`; a
  collision with another party's pending/`members` row still reports "already taken".
