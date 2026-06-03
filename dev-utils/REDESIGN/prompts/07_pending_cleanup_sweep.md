# Sweep expired and stale pending registrations

**Atomic task.** Adds a periodic cleanup so `pending_registrations` rows don't accumulate
forever.

## Current state
`pending_registrations` rows are created on registration and marked verified on promotion, but
nothing ever deletes them. `src/server/database/cleanupTasks.ts` runs a periodic
`performCleanupTasks()` (e.g. `deleteExpiredPasswordResetTokens`, `removeOldUnverifiedMembers`)
on an interval. `pendingRegistrationManager` already exposes a sweep query.

## Do
- Add a cleanup task that deletes:
  - **expired** pending rows (`expires_at < now` and not verified), and
  - **verified** rows older than a short retention — **~1 hour after `verified_at`** (kept
    briefly so the poll's idempotency window survives a refreshed/duplicate waiting tab).
- Use the sweep query from `pendingRegistrationManager` (keep SQL in the manager).
- Wire the task into the existing `performCleanupTasks()` scheduler.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- On the cleanup interval, expired pending rows and verified rows older than ~1h are deleted;
  a row verified within the last hour survives.
