# Remove the `is_verified` machinery

**Atomic task — coupled by necessity.** Drops the now-vestigial verified flag and every
reference to it. These pieces must land together: dropping the columns while any consumer still
references them would break the build. Behavior does not change (every member is already
verified) — this only deletes dead weight.

## Current state
Every member is verified and no `is_verified = 0` rows exist, but the `members` table still
carries `is_verified`, `verification_code`, `is_verification_notified`, and server code still
reads/branches on them.

## Do (all together)
1. **Drop the columns** `is_verified`, `verification_code`, `is_verification_notified`:
   - Remove them from `CREATE TABLE IF NOT EXISTS members` in `databaseTables.ts`
     `generateTables()`.
   - Add a one-off `ALTER TABLE members DROP COLUMN <col>` migration for each (guard against
     "column doesn't exist" like `dropLegacyLiveGamesPosPastedColumnIfPresent`), called once
     from `initDatabase()`, annotated `TEMPORARY MIGRATION: remove after it has run in
     production`. Note the migration in the PR.
   - Remove the three from column allow-lists / the `MemberRecord` interface in
     `memberManager.ts`, and from `addUser`.
2. **Promotion:** update the verify-promotion in `verifyAccountController.ts` so it no longer
   sets `is_verified` / `verification_code` / `is_verification_notified` when creating the
   member.
3. **`MemberAPI.ts`:** remove the `verified` field from the payload and delete the
   `is_verification_notified` "thank you for verifying" notification branch.
4. **Sockets:** `openSocket.ts` — stop reading `is_verified` / setting `ws.metadata.verified`;
   remove `verified` from the socket metadata type. `socketManager.ts` — remove
   `AddVerificationToAllSocketsOfMember`.
5. **Rated-game gating:** in `createseek.ts` / `acceptseek.ts`, simplify
   `signedIn && ws.metadata.verified` → `signedIn`. Keep the guest/signed-out rejection; if the
   `rated_requires_verified` message no longer fits, update it (and its translation) to
   "must be signed in to play rated".
6. **`AdminPanel.ts`:** remove the `is_verified` column/display.
7. **`cleanupTasks.ts`:** delete `removeOldUnverifiedMembers` and its scheduling.
8. **Leftover verify code:** remove old `members`-based verification (`verification_code`
   paths, `manuallyVerifyUser` if now unused).
9. **Translations:** remove now-unused verification strings (profile "thank you for verifying"
   / "please verify your account"); update any `rated_requires_verified` string changed in
   step 5.

## Acceptance
- `npm run type-check --silent` and `npm run lint --silent` pass; clean up any orphaned imports
  (lint lists them).
- `grep -rn "is_verified\|verification_code\|is_verification_notified\|metadata.verified\|AddVerificationToAllSocketsOfMember" src/server`
  returns nothing (outside intentional comments).
- Registering and verifying still works end-to-end; a signed-in user can create/accept a rated
  seek and a guest cannot; no profile "verify your account" messaging remains.
