# Live Game Persistence: Minimum Properties Analysis

## Overview

This document analyzes the minimum set of atomic properties that must be persisted to the database in order to fully reconstruct every live server game upon a server restart. The goal is to enable game continuity across server restarts instead of aborting all active games.

Currently, all live game state lives exclusively in memory within the `activeGames` record in `gamemanager.ts`. On a graceful shutdown (`logAllGames()`), every active game is aborted and logged. This analysis identifies exactly which properties of the `ServerGame` object are essential to persist, and which can be derived/reconstructed.

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
│   │       └── disconnect: { timers... }          ← RUNTIME ONLY
│   ├── autoTimeLossTimeoutID?: Timeout            ← RUNTIME ONLY
│   ├── autoAFKResignTimeoutID?: Timeout           ← RUNTIME ONLY
│   ├── autoAFKResignTime?: number                 ← EPHEMERAL
│   ├── drawOfferState?: Player
│   ├── deleteTimeoutID?: Timeout                  ← RUNTIME ONLY
│   └── positionPasted: boolean
└── boardsim?: Board                               ← DERIVABLE (reconstruct from variant + replay moves)
```

---

## Properties That Do NOT Need Persistence

These are either runtime-only objects or fully derivable from other persisted data:

### Runtime Objects (not serializable)

- **`playerData[color].socket`** — WebSocket reference. Players will reconnect after restart.
- **`match.autoTimeLossTimeoutID`** — `setTimeout` handle. Recreated from clock state on restoration.
- **`match.autoAFKResignTimeoutID`** — `setTimeout` handle. AFK state resets on restart (players reconnect).
- **`match.deleteTimeoutID`** — `setTimeout` handle. Only relevant for post-conclusion cleanup.
- **`playerData[color].disconnect.startID`** — `setTimeout` handle for reconnection cushion.
- **`playerData[color].disconnect.timeoutID`** — `setTimeout` handle for auto-resign.
- **`playerData[color].disconnect.timeToAutoLoss`** — Disconnect timer target timestamp.
- **`playerData[color].disconnect.wasByChoice`** — Disconnect intent; irrelevant after restart.

### Derivable From Other Persisted Data

- **`basegame.gameRules`** — Fully derived from `metadata.Variant` via `initvariant.getVariantGamerules()`.
- **`basegame.whosTurn`** — Computed: `gameRules.turnOrder[moves.length % turnOrder.length]`.
- **`basegame.untimed`** — Derived from time control: `clockutil.isClockValueInfinite(clock)`.
- **`basegame.clocks.startTime`** — Derived from time control: `clockutil.getMinutesAndIncrementFromClock(clock)`.
- **`boardsim`** — Reconstructed by calling `initBoard()` then replaying all persisted moves.
- **`metadata.Event`** — Constructed from `rated` + `variant`: `"Rated Classical infinite chess game"`.
- **`metadata.Site`** — Constant: `'https://www.infinitechess.org/'`.
- **`metadata.Round`** — Constant: `'-'`.
- **`metadata.TimeControl`** — Same value as `match.clock`.
- **`metadata.Result`** — Derived from `gameConclusion.victor` via `metadata.getResultFromVictor()`.
- **`metadata.Termination`** — Derived from `gameConclusion.condition` via `getTerminationInEnglish()`.
- **`metadata.White`** — Derived: username from DB lookup (signed in) or `"(Guest)"` translated string.
- **`metadata.Black`** — Same as above.
- **`metadata.WhiteID`** — Derived: `uuid.base10ToBase62(user_id)`.
- **`metadata.BlackID`** — Same as above.
- **`metadata.WhiteRatingDiff`** / **`metadata.BlackRatingDiff`** — Only set post-game during logging.

### Ephemeral State (policy decision: reset on restart)

- **`match.autoAFKResignTime`** — The AFK auto-resign timestamp. On restart, all players are effectively "reconnecting," so AFK state resets naturally. New AFK timers will start when a player goes AFK again.

---

## Minimum Atomic Properties That MUST Be Persisted

### Group 1: Game Identity (immutable after creation)

| #   | Property      | DB Column      | Type                | Source              | Notes                                    |
| --- | ------------- | -------------- | ------------------- | ------------------- | ---------------------------------------- |
| 1   | Game ID       | `game_id`      | INTEGER PRIMARY KEY | `match.id`          | Unique across both live and logged games |
| 2   | Creation time | `time_created` | INTEGER NOT NULL    | `match.timeCreated` | Epoch milliseconds                       |
| 3   | Variant       | `variant`      | TEXT NOT NULL       | `metadata.Variant`  | e.g., `"Classical"`, `"Omega^3"`         |
| 4   | Time control  | `clock`        | TEXT NOT NULL       | `match.clock`       | e.g., `"600+5"` or `"-"` for untimed     |
| 5   | Rated         | `rated`        | INTEGER NOT NULL    | `match.rated`       | 0 = casual, 1 = rated                    |
| 6   | Publicity     | `publicity`    | TEXT NOT NULL       | `match.publicity`   | `'public'` or `'private'`                |

### Group 2: Player Identity (immutable after creation, per player)

These are required to reconstruct each player's `AuthMemberInfo` for socket reconnection matching (via `memberInfoEq()`), and to reconstruct metadata display values.

| #   | Property          | DB Column          | Type          | Source                                    | Notes                                                                                                      |
| --- | ----------------- | ------------------ | ------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 7   | White user ID     | `white_user_id`    | INTEGER       | `playerData[WHITE].identifier.user_id`    | NULL if guest                                                                                              |
| 8   | White browser ID  | `white_browser_id` | TEXT NOT NULL | `playerData[WHITE].identifier.browser_id` | Always present (required by `AuthMemberInfo`)                                                              |
| 9   | Black user ID     | `black_user_id`    | INTEGER       | `playerData[BLACK].identifier.user_id`    | NULL if guest                                                                                              |
| 10  | Black browser ID  | `black_browser_id` | TEXT NOT NULL | `playerData[BLACK].identifier.browser_id` | Always present                                                                                             |
| 11  | White ELO display | `white_elo`        | TEXT          | `metadata.WhiteElo`                       | e.g., `"1500"` or `"1200?"`. Snapshot at game start; cannot re-derive since ratings change. NULL if guest. |
| 12  | Black ELO display | `black_elo`        | TEXT          | `metadata.BlackElo`                       | Same as above                                                                                              |

**Why `browser_id` is essential:** For signed-in players, `user_id` alone suffices for identity matching (`memberInfoEq` compares `user_id`). For guests, `browser_id` is the sole identifier. However, `AuthMemberInfo` always requires `browser_id` to be defined, so we must persist it for all players.

**Why `username` is NOT stored:** For signed-in players, the current username can be read from the `members` table using `user_id`. For guests, display name is always the `"(Guest)"` translated string. Live games are short-lived (minutes to hours), so username changes mid-game are acceptable to pick up.

**Why `roles` is NOT stored:** Player roles are only used for authorization, not game logic. They can be re-read from the `members` table on reconstruction.

### Group 3: Move History (grows with each move)

| #   | Property     | DB Column      | Type                       | Source                        | Notes                                                                                                               |
| --- | ------------ | -------------- | -------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 13  | Move list    | `moves`        | TEXT NOT NULL DEFAULT `''` | `basegame.moves[].compact`    | Pipe-delimited compact move strings. E.g., `"1,2>3,4\|5,6>7,8=Q"`. Empty string if no moves.                        |
| 14  | Clock stamps | `clock_stamps` | TEXT                       | `basegame.moves[].clockStamp` | Pipe-delimited millisecond values per move. E.g., `"598200\|597000"`. NULL if untimed. Position-matched to `moves`. |

**Format rationale:** Each move's compact form (e.g., `"1,2>3,4"` or `"5,6>7,8=Q"`) is already a minimal atomic string encoding `startCoords`, `endCoords`, and optional `promotion`. Storing them pipe-delimited avoids the overhead of a separate table while keeping the format simple and non-JSON. Clock stamps are separated into their own column since they're nullable (untimed games) and semantically distinct.

**Alternative: Normalized `live_game_moves` table.** A separate table with `(game_id, ply, compact, clock_stamp)` would be more normalized and efficient for append-only writes: each move submission becomes a single INSERT rather than an UPDATE that rewrites the entire growing TEXT value. Since SQLite must rewrite the full row on any UPDATE, this overhead grows linearly with move count. For typical games (under ~200 moves), the TEXT approach is practical; for unusually long games, a normalized table avoids the rewrite cost. This is worth considering for production but is not strictly necessary for the minimal property analysis.

### Group 4: Clock State (for timed games only)

| #   | Property             | DB Column                 | Type    | Source                      | Notes                                                                                                                                                                                            |
| --- | -------------------- | ------------------------- | ------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 15  | White time remaining | `white_time_remaining_ms` | INTEGER | `clocks.currentTime[WHITE]` | Milliseconds remaining at time of snapshot. NULL if untimed.                                                                                                                                     |
| 16  | Black time remaining | `black_time_remaining_ms` | INTEGER | `clocks.currentTime[BLACK]` | Same as above. NULL if untimed.                                                                                                                                                                  |
| 17  | Color ticking        | `color_ticking`           | INTEGER | `clocks.colorTicking`       | Player number whose clock is counting down. NULL if no clock is running (untimed, or < 2 moves played, or game over).                                                                            |
| 18  | Clock snapshot time  | `clock_snapshot_time`     | INTEGER | _(captured at save time)_   | Epoch millis when the clock values were snapshotted. Essential for adjusting the ticking player's time on restoration: `adjustedTime = time_remaining - (now - snapshot_time)`. NULL if untimed. |

**Why clock stamps alone are insufficient:** Between moves, the current player's clock is counting down. The `clockStamp` values in the move list only capture the state _after_ each move (with increment already added). We need an independent snapshot of the current remaining time for _both_ players plus a reference timestamp to account for time elapsed during the current turn.

**Restoration formula for the ticking player:**

```
actual_remaining = stored_remaining - (Date.now() - clock_snapshot_time)
```

### Group 5: Draw Offer State

| #   | Property             | DB Column              | Type    | Source                           | Notes                                                                                                                                        |
| --- | -------------------- | ---------------------- | ------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 19  | Draw offer state     | `draw_offer_state`     | INTEGER | `match.drawOfferState`           | Player number who extended the current offer. NULL if no open offer.                                                                         |
| 20  | White last offer ply | `white_last_offer_ply` | INTEGER | `playerData[WHITE].lastOfferPly` | The ply (0-based) at which white last offered a draw. NULL if never offered. Used to enforce the minimum-ply gap between consecutive offers. |
| 21  | Black last offer ply | `black_last_offer_ply` | INTEGER | `playerData[BLACK].lastOfferPly` | Same as above for black.                                                                                                                     |

### Group 6: Game Conclusion (set when game ends)

| #   | Property             | DB Column              | Type    | Source                     | Notes                                                                                                            |
| --- | -------------------- | ---------------------- | ------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 22  | Conclusion victor    | `conclusion_victor`    | INTEGER | `gameConclusion.victor`    | The winning player number. NULL if draw. Absent (use a sentinel or separate flag) if game is ongoing or aborted. |
| 23  | Conclusion condition | `conclusion_condition` | TEXT    | `gameConclusion.condition` | e.g., `"checkmate"`, `"time"`, `"resignation"`, `"aborted"`, `"agreement"`. NULL if game is ongoing.             |
| 24  | Time ended           | `time_ended`           | INTEGER | `match.timeEnded`          | Epoch millis when game concluded. NULL if ongoing.                                                               |

**Note on `conclusion_victor`:** The `GameConclusion` type uses `undefined` for aborted/ongoing, `null` for draw, and a `Player` number for a win. In the DB, we can represent this as: NULL column + NULL `conclusion_condition` = ongoing; non-NULL `conclusion_condition` + NULL `conclusion_victor` = draw or aborted (distinguished by condition); non-NULL both = decisive result.

### Group 7: Other Flags

| #   | Property        | DB Column         | Type                       | Source                 | Notes                                                                                                                        |
| --- | --------------- | ----------------- | -------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 25  | Position pasted | `position_pasted` | INTEGER NOT NULL DEFAULT 0 | `match.positionPasted` | Whether a custom position was pasted in. If true, the game cannot be logged to the permanent `games` table after conclusion. |

---

## Summary: Complete Column List

**Total: 25 atomic columns**

```sql
CREATE TABLE IF NOT EXISTS live_games (
    -- Group 1: Game Identity (6 columns)
    game_id                 INTEGER PRIMARY KEY,
    time_created            INTEGER NOT NULL,
    variant                 TEXT NOT NULL,
    clock                   TEXT NOT NULL,
    rated                   INTEGER NOT NULL CHECK (rated IN (0, 1)),
    publicity               TEXT NOT NULL CHECK (publicity IN ('public', 'private')),

    -- Group 2: Player Identity (6 columns)
    white_user_id           INTEGER,
    white_browser_id        TEXT NOT NULL,
    black_user_id           INTEGER,
    black_browser_id        TEXT NOT NULL,
    white_elo               TEXT,
    black_elo               TEXT,

    -- Group 3: Move History (2 columns)
    moves                   TEXT NOT NULL DEFAULT '',
    clock_stamps            TEXT,

    -- Group 4: Clock State (4 columns)
    white_time_remaining_ms INTEGER,
    black_time_remaining_ms INTEGER,
    color_ticking           INTEGER,
    clock_snapshot_time     INTEGER,

    -- Group 5: Draw Offer State (3 columns)
    draw_offer_state        INTEGER,
    white_last_offer_ply    INTEGER,
    black_last_offer_ply    INTEGER,

    -- Group 6: Game Conclusion (3 columns)
    conclusion_victor       INTEGER,
    conclusion_condition    TEXT,
    time_ended              INTEGER,

    -- Group 7: Other Flags (1 column)
    position_pasted         INTEGER NOT NULL DEFAULT 0
);
```

---

## Reconstruction Procedure

On server restart, to restore each live game:

1. **Query** all rows from the `live_games` table.
2. **For each row:**
   a. **Reconstruct `AuthMemberInfo`** for each player from `user_id` + `browser_id`. Look up `username` and `roles` from the `members` table for signed-in users.
   b. **Reconstruct `MetaData`** from stored fields (`variant`, `clock`, `rated`, elo values, timestamps). Derive `Event`, `Site`, `Round`, `White`, `Black`, `WhiteID`, `BlackID`, `TimeControl` from atomic values.
   c. **Call `initGame(metadata)`** to create the `basegame` with correct `gameRules`, clock initialization, etc.
   d. **Reconstruct `MatchInfo`** from stored fields (`game_id`, `time_created`, `publicity`, `rated`, `clock`, player data, draw offer state, `position_pasted`).
   e. **Replay moves** by parsing the `moves` string and applying each move to the basegame (and boardsim if applicable). Attach `clockStamp` values from the `clock_stamps` column.
   f. **Restore clock state** for timed games: set `currentTime` for each player from stored values, adjust the ticking player's time for elapsed time since snapshot (`actual = stored - (now - snapshot_time)`). Set `colorTicking`, `timeAtTurnStart = now`, `timeRemainAtTurnStart = adjustedTime`.
   g. **Restore draw offer state** from `draw_offer_state` and per-player `lastOfferPly`.
   h. **Restore game conclusion** if present.
   i. **If the game is concluded but not yet logged**: immediately log it and delete the live game row.
   j. **Start disconnect timers** for all players (they're all "disconnected" post-restart). Give a generous reconnection grace period.
   k. **Start auto-time-loss timer** for the ticking player based on their adjusted remaining time.
   l. **Reconstruct `boardsim`** (if the variant supports server-side validation) by calling `initBoard()` and replaying all moves through it.
3. **Delete the row** from `live_games` once the game concludes and is logged to the permanent `games` table.

---

## When to Persist (State Change Events)

The `live_games` row should be written/updated at each game state change:

| Event                   | Columns Updated                                                               |
| ----------------------- | ----------------------------------------------------------------------------- |
| **Game created**        | INSERT full row (all Group 1 & 2 columns, defaults for the rest)              |
| **Move submitted**      | `moves`, `clock_stamps`, clock state columns (Group 3 & 4)                    |
| **Draw offer extended** | `draw_offer_state`, `white_last_offer_ply` or `black_last_offer_ply`          |
| **Draw offer declined** | `draw_offer_state` (set to NULL)                                              |
| **Draw accepted**       | `conclusion_victor`, `conclusion_condition`, `time_ended`, `draw_offer_state` |
| **Resignation**         | `conclusion_victor`, `conclusion_condition`, `time_ended`                     |
| **Abort**               | `conclusion_condition`, `time_ended`                                          |
| **Time loss**           | `conclusion_victor`, `conclusion_condition`, `time_ended`, clock state        |
| **Disconnect loss**     | `conclusion_victor`, `conclusion_condition`, `time_ended`                     |
| **Position pasted**     | `position_pasted`                                                             |
| **Game deleted/logged** | DELETE row                                                                    |

---

## Edge Cases & Policy Decisions

1. **Games with pasted positions** (`position_pasted = true`): These cannot be logged to the permanent `games` table because the starting position is unknown. Since a pasted position entirely replaces the board state with an arbitrary position that cannot be derived from the variant alone, replaying moves from the variant's default position will not reproduce the correct game. **Recommendation:** Either (a) exclude pasted-position games from persistence (abort them on restart, which is the simplest approach), or (b) add an optional `custom_position_icn` TEXT column to store the full pasted position in ICN format, enabling correct reconstruction.

2. **Nearly-concluded games**: If a game was concluded but not yet logged (within the 8-second `timeBeforeGameDeletionMillis` window), persist the conclusion. On restart, detect these and immediately run the logging pipeline.

3. **AFK state**: AFK timers are not persisted. On restart, all players are "reconnecting," which naturally resets AFK state. If a player fails to reconnect, the normal disconnect timer will handle it.

4. **Disconnect timers**: Not persisted. On restart, start fresh disconnect timers for all players with a generous grace period.

5. **Guest players**: Guests are identified solely by `browser_id`. If a guest clears their cookies during a restart, they cannot be re-associated with their game. In this case, the game should proceed normally with disconnect timers running for the absent guest. If the guest fails to reconnect before the disconnect timer expires, the game concludes via the standard disconnect loss mechanism, just as it would for any player who loses connection and fails to return.

6. **Games where clocks expired during downtime**: On restoration, if `adjustedTime <= 0` for the ticking player, immediately flag them as lost on time.
