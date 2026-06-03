# Add the "Resend" button and "Wrong email?" link

**Atomic task.** Adds the two recovery controls to the "Check your email" state.

## Current state
The "Check your email" state shows a generic message and polls, but offers no way to resend or
to fix a mistyped email. `POST /register/resend` exists (cookie-scoped, rate-limited 8/hr,
returns a `blacklisted` signal when relevant). `POST /register` treats a re-submit matching the
caller's own pending cookie as an update-and-resend (rotating the token when the email
changes). No email address is shown in the waiting state.

## Do
- **Resend button** → `serverFetch` `POST /register/resend`. Feedback:
  - success → a transient **"✓ Verification email sent again."** (no address, **no countdown
    timer**).
  - `429` → **"Please wait a little bit before resending."**
  - `blacklisted` signal → **"This address can't receive mail."**
  - Do **not** add a client-side cooldown — the server limiter is the only throttle.
- **"Wrong email?" link** → swap back to the form with **all inputs preserved** (including the
  email, so the user can spot the typo — never clear them). Correcting the email and
  re-submitting hits `POST /register`, which updates the caller's own pending row and re-sends.

## Out of scope
- The verify page and Turnstile — separate tasks.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass; the page builds.
- Resend re-sends and shows the confirmation; hitting the limit shows the wait message; a
  blacklisted address shows the can't-receive message.
- "Wrong email?" returns to the filled-in form, and a corrected re-submit re-sends with no
  false "already taken".
