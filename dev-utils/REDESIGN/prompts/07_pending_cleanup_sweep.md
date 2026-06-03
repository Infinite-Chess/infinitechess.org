# Sweep expired and stale pending registrations

**Atomic task.** Adds a periodic cleanup so `pending_registrations` rows don't accumulate
forever.

## Current state
`pending_registrations` rows are created on registration and marked verified on promotion, but
nothing ever deletes them. `src/server/database/cleanupTasks.ts` runs a periodic
`performCleanupTasks()` (e.g. `deleteExpiredPasswordResetTokens`, `removeOldUnverifiedMembers`)
on an interval. `pendingRegistrationManager` already exposes a sweep query.

## Do
- Add a cleanup task that deletes pending rows past their expiry — **`expires_at < now`** —
  using the sweep query from `pendingRegistrationManager` (keep SQL in the manager). One rule
  covers both unverified rows that timed out and verified rows once their original 24h window
  passes; a verified row that lingers until then is harmless (`members` already enforces its
  username/email), and the poll's active window (~20–30 min) is far shorter than the 24h TTL.
- Wire the task into the existing `performCleanupTasks()` scheduler.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass.
- On the cleanup interval, pending rows past their `expires_at` are deleted; rows still within
  their 24h window (verified or not) survive.
