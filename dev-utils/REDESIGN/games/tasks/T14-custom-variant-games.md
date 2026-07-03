# T14 — Custom-variant games: start, persist, restore (server)

Part of the game-page redesign (see `../requirements.md`). The schema groundwork for custom-position
games is done — `GameStateVariant` / `AuthSeekVariant` are `preset | custom` unions, the `games` and
`live_games` `variant` columns are nullable (NULL = custom), and `live_games` has a `position` column.
But **no game can actually start as custom yet**: `createGame` and `initMatch` throw
`"Custom variant game starting is not yet implemented."` ([gamemanager.ts](../../../../src/server/game/gamemanager/gamemanager.ts) `createGame`,
[gameutility.ts](../../../../src/server/game/gamemanager/gameutility.ts) `initMatch`). The seek pipeline already
delivers the position (`AuthSeekVariant`'s custom arm carries a validated `position` string), so this
task wires the server to build, persist, and restore a game from it. Client rendering of custom
positions is the consumer (T9/T10), not part of this task.

## Scope (general)

1. **Start.** Remove the two throws. When the seek's variant is `custom`, build the in-memory game
   from the seek's `position` (already validated at seek creation via `validateIcnSeekContent`) instead
   of from a preset code. `MatchInfo.variant: VariantCode` must be able to represent a custom game —
   the in-memory match needs to carry the position (and the gamerules derived from parsing it) rather
   than a registry code. Custom positions are large, so they'll run with `validateMoves = false` (the
   server tracks moves as text, not a board), same as pasted positions today.

2. **Persist.** `onGameCreated` ([liveGameValues.ts](../../../../src/server/game/gamemanager/liveGameValues.ts)) currently
   hardcodes `position: null`. For a custom game, write `variant: null` + `position: <the custom
   position>`; for preset, keep `variant: <code>` + `position: null` (exactly one is non-null). No
   other live-persistence columns change — moves/clocks/conclusion all behave identically.

3. **Restore.** `liveGameRestore` rebuilds via `gameRow.variant as VariantCode` (3 sites). Branch on
   the discriminator: `variant` non-null → preset (current path); `variant` null → rebuild from
   `position`. This retires the latent `null as VariantCode` casts.

4. **Wire the live position.** A live `FullGameState` has no ICN, so the custom position must reach the
   client some other way for the loader to build the board (the dead path gets it from `DeadGameState.icn`;
   `GameStateVariant`'s custom arm deliberately carries no payload). Add a **live-only** field to
   `FullGameState` (parallel to dead's `icn`), populated for custom games and fed to T9's loader. Settle
   the exact field with whoever owns T9.

5. **Un-stale the docs.** Update `docs/systems/LIVE_GAME_PERSISTENCE.md` — it still lists `variant` as
   `TEXT NOT NULL` and omits `position`. Fix Group 1 (variant now nullable; add the `position` row) and
   the "Game created" event row. Also revisit `requirements.md`'s custom-game notes if anything there
   now reads as stale.

## Notes

- Independent of the T9–T12 client/protocol chain (those already work for preset games); orderable
  whenever custom games become a priority. Gated only on the schema work above, which is landed.
- Once this ships, the temporary `is_custom`/nullability migrations are irrelevant to the feature — they
  just prepared the columns.

When this task is complete, delete this doc and the corresponding section in OVERVIEW.md.