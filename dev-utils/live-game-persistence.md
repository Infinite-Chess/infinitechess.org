# Live Game Persistence

Active games are persisted to the database so they survive server restarts instead of being aborted. This document describes the two-table schema, what each column stores, and the event matrix that drives every DB write.

---

## Database Schema: Two Tables

Following the pattern of `games` + `player_games` for ended games, live state is split across two tables to support an arbitrary number of players per game:

- **`live_games`** — One row per active game. Contains game-level state.
- **`live_player_games`** — One row per player per active game. Contains per-player state.

### Table 1: `live_games`

#### Group 1: Game Identity

| Column         | Type                                       | Notes                                    |
| -------------- | ------------------------------------------ | ---------------------------------------- |
| `game_id`      | INTEGER PRIMARY KEY                        | Unique across live and logged games      |
| `time_created` | INTEGER NOT NULL                           | Epoch milliseconds                       |
| `variant`      | TEXT NOT NULL                              | e.g. `"Classical"`, `"Omega^3"`          |
| `clock`        | TEXT NOT NULL                              | e.g. `"600+5"` or `"-"` for untimed     |
| `rated`        | INTEGER NOT NULL CHECK (rated IN (0, 1))   | 0 = casual, 1 = rated                    |
| `private`      | INTEGER NOT NULL CHECK (private IN (0, 1)) | 0 = public, 1 = private                 |

#### Group 2: Move History

| Column  | Type                       | Notes                                                                                                                      |
| ------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `moves` | TEXT NOT NULL DEFAULT `''` | Pipe-delimited compact moves with embedded clock comments via ICN format (e.g. `1,2>3,4{[%clk 0:09:56.7]}`). See below. |

**Move format:** Produced by `getShortFormMovesFromMoves()` in `icnconverter.ts` with `{ compact: true, spaces: false, comments: true, move_numbers: false }`. Each move encodes `startCoords > endCoords`, optional promotion, and a clock comment. Parsed back via `parseShortFormMoves()`. The entire column is rewritten on each move submission.

#### Group 3: Clock State

| Column                | Type    | Notes                                                                               |
| --------------------- | ------- | ----------------------------------------------------------------------------------- |
| `color_ticking`       | INTEGER | Player number whose clock is running. NULL if untimed, < 2 moves, or game over.    |
| `clock_snapshot_time` | INTEGER | Epoch ms when clock values were snapshotted. Used to adjust the ticking player's time on restoration: `actual = stored_remaining - (Date.now() - clock_snapshot_time)`. |

Per-player `time_remaining_ms` lives in `live_player_games`.

#### Group 4: Draw Offer State

| Column             | Type    | Notes                                                         |
| ------------------ | ------- | ------------------------------------------------------------- |
| `draw_offer_state` | INTEGER | Player number who extended the current offer. NULL if none.   |

Per-player `last_draw_offer_ply` lives in `live_player_games`.

#### Group 5: Game Conclusion

| Column                 | Type    | Notes                                                                                              |
| ---------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `conclusion_condition` | TEXT    | e.g. `"checkmate"`, `"time"`, `"resignation"`, `"aborted"`, `"agreement"`. NULL if ongoing.        |
| `conclusion_victor`    | INTEGER | Winning player number. NULL for draw, ongoing, or aborted.                                         |
| `time_ended`           | INTEGER | Epoch ms when game concluded. NULL if ongoing.                                                     |

#### Group 6: Timer State

| Column            | Type    | Notes                                                                                                                                                  |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `afk_resign_time` | INTEGER | Epoch ms when the AFK auto-resign fires. NULL if no AFK timer active. On restoration, remaining = `stored - Date.now()`; if ≤ 0, immediately resign.   |
| `delete_time`     | INTEGER | Epoch ms when the concluded game is deleted and logged. NULL if ongoing. Set to `timeEnded + timeBeforeGameDeletionMillis`. On restoration, if elapsed, immediately run logging. |

#### Group 7: Flags

| Column            | Type                                                         | Notes                                                                                                            |
| ----------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `position_pasted` | INTEGER NOT NULL DEFAULT 0 CHECK (position_pasted IN (0, 1)) | Whether a custom position was pasted. Pasted games are never logged to the permanent `games` table.              |
| `validate_moves`  | INTEGER NOT NULL DEFAULT 1 CHECK (validate_moves IN (0, 1))  | Whether server-side move validation is active (`boardsim` is defined). Set to 0 when a position is pasted.       |

---

### Table 2: `live_player_games`

One row per player per live game.

| Column                        | Type             | Notes                                                                                                                                                                  |
| ----------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game_id`                     | INTEGER NOT NULL | FK → `live_games.game_id` ON DELETE CASCADE                                                                                                                            |
| `player_number`               | INTEGER NOT NULL | 1 = White, 2 = Black, etc. Supports future multi-player games.                                                                                                         |
| `user_id`                     | INTEGER          | NULL if guest.                                                                                                                                                         |
| `browser_id`                  | TEXT NOT NULL    | Always present (guests are identified by `browser_id` alone).                                                                                                         |
| `elo`                         | TEXT             | Snapshot at game start (e.g. `"1500"` or `"1200?"`). NULL if guest.                                                                                                   |
| `last_draw_offer_ply`         | INTEGER          | Ply (0-based) of the player's last draw offer. NULL if never offered.                                                                                                  |
| `time_remaining_ms`           | INTEGER          | Milliseconds remaining at time of snapshot. NULL if untimed.                                                                                                           |
| `disconnect_cushion_end_time` | INTEGER          | Epoch ms when the 5-second reconnection cushion expires. NULL if no cushion is active.                                                                                 |
| `disconnect_resign_time`      | INTEGER          | Epoch ms when the auto-resign fires. NULL if no active disconnect timer.                                                                                               |
| `disconnect_by_choice`        | INTEGER          | 1 = intentional disconnect (20s timer), 0 = network drop (60s timer). NULL if player was connected. CHECK (disconnect_by_choice IN (0, 1)).                            |

**Three-case disconnect restoration:**
- `disconnect_resign_time` non-NULL → auto-resign timer was active; restore from that timestamp.
- `disconnect_cushion_end_time` non-NULL, `disconnect_resign_time` NULL → still in the 5-second cushion; revive it (or start the auto-resign timer if elapsed).
- All disconnect columns NULL → player was connected before the restart; start a fresh 60-second timer (server restart counts as not-by-choice).

---

## DDL

```sql
CREATE TABLE IF NOT EXISTS live_games (
    game_id                 INTEGER PRIMARY KEY,
    time_created            INTEGER NOT NULL,
    variant                 TEXT NOT NULL,
    clock                   TEXT NOT NULL,
    rated                   INTEGER NOT NULL CHECK (rated IN (0, 1)),
    private                 INTEGER NOT NULL CHECK (private IN (0, 1)),
    moves                   TEXT NOT NULL DEFAULT '',
    color_ticking           INTEGER,
    clock_snapshot_time     INTEGER,
    draw_offer_state        INTEGER,
    conclusion_condition    TEXT,
    conclusion_victor       INTEGER,
    time_ended              INTEGER,
    afk_resign_time         INTEGER,
    delete_time             INTEGER,
    position_pasted         INTEGER NOT NULL DEFAULT 0 CHECK (position_pasted IN (0, 1)),
    validate_moves          INTEGER NOT NULL DEFAULT 1 CHECK (validate_moves IN (0, 1))
);

CREATE TABLE IF NOT EXISTS live_player_games (
    game_id                         INTEGER NOT NULL REFERENCES live_games(game_id) ON DELETE CASCADE,
    player_number                   INTEGER NOT NULL,
    user_id                         INTEGER,
    browser_id                      TEXT NOT NULL,
    elo                             TEXT,
    last_draw_offer_ply             INTEGER,
    time_remaining_ms               INTEGER,
    disconnect_cushion_end_time     INTEGER,
    disconnect_resign_time          INTEGER,
    disconnect_by_choice            INTEGER CHECK (disconnect_by_choice IN (0, 1)),
    PRIMARY KEY (game_id, player_number)
);
CREATE INDEX IF NOT EXISTS idx_live_player_games_game ON live_player_games (game_id);
```

---

## Event Matrix: When Each Column Is Written

| Event                       | `live_games` Columns Updated                                                                                     | `live_player_games` Columns Updated                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Game created**            | INSERT full row (all Group 1 columns, defaults for the rest)                                                     | INSERT one row per player (identity, elo, defaults)                                                  |
| **Move submitted**          | `moves`, `color_ticking`, `clock_snapshot_time`, `validate_moves`                                                | `time_remaining_ms` (both players)                                                                   |
| **Draw offer extended**     | `draw_offer_state`                                                                                               | `last_draw_offer_ply` (offering player)                                                              |
| **Draw offer declined**     | `draw_offer_state` → NULL                                                                                        | —                                                                                                    |
| **Draw accepted**           | `conclusion_condition`, `conclusion_victor`, `time_ended`, `draw_offer_state`, `delete_time`                     | —                                                                                                    |
| **Resignation**             | `conclusion_condition`, `conclusion_victor`, `time_ended`, `delete_time`                                         | —                                                                                                    |
| **Abort**                   | `conclusion_condition`, `time_ended`, `delete_time`                                                              | —                                                                                                    |
| **Time loss**               | `conclusion_condition`, `conclusion_victor`, `time_ended`, `color_ticking`, `clock_snapshot_time`, `delete_time` | `time_remaining_ms`                                                                                  |
| **Disconnect loss**         | `conclusion_condition`, `conclusion_victor`, `time_ended`, `delete_time`                                         | —                                                                                                    |
| **Player disconnects**      | —                                                                                                                | `disconnect_cushion_end_time`, `disconnect_resign_time`, `disconnect_by_choice`                      |
| **Player reconnects**       | —                                                                                                                | `disconnect_cushion_end_time` → NULL, `disconnect_resign_time` → NULL, `disconnect_by_choice` → NULL |
| **Player goes AFK**         | `afk_resign_time`                                                                                                | —                                                                                                    |
| **Player returns from AFK** | `afk_resign_time` → NULL                                                                                         | —                                                                                                    |
| **AFK auto-resign**         | `conclusion_condition`, `conclusion_victor`, `time_ended`, `afk_resign_time` → NULL, `delete_time`               | —                                                                                                    |
| **Position pasted**         | `position_pasted`, `validate_moves` → 0                                                                         | —                                                                                                    |
| **Game deleted/logged**     | DELETE row (cascades to `live_player_games`)                                                                     | —                                                                                                    |
