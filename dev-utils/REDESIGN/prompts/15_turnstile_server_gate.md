# Enforce Cloudflare Turnstile on `POST /register` (server gate)

**Atomic task.** Adds the mandatory server-side bot check: `/register` rejects any request
without a valid Turnstile token, verified with Cloudflare. The widget is added separately; this
is the gate.

## Current state
`POST /register` validates and creates a pending registration with no bot-protection check —
any client can submit. The site runs behind a Cloudflare Tunnel, so `getClientIP(req)`
(`src/server/utility/IP.ts`) returns the real client IP via `cf-connecting-ip`.

## Do
1. **Env:** add `TURNSTILE_SITE_KEY` (public) and `TURNSTILE_SECRET_KEY` (server-only) to env
   loading (`dotenv/config`); document them in `.env.example`. In development, fall back to
   Cloudflare's dummy **test keys** when unset — sitekey `1x00000000000000000000AA`, secret
   `1x0000000000000000000000000000000AA` (both always pass) — so local dev needs no real keys.
   Never hardcode real keys.
2. **Helper:** add a small reusable helper (e.g. `src/server/middleware/turnstile.ts`) that
   verifies a token via `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`
   (body: `secret`, `response` = the token, `remoteip` = `getClientIP(req)`) using the global
   `fetch`. Don't inline the HTTP call in the controller.
3. **Gate:** in `createNewMember`, **before any pending/account work**, verify the token (sent
   in the `POST` body as `cf-turnstile-response`). If it is missing or invalid → reject with a
   clear error JSON before creating a pending row. Do **not fail open** on a `siteverify`
   network error — reject with a retry message.

## Out of scope
- The client widget — separate task.
- Adding Turnstile to other forms (login/reset).

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- `POST /register` with a valid always-pass token works end-to-end via `curl`; with **no**
  token or a **garbage** token it is rejected before any pending row is created; a `siteverify`
  network error rejects (does not bypass the gate).
