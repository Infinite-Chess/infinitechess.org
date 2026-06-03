# Chunk 04 — Cloudflare Turnstile (bot protection)

**Read `00_OVERVIEW.md` first. Requires chunks `01` and `03`** (it adds the widget to the
redesigned form and the server gate to the rewritten `/register` handler). Do this
**last**. **Do not deploy registration to production until this chunk is merged** — it is
the actual bot gate.

Use **Managed mode** (adaptive: invisible when confident, escalates to a checkbox when
suspicious). Enforce it **server-side**; the widget alone is not protection.

## Scope (do)

### A. Config / env
- Add `TURNSTILE_SITE_KEY` (public) and `TURNSTILE_SECRET_KEY` (server-only) to the env
  loading (this project uses `dotenv/config`). Document them in `.env.example` / wherever
  env vars are documented.
- **Development defaults:** fall back to Cloudflare's dummy **test keys** when the env vars
  are unset, so local dev works without real keys (they bypass domain checks / localhost):
  - sitekey `1x00000000000000000000AA` (always passes), secret
    `1x0000000000000000000000000000000AA` (always passes).
  - Keep the other test keys handy for exercising failure/challenge paths (see `00_OVERVIEW.md`).
- Never hardcode real keys. The site key is injected into the template; the secret stays
  server-side.

### B. Client widget (on the register form from chunk `03`)
- Load the Turnstile script (`https://challenges.cloudflare.com/turnstile/v0/api.js`) on
  the register page and render the widget (`<div class="cf-turnstile" data-sitekey=...>`),
  Managed mode (default). Inject the site key from SSR context (pass it to `register.njk`
  from the route).
- Wire the token into submit: keep the submit button **disabled until a token exists**
  (use the widget's success callback to enable it / store the token). On widget
  `error`/`expired` callbacks, disable submit again and show a retry message.
- Send the token in the `POST /register` body (e.g. as `cf-turnstile-response`, the
  field name the widget uses). Reset the widget after a failed/blocked attempt so the user
  can retry with a fresh token (tokens are single-use, ~300s TTL).

### C. Server gate (on `/register` in `createAccountController.ts`)
- Before any account/pending work, **verify the token** with Cloudflare `siteverify`
  (`POST https://challenges.cloudflare.com/turnstile/v0/siteverify`, body: `secret`,
  `response` = the token, `remoteip` = `getClientIP(req)` from
  `src/server/utility/IP.ts`). Use the global `fetch`.
- If verification fails or the token is missing → reject with a clear error JSON **before**
  creating a pending row. This is the mandatory gate.
- Put the siteverify call in a small reusable helper (e.g.
  `src/server/middleware/turnstile.ts` or a util) — it may be reused on other forms later.
  Avoid inlining HTTP logic in the controller.

### D. Honeypot — already removed in chunk `01`
- The `recovery` honeypot was removed in chunk `01` (before the form redesign). Nothing to
  do here except **confirm** no `recovery` handling remains in `createNewMember` and no
  hidden honeypot field exists in the form. If anything lingers, remove it.

## Out of scope
- Don't add Turnstile to other forms (login/reset) in this chunk — keep it to register.
  (If the helper is reusable, great, but wiring other pages is separate work.)

## Acceptance criteria
- `npm run type-check --silent` and `npm run lint --silent` both pass.
- With the **always-pass** test keys, registration works end-to-end.
- **The security test:** `curl -X POST /register` with a valid JSON body but **no** token,
  and with a **garbage** token, are both **rejected** before any pending row is created.
- With the **always-block** sitekey (`2x00000000000000000000AB`), the widget blocks and the
  submit stays disabled / the request is rejected; the failure message is shown.
- (Honeypot was removed in chunk `01`.) Confirm no `recovery` handling remains in
  `createNewMember` and no hidden honeypot field exists in the form.
- Token replay (submitting the same token twice) fails on the second attempt; the client
  obtains a fresh token per submit.

## Gotchas
- `siteverify` must run **server-side** with the secret key — the client check is cosmetic.
- We're behind a Cloudflare Tunnel, so `getClientIP` already yields the real client IP via
  `cf-connecting-ip`; pass it as `remoteip`.
- Don't block legitimately on transient `siteverify` network errors without a clear
  message — but do **not** fail open (a network error must not bypass the gate; reject with
  a retry message).
- Before production, configure the real keys' allowed-domains in the Cloudflare dashboard
  (incl. a staging hostname for an end-to-end test with real keys). Note this in the PR.
