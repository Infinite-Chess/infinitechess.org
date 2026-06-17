# Prompt 6 — Localize the password-reset flow

Assume prompts 1–5 are complete: the password-reset flow (request page, set-password page, the
backend, and its emails) is built and working with **hardcoded English strings**. Localization
was deliberately saved for last, so the flow's final shape is now known.

Your job: find every hardcoded English user-facing string across the whole password-reset flow
and localize it, following `docs/systems/TRANSLATIONS.md`. This includes any **pre-existing**
password-reset strings still on the old translation system (e.g. old server-response keys and
old EJS-era keys) — migrate those into the new system too, so the flow is consistent and there's
no leftover redundancy.

Any orphaned keys in the process from the old translation system should be deleted.

When done, ensure `npm run type-check --silent` and `npm run lint --silent` both pass.
