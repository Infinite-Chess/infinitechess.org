# Pending registrations reserve their username/email

**Atomic task.** Makes a username/email count as "taken" if it is held by a `members` row
**or** by a non-expired `pending_registrations` row, so two people can't claim the same name
while one is mid-verification.

## Current state
`isUsernameTaken` / `isEmailTaken` in `src/server/database/memberManager.ts` consult only the
`members` table. The `pending_registrations` table and its manager exist, but availability
checks ignore them, so a name held by a pending registration still reads as "available."

## Do
- Extend `isUsernameTaken` / `isEmailTaken` (or wrap them) so they **also** return taken when
  a **non-expired** pending row holds the name (`expires_at > now`). Use the
  `pendingRegistrationManager` accessors; keep SQL in the managers.
- Ensure **every** call site is covered without duplicating the dual-table logic —
  `checkUsernameAvailable`, `checkEmailValidity`, `doUsernameValidation`, `doEmailValidation`
  in `src/server/controllers/createAccountController.ts`. Centralize rather than repeating the
  pending-table check at each site.

## Out of scope
- Creating pending rows (registration still creates `members` rows for now) — separate task.
- Clearing expired pending rows on submit — that belongs with the registration rewrite.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- `/register/username/:username` and `/register/email/:email` report a name held by a
  **non-expired** pending row as taken.
- A name held only by an **expired** pending row still reads as available.
