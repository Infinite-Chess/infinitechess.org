# Immediate Game Logging + Cheat-Report DB Overturn

## Problem

Non-server-validated games had an ~8s delay between _conclusion_ and _finalization_
(logging into the DB). The **Analysis** button appeared the instant a game concluded, so a
player clicking it within those 8s hit an Analysis page that couldn't `fetch` the game — it
didn't exist in the `games` table yet.

## Solution

**Decouple DB-logging from finalization.** Every game is now logged to the permanent database the
instant it concludes, so the Analysis page can fetch it immediately. The 8s window is kept, but it
now _only_ governs the `finalized` (locked-in) flag and the cheat-report window — not DB-logging.
When a cheat report overturns an already-logged game, the logged record is **updated in place**.

### Lifecycle now

| Stage                     | Old                                                  | New                                                                                        |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Conclusion (`freeGame`)   | update live_games conclusion cols; set 8s timer      | **log to permanent DB immediately**; drop the live_games row; set 8s timer (non-validated) |
| Finalize (`finalizeGame`) | log to DB, apply ratings, broadcast, delete live row | **only** flip the `finalized` flag, measure rating abuse, broadcast `finalized`            |
| Cheat report overturn     | overturn in memory + broadcast                       | overturn + broadcast + **update the logged DB record**                                     |
| Eviction                  | log if unlogged                                      | game already logged — just lock in + drop from memory                                      |

`finalized` continues to mean _actually finalized_ (result locked, no more reports) — it no
longer means "in the DB". Clients already handle a non-finalized concluded game via full resync
([onlinegame.ts](src/client/scripts/esm/game/misc/onlinegame/onlinegame.ts)), so nothing on the
client changed.

## Key facts that shaped the design

- **Cheat reports only apply to non-server-validated games**, and **non-validated games are never
  rated** (every rated variant is small enough to be server-validated). So an overturn **never**
  touches leaderboards or ratings — only `games`, `player_games`, and `player_stats`.
- `player_games` **is** affected: a decisive `score` (1/0/0.5) must become `null` (aborted).
- `player_stats` **is** affected: the original win/loss/draw + casual + public counters must be
  reversed and `game_count_aborted` applied; the cheater's popped move drops from `moves_played`.

## What an overturn updates (game → aborted)

Handled atomically in `gamelogger.updateOverturnedGame`:

- **`games`**: `result` (`*`), `termination` (`aborted`), `move_count` (−1), `icn` (regenerated
  from the popped move list + new metadata).
- **`player_games`**: `score` → `null` for each signed-in player.
- **`player_stats`** (kept in a clearly separated function): reverse the original outcome's
  counters, apply the aborted counters, and drop the cheater's popped move from `moves_played`.
- **Edge case** — if the report pops the game down to **0 moves** (never stored): the `games` row
  is **deleted** (cascades to `player_games`) and its `player_stats` contribution fully un-counted.

## Files changed

**Server / game manager**

- `gamemanager.ts` — `freeGame` now logs at conclusion (new `logConcludedGame` helper, moved out of
  `finalizeGame`); `finalizeGame` slimmed to flag + rating abuse + `finalized` broadcast;
  `applyConclusion` no longer persists conclusion columns; `restoreLiveGames` no longer restores
  concluded games.
- `cheatreport.ts` — `concludeReportedGame` captures the original conclusion + cheater color and
  calls `gamelogger.updateOverturnedGame` when the game was already logged.
- `gamelogger.ts` — new `updateOverturnedGame` + `updateGameRecordForOverturn` +
  `reversePlayerStatsForOverturn`.
- `liveGameValues.ts` — removed `onGameConcluded`; renamed `onGameFinalized` → `onGameLogged`
  (deletes the live row at log time); dropped conclusion columns from the insert.
- `liveGameRestore.ts` — removed `reconstructConclusion`; restored games are always ongoing
  (`freed`/`finalized` = false, no finalize timer).

**Server / database**

- `gamesManager.ts` — new `updateGame` + `deleteGame`.
- `playerGamesManager.ts` — new `updatePlayerGame`.
- `databaseTables.ts` — dropped `conclusion_condition`, `conclusion_victor`, `time_ended`,
  `finalize_time` from the `live_games` schema + `allLiveGamesColumns`; added a temporary
  migration `dropLiveGamesConclusionColumnsIfPresent`.
- `liveGamesManager.ts` — removed those columns from `LiveGameData` and the insert.

## Trade-offs / notes

- A server **restart during the 8s window** now drops the concluded game from memory (rematch
  offer + ability to still report are lost), but the game is fully preserved in the permanent DB —
  the Analysis page still works. This follows the existing convention: _if the game is in the DB,
  it needs no live_games row_. Restarts are rare, so this is an accepted trade-off.
- `updateOverturnedGame` errors are logged (not thrown): the overturn already happened in memory
  and was broadcast, so a DB failure there can only be flagged, not undone.

## Verification

`npm run type-check --silent` ✅ `npm run lint --silent` ✅
