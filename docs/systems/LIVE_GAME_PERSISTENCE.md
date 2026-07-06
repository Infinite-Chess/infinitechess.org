# Live Game Persistence

Active games are persisted to the database so they survive server restarts instead of being aborted. This document describes the two-table schema, what each column stores, and the event matrix that drives every DB write.

---

## Database Schema: Two Tables

Following the pattern of `games` + `player_games` for ended games, live state is split across two tables to support an arbitrary number of players per game:

- **`live_games`** — One row per active game. Contains game-level state.
- **`live_player_games`** — One row per player per active game. Contains per-player state.

### Table 1: `live_games`

#### Group 1: Game Identity

| Column         | Type                                       | Notes                               |
| -------------- | ------------------------------------------ | ----------------------------------- |
| `game_id`      | INTEGER PRIMARY KEY                        | Unique across live and logged games |
| `time_created` | INTEGER NOT NULL                           | Epoch milliseconds                  |
| `variant`      | TEXT NOT NULL                              | e.g. `"Classical"`, `"Omega^3"`     |
| `clock`        | TEXT NOT NULL                              | e.g. `"600+5"` or `"-"` for untimed |
| `rated`        | BOOLEAN NOT NULL CHECK (rated IN (0, 1))   | 0 = casual, 1 = rated               |
| `private`      | BOOLEAN NOT NULL CHECK (private IN (0, 1)) | 0 = public, 1 = private             |

#### Group 2: Move History

| Column  | Type                       | Notes                                                                                                                   |
| ------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `moves` | TEXT NOT NULL DEFAULT `''` | Pipe-delimited compact moves with embedded clock comments via ICN format (e.g. `1,2>3,4{[%clk 0:09:56.7]}`). See below. |

**Move format:** Produced by `getShortFormMovesFromMoves()` in `icnconverter.ts` with `{ compact: true, spaces: false, comments: true, move_numbers: false }`. Each move encodes `startCoords > endCoords`, optional promotion, and a clock comment. Parsed back via `parseShortFormMoves()`. The entire column is rewritten on each move submission.

#### Group 3: Clock State

| Column                | Type    | Notes                                                                                                                                                                   |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color_ticking`       | INTEGER | Player number whose clock is running. NULL if untimed, < 2 moves, or game over.                                                                                         |
| `clock_snapshot_time` | INTEGER | Epoch ms when clock values were snapshotted. Used to adjust the ticking player's time on restoration: `actual = stored_remaining - (Date.now() - clock_snapshot_time)`. |

Per-player `time_remaining_ms` lives in `live_player_games`.

#### Group 4: Draw Offer State

| Column             | Type    | Notes                                                       |
| ------------------ | ------- | ----------------------------------------------------------- |
| `draw_offer_state` | INTEGER | Player number who extended the current offer. NULL if none. |

Per-player `last_draw_offer_ply` lives in `live_player_games`.

#### Group 5: Game Conclusion

| Column                 | Type    | Notes                                                                                                                                                               |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conclusion_condition` | TEXT    | e.g. `"checkmate"`, `"time"`, `"resignation"`, `"aborted"`, `"agreement"`, `"disconnect"` (claimed win), `"abandonment"` (claimed/both-gone draw). NULL if ongoing. |
| `conclusion_victor`    | INTEGER | Winning player number. NULL for draw, ongoing, or aborted.                                                                                                          |
| `time_ended`           | INTEGER | Epoch ms when game concluded. NULL if ongoing.                                                                                                                      |

#### Group 6: Timer State

| Column                       | Type    | Notes                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finalize_time`              | INTEGER | Epoch ms deadline to finalize (lock in, db log) a concluded game. NULL if ongoing. Set to `timeEnded + timeBeforeGameDeletionMillis` — a cushion for cheat reports to overturn the result first. On restoration, if elapsed, log immediately. (Once logged, the row is deleted, so a logged game is never in this table.) |
| `both_disconnected_end_time` | INTEGER | Epoch ms when the both-disconnected timer concludes the game (draw by abandonment, or abort) if neither player returns. NULL unless both players are currently disconnected. On restoration, if elapsed, conclude immediately.                                                                                            |

#### Group 7: Flags

| Column           | Type                                                        | Notes                                                                                                      |
| ---------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `validate_moves` | BOOLEAN NOT NULL DEFAULT 1 CHECK (validate_moves IN (0, 1)) | Whether server-side move validation is active (`boardsim` is defined). Set to 0 when a position is pasted. |

---

### Table 2: `live_player_games`

One row per player per live game.

| Column                        | Type             | Notes                                                                                                                                       |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `game_id`                     | INTEGER NOT NULL | FK → `live_games.game_id` ON DELETE CASCADE                                                                                                 |
| `player_number`               | INTEGER NOT NULL | 1 = White, 2 = Black, etc. Supports future multi-player games.                                                                              |
| `user_id`                     | INTEGER          | NULL if guest.                                                                                                                              |
| `browser_id`                  | TEXT NOT NULL    | Always present (guests are identified by `browser_id` alone).                                                                               |
| `last_draw_offer_ply`         | INTEGER          | Ply (0-based) of the player's last draw offer. NULL if never offered.                                                                       |
| `time_remaining_ms`           | INTEGER          | Milliseconds remaining at time of snapshot. NULL if untimed.                                                                                |
| `disconnect_cushion_end_time` | INTEGER          | Epoch ms when the 5-second reconnection cushion expires. NULL if no cushion is active.                                                      |
| `disconnect_claim_time`       | INTEGER          | Epoch ms from which the opponent may claim victory/a draw against this player. NULL if no claim window is set.                              |
| `disconnect_voluntary`        | BOOLEAN          | 1 = intentional disconnect (10s timer), 0 = network drop (60s timer). NULL if player was connected. CHECK (disconnect_voluntary IN (0, 1)). |

**Three-case disconnect restoration:**

- `disconnect_claim_time` non-NULL → the opponent's claim window was set; restore the timestamp (if already past, the window is simply already claimable).
- `disconnect_cushion_end_time` non-NULL, `disconnect_claim_time` NULL → still in the 5-second cushion; revive it (or open the claim window if elapsed).
- All disconnect columns NULL → player was connected before the restart; start a fresh 5-second cushion (server restart counts as not-by-choice).

After restoring per-player disconnect state, if **both** players are disconnected, `both_disconnected_end_time` is revived (or, if NULL because the restart itself disconnected both, started fresh at 60 seconds).

---

## Event Matrix: When Each Column Is Written

| Event                                                       | `live_games` Columns Updated                                                                                       | `live_player_games` Columns Updated                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Game created**                                            | INSERT full row (all Group 1 columns, defaults for the rest)                                                       | INSERT one row per player (identity, defaults)                                                      |
| **Move submitted**                                          | `moves`, `color_ticking`, `clock_snapshot_time`, `validate_moves`                                                  | `time_remaining_ms` (both players)                                                                  |
| **Draw offer extended**                                     | `draw_offer_state`                                                                                                 | `last_draw_offer_ply` (offering player)                                                             |
| **Draw offer declined**                                     | `draw_offer_state` → NULL                                                                                          | —                                                                                                   |
| **Draw accepted**                                           | `conclusion_condition`, `conclusion_victor`, `time_ended`, `draw_offer_state`, `finalize_time`                     | —                                                                                                   |
| **Resignation**                                             | `conclusion_condition`, `conclusion_victor`, `time_ended`, `finalize_time`                                         | —                                                                                                   |
| **Abort**                                                   | `conclusion_condition`, `time_ended`, `finalize_time`                                                              | —                                                                                                   |
| **Time loss**                                               | `conclusion_condition`, `conclusion_victor`, `time_ended`, `color_ticking`, `clock_snapshot_time`, `finalize_time` | `time_remaining_ms`                                                                                 |
| **Claim victory/draw**                                      | `conclusion_condition`, `conclusion_victor`, `time_ended`, `finalize_time`, `both_disconnected_end_time` → NULL    | —                                                                                                   |
| **Player disconnects**                                      | —                                                                                                                  | `disconnect_cushion_end_time`, `disconnect_claim_time`, `disconnect_voluntary`                      |
| **Player reconnects**                                       | `both_disconnected_end_time` → NULL                                                                                | `disconnect_cushion_end_time` → NULL, `disconnect_claim_time` → NULL, `disconnect_voluntary` → NULL |
| **Both-disconnected timer set/cleared**                     | `both_disconnected_end_time`                                                                                       | —                                                                                                   |
| **Both-disconnected timeout** (draw by abandonment / abort) | `conclusion_condition`, `conclusion_victor`, `time_ended`, `finalize_time`, `both_disconnected_end_time` → NULL    | —                                                                                                   |
| **Game finalized** (result locked in, db logged)            | DELETE row (cascades to `live_player_games`) — result now lives in the permanent tables                            | (cascades)                                                                                          |
| **Game evicted** (both players left the rematch window)     | — (row already removed at finalization)                                                                            | —                                                                                                   |

**Post-game rematch window:** After a game concludes it is finalized & logged (immediately if server-validated, else after
the `finalize_time` cheat-report cushion). Logging **deletes the row** — the result is now safe in the permanent tables — but
the game **lingers in memory** to host the rematch handshake until both players leave, at which point it is evicted from memory.
The rematch offers and post-game reconnection cushions are ephemeral (never persisted). A concluded-but-not-yet-logged game
(still in its cheat-report cushion) is the only post-conclusion state that survives a restart: it restores and resumes its
finalize_time` deadline. A logged game is never in this table, so there's nothing to discard on restart.
