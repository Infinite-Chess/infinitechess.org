# Prompt 4 — Stop locking accounts out on a spam complaint

You are working on the infinitechess.org backend. Assume prompts 1–3 are complete. This change is
**independent** of the password-reset pages but is part of the same effort: making sure a real
user can never be permanently locked out of account-recovery email.

## The problem

Every email this app sends is **transactional and user-triggered** (account verification,
password reset, password-changed receipts, and future account-deletion / ToS notices). There is
**no marketing mail**. Yet the AWS SES webhook currently treats a **spam complaint** the same as
a hard bounce: it permanently blacklists the address. The send guard (`isBlacklisted`) then
blocks *all* future mail to it — so one stray "report spam" tap permanently strands a real user
from password resets, security receipts, and account-deletion confirmations.

The rationale for complaint-suppression (don't keep sending *bulk* mail to people who don't want
it) simply doesn't apply when all mail is transactional.

## The policy change

- **Spam complaints must no longer blacklist (suppress) an address.** Keep them **recorded** —
  the webhook should still log the complaint (it already writes to the `awsNotifications` log) so
  we retain visibility and can act manually on a repeat offender or if SES complaint metrics
  climb — but it must **not** call `addToBlacklist`.
- **Permanent (hard) bounces are unchanged** — they still blacklist (`reason: 'bounce'`). A dead
  mailbox is a legitimate, unambiguous suppression signal; resending just bounces again.

## Context

- `src/server/controllers/awsWebhook.ts` — `handleSesWebhook`. The `Complaint` branch currently
  calls `addToBlacklist(email, 'spam_report')`; the `Bounce` branch calls
  `addToBlacklist(email, 'bounce')` for `Permanent` bounces only.
- `src/server/database/blacklistManager.ts` — `addToBlacklist(email, reason)`, `isBlacklisted`,
  `removeFromBlacklist`. The `email_blacklist` table has an `email` and a `reason` column.
- `docs/systems/REGISTRATION.md` describes the existing blacklist behavior ("permanent bounces
  and complaints only") — update that documentation to match the new policy.

## Your task

In the webhook's `Complaint` branch, stop blacklisting: keep the existing log line, drop the
`addToBlacklist` call. Leave the `Bounce` (`Permanent`) handling exactly as-is. Update
`REGISTRATION.md` (and any other doc that states the old behavior) so it reflects that complaints
are recorded but no longer suppress. Don't build a transactional-vs-bulk taxonomy — there's only
transactional mail today; that's a future concern.

When done, ensure `npm run type-check --silent` and `npm run lint --silent` both pass, and watch
for redundancy.
