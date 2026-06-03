# Surface undeliverable (blacklisted) addresses to the client

**Atomic task.** Makes the register and resend responses tell the client when the server
**declined to send** because the address is blacklisted — without ever claiming a send it
didn't make.

## Current state
`sendEmailConfirmation` checks `isBlacklisted` (the `email_blacklist` table, populated from AWS
SES bounce/complaint webhooks in `src/server/controllers/awsWebhook.ts`) and **silently skips**
sending to a blacklisted address, giving the caller no signal. So `POST /register` and
`POST /register/resend` cannot tell the user their address can't receive mail.

## Do
Make the send path surface the blacklist outcome instead of swallowing it. When the target
address is blacklisted:
- **`POST /register`**: still create/reserve the pending row + cookie, but return a
  `blacklisted` signal in the response so the client can show a generic message.
- **`POST /register/resend`**: return the same `blacklisted` signal.
- **Never claim a send occurred** for a blacklisted address.
- The response **must not reveal the reason** (bounce vs. complaint) — only that the address
  can't receive mail.

Because sends are fire-and-forget, this only ever fires when the address was **already**
blacklisted from prior history.

## Out of scope
- The client-side "This address can't receive mail" message — separate task.
- Re-checking the blacklist when SSR-rendering the waiting state — handled with that state's
  task.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- Registering or resending with a blacklisted address returns the `blacklisted` signal,
  creates/keeps the pending row, and sends nothing; a non-blacklisted address is unaffected;
  the blacklist reason is never included in the response.
