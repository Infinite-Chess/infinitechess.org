# Chunk 02 — Backend: remove the vestigial `is_verified` machinery

**Read `00_OVERVIEW.md` first. Requires chunk `01`.** After `01`, every account is
created already-verified (the only path to a `members` row is verification). That makes
the `is_verified` flag and everything around it dead weight. This chunk is a **pure
simplification** — behavior is already "everyone is verified", so removing the flag should
not change runtime behavior, only delete code.

This chunk is independent of chunk `03` (front-end); they can be done in either order.

## Scope (do)

1. **Drop the columns** from the `members` table: `is_verified`, `verification_code`,
   `is_verification_notified`.
   - **One-time purge of remaining unverified members FIRST (decided: option b, not
     grandfather).** Before dropping the columns, run a one-off migration that **deletes all
     `is_verified = 0` members** — otherwise dropping the flag would silently promote them to
     permanent verified accounts. Reuse the existing deletion path: it is exactly
     `removeOldUnverifiedMembers`'s logic **minus** the `joined < cutoff` age filter — i.e.
     `SELECT user_id FROM members WHERE is_verified = 0`, then `deleteAccount(user_id,
     'unverified')` for each (so cascades + the `deleted_members` table are handled
     correctly). This **must run before** the column-drop migration (it queries
     `is_verified`). Annotate it `TEMPORARY MIGRATION: remove after it has run in production`
     and call it once from `initDatabase()` ahead of the DROP COLUMN step. Note in the PR
     description that, because the old 3-day sweep bounds the unverified set to ≤3 days, this
     purges only a small recent population — and that any genuine in-flight registrant it
     evicts simply re-registers under the new verify-first flow.
   - Remove them from the `CREATE TABLE IF NOT EXISTS members` statement in
     `databaseTables.ts` `generateTables()` (so fresh databases never have them).
   - **For existing databases, add a one-off migration** following the established pattern
     in the same file: see `dropLegacyLiveGamesPosPastedColumnIfPresent()`
     (`databaseTables.ts` ~line 383) — a small function that runs
     `ALTER TABLE members DROP COLUMN <col>` for each of the three columns (guard against
     "column doesn't exist" like the existing one does), called once from `initDatabase()`,
     and annotated `TEMPORARY MIGRATION: remove after it has run in production`. SQLite
     supports `DROP COLUMN`; copy the existing function's shape.
   - **Data safety:** `DROP COLUMN` preserves every row and all other columns — only the
     three dropped columns' values are removed (intended). These three have no
     `PRIMARY KEY` / `UNIQUE` / index, so they drop directly with no table rebuild. (No
     member data — usernames, emails, passwords, prefs — is affected.)
   - Also remove the three columns from any column allow-lists / the `MemberRecord`
     interface in `memberManager.ts`, and update `addUser` so it no longer takes or inserts
     them. Note the migration in the PR description.
   - (Alternative if a migration feels risky: you *could* leave the dead columns physically
     in the DB and only remove all code references. Prefer the migration above — it's the
     codebase's own pattern and leaves no vestigial columns — but this is a fallback.)

2. **`MemberAPI.ts`** — remove the `verified` field from the member payload and delete the
   `is_verification_notified` "thank you for verifying" notification branch entirely
   (the `is_verified === 1 && is_verification_notified === 0` logic and the
   `is_verified === 0` branch).

3. **Sockets** — `openSocket.ts`: stop reading `is_verified` / stop setting
   `ws.metadata.verified`. Remove the `verified` field from the socket metadata type.
   `socketManager.ts`: remove `AddVerificationToAllSocketsOfMember` (no longer called).

4. **Rated-game gating** — `createseek.ts` and `acceptseek.ts`: a signed-in user is now
   always verified, so simplify the checks from `signedIn && ws.metadata.verified` to just
   `signedIn`. Keep the guest/signed-out rejection and the `rated_requires_verified`
   message only if it still makes sense; if the message no longer matches the simplified
   condition, update it (and its translation) to reflect "must be signed in to play rated".

5. **AdminPanel.ts** — remove the `is_verified` column/display.

6. **`removeOldUnverifiedMembers`** (`cleanupTasks.ts`) — delete this task and its
   scheduling; after the step-1 purge no unverified members exist, so it can never find
   anything. (Its delete-all-unverified variant lives on only as the one-time step-1
   migration.) Keep the pending-registrations sweep added in `01`.

7. **Leftover verify code** — remove anything in `verifyAccountController.ts` /
   `emailController.ts` that still references the old `members`-based verification
   (`verification_code`, the old "already verified" member redirects, `manuallyVerifyUser`
   if now unused). The only verification that should remain is the pending → members
   promotion from `01`.

8. **Translations** — remove now-unused verification strings from the English TOMLs
   (e.g. the profile "thank you for verifying" / "please verify your account" messages),
   and any `rated_requires_verified` string you replaced in step 4.

## Out of scope
- Front-end register/verify UI — chunk `03`. Turnstile — chunk `04`.
- Do not change the pending-registration flow from `01`.

## Acceptance criteria
- `npm run type-check --silent` and `npm run lint --silent` both pass.
- `grep -rn "is_verified\|verification_code\|is_verification_notified\|metadata.verified\|AddVerificationToAllSocketsOfMember" src/server` returns **no** remaining references (outside comments you intentionally keep).
- Registering and verifying (the `01` flow) still works end-to-end.
- A signed-in user can create/accept a rated seek; a guest still cannot.
- The app builds and runs; no profile "verify your account" messaging remains.

## Gotchas
- This touches game logic (`createseek`/`acceptseek`) and sockets — re-read those files to
  ensure the simplified condition still rejects guests/signed-out users for rated play.
- Don't silently break existing databases: the `CREATE TABLE IF NOT EXISTS` edit only
  affects fresh DBs, so the one-off `ALTER TABLE … DROP COLUMN` migration (step 1) is what
  updates existing ones. Follow `dropLegacyLiveGamesPosPastedColumnIfPresent()`.
- After deleting, search for now-orphaned imports — `npm run lint --silent` lists unused
  imports; clean them all.
