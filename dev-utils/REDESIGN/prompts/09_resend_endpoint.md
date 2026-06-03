# Add the `POST /register/resend` endpoint

**Atomic task.** Adds a cookie-scoped endpoint to re-send the verification email to a waiting
pending registration, and removes the obsolete `members`-based resend.

## Current state
There is no way to re-send the verification email to a pending registration. The old resend
endpoint `requestConfirmEmail` (and its route) still exist but assume a signed-in unverified
member, which no longer occurs. `resendAccountVerificationLimiter` in
`src/server/middleware/rateLimiters.ts` is currently **4 per hour per IP**.

## Do
1. Add **`POST /register/resend`**: read the pending cookie (`claim_token`), look up the
   pending row, and re-send its verification email using the **existing** `verification_token`
   (no token rotation). It takes **no request body**, so it can only ever re-send to the
   caller's own pending address — never an arbitrary one. Respond success JSON; if there is no
   matching/non-expired pending row, respond accordingly.
2. Apply `resendAccountVerificationLimiter` to the route, and **bump it from 4 → 8 per hour per
   IP** (per-IP is shared by NAT/office/carrier users; the server limit is the only resend
   throttle).
3. Remove the old `requestConfirmEmail` handler and its route.

## Out of scope
- The front-end "Resend" button, its feedback, and the rate-limit message — separate task.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- `POST /register/resend` re-sends to the cookie's pending row and to no other; exceeding 8/hr
  returns `429`; the old `requestConfirmEmail` route no longer exists.
