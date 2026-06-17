# Prompt 5 — One-time prod cleanup: clear all spam-complaint blacklist entries

You are working on the infinitechess.org backend. Assume prompts 1–4 are complete. Prompt 4
changed policy so spam complaints no longer blacklist anyone. This prompt cleans up the
**existing** data that the old policy already created, on production.

## The task

Write a **one-time maintenance script** (to be run once against the prod database) that removes
**every** `reason = 'spam_report'` row from `email_blacklist` — regardless of whether the address
matches a current member. Rationale: every email this app sends is user-triggered, so a complaint
always came from a real recipient of a real email, and under the new policy a complaint must never
suppress. So all existing complaint-based suppressions are now invalid and should go.

Remove them via `removeFromBlacklist` (or an equivalent delete), and log what was cleared so the
prod run is auditable.

## Critical constraint — bounce entries are a tripwire, not a cleanup target

`reason = 'bounce'` rows are **never** removed (a hard bounce means that mailbox is dead;
resurrecting it just re-bounces and harms sender reputation). But a bounce row tied to a **valid
member** should be **impossible**, so treat it as a red flag:

- **First**, before changing anything, check whether any valid member's email is blacklisted with
  `reason = 'bounce'`. If even one exists, **throw an error** that names the offending
  account(s)/email(s), and make **no** changes at all — so a human can investigate and decide.
- **Only if** no such case exists, proceed to delete all `spam_report` rows.

(The member lookup exists only for this tripwire — the `spam_report` deletion itself is not
conditioned on member membership.)

## Context

- `src/server/database/blacklistManager.ts` — `removeFromBlacklist(email)`; the `email_blacklist`
  table (`email`, `reason`).
- `src/server/database/memberManager.ts` — for looking up which emails belong to real members.
- Follow the project's existing convention for one-off / maintenance scripts (inspect how any
  existing maintenance or seed scripts are structured and located, and match that). The script
  should be safe to run exactly once and clearly logged.

## Note for the human running it
This is a prod-only data fix; it isn't wired into normal startup. Decide separately whether to
keep the script in the repo after running it or remove it.

When done, ensure `npm run type-check --silent` and `npm run lint --silent` both pass.
