# Add the `pending_registrations` table + manager

**Atomic task.** Adds the storage and data-access layer for verify-first registration.
Nothing reads or writes it yet — this is pure infrastructure that later work builds on.

## Current state
Registration inserts `members` rows directly. There is no pending-registration storage.

## Do
1. **Table** — in `src/server/database/databaseTables.ts` `generateTables()`, add a
   `pending_registrations` table, mirroring the existing `members` table's style:
   ```
   id                 INTEGER PRIMARY KEY
   verification_token TEXT    UNIQUE   -- secret, used in the email link
   claim_token        TEXT    UNIQUE   -- secret, stored in the httpOnly pending cookie
   username           TEXT    UNIQUE COLLATE NOCASE
   email              TEXT    UNIQUE
   hashed_password    TEXT
   created_at         TIMESTAMP
   expires_at         TIMESTAMP        -- 24h from creation
   verified_at        TIMESTAMP        -- NULL until promotion
   member_user_id     INTEGER          -- NULL until promotion
   ```
2. **Manager** — add `src/server/database/pendingRegistrationManager.ts`, mirroring
   `memberManager.ts` conventions (all SQL lives here, not in controllers). Expose the
   operations later work needs:
   - create a pending row (with `verification_token`, `claim_token`, `expires_at`);
   - look up by `verification_token`; look up by `claim_token`;
   - check whether a username/email is present among **non-expired** pending rows;
   - delete expired pending rows for a given username/email;
   - mark a row verified (set `verified_at`, `member_user_id`);
   - sweep query: delete expired rows, and verified rows older than a short retention.

## Out of scope
- Wiring this into registration, verification, polling, availability checks, or cleanup
  scheduling — each is its own task.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- A fresh database contains the `pending_registrations` table with the columns above.
- The manager's functions compile and are individually callable.
