# Live Game Persistence

Active games are persisted to the database so they survive server restarts instead of being aborted. This document describes the three-table schema, what each column stores, and the event matrix that drives every DB write.

---

## Database Schema: Three Tables

Following the pattern of `games` + `player_games` for ended games, live state is split across three tables to support an arbitrary number of participants per game:

- **`live_games`** — One row per active game. Contains game-level state.
- **`live_player_games`** — One row per human player per active game. Contains identity and disconnect state.
- **`live_engine_games`** — One row per engine participant per active game. Contains engine settings and clock state.

### Table 1: `live_games`

#### Group 1: Game Identity

| Column            | Type                                       | Notes                                                                                                   |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `game_id`         | INTEGER PRIMARY KEY                        | Unique across live and logged games                                                                     |
| `time_created`    | INTEGER NOT NULL                           | Epoch milliseconds                                                                                      |
| `variant`         | TEXT                                       | Preset variant code, e.g. `"Classical"`, `"Omega^3"`. NULL for a custom-position game (see `position`). |
| `position`        | TEXT                                       | A custom game's start position; NULL for preset games (complementary to `variant`).                     |
| `clock`           | TEXT NOT NULL                              | e.g. `"600+5"` or `"-"` for untimed                                                                     |
| `rated`           | BOOLEAN NOT NULL CHECK (rated IN (0, 1))   | 0 = casual, 1 = rated                                                                                   |
| `private`         | BOOLEAN NOT NULL CHECK (private IN (0, 1)) | 0 = public, 1 = private                                                                                 |
| `mod_slide_limit` | INTEGER                                    | Slide Limit modifier: max squares a sliding piece may travel. NULL = modifier inactive.                 |

#### Group 2: Move History

| Column  | Type                       | Notes                                                                                                                   |
| ------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `moves` | TEXT NOT NULL DEFAULT `''` | Pipe-delimited compact moves with embedded clock comments via ICN format (e.g. `1,2>3,4{[%clk 0:09:56.7]}`). See below. |

**Move format:** Produced by `getShortFormMovesFromMoves()` in `icnmoves.ts` with `{ compact: true, spaces: false, comments: !untimed, move_numbers: false }`. Each move encodes `startCoords > endCoords`, optional promotion, and optional clock comment. Parsed back via `parseShortFormMoves()`. The entire column is rewritten on each move submission.

#### Group 3: Clock State

| Column                | Type    | Notes                                                                                                                                                                   |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color_ticking`       | INTEGER | Player number whose clock is running. NULL if untimed, < 2 moves, game over, or the engine's turn is frozen.                                                            |
| `clock_snapshot_time` | INTEGER | Epoch ms when clock values were snapshotted. Used to adjust the ticking player's time on restoration: `actual = stored_remaining - (Date.now() - clock_snapshot_time)`. |

Per-participant `time_remaining_ms` lives in `live_player_games` or `live_engine_games`.

#### Group 4: Draw Offer State

| Column             | Type    | Notes                                                       |
| ------------------ | ------- | ----------------------------------------------------------- |
| `draw_offer_state` | INTEGER | Player number who extended the current offer. NULL if none. |

Per-player `last_draw_offer_ply` lives in `live_player_games`.

#### Group 5: Timer State

| Column                       | Type    | Notes                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `both_disconnected_end_time` | INTEGER | Epoch ms when the timer concludes the game (draw by abandonment, abort, or engine win by disconnect) if nobody returns. NULL unless **every human** in the game is currently disconnected — in an engine game that's the lone human, since only humans occupy `live_player_games`. On restoration, if elapsed, conclude immediately. |

#### Group 6: Flags

| Column           | Type                                                        | Notes                                                                                                      |
| ---------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `validate_moves` | BOOLEAN NOT NULL DEFAULT 1 CHECK (validate_moves IN (0, 1)) | Whether server-side move validation is active (`boardsim` is defined). Set to 0 when a position is pasted. |

---

### Table 2: `live_player_games`

One row per human player per live game.

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

Every human is disconnected once restoration finishes — sockets never survive a restart — so `both_disconnected_end_time` is **always** revived, or started fresh at 5 minutes if NULL. It's cleared the moment any player reconnects.

---

### Table 3: `live_engine_games`

One row per engine participant per live game. Engines have no identity or disconnect state, so they are stored separately from human players.

| Column              | Type             | Notes                                                        |
| ------------------- | ---------------- | ------------------------------------------------------------ |
| `game_id`           | INTEGER NOT NULL | FK to `live_games.game_id` with cascading deletion.          |
| `player_number`     | INTEGER NOT NULL | The engine's color.                                          |
| `time_remaining_ms` | INTEGER          | Milliseconds remaining at time of snapshot. NULL if untimed. |
| `engine`            | TEXT NOT NULL    | Engine identifier.                                           |
| `engine_version`    | TEXT NOT NULL    | Version from the build manifest at game creation.            |
| `strength_level`    | INTEGER NOT NULL | Selected engine strength.                                    |

---

## Event Matrix: When Each Column Is Written

| Event                                                                                  | `live_games` Columns Updated                                                     | Participant Tables Columns Updated                                                                  |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Game created**                                                                       | INSERT full row (all Group 1 columns, defaults for the rest)                     | INSERT human rows into `live_player_games` and any engine row into `live_engine_games`              |
| **Move submitted**                                                                     | `moves`, `color_ticking`, `clock_snapshot_time`                                  | `time_remaining_ms` for every participant                                                           |
| **Engine turn paused/resumed**                                                         | `color_ticking`, `clock_snapshot_time`                                           | — (pausing rewinds the engine's turn instead of charging it, so no time changes)                    |
| **Draw offer extended**                                                                | `draw_offer_state`                                                               | `last_draw_offer_ply` (offering player)                                                             |
| **Draw offer declined**                                                                | `draw_offer_state` → NULL                                                        | —                                                                                                   |
| **Draw accepted**                                                                      | DELETE row (game logged to permanent tables) — cascades to participant tables    | (cascades)                                                                                          |
| **Resignation**                                                                        | DELETE row (game logged to permanent tables)                                     | (cascades)                                                                                          |
| **Abort**                                                                              | DELETE row (game logged to permanent tables)                                     | (cascades)                                                                                          |
| **Time loss**                                                                          | DELETE row (game logged to permanent tables)                                     | (cascades)                                                                                          |
| **Claim victory/draw**                                                                 | DELETE row (game logged to permanent tables)                                     | (cascades)                                                                                          |
| **Player disconnects**                                                                 | —                                                                                | `disconnect_cushion_end_time`, `disconnect_claim_time`, `disconnect_voluntary`                      |
| **Player reconnects**                                                                  | `both_disconnected_end_time` → NULL                                              | `disconnect_cushion_end_time` → NULL, `disconnect_claim_time` → NULL, `disconnect_voluntary` → NULL |
| **Both-disconnected timer set/cleared**                                                | `both_disconnected_end_time`                                                     | —                                                                                                   |
| **Both-disconnected timeout** (draw by abandonment / abort / engine win by disconnect) | DELETE row (game logged to permanent tables)                                     | (cascades)                                                                                          |
| **Game finalized** (result locked in)                                                  | — (row already deleted at conclusion; only the in-memory `finalized` flag flips) | —                                                                                                   |
| **Game evicted** (both players left the rematch window)                                | — (row already removed at conclusion)                                            | —                                                                                                   |

### Game conclusion & the rematch window

The moment a game concludes it is **logged to the permanent `games`/`player_games` tables**, and its `live_games` row (plus
cascaded participant rows) is **deleted**. The game **lingers in memory** to host the rematch handshake and cheat-report
window until both players leave, at which point it is evicted from memory. Rematch offers, the `finalized` flag, and post-game
reconnection cushions are all ephemeral (never persisted).
