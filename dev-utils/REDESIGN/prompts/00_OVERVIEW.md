# Register Page Redesign + Bot Protection — Overview

This folder contains the incremental implementation prompts for redesigning the
registration flow. **Read this file first**, then the numbered prompt for the chunk
you are implementing. Each numbered prompt assumes the design decisions recorded here.

Implement the prompts **in order**: `01` → `02` → `03` → `04`. `02`, `03`, and `05` each
depend only on `01` (not on each other), so they may be swapped or parallelized, but the
linear order is the safe default. `04` (Turnstile) is intentionally **last** so the
widget is added to the finished form rather than a form we then redesign. `05` (redesign
the verification **email**) is a self-contained task doable any time after `01`.

> ⚠️ Between chunks the app still runs, but the registration flow is not fully
> bot-protected until `04` lands. **Do not deploy to production until `04` is merged.**

> 📋 **`OPEN_DECISIONS.md`** (in this folder) lists known gaps not yet folded into the
> numbered prompts (resend/re-register handling, link TTL, cutover of existing unverified
> accounts, verify-button JS). Resolve those with the owner and fold them in before
> relying on the prompts as complete.

---

## The goal in one paragraph

Move account creation to a **"verify-first" model (Pattern B)**: filling out the
register form no longer creates a `members` row. Instead it creates a row in a new
`pending_registrations` table and emails a verification link. The account only becomes
real when the email is verified. This eliminates the ~70% of accounts that are created,
never verified, and auto-deleted 3 days later — and lets us delete the `is_verified`
flag and all the "unverified account" handling it drags along. Bot protection is
upgraded to **Cloudflare Turnstile (Managed mode)**, required server-side.

Casual "play one game and leave" users are already served by **guest play**, so adding
a verify-before-account gate costs us nothing there.

---

## The agreed flow (read carefully — this is the contract)

### Registering (the "register browser")
1. User opens `/register`, fills the form (username, email, password) + Turnstile.
2. On submit (a `fetch` POST to `/register`): server validates everything (incl. the
   Turnstile token), inserts a `pending_registrations` row, sends the verification
   email, sets an **httpOnly "pending" cookie** identifying this pending row, and
   returns success. **No `members` row is created.**
3. The page **swaps in place** to a "Check your email" state (no full navigation). On
   reload, SSR re-derives this state from the pending cookie (so refresh is safe; direct
   navigation without the cookie just shows the form).
4. The "Check your email" state **polls** a small endpoint, scoped to the pending cookie.

### Verifying (the "email link", possibly a different device)
5. The email link points to `GET /verify/:token`. This GET is **inert** — it renders a
   page with a **"Verify my account" button** and does **nothing else** (no DB writes, no
   token consumption). This defeats email security scanners, which issue GETs but do not
   click buttons / submit forms.
6. The user clicks the button → `POST` → the server **promotes** the pending row into a
   real, already-verified `members` row and marks the pending row verified. The verify
   page then **swaps text in place** to "✓ Verified! Head back to where you signed up."
   **The verify page never creates a session / never logs anyone in.**

### Logging in (exactly one place)
7. The register browser's **poll** detects the verification, and the server logs **that
   browser** in (it holds the pending cookie ⇒ it is the browser that entered the
   password) and the page redirects to `/` (home) with a success toast.

### Why this shape (do not "simplify" these away)
- **Login lives only in the poll.** The verify page never logs in. This makes the verify
  page uniform for every device and gives us the security property below for free.
- **Security property:** a session is only ever handed to the browser that entered the
  password (the pending-cookie holder). A forwarded link, shared inbox, or email scanner
  can at most *verify* the account — it gains no session; it merely trips the real
  registrant's poll into logging in. (This is the "Model 2" decision we settled on.)
- **The "Verify my account" button is required**, not optional. Without it, a scanner's
  GET would verify the account and prematurely trip the register browser's login. Require
  a **real click** — do **not** auto-submit the POST on page load (some scanners execute
  JS). Set a strict `Referrer-Policy` on the verify page so the token does not leak.

### Tabs / devices, concretely
- **Same browser:** the still-open register tab polls and lights up → home + toast. The
  verify tab shows the in-place "verified, head back" message.
- **Cross-device** (registered on desktop, verified on phone): the desktop register tab
  polls and lights up → home + toast; the phone verify tab shows the in-place message and
  does **not** log in. (Optionally offer a "log in here" link on the verify page.)
- The success toast firing on both the register browser is fine. Keep verify-tab copy
  **device-agnostic** ("head back to where you signed up", never "return to your tab").

### Copy
Exact wording is **not** significant and can be tweaked after implementation. Use
sensible English text; all user-facing strings must go through the translation system
(English TOMLs only — see below).

---

## Bot protection: Cloudflare Turnstile (chunk 04)

- **Managed mode** (adaptive: invisible when confident, escalates to an interactive
  checkbox when suspicious).
- **Enforced server-side**: `/register` must reject any request without a valid token
  (verified via Cloudflare's `siteverify`). The widget is UX; the server is the gate.
- **Env-driven keys** — never hardcode. Use Cloudflare's documented dummy **test keys**
  in development (they bypass domain checks and work on localhost) and real keys via env
  in staging/prod. Suggested env var names: `TURNSTILE_SITE_KEY` (public, injected into
  the template) and `TURNSTILE_SECRET_KEY` (server-only).
  - Always-pass sitekey `1x00000000000000000000AA`; always-block `2x00000000000000000000AB`;
    force-challenge `3x00000000000000000000FF`.
  - Always-pass secret `1x0000000000000000000000000000000AA`; always-fail
    `2x0000000000000000000000000000000AA`; already-spent `3x000000000000000000000000000000000AA`.
- **Drop the honeypot — in chunk `01`, not here.** The `recovery` hidden-field honeypot in
  `createNewMember` is redundant once Turnstile is the gate, but it is removed early (chunk
  `01`) so the redesigned form in chunk `03` is never built with a hidden field. Removing it
  ahead of Turnstile is safe because nothing deploys until chunk `04`. Don't add any hidden
  field to the new form.
- Failure UX: keep the submit button disabled until a token exists; on widget error show
  a retry message. Don't over-engineer false positives — Managed mode + a clear retry
  message is enough.
- We are fully behind a **Cloudflare Tunnel**, so `getClientIP` already returns the real
  client IP from `cf-connecting-ip` (`src/server/utility/IP.ts`) — pass it as `remoteip`
  to `siteverify`.

---

## File map (verified paths)

**Register page (currently a mid-redesign stub — you are building it):**
- `src/server/views/register.njk` — currently `<main></main>` stub.
- `src/client/scripts/esm/views/register.ts` — currently references old elements; will be rewritten.
- `src/client/css/register.css` — exists.
- `translation/register/en-US.toml` — **create** (mirror `translation/login/en-US.toml`).

**Reference pattern (the finished login redesign — copy its conventions):**
- `src/server/views/login.njk` — uses `{% set t = templateT('login') %}`, ships script
  strings via a `{% block head %}` `window.t` assignment, `btn-primary`, `bg-checkerboard`,
  `login-card`.
- `src/client/scripts/esm/views/login.ts` — uses `serverFetch`, inline error element.
- `src/client/css/login.css`, `translation/login/en-US.toml`.

**Backend:**
- `src/server/controllers/createAccountController.ts` — `createNewMember`,
  `checkUsernameAvailable`, `checkEmailValidity`, `generateAccount`. Honeypot lives here.
- `src/server/controllers/verifyAccountController.ts` — old verify logic (to be replaced).
- `src/server/controllers/emailController.ts` — `sendEmailConfirmation` (to be reworked).
- `src/server/controllers/loginController.ts` — `handleLogin`.
- `src/server/controllers/authenticationTokens/sessionManager.ts` —
  `createNewSession(req, res, user_id, username, roles, keepLoggedIn)` is how a session
  cookie is issued. The poll endpoint uses this.
- `src/server/database/memberManager.ts` — `addUser(username, email, hashedPassword,
  is_verified, verification_code, is_verification_notified)`, `isUsernameTaken`,
  `isEmailTaken`, `getMemberDataByCriteria`, `updateMemberColumns`.
- `src/server/database/databaseTables.ts` — `generateTables()` creates the `members`
  table (and others). Add `pending_registrations` here.
- `src/server/database/cleanupTasks.ts` — `removeOldUnverifiedMembers()` (3-day sweep).
  Add/repurpose a sweep for expired `pending_registrations`.
- `src/server/middleware/middleware.ts` — API routes. `/register` POST (line ~202),
  `/register/username/:username`, `/register/email/:email`, `/verify/:member/:code` (~269).
  `createAccountLimiter` is applied to `/register`.
- `src/server/middleware/rateLimiters.ts` — `createAccountLimiter` (6/IP/24h).
- `src/server/routes/root.ts` — page renders (e.g. `res.render('register.njk')` at ~48).
- `build/client.ts` — `ESMEntryPoints` array. `register.ts` is currently **commented out**
  (line ~50) and `register.css` is not listed — both must be added; add verify assets too.

**`is_verified` usage (all removed in chunk 02):**
- `src/server/api/MemberAPI.ts` — `verified` field + the `is_verification_notified`
  "thank you for verifying" message.
- `src/server/socket/openSocket.ts` — sets `ws.metadata.verified`.
- `src/server/game/invitesmanager/createseek.ts` & `acceptseek.ts` — reject rated
  seeks unless `signedIn && ws.metadata.verified`.
- `src/server/api/AdminPanel.ts` — displays `is_verified`.
- `src/server/socket/socketManager.ts` — `AddVerificationToAllSocketsOfMember`.

**Client utilities & components:**
- `src/client/scripts/esm/util/serverFetch.ts` — wrapper around `fetch` that injects the
  `is-fetch-request` header. **Use it for all requests.**
- `src/client/scripts/esm/components/toast.ts` — toast component for the success toast.
- `src/client/scripts/esm/components/header/dropdowns/languagedropdown.js` —
  `addLngQueryParamToLink`.

---

## Conventions (apply to every chunk)

- **After any script change, both must pass:** `npm run type-check --silent` and
  `npm run lint --silent`. Run each, fix all errors, and fix any pre-existing lint
  warning you touch. TS indentation is **tabs**. Prettier enforces styling.
- Respect the `src/client` / `src/server` / `src/shared` import boundaries. Only `shared`
  may be imported by both sides.
- **Never re-export types** — import from source. Never use `Omit`/`Exclude`; have one
  type extend another.
- **Avoid redundancy.** After implementing, actively look for duplication you introduced
  (especially availability checks and validation) and centralize it.
- **Translations:** maintain **English TOMLs only**. New pages follow the component
  pattern: a `translation/<page>/en-US.toml` with top-level template strings and a
  `[script]` table for strings shipped to the browser. See `NEW_PAGE_GUIDE.md` and
  `dev-utils/REDESIGN/TRANSLATION_SYSTEM.md`. In templates, `templateT('<page>')`; ship
  script strings via the `head` block like `login.njk` does.
- New SSR pages: follow `dev-utils/REDESIGN/NEW_PAGE_GUIDE.md` (template in
  `src/server/views`, CSS + TS entry, route in `root.ts`, esbuild entry in `build/client.ts`).
- Tests are **not required** for new features, but **update existing tests** you break
  (e.g. `src/server/controllers/createAccountController.unit.test.ts`).

---

## Endpoint & data contracts (shared across chunks)

These are the interfaces `01` exposes and `03` consumes. Keep them stable.

### `pending_registrations` table (created in `01`)
Recommended schema (column names flexible; the **bolded properties are firm**):
```
id                INTEGER PRIMARY KEY
verification_token TEXT  -- UNIQUE, secret, used in the email link
claim_token       TEXT  -- UNIQUE, secret, stored in the httpOnly pending cookie (poll scope)
username          TEXT  -- UNIQUE, COLLATE NOCASE
email             TEXT  -- UNIQUE
hashed_password   TEXT
created_at        TIMESTAMP
expires_at        TIMESTAMP
verified_at       TIMESTAMP  -- NULL until the POST verify promotes it; kept until cleanup
member_user_id    INTEGER    -- set on promotion, so the poll can issue the session
```
- **Firm:** `UNIQUE` on `username` (NOCASE) and `email`; an `expires_at`; a secret token
  for the email link distinct from the cookie's claim token; a way for the poll to tell
  "verified" from "still waiting" from "gone/expired" (hence keeping the row with
  `verified_at`/`member_user_id` rather than deleting on verify).
- The pending row is **deleted by the cleanup sweep**, not immediately on verify.

### Availability (changed in `01`)
- `checkUsernameAvailable` / `checkEmailValidity` and the final pre-insert validation must
  treat a name as taken if it exists in `members` **OR** in a non-expired
  `pending_registrations` row. Centralize this (e.g. extend `isUsernameTaken` /
  `isEmailTaken` to consult both tables with an `expires_at > now` filter). On submit,
  clear an **expired** pending row for the same username/email first so the `UNIQUE`
  constraint does not block a freed name.

### Routes (added/changed in `01`, consumed in `03`)
- `POST /register` — validates (incl. Turnstile token once `04` lands), inserts pending,
  sends email, sets the httpOnly pending cookie, returns success JSON. No `members` row.
- `GET /verify/:token` — **inert**; rendered page (chunk `03`) with the verify button.
- `POST /verify/:token` (or token in body) — promotes pending → `members` (verified),
  sets `verified_at`/`member_user_id`. Returns success JSON. **Sets no session.**
- `GET` poll endpoint (e.g. `/register/poll`) — reads the pending cookie; responds:
  - still waiting → `{ status: 'pending' }`
  - verified → issue the session via `createNewSession`, respond `{ status: 'verified' }`
  - gone/expired/no cookie → `{ status: 'expired' }`
  Only ever acts on the pending row matching the cookie.

### Cookie
- httpOnly (signed if the app signs cookies), scoped to the registration; holds the
  `claim_token` (not the email's `verification_token`). Cleared on success/expiry.
```
