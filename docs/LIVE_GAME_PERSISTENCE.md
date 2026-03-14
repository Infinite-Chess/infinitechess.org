# Live Game Persistence: Minimum Properties Analysis

## Overview

This document analyzes the minimum set of atomic properties that must be persisted to the database in order to fully reconstruct every live server game upon a server restart. The goal is to enable game continuity across server restarts instead of aborting all active games.

Currently, all live game state lives exclusively in memory within the `activeGames` record in `gamemanager.ts`. On a graceful shutdown (`logAllGames()`), every active game is aborted and logged. This analysis identifies exactly which properties of the `ServerGame` object are essential to persist, and which can be derived/reconstructed.

### Design Constraints

- **Multi-player future-proofing:** Games are not guaranteed to forever be only two-player (e.g., 4-player variants may be introduced). Per-player data must not be stored as `white_`/`black_` columns. Instead, we use a separate `live_player_games` table following the pattern of the existing `player_games` table, which stores player-to-game relationships via `player_number`.
- **Atomic columns:** All properties are stored as individual atomic DB values, not as serialized JSON, since underlying types may change their structure independently.
- **Timer state persistence:** A server restart does not mean players are at their keyboards or have reconnected. AFK timers, disconnect timers, and post-conclusion delete timers must all have enough persistent information to reinstate them on startup.

---

## Source Type Hierarchy

A live game on the server is represented by the `ServerGame` type:

```
ServerGame
├── basegame: Game
│   ├── metadata: MetaData
│   ├── moves: BaseMove[]
│   ├── gameRules: GameRules              ← DERIVABLE from variant
│   ├── whosTurn: Player                  ← DERIVABLE from turnOrder + moves.length
│   ├── gameConclusion?: GameConclusion
│   ├── untimed: boolean                  ← DERIVABLE from time control
│   └── clocks?: ClockData                ← PARTIALLY DERIVABLE
├── match: MatchInfo
│   ├── id: number
│   ├── timeCreated: number
│   ├── timeEnded?: number
│   ├── publicity: 'public' | 'private'
│   ├── rated: boolean
│   ├── clock: TimeControl
│   ├── playerData: PlayerGroup<PlayerData>
│   │   └── per player:
│   │       ├── identifier: AuthMemberInfo
│   │       ├── socket?: CustomWebSocket           ← RUNTIME ONLY
│   │       ├── lastOfferPly?: number
│   │       └── disconnect:
│   │           ├── startID?: Timeout              ← RUNTIME ONLY (handle)
│   │           ├── timeoutID?: Timeout            ← RUNTIME ONLY (handle)
│   │           ├── timeToAutoLoss?: number        ← MUST PERSIST
│   │           └── wasByChoice?: boolean          ← MUST PERSIST
│   ├── autoTimeLossTimeoutID?: Timeout            ← RUNTIME ONLY (handle)
│   ├── autoAFKResignTimeoutID?: Timeout           ← RUNTIME ONLY (handle)
│   ├── autoAFKResignTime?: number                 ← MUST PERSIST
│   ├── drawOfferState?: Player
│   ├── deleteTimeoutID?: Timeout                  ← RUNTIME ONLY (handle)
│   └── positionPasted: boolean
└── boardsim?: Board                               ← CONDITIONALLY DERIVABLE (track via has_boardsim)
```

---

## Properties That Do NOT Need Persistence

These are either runtime-only objects or fully derivable from other persisted data:

### Runtime Objects (not serializable — `setTimeout` handles and WebSocket references)

These are non-serializable JavaScript runtime handles. On restoration, each timer is re-created from the persisted timestamp/state that drives it.

- **`playerData[color].socket`** — WebSocket reference. Players will reconnect after restart.
- **`match.autoTimeLossTimeoutID`** — `setTimeout` handle. Recreated from clock state on restoration.
- **`match.autoAFKResignTimeoutID`** — `setTimeout` handle. Recreated from persisted `autoAFKResignTime`.
- **`match.deleteTimeoutID`** — `setTimeout` handle. Recreated from persisted `delete_time`.
- **`playerData[color].disconnect.startID`** — `setTimeout` handle for the 5-second reconnection cushion. On restart all sockets are severed, so the cushion is not relevant; we go directly to the disconnect timer state.
- **`playerData[color].disconnect.timeoutID`** — `setTimeout` handle. Recreated from persisted `timeToAutoLoss`.

### Derivable From Other Persisted Data

- **`basegame.gameRules`** — Fully derived from `metadata.Variant` via `initvariant.getVariantGamerules()`.
- **`basegame.whosTurn`** — Computed: `gameRules.turnOrder[moves.length % turnOrder.length]`.
- **`basegame.untimed`** — Derived from time control: `clockutil.isClockValueInfinite(clock)`.
- **`basegame.clocks.startTime`** — Derived from time control: `clockutil.getMinutesAndIncrementFromClock(clock)`.
- **`boardsim`** — Conditionally reconstructed: if `has_boardsim` is true, call `initBoard()` then replay all persisted moves. If `has_boardsim` is false (e.g., after a position paste, or for unsupported variants), `boardsim` stays `undefined` and the server trusts client-reported moves.
- **`metadata.Event`** — Constructed from `rated` + `variant`: `"Rated Classical infinite chess game"`.
- **`metadata.Site`** — Constant: `'https://www.infinitechess.org/'`.
- **`metadata.Round`** — Constant: `'-'`.
- **`metadata.TimeControl`** — Same value as `match.clock`.
- **`metadata.Result`** — Derived from `gameConclusion.victor` via `metadata.getResultFromVictor()`.
- **`metadata.Termination`** — Derived from `gameConclusion.condition` via `getTerminationInEnglish()`.
- **`metadata.White`** / **`metadata.Black`** — Derived: username from DB lookup (signed in) or `"(Guest)"` translated string.
- **`metadata.WhiteID`** / **`metadata.BlackID`** — Derived: `uuid.base10ToBase62(user_id)`.
- **`metadata.WhiteRatingDiff`** / **`metadata.BlackRatingDiff`** — Only set post-game during logging.

---

## Database Schema: Two Tables

Following the existing pattern of `games` + `player_games` for ended games, live game data is split across two tables to support an arbitrary number of players per game:

- **`live_games`** — One row per active game. Contains game-level state.
- **`live_player_games`** — One row per player per active game. Contains per-player state.

### Table 1: `live_games` — Game-Level Properties

#### Group 1: Game Identity (immutable after creation)

| #   | Property      | DB Column      | Type                | Source              | Notes                                    |
| --- | ------------- | -------------- | ------------------- | ------------------- | ---------------------------------------- |
| 1   | Game ID       | `game_id`      | INTEGER PRIMARY KEY | `match.id`          | Unique across both live and logged games |
| 2   | Creation time | `time_created` | INTEGER NOT NULL    | `match.timeCreated` | Epoch milliseconds                       |
| 3   | Variant       | `variant`      | TEXT NOT NULL       | `metadata.Variant`  | e.g., `"Classical"`, `"Omega^3"`         |
| 4   | Time control  | `clock`        | TEXT NOT NULL       | `match.clock`       | e.g., `"600+5"` or `"-"` for untimed     |
| 5   | Rated         | `rated`        | INTEGER NOT NULL    | `match.rated`       | 0 = casual, 1 = rated                    |
| 6   | Publicity     | `publicity`    | TEXT NOT NULL       | `match.publicity`   | `'public'` or `'private'`                |

#### Group 2: Move History (grows with each move)

| #   | Property       | DB Column | Type                       | Source             | Notes                                                                        |
| --- | -------------- | --------- | -------------------------- | ------------------ | ---------------------------------------------------------------------------- |
| 7   | Moves + clocks | `moves`   | TEXT NOT NULL DEFAULT `''` | `basegame.moves[]` | Pipe-delimited compact moves with embedded clock comments. See format below. |

**Move format:** Moves are stored as a pipe-delimited string of compact notation with embedded clock values using the ICN comment format. The existing `getShortFormMovesFromMoves()` in `icnconverter.ts` (with `{ compact: true, spaces: false, comments: true, move_numbers: false }`) produces exactly this format:

```
1,2>3,4{[%clk 0:09:56.7]}|5,6>7,8=Q{[%clk 0:09:45.2]}
```

Each move encodes `startCoords > endCoords`, optional promotion (`=Q`), and an optional clock comment (`{[%clk H:MM:SS.s]}`) containing the player's remaining time after the move. The existing `parseShortFormMoves()` function can parse this format back, extracting both moves and `clockStamp` values.

For untimed games, the clock comment is omitted: `1,2>3,4|5,6>7,8=Q`.

**Why a single delimited string (not a separate table):**

- **Simplicity:** One column, one UPDATE per move. No JOINs needed for reconstruction.
- **Atomicity:** Either all moves are present or none — no risk of orphaned or missing individual move rows corrupting the game state.
- **Existing infrastructure:** Uses the existing ICN format and parser (`getShortFormMovesFromMoves` / `parseShortFormMoves`).
- **Performance:** For typical games (under ~200 moves), the delimited string is small (a few KB at most). SQLite must rewrite the entire row on any UPDATE regardless, so the overhead of a growing TEXT value is inherent to the row-level write.
- **Drawback:** Each move submission overwrites the entire `moves` cell with a slightly longer string, versus a normalized table where each move would be a single INSERT. However, the additional complexity (a new table, JOINs, index maintenance, handling of missing rows) is not worth the marginal performance difference for typical game lengths. If an individual move row were ever missing (e.g., move 17 of a 37-move game), the entire game state would be corrupted and unrecoverable, whereas the delimited string is all-or-nothing.

#### Group 3: Clock State (for timed games only)

| #   | Property            | DB Column             | Type    | Source                    | Notes                                                                                                                      |
| --- | ------------------- | --------------------- | ------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 8   | Color ticking       | `color_ticking`       | INTEGER | `clocks.colorTicking`     | Player number whose clock is counting down. NULL if no clock is running (untimed, < 2 moves played, or game over).         |
| 9   | Clock snapshot time | `clock_snapshot_time` | INTEGER | _(captured at save time)_ | Epoch millis when clock values were snapshotted. Used to adjust the ticking player's time on restoration. NULL if untimed. |

**Note:** Per-player `time_remaining_ms` is stored in the `live_player_games` table (see below), since it is a player-to-game relationship.

**Why clock stamps embedded in moves are insufficient alone:** Between moves, the current player's clock is counting down. The `clockStamp` values in the move list only capture the state _after_ each move (with increment already added). We need an independent snapshot of each player's current remaining time plus a reference timestamp to account for time elapsed during the current turn.

**Restoration formula for the ticking player:**

```
actual_remaining = stored_remaining - (Date.now() - clock_snapshot_time)
```

#### Group 4: Draw Offer State

| #   | Property         | DB Column          | Type    | Source                 | Notes                                                                |
| --- | ---------------- | ------------------ | ------- | ---------------------- | -------------------------------------------------------------------- |
| 10  | Draw offer state | `draw_offer_state` | INTEGER | `match.drawOfferState` | Player number who extended the current offer. NULL if no open offer. |

**Note:** Per-player `last_offer_ply` is stored in the `live_player_games` table.

#### Group 5: Game Conclusion (set when game ends)

| #   | Property             | DB Column              | Type    | Source                     | Notes                                                                                                |
| --- | -------------------- | ---------------------- | ------- | -------------------------- | ---------------------------------------------------------------------------------------------------- |
| 11  | Conclusion victor    | `conclusion_victor`    | INTEGER | `gameConclusion.victor`    | Winning player number. NULL if draw or ongoing.                                                      |
| 12  | Conclusion condition | `conclusion_condition` | TEXT    | `gameConclusion.condition` | e.g., `"checkmate"`, `"time"`, `"resignation"`, `"aborted"`, `"agreement"`. NULL if game is ongoing. |
| 13  | Time ended           | `time_ended`           | INTEGER | `match.timeEnded`          | Epoch millis when game concluded. NULL if ongoing.                                                   |

**Representation:** The `GameConclusion` type uses `undefined` for ongoing games (not aborted — only `undefined` means ongoing), `null` victor for draws, and a `Player` number for wins. In the DB: NULL `conclusion_condition` = ongoing; non-NULL `conclusion_condition` + NULL `conclusion_victor` = draw or aborted (distinguished by condition text); non-NULL both = decisive result.

#### Group 6: Timer State (for restoration of active timers)

| #   | Property             | DB Column              | Type    | Source                              | Notes                                                                                                                                                                                                                              |
| --- | -------------------- | ---------------------- | ------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14  | AFK auto-resign time | `auto_afk_resign_time` | INTEGER | `match.autoAFKResignTime`           | Epoch millis when the AFK auto-resign fires. NULL if no player is currently AFK. On restoration: `remaining = stored - Date.now()`. If ≤ 0, immediately resign.                                                                    |
| 15  | Delete time          | `delete_time`          | INTEGER | _(computed when conclusion is set)_ | Epoch millis when the concluded game should be deleted and logged. NULL if game is ongoing. Set to `timeEnded + timeBeforeGameDeletionMillis` (currently 8 seconds). On restoration: if elapsed, immediately run logging pipeline. |

**Why AFK state must persist:** A server restart does not mean the player is at their keyboard. The AFK auto-resign timer was started because the client explicitly reported going AFK. Only the client sending an "AFK-Return" message cancels this timer. Since WebSocket connections are severed by a restart, the server has no way to know whether the player is actually back until they reconnect and send that message. We must preserve the timer so that a player who was AFK before the restart and remains AFK afterward will still be auto-resigned.

**Why the delete timer must persist:** If a game concluded but has not yet been logged (within the `timeBeforeGameDeletionMillis` window), we need to restore it in its concluded state and revive the delete timer so the logging pipeline eventually runs. Without this, concluded games would linger in `live_games` indefinitely.

#### Group 7: Flags

| #   | Property        | DB Column         | Type                       | Source                              | Notes                                                                                                                                                                                                                           |
| --- | --------------- | ----------------- | -------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16  | Position pasted | `position_pasted` | INTEGER NOT NULL DEFAULT 0 | `match.positionPasted`              | Whether a custom position was pasted in. If true, the game will NOT be logged to the permanent `games` table after conclusion.                                                                                                  |
| 17  | Has boardsim    | `has_boardsim`    | INTEGER NOT NULL DEFAULT 1 | `servergame.boardsim !== undefined` | Whether server-side move legality validation is active. Set to 1 at creation for supported variants, set to 0 when a position is pasted (which deletes `boardsim`). Updated every move submission to reflect the current state. |

**Why `has_boardsim`:** The presence of `boardsim` on a `ServerGame` is the sole signal for whether the server performs legal move validation (`movesubmission.ts` checks `servergame.boardsim !== undefined`). Since `boardsim` itself is a large runtime object that can be reconstructed by replaying moves, we only need to know _whether_ to reconstruct it. When a client pastes a custom position, `boardsim` is deleted (`pastereport.ts`), and the server switches to trusting client-reported moves for the remainder of that game. This flag captures that state.

---

### Table 2: `live_player_games` — Per-Player Properties

One row per player per live game. Follows the pattern of the existing `player_games` table.

| #   | Property                      | DB Column                      | Type             | Source                           | Notes                                                                                                                |
| --- | ----------------------------- | ------------------------------ | ---------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Game ID                       | `game_id`                      | INTEGER NOT NULL | FK → `live_games.game_id`        | ON DELETE CASCADE                                                                                                    |
| 2   | Player number                 | `player_number`                | INTEGER NOT NULL | Key in `PlayerGroup`             | 1 = White, 2 = Black, etc. Supports future multi-player games.                                                       |
| 3   | User ID                       | `user_id`                      | INTEGER          | `identifier.user_id`             | NULL if guest                                                                                                        |
| 4   | Browser ID                    | `browser_id`                   | TEXT NOT NULL    | `identifier.browser_id`          | Always present (required by `AuthMemberInfo`). Sole identifier for guests.                                           |
| 5   | ELO display                   | `elo`                          | TEXT             | `metadata.{White,Black}Elo`      | e.g., `"1500"` or `"1200?"`. Snapshot at game start; cannot re-derive since ratings change. NULL if guest.           |
| 6   | Last offer ply                | `last_offer_ply`               | INTEGER          | `playerData[color].lastOfferPly` | Ply (0-based) of last draw offer. NULL if never offered. Used to enforce minimum-ply gap between consecutive offers. |
| 7   | Time remaining                | `time_remaining_ms`            | INTEGER          | `clocks.currentTime[color]`      | Milliseconds remaining at time of snapshot. NULL if untimed.                                                         |
| 8   | Disconnect: time to auto-loss | `disconnect_time_to_auto_loss` | INTEGER          | `disconnect.timeToAutoLoss`      | Epoch millis when auto-resign fires. NULL if player was connected (no active disconnect timer).                      |
| 9   | Disconnect: was by choice     | `disconnect_was_by_choice`     | INTEGER          | `disconnect.wasByChoice`         | 1 = intentional (20s timer), 0 = network interruption (60s timer). NULL if player was connected.                     |

**Why `browser_id` is essential:** For signed-in players, `user_id` alone suffices for identity matching (`memberInfoEq` compares `user_id`). For guests, `browser_id` is the sole identifier. However, `AuthMemberInfo` always requires `browser_id` to be defined, so we persist it for all players.

**Why `username` is NOT stored:** For signed-in players, the current username can be read from the `members` table using `user_id`. For guests, display name is always the `"(Guest)"` translated string.

**Why `roles` is NOT stored:** Player roles are only used for authorization, not game logic. They can be re-read from the `members` table on reconstruction.

**Why disconnect state must persist:** A server restart severs all WebSocket connections, but that does not mean disconnected players have reconnected. Disconnect timers are ONLY cancelled when the disconnected player reconnects with a new socket connection. If a player was disconnected before the restart, their auto-resign timer must be restored from `disconnect_time_to_auto_loss`, and the `wasByChoice` flag determines whether the opponent should be notified. For players who were connected before the restart (NULL disconnect columns), new disconnect timers are started with `closureNotByChoice = true` (60-second window) since the server restart was not their fault.

---

## Summary: Complete Column List

**`live_games`: 17 columns**
**`live_player_games`: 9 columns per player row**

```sql
CREATE TABLE IF NOT EXISTS live_games (
    -- Group 1: Game Identity (6 columns)
    game_id                 INTEGER PRIMARY KEY,
    time_created            INTEGER NOT NULL,
    variant                 TEXT NOT NULL,
    clock                   TEXT NOT NULL,
    rated                   INTEGER NOT NULL CHECK (rated IN (0, 1)),
    publicity               TEXT NOT NULL CHECK (publicity IN ('public', 'private')),

    -- Group 2: Move History (1 column)
    moves                   TEXT NOT NULL DEFAULT '',

    -- Group 3: Clock State (2 columns)
    color_ticking           INTEGER,
    clock_snapshot_time     INTEGER,

    -- Group 4: Draw Offer State (1 column)
    draw_offer_state        INTEGER,

    -- Group 5: Game Conclusion (3 columns)
    conclusion_victor       INTEGER,
    conclusion_condition    TEXT,
    time_ended              INTEGER,

    -- Group 6: Timer State (2 columns)
    auto_afk_resign_time    INTEGER,
    delete_time             INTEGER,

    -- Group 7: Flags (2 columns)
    position_pasted         INTEGER NOT NULL DEFAULT 0,
    has_boardsim            INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS live_player_games (
    game_id                         INTEGER NOT NULL REFERENCES live_games(game_id) ON DELETE CASCADE,
    player_number                   INTEGER NOT NULL,
    user_id                         INTEGER,
    browser_id                      TEXT NOT NULL,
    elo                             TEXT,
    last_offer_ply                  INTEGER,
    time_remaining_ms               INTEGER,
    disconnect_time_to_auto_loss    INTEGER,
    disconnect_was_by_choice        INTEGER CHECK (disconnect_was_by_choice IN (0, 1) OR disconnect_was_by_choice IS NULL),
    PRIMARY KEY (game_id, player_number)
);
CREATE INDEX IF NOT EXISTS idx_live_player_games_game ON live_player_games (game_id);
```

---

## Reconstruction Procedure

On server restart, to restore each live game:

1. **Query** all rows from `live_games`, and for each game, query its `live_player_games` rows.
2. **For each game:**
   a. **Reconstruct `AuthMemberInfo`** for each player from `user_id` + `browser_id`. Look up `username` and `roles` from the `members` table for signed-in users.
   b. **Reconstruct `MetaData`** from stored fields (`variant`, `clock`, `rated`, elo values, timestamps). Derive `Event`, `Site`, `Round`, player names/IDs, `TimeControl` from atomic values.
   c. **Call `initGame(metadata)`** to create the `basegame` with correct `gameRules`, clock initialization, etc.
   d. **Reconstruct `MatchInfo`** from stored fields (`game_id`, `time_created`, `publicity`, `rated`, `clock`, player data, draw offer state, `position_pasted`).
   e. **Parse and replay moves** using `parseShortFormMoves()` on the `moves` string to recover the move list with `clockStamp` values. Apply each move to the basegame.
   f. **Conditionally reconstruct `boardsim`:** If `has_boardsim` is true (and the variant supports it), call `initBoard()` and replay all moves through it to rebuild server-side validation state. If `has_boardsim` is false, leave `boardsim` as `undefined` — the server will trust client-reported moves.
   g. **Restore clock state** for timed games: set `currentTime` for each player from their `time_remaining_ms`. Adjust the ticking player's time for elapsed time since snapshot: `actual = stored - (Date.now() - clock_snapshot_time)`. If `actual <= 0`, immediately flag time loss (see Edge Case #6). Otherwise, set `colorTicking`, `timeAtTurnStart = Date.now()`, `timeRemainAtTurnStart = adjustedTime`, and start the auto-time-loss timer.
   h. **Restore draw offer state** from `draw_offer_state` and per-player `last_offer_ply`.
   i. **Restore game conclusion** if `conclusion_condition` is non-NULL. Set `gameConclusion` and `timeEnded` accordingly.
   j. **Restore delete timer** for concluded games: If `delete_time` is set, compute `remaining = delete_time - Date.now()`. If ≤ 0, immediately run the logging pipeline and delete the live game row. Otherwise, set a new `deleteTimeoutID` for the remaining duration.
   k. **Restore AFK timer:** If `auto_afk_resign_time` is set, compute `remaining = auto_afk_resign_time - Date.now()`. If ≤ 0, immediately auto-resign the current player. Otherwise, set a new `autoAFKResignTimeoutID` for the remaining duration.
   l. **Restore disconnect timers for each player:**
    - If the player has a stored `disconnect_time_to_auto_loss`: compute `remaining = disconnect_time_to_auto_loss - Date.now()`. If ≤ 0, immediately auto-resign them. Otherwise, start a disconnect timer for the remaining duration with the stored `wasByChoice` value. Notify their opponent.
    - If the player has NULL disconnect columns (was connected before restart): start a fresh disconnect timer with `closureNotByChoice = true` (60-second `timeBeforeAutoResignByDisconnectMillis_NotByChoice`), since the server restart caused the disconnection — not the player.
3. **Delete the row** from `live_games` (cascading to `live_player_games`) once the game concludes and is logged to the permanent `games` table.

---

## When to Persist (State Change Events)

| Event                       | `live_games` Columns Updated                                                                                     | `live_player_games` Columns Updated                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Game created**            | INSERT full row (all Group 1 columns, defaults for the rest)                                                     | INSERT one row per player (identity, elo, defaults)                      |
| **Move submitted**          | `moves`, `color_ticking`, `clock_snapshot_time`, `has_boardsim`                                                  | `time_remaining_ms` (for both players, after clock adjustment)           |
| **Draw offer extended**     | `draw_offer_state`                                                                                               | `last_offer_ply` (for the offering player)                               |
| **Draw offer declined**     | `draw_offer_state` (set to NULL)                                                                                 | —                                                                        |
| **Draw accepted**           | `conclusion_victor`, `conclusion_condition`, `time_ended`, `draw_offer_state`, `delete_time`                     | —                                                                        |
| **Resignation**             | `conclusion_victor`, `conclusion_condition`, `time_ended`, `delete_time`                                         | —                                                                        |
| **Abort**                   | `conclusion_condition`, `time_ended`, `delete_time`                                                              | —                                                                        |
| **Time loss**               | `conclusion_victor`, `conclusion_condition`, `time_ended`, `color_ticking`, `clock_snapshot_time`, `delete_time` | `time_remaining_ms`                                                      |
| **Disconnect loss**         | `conclusion_victor`, `conclusion_condition`, `time_ended`, `delete_time`                                         | —                                                                        |
| **Player disconnects**      | —                                                                                                                | `disconnect_time_to_auto_loss`, `disconnect_was_by_choice`               |
| **Player reconnects**       | —                                                                                                                | `disconnect_time_to_auto_loss` → NULL, `disconnect_was_by_choice` → NULL |
| **Player goes AFK**         | `auto_afk_resign_time`                                                                                           | —                                                                        |
| **Player returns from AFK** | `auto_afk_resign_time` → NULL                                                                                    | —                                                                        |
| **AFK auto-resign**         | `conclusion_victor`, `conclusion_condition`, `time_ended`, `auto_afk_resign_time` → NULL, `delete_time`          | —                                                                        |
| **Position pasted**         | `position_pasted`, `has_boardsim` → 0                                                                            | —                                                                        |
| **Game deleted/logged**     | DELETE row (cascades to `live_player_games`)                                                                     | —                                                                        |

---

## Edge Cases & Policy Decisions

1. **Games with pasted positions** (`position_pasted = true`): These games should NOT be aborted on restart. The clients know exactly what position was pasted and can replay the moves on it when the server sends them the move list. On the server side, `has_boardsim` will be 0, so the server won't attempt to reconstruct a `boardsim` — it creates only a `BaseGame` and trusts the moves to be legal. There is no need to store the custom position ICN on the server.

2. **Nearly-concluded games** (concluded but not yet logged): If a game was concluded but the delete timer hasn't fired yet, it is restored in its concluded state with the delete timer revived. The `delete_time` column stores when the game should be logged and deleted. On restoration, if the time has already passed, the logging pipeline runs immediately. If not, a new timer is set for the remaining duration. This ensures games are never stuck in a concluded-but-unlogged state.

3. **AFK state**: AFK timers MUST be persisted. A server restart does not mean the player has returned to their keyboard. The `auto_afk_resign_time` column captures the epoch timestamp when the AFK auto-resign should fire. On restoration, the remaining time is computed and a new timer is set. If the time has already elapsed, the player is immediately auto-resigned. The AFK timer is only cancelled when the client explicitly sends an "AFK-Return" message, which requires an active WebSocket connection.

4. **Disconnect timers**: Disconnect timers MUST be persisted. WebSocket connections are severed by a server restart, but that does not mean the player has reconnected. Disconnect timers are ONLY cancelled when the disconnected player opens a new WebSocket connection. For players who were already disconnected before the restart, their existing `disconnect_time_to_auto_loss` is restored (they may be closer to expiring). For players who were connected before the restart (NULL disconnect columns), fresh disconnect timers are started with `closureNotByChoice = true` (60-second window), since the server restart — not the player — caused the disconnection.

5. **Guest players**: Guests are identified solely by `browser_id`. If a guest clears their cookies during a restart, they cannot be re-associated with their game. The game proceeds normally with disconnect timers running for the absent guest. If they fail to reconnect before the timer expires, the game concludes via the standard disconnect loss mechanism.

6. **Games where clocks expired during downtime**: On restoration, if `actual_remaining <= 0` for the ticking player after applying the formula `stored_remaining - (Date.now() - clock_snapshot_time)`, immediately flag them as lost on time.

7. **Games with no moves yet**: These are just-created games where players haven't moved. They are restored normally — clocks haven't started ticking yet (`color_ticking` is NULL), and normal disconnect timers handle absent players.
