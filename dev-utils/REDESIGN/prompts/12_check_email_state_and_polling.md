# Make the "Check your email" state live (SSR resume + polling)

**Atomic task.** Turns the static post-submit message into a state that survives reloads (via
SSR) and polls until the email is verified, then logs in and redirects.

## Current state
The register page renders a redesigned form and, on a successful submit, swaps to a **static**
"Check your email" message. `GET /register/poll` exists and returns
`pending`/`verified`/`expired` (issuing the session and clearing the pending cookie on
`verified`). The page does not poll and does not re-render the waiting state on reload.
`POST /register` and `POST /register/resend` can return a `blacklisted` signal for an
undeliverable address. `src/server/routes/root.ts` renders `register.njk`. A toast component
lives at `src/client/scripts/esm/components/toast.ts`.

## Do
- Make the "Check your email" state renderable two ways:
  1. the client-side swap after a successful submit (already happens), and
  2. via **SSR** when `/register` loads with the pending cookie present. In `root.ts`, when
     rendering `register.njk`, read the pending cookie and pass an `awaitingVerification` flag;
     **also re-check `isBlacklisted`** for the pending row's address and pass a `blacklisted`
     flag. Branch in the template: cookie present → "Check your email" state; `blacklisted`
     flag → the generic **"This address can't receive mail"** variant (never "we sent a link");
     no cookie → the form.
- While in the "Check your email" state, **poll** `GET /register/poll` (~3s; cap the total
  duration, e.g. stop after ~20–30 min or back off):
  - `pending` → keep waiting.
  - `verified` → the session cookie is now set by the server; **redirect to `/`** and show a
    success toast (use `components/toast.ts`; pass the toast via `sessionStorage`/query and
    read it on the home page — match any existing toast-after-redirect pattern, else a simple
    `sessionStorage` flag).
  - `expired` → show a "your link expired, register again" state with a way back to the form.
- **Echo no email address** anywhere in this state.

## Out of scope
- The "Resend" button and "Wrong email?" link — separate task.
- The verify page and Turnstile — separate tasks.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass; the page builds.
- Reloading `/register` mid-wait (pending cookie present) re-renders the "Check your email"
  state via SSR; without the cookie it renders the form.
- After the email is verified, the polling tab redirects to `/` with a success toast, logged
  in; an expired pending row yields the expired state; a blacklisted address shows the generic
  "can't receive mail" message instead of "we sent a link".
