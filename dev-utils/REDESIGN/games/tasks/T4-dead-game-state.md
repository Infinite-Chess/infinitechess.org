# T4 — Dead-game state producer (`DeadGameState` from DB)

Part of the game-page redesign (see `../requirements.md`). Define the **dead** (concluded) game shape and a producer that builds it from the database — **without parsing the ICN**. The HTTP endpoint that serves it is T5; this task is just the type + the producer.

Depends on T2 (which defines `GameStateBase` + the `buildServerUsernameContainer` helper).

## The shape

`DeadGameState` extends the shared `GameStateBase` from T2 (`id, rated, variant, timeControl, timeCreated, players, gameConclusion?`) with two dead-only fields:

```
DeadGameState = GameStateBase + {           // GameStateBaseSchema.extend({...})
  icn: string,                              // source of truth for moves + clock stamps (+ start position only for custom-position games)
  ratingChanges?: PlayerGroup<PlayerRatingChangeInfo>,  // per signed-in player, rated games only
  finalClocks?: PlayerGroup<number>,        // ms remaining per color at game end (timed games only); a color may be absent if that player was a guest
}
```

- Add `DeadGameState` + `DeadGameStateSchema = GameStateBaseSchema.extend({ ... })` in `src/shared/types.ts`, reusing the existing `PlayerRatingChangeInfo` type. No `MetaData` — same principle as the live shape.
- The server does **not** parse the ICN; the `icn` string is passed through verbatim for the client to parse (moves, clock stamps, custom start position).
- **Why `finalClocks` is needed:** the ICN only stamps clocks on *moves*. A non-move ending (resignation, timeout, agreement, abandonment) leaves the clock at the moment of conclusion uncaptured by the move stamps, so the final clock must come from `player_games.clock_at_end_millis`.

## The producer

Add `produceDeadGameState(game_id: number): DeadGameState | undefined` (returns `undefined` if no such game row → caller 404s). Put it in a dedicated server module (e.g. `src/server/game/gamemanager/deadgamestate.ts`) — a dead game has no live `ServerGame`, so it doesn't belong in `gameutility.ts`. Build it from columns only:

### Reads
1. **games row** via `getGameData(game_id, [...])` (`src/server/database/gamesManager.js`): `variant, rated, date, base_time_seconds, increment_seconds, result, termination, icn`.
2. **player_games rows** for the game_id: `player_number, user_id, elo_at_game, elo_change_from_game, clock_at_end_millis`. Reuse an existing query if one exists (member profile history likely reads this table); otherwise add one to `gamesManager`.
3. **members** — resolve each `user_id → username` via the existing members lookup (e.g. `getMemberDataByCriteria`).

### Field mapping
- `id` ← `game_id`; `rated` ← `rated` column (0/1 → boolean).
- `variant` ← `variant` column (typed as `VariantCode`).
- `timeControl` ← rebuild from `base_time_seconds`/`increment_seconds`: `null` ⇒ `'-'`, else `` `${base}+${increment}` ``. Check `clockutil` for an existing builder (inverse of `splitTimeControl`) before writing the string inline.
- `timeCreated` ← convert the `date` column (sqlite timestamp) to epoch ms via the existing `timeutil` inverse of `timestampToSqlite`.
- `gameConclusion` ← `{ condition: termination, victor }`:
  - `condition` ← the `termination` column (it stores the `GameConclusion.condition` **key**, e.g. `"checkmate"`, not English — see `gamelogger.ts:83`).
  - `victor` ← invert from the `result` column (e.g. `"1-0"→WHITE`, `"0-1"→BLACK`, `"1/2-1/2"→null`). Use/invert `metadatautil.getResultFromVictor` rather than hardcoding strings. The discriminated union requires `victor` to match the condition kind (win→Player, draw→null), which this mapping yields.
- `players: PlayerGroup<ServerUsernameContainer>` — for White(1)/Black(2):
  - color present in `player_games` ⇒ member: `buildServerUsernameContainer({ signedIn:true, user_id, username, ... }, rating)` (or construct the container directly), where `rating = { value: elo_at_game, confident: true }` if `elo_at_game != null` else `undefined`. **`confident` is always `true` for dead games** (at-game confidence isn't stored — see requirements).
  - color absent from `player_games` ⇒ guest: `{ type: 'guest', username: metadatautil.GUEST_NAME_ICN_METADATA }`, no rating.
- `ratingChanges` ← for each `player_games` row with `elo_change_from_game != null`: `{ newRating: { value: elo_at_game + elo_change_from_game, confident: true }, change: elo_change_from_game }`. Omit the whole field if no player has a change (unrated / no rated players).
- `finalClocks` ← for each `player_games` row with `clock_at_end_millis != null`, set that color's ms. Omit the whole field for untimed games (all null). A color absent here means that player was a guest (no `player_games` row) — the client falls back to that color's last move clock stamp from the ICN (a T7 concern; just leave it absent).

## Out of scope / deferred

- The HTTP endpoint + rate limiter (T5).
- Any client parsing/rendering (T7).
- Custom-position games — not yet implemented anywhere (logging uses `skipPosition: true`); the `icn` carries position only when that future case lands. No special handling needed now.

## Known edge case (flag, don't over-engineer)

A member who **deleted their account** still has `player_games` rows (`user_id` retained) but no `members` row, so the username lookup returns nothing. Fall back to the display name `"(Deleted User)"`. Do not parse the ICN to recover it.

## Constraints

- Follow `CLAUDE.md`: reference source types (never re-export); reuse existing queries/helpers, don't duplicate; no `Omit`/`Exclude` (use schema `.extend`); tight jsdoc; tabs.
- Do **not** parse the ICN. Do **not** read from `activeGames` (this is the dead path).

## Acceptance

- `npm run type-check --silent` passes.
- `npm run lint --silent` passes (fix any pre-existing warning touched).
- `produceDeadGameState` returns a value validating against `DeadGameStateSchema` for a real concluded game, and `undefined` for a nonexistent id — built entirely from columns, with no ICN parsing.
