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

4. **Wire the live position.** The custom position is *static setup*, so it rides in the SSR'd
   `gamePageData` alongside `variant`/`timeControl`/`timeCreated` — NOT on the subscribe socket. (The
   subscribe `GameStateMessage` now carries only live deltas; all static setup was moved into `gamePageData`
   via the shared `StaticGameSetup` type — server `gamePageController`, client `globals.d.ts`.) For a
   custom game, populate the position into that SSR channel and feed it to the loader. Settle the exact
   field shape — either a sibling `position` field on `StaticGameSetup`, or give `GameStateVariant`'s
   custom arm a payload (today it deliberately carries none).

5. **Extend the client loader for custom positions (both live *and* dead).** `loadGameFromState`
   ([onlinegamerouter.ts](../../../../src/client/scripts/esm/game/misc/onlinegame/onlinegamerouter.ts))
   passes `variant: variant.code | undefined` to `gameslot.loadGamefile` but threads **no**
   `variantOptions`, so a `variant.kind === 'custom'` game cannot build its position and won't load.
   Extend the loader to accept/derive `variantOptions` (build them from the SSR'd position via
   [icnimport.variantOptionsFromLongFormat](../../../../src/shared/chess/logic/icn/icnimport.ts)) and
   pass them through `additional.variantOptions`. This is the single choke point both paths share:
   - **Dead/review path:** the dead loader already parses the ICN
     ([deadgameloader.ts](../../../../src/client/scripts/esm/game/misc/onlinegame/deadgameloader.ts)) but
     **guards custom games out with a TODO pointing here** — the ICN's parsed position/gamerules are
     right there in the `LongFormatOut`; remove the guard and pass `variantOptions` into the loader.
   - **Live path:** feed the SSR'd position from step 4 through the same loader argument.

6. **Un-stale the docs.** Update `docs/systems/LIVE_GAME_PERSISTENCE.md` — it still lists `variant` as
   `TEXT NOT NULL` and omits `position`. Fix Group 1 (variant now nullable; add the `position` row) and
   the "Game created" event row. Also revisit `requirements.md`'s custom-game notes if anything there
   now reads as stale.

## Engine games on a custom position

Removing the throws in scope item 1 also opens custom positions to **engine** games, which carry
constraints preset games never hit. None of it is enforced server-side today.

- **Nothing server-side checks the engine can play the position.** `isPlaySupported`
  ([apeiron_card.ts](../../../../src/shared/chess/engines/apeiron_card.ts)) has **zero** server callers —
  the entire gate lives in the client's variant selector. Until custom games start, an unplayable
  position dead-ends in the `createGame` throw; once that's gone, a hand-crafted `createenginegame`
  message starts a game the WASM engine can't handle. The check must apply **only** to engine games —
  `resolveAndValidateVariant` ([createseek.ts](../../../../src/server/game/seeksmanager/createseek.ts))
  is shared with ordinary seeks.
- **`isPlaySupported` requires a bounded board**, so the gamefile it judges has to be constructed with
  `apeiron_card.PLAY_BORDER`. Engine games already get that border when the board is really built
  ([gameutility.ts](../../../../src/server/game/gamemanager/gameutility.ts) `initServerGame`); the
  validation path must use the same one or the two disagree on what's in bounds.
- **`isPlaySupported` does NOT check `SUPPORTED_VARIANTS`.** That lives solely in `checkGameRules`,
  which `isPlaySupported` never calls — only the analysis/review entry points reach it. The selector
  enforces it separately, by hiding unsupported preset buttons. Custom seeks drop the variant identity
  on the wire regardless (`gamefileToPositionOptions` keeps position + gamerules only); what stops a 4D
  ICN from becoming a seek is the unrelated `hasCustomMovement` check, and that rejection is
  **intended** — someone pasting `[Variant "4×4×4×4 Chess"]` would expect 4D movement a seek can't carry.
- **Reason codes are `EngineSupportCode`**, keying `position_errors.engine.<code>.{label,message}` in
  `translation/shared/en-US.toml` — nested objects, not the flat strings `PositionErrorCode` uses, so
  `localizePositionError` does not extend to them as-is.

### Where the world border comes from — the three client paths disagree

Only the **From-ICN** path bakes an explicit `worldBorder` into the ICN it sends:
`tryFormulateGame(…, engineBorder())` → the constructed gamefile's generated `gameRules.worldBorder` →
`gamecompressor.gamefileToPositionOptions` copies gameRules → `variantOptionsToICN` → serialized by
[icnconverter.ts](../../../../src/shared/chess/logic/icn/icnconverter.ts).

- **Local save** and **cloudSave** do not. Both build *previews* with the engine border
  (`handleSavePreview` and `validateSavedPosition` pass `engineBorder()`) — which is why the preview
  tooltip renders it correctly — but that gamefile is discarded, and `getSeekVariant` serializes the raw,
  border-less options. cloudSave sends only a name; the server reads the stored ICN straight from the DB.
- **Presets** can never carry one, since no gameRules cross the wire; the server always reconstructs it.
- **The From-ICN baking is load-bearing, not incidental.** That border is generated from the
  **pre-move** position's bounding box, and only *then* is the position flattened. A server regenerating
  from the flattened position gets a different, tighter border. Preserving it is what makes client and
  server agree for an ICN carrying moves.
- A server-supplied `PLAY_BORDER` is a **no-op** when the ICN already carries a border —
  [boardpreviewer.ts](../../../../src/shared/chess/logic/boardpreviewer.ts) only generates one when
  `gameRules.worldBorder === undefined`.

Normalizing the three (client never bakes, server always supplies) is the cleaner invariant, but it
can't be settled until the server can build a custom game at all — hence it belongs to this task.

## Notes

- **The ICN is the source of truth for custom games' game rules.** A preset variant derives its
  gamerules (incl. turn order), starting position, and win conditions from the registry code. A custom
  game has no code, so the ICN itself is authoritative for **game rules, turn order, starting position,
  moves, and clock stamps** — the client parses them out of it (`ShortToLong_Format` →
  `gameRules`/`position`/`state_global`/`moves`). What the ICN is **NOT** the source of truth for is
  anything in its metadata tags (variant name, players, elo, result, dates): those stay eyeball-only,
  and the authoritative values come from the typed state (`gamePageData` / `DeadGameState`). This
  matters wherever move→color mapping or clock fallback assumes a turn order — read it from the parsed
  gamerules, never assume white/black alternation.
- Independent of the T9–T12 client/protocol chain (those already work for preset games); orderable
  whenever custom games become a priority. Gated only on the schema work above, which is landed.
- Once this ships, the temporary `is_custom`/nullability migrations are irrelevant to the feature — they
  just prepared the columns.

When this task is complete, delete this doc and the corresponding section in OVERVIEW.md.