# Add the `pending_registrations` table + manager

**Atomic task.** Adds the storage and data-access layer for verify-first registration.
Nothing reads or writes it yet — this is pure infrastructure that later work builds on.

## Current state
Registration inserts `members` rows directly. There is no pending-registration storage.

## Do
1. **Table** — in `src/server/database/databaseTables.ts` `generateTables()`, add a
   `pending_registrations` table, mirroring the existing `members` table's style:
   ```
   claim_token        TEXT PRIMARY KEY NOT NULL  -- httpOnly cookie secret; stable; primary lookup (the poll)
   verification_token TEXT UNIQUE NOT NULL        -- email-link secret; rotates on email change
   username           TEXT UNIQUE NOT NULL COLLATE NOCASE
   email              TEXT UNIQUE NOT NULL
   hashed_password    TEXT NOT NULL
   created_at         TIMESTAMP NOT NULL
   expires_at         TIMESTAMP NOT NULL          -- 24h from creation
   member_user_id     INTEGER                     -- NULL until verified; doubles as the "verified" flag
   ```
   `claim_token` is the primary key (not a surrogate `id`) to match the codebase's token-table
   convention (`refresh_tokens`, `password_reset_tokens`): it is the row's stable identity and
   the most frequent lookup (the poll). `verification_token` rotates on an email change, so it
   stays `UNIQUE` rather than being the key.
2. **Manager** — add `src/server/database/pendingRegistrationManager.ts`, mirroring
   `memberManager.ts` conventions (all SQL lives here, not in controllers). Expose the
   operations later work needs:
   - create a pending row (with `verification_token`, `claim_token`, `created_at`,
     `expires_at`);
   - look up by `claim_token` (the poll/resend path); look up by `verification_token` (the
     verify path);
   - check whether a username/email is present among **non-expired** pending rows;
   - delete expired pending rows for a given username/email;
   - mark a row verified (set `member_user_id`);
   - sweep query: delete rows where `expires_at < now`.

## Out of scope
- Wiring this into registration, verification, polling, availability checks, or cleanup
  scheduling — each is its own task.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- A fresh database contains the `pending_registrations` table with the columns above.
- The manager's functions compile and are individually callable.
