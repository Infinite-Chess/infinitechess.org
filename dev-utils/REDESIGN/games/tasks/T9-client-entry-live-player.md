# T9 — Game-page client entry + new loader (live player)

Part of the game-page redesign (see `../requirements.md`). Build the new game page's **own** client entry (NOT `main.ts`) and a **new, purpose-built loader** that consumes the new state shapes directly, then wire the **live player** path end-to-end: subscribe by id → receive `gamestate` → load & render → live deltas.

Depends on T6 (server `subscribe`/`gamestate`), T8 (canvas + side-bar structure), T2 (`FullGameState`/`SubscribedGameState`).

## Approach (confirmed)

- **No `main.ts`.** This page gets its own slim entry. It's fine if it initially pulls in much of the existing `game/` graph by reusing modules — slimming is a **separate, later iterative refactor** (done with the user), not part of this task.
- **New loader, not an adapter.** Do **not** bridge the new state into the old `gameloader.startOnlineGame`. Write a new loader for this page that consumes `FullGameState`/`SubscribedGameState` directly and calls the lower-level primitive `gameslot.loadGamefile(...)`. Building the `MetaData` that `gameslot.loadGamefile` requires from the typed state fields is the **new loader's own job** (reuse `clientmetadatautil` for the field conversions) — that's not an adapter to old code, it's the loader producing what the gamefile primitive needs.
- Reuse lower-level primitives and existing live-delta handlers; replace only the entry + load orchestration.

## Required changes

### 1. New entry — `src/client/scripts/esm/views/game/game.ts`

Replace the T3 skeleton with the real entry. Reuse the rendering bootstrap that `main.ts` does (`webgl.init`, `camera.init`, `game.init`, the game loop via `loadbalancer`/`frameratelimiter`, the `beforeunload` socket-close listener) — import the same modules. Then:
- Read `window.gamePageData` (`{ id, isLive }`, injected in T3).
- **Live** (`isLive`): open the socket and send the new `subscribe` action with the numeric `id` (replaces `main.ts`'s `send('game','joingame')`). Handle the incoming `gamestate` via the new loader. Live deltas reuse existing handlers (§4).
- **Dead** (`!isLive`): out of scope here — stub/defer to T10.

### 2. New loader — `src/client/scripts/esm/views/game/gameStateLoader.ts` (or similar)

`loadGameFromState(state: FullGameState, youAreColor?: Player)`:
- Build a `MetaData` from the typed fields (`variant` → `Variant`, `players` → `White`/`Black`/`WhiteElo`/`BlackElo`, `timeControl` → `TimeControl`, `timeCreated` → `UTCDate`/`UTCTime`, `gameConclusion` → `Result`/`Termination`) — add a `FullGameState → MetaData` builder to `clientmetadatautil` (reuse its existing helpers like `getRatingFromWhiteBlackElo`, `getGameConclusionFromResultAndTermination` inversely).
- Resolve variant (`variantregistry.resolveVariantCode`) + timestamp (`metadatautil.resolveTimestampFromMetadata`).
- `viewWhitePerspective = youAreColor === undefined || youAreColor === WHITE` (spectator/white POV).
- Call `gameslot.loadGamefile({ metadata, variant, dateTimestamp, viewWhitePerspective, allowEditCoords: false, additional: { moves: state.moves, gameConclusion: state.gameConclusion, clockValues: state.clockValues } })`.
- Set up online-game state for a participant (reuse `onlinegame.initOnlineGame` with `gameInfo`-equivalent + `youAreColor` + `participantState`, or a new minimal equivalent — implementer's call).

This loader is shared with T10 (dead) and T11 (spectator); design its signature with that in mind, but only the live-player path is wired here.

### 3. Client schema wiring — `src/client/scripts/esm/websocket/socketschemas.ts`

Add the incoming `gamestate` action carrying `SubscribedGameStateSchema` (from T2/T6) to the client `GameSchema`. Wire the `subscribe` outgoing send. Leave the old `joingame` action/schema in place for now (dormant; retired later).

### 4. Live deltas

Reuse the existing `onlinegamerouter` handlers for `move`/`clock`/`gameupdate`/`gameratingchange` (they operate on the loaded `gameslot.getGamefile()` and are agnostic to how it was loaded). Route the new `gamestate` action to the new loader. Reuse or thinly wrap `onlinegamerouter`'s routing — implementer's call; don't rewrite the delta handlers.

## Out of scope / deferred

- Dead/review load (T10), spectator read-only view (T11), gamestart navigation + sound (T12).
- Slimming the import graph / decoupling editor & engines — **separate later refactor with the user**.
- Removing the dormant old `main.ts`/`joingame` path — folds into a later cleanup once T9–T11 land.

## Constraints

- Do not use or modify `main.ts`. Do not route the new state through the old `startOnlineGame`.
- Reuse primitives (`gameslot.loadGamefile`, rendering bootstrap, delta handlers); build the new entry + loader fresh.
- Follow `CLAUDE.md`: reference source types; reuse, don't duplicate; tight jsdoc; tabs.

## Acceptance

- `npm run type-check --silent` passes.
- `npm run lint --silent` passes (fix any pre-existing warning touched).
- The client build succeeds with the new `views/game/game.ts` entry. Loading `/game/<live id>` as a participant subscribes, receives `gamestate`, and the new loader renders the board + clocks from the typed `FullGameState`; subsequent `move`/`clock`/`gameupdate` deltas update the board. (Runtime depends on T6 being deployed.)
