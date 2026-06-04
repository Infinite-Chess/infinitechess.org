# Rework the awaiting state into its own page + change-email recovery

**Atomic task.** Promotes the "check your email" state from an in-place card on `/register`
into its own page, removes the resend button and the re-submit "update" path, and adds a
Lichess-style change-email control as the single recovery affordance.

## Current state
The "check your email" state is a hidden card on `/register` that is swapped in after a
successful submit and SSR'd on reload from the pending cookie; it polls `GET /register/poll`.
`POST /register/resend` exists (cookie-scoped, rate-limited 8/hr). `POST /register` treats a
re-submit carrying the caller's own pending cookie as an **update-and-resend** — the commit
`a7e69d7c9` added `updatePendingRegistration`, `isUsernameTakenInPendingByOther`, and
`isEmailTakenInPendingByOther` for this. There is no dedicated change-email endpoint and no
separate awaiting page. `dev-utils/REDESIGN/NEW_PAGE_GUIDE.md` describes how to add an SSR page
(template, CSS, TS entry, route, esbuild entry).

## Do

### 1. Extract the awaiting state into its own page
- New SSR page at `GET /register/awaiting`: `src/server/views/registerawaiting.njk`,
  `src/client/scripts/esm/views/registerawaiting.ts`, a render route in
  `src/server/routes/root.ts`, and an esbuild entry in `build/client.ts`. Reuse the shared
  auth/card styles; add CSS as needed.
- `GET /register/awaiting` renders the waiting state only when an **active pending cookie** is
  present (pass the pending email and a `blacklisted` flag for SSR); otherwise redirect to
  `/register`.
- `GET /register` **redirects to `/register/awaiting`** when an active pending cookie is
  present; otherwise it renders the form. The form page is now form-only — remove the awaiting
  card and the SSR awaiting branch from `register.njk` / `register.ts`.
- After a successful `POST /register`, the form page **navigates** to `/register/awaiting`
  (replacing the old in-place card swap). Move the polling and the verified→home flash-toast
  out of `register.ts` and into `registerawaiting.ts`.
- Rename the poll route to **`GET /register/awaiting/poll`** (update server + client).
- Poll outcomes unchanged: `verified` → redirect `/` with a welcome toast; `expired` → reload
  (re-renders as the plain form once the row is no longer active); `pending` → keep waiting.

### 2. Remove the re-submit "update" path (revert most of `a7e69d7c9`)
- `POST /register` becomes **fresh-only**: drop the `isUpdate` branching, the dual
  availability checks, the dual-token logic, and the 200-vs-201. **Keep** the format/availability
  split (`doUsernameFormatChecks` / `doEmailFormatChecks`).
- Remove `isUsernameTakenInPendingByOther` (username can no longer change). **Keep**
  `isEmailTakenInPendingByOther` (the change-email endpoint needs it). Narrow
  `updatePendingRegistration` down to an email-only
  `updatePendingRegistrationEmail(claimToken, email, verificationToken)` that also refreshes
  `expires_at`.
- **Two-tab guard:** if `POST /register` arrives while the caller **already holds an active
  pending registration**, do not create a second one — return `{ success: true }` so the page
  simply navigates to `/register/awaiting` for the existing registration (the submitted data is
  ignored). Combined with the `GET /register` redirect, a stale second tab self-heals on its
  next action. (No BroadcastChannel / cross-tab messaging — an idle, untouched stale tab is
  acceptable.)

### 3. Remove Resend entirely
- Delete the `POST /register/resend` endpoint, its handler `resendPendingVerificationEmail`,
  and its route/limiter wiring. The change-email control below *is* the re-send mechanism
  (changing the address — even re-submitting the same one — rotates the token and re-sends), so
  a dedicated resend button is redundant. (Matches Lichess, which omits resend on reliable
  email; we use Amazon SES.)
- Instead, the awaiting page shows brief guidance: **"Not seeing it? Check your spam folder,
  and make sure your email address is correct."**

### 4. Add the change-email control (the only recovery affordance)
- A **"Wrong email?"** button reveals a field **prefilled (SSR)** with the pending address plus
  a **"Change it"** button. In the **blacklisted** variant the field is shown **expanded by
  default** (changing the address is the only way forward).
- "Change it" → `serverFetch` `POST /register/awaiting/email` with `{ email }` (cookie-scoped,
  behind the shared email rate-limiter repurposed from resend). The server re-validates the new
  address (format, blacklist, MX, taken-by-**another**), updates the pending row's email,
  rotates the `verification_token`, refreshes `expires_at`, and re-sends.
- **Success → reload the page.** The reload re-SSRs the awaiting state with the new address and
  is itself the "it worked" feedback — no success toast.
- **Errors → render inline beneath the field** (single `message`), **no reload**. A collision
  with someone else's pending row or a real member is a genuine "already in use."

### Echo-email note
The main waiting copy still shows **no** email address. The change-email field is the sole,
deliberate exception — it displays the pending address so the user can spot a typo.

## Out of scope
- The verify page and Turnstile — separate tasks (14, 15, 16).

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass; the page builds.
- Submitting the form navigates to `/register/awaiting`; reloading it mid-wait re-renders via
  SSR; visiting `/register` while pending redirects to `/register/awaiting`; without the cookie
  `/register` renders the form.
- Verified → the awaiting page redirects to `/` with a welcome toast, logged in; expired →
  reload returns to the form.
- A second tab that submits lands on `/register/awaiting` with no false "already taken."
- "Wrong email?" reveals the prefilled field; changing to a valid new address reloads to the
  updated state and re-sends; an in-use / blacklisted / invalid address shows an inline error
  with no reload; the blacklisted variant shows the field expanded.
- No `POST /register/resend` endpoint remains.
