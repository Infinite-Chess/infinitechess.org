# One-time purge of remaining unverified members

**Atomic task.** Deletes the leftover `is_verified = 0` accounts so that, once the verified
flag is removed, no unverified account is silently promoted to a permanent one.

## Current state
Every new account is created already-verified (the only path to a `members` row is
verification). The `members` table still has `is_verified`; any rows with `is_verified = 0` are
pre-existing accounts that registered under the old flow and never verified. The periodic
`removeOldUnverifiedMembers` task deletes unverified members older than 3 days, so this set is
bounded to recent ones. `deleteAccount(user_id, reason)` is the proper deletion path (it
handles cascades and the `deleted_members` table). `databaseTables.ts` already contains
temporary one-off migrations (e.g. `dropLegacyLiveGamesPosPastedColumnIfPresent`) called from
`initDatabase()`.

## Do
- Add a one-off migration in `databaseTables.ts`, following the established temporary-migration
  pattern, that deletes **all** `is_verified = 0` members: `SELECT user_id FROM members WHERE
  is_verified = 0`, then `deleteAccount(user_id, 'unverified')` for each.
- Call it once from `initDatabase()`. Annotate it `TEMPORARY MIGRATION: remove after it has run
  in production` (it evicts any genuine in-flight registrant, who simply registers again).

## Out of scope
- Dropping the `is_verified` column and removing its machinery — separate task, which must run
  **after** this one.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- After startup, no `members` rows have `is_verified = 0`; verified members are untouched.
