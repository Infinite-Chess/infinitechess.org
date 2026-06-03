# Add the Cloudflare Turnstile widget to the register form

**Atomic task.** Renders the Turnstile widget on the register form and sends its token, so UI
registration can pass the server gate.

## Current state
The server rejects `POST /register` submissions without a valid Turnstile token (verified via
`siteverify`), but the register form renders no widget and sends no token, so UI registration
can't pass the gate. `TURNSTILE_SITE_KEY` is available server-side.

## Do
- Inject the site key into `register.njk` from its render route (SSR context).
- Load the Turnstile script (`https://challenges.cloudflare.com/turnstile/v0/api.js`) on the
  register page and render the widget (`<div class="cf-turnstile" data-sitekey=...>`), Managed
  mode (the default).
- Keep the submit button **disabled until a token exists** (use the widget's success callback
  to enable it / store the token); on `error`/`expired` callbacks, disable submit again and
  show a retry message.
- Send the token in the `POST /register` body as `cf-turnstile-response`. **Reset the widget**
  after a failed/blocked attempt so the user can retry with a fresh token (tokens are
  single-use, ~300s TTL).

## Out of scope
- Adding Turnstile to other forms (login/reset).

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass; the page builds.
- With the always-pass test keys, registration works end-to-end through the UI.
- With the always-block sitekey `2x00000000000000000000AB`, the widget blocks and submit stays
  disabled / the request is rejected, with a failure message shown.
- Submitting the same token twice fails on the second attempt (a fresh token is obtained per
  submit).
