# T2 — Shared `GameStateBase` + live `FullGameState` serializer

Part of the game-page redesign (see `../requirements.md`). This is the spine: the canonical, **role-agnostic** representation of a **live** game's full state, plus the shared base that the dead-game type (T4) will also extend. Live games send `FullGameState` over the WebSocket (T6); the client renders from it (T7).

Note: dead games do **not** use `FullGameState` — they extend the same `GameStateBase` but with `icn` instead of structured moves (T4/T5), parsed client-side.

This task is **additive** apart from one small DRY refactor (extracting a username-container helper). It does **not** rewire any existing message path.

## Key principle — no `MetaData` in the state

`MetaData` is the ICN's eyeball-only tag format; it is **not** the source of truth and is **not** sent in the game state. The state spreads the authoritative game properties as **typed fields**. (The server still builds `MetaData` for ICN/DB storage — that's unchanged — but the live state sent to clients does not include it.)

The existing live `joingame` payload (`sendGameInfoToPlayer`) additionally carries a **per-viewer overlay** — `youAreColor`, `participantState`, `forceSync`. That overlay is intentionally **excluded** from `GameStateBase`/`FullGameState`; it's layered on at delivery time (T6 for live players; omitted for spectators and dead games).

## Required changes

### 1. Shared types + schemas — `src/shared/types.ts`

Add a shared base and the live shape. Compose from existing shared schemas already in this file — do not redefine `MovePacket`, `ClockValues`, `Rating`, `TimeControl`, `ServerUsernameContainer`, or the game-conclusion schema. Reference `VariantCode` from `src/shared/chess/variants/variantregistry.js` (use an existing variant-code schema if one exists; otherwise a string schema is acceptable — flag which you chose).

```
GameStateBase = {                          // strictObject — shared by live & dead
  id: <int, nonnegative>,
  rated: boolean,
  variant: VariantCode,
  timeControl: TimeControl,
  timeCreated: <epoch ms, number>,
  players: PlayerGroup<ServerUsernameContainer>,   // typeschemas.GenPlayerGroupSchema(ServerUsernameContainerSchema); rating embedded per player
  gameConclusion?: GameConclusion,                 // winconutil.gameConclusionSchema, optional
}

FullGameState = GameStateBase + {          // live; GameStateBaseSchema.extend({...})
  moves: MovePacket[],                     // each carries its optional clockStamp (per-move clock history)
  clockValues?: ClockValues,               // optional — absent for untimed games
}
```

- Define `GameStateBaseSchema` (strictObject) and `FullGameStateSchema = GameStateBaseSchema.extend({ ... })`, with `GameStateBase` / `FullGameState` as the inferred types. T4 will add `DeadGameStateSchema = GameStateBaseSchema.extend({ icn, ratingChanges? })`.
- Document `GameStateBase` as the canonical role-agnostic typed game core, and note that `MetaData` is deliberately not part of it.
- This overlaps the client's `ServerGameInfo`/`JoinGameMessage` (`src/client/scripts/esm/websocket/socketschemas.ts`). **Leave those untouched here** — de-dup is deferred (see "Follow-up"). Add a short comment pointing at that.

### 2. DRY helper — shared `ServerUsernameContainer` builder

The `identifier → ServerUsernameContainer` construction is currently inlined in `createseek.ts` (~line 143: `{ type: signedIn ? 'player' : 'guest', username: signedIn ? username : metadatautil.GUEST_NAME_ICN_METADATA, rating }`). Extract it into a small server-side helper `buildServerUsernameContainer(identifier: AuthMemberInfo, rating?: Rating): ServerUsernameContainer` and:
- refactor `createseek.ts` to use it (no behavior change), and
- use it in the producer below.

Place it where both seeks and gameutility can import it without a circular dependency (e.g. alongside `seekutility` or a small shared server util — implementer's call). Never expose `browser_id`.

### 3. Live producer — `src/server/game/gamemanager/gameutility.ts`

Add `produceFullGameState(servergame: ServerGame): FullGameState`, composing existing data/helpers (don't reimplement logic):

- `id` / `rated` ← `servergame.match.id` / `servergame.match.rated`
- `variant` ← `servergame.match.variant`
- `timeControl` ← `servergame.match.clock`
- `timeCreated` ← `servergame.match.timeCreated`
- `players` ← per color, `buildServerUsernameContainer(playerData[color].identifier, rating)` where `rating` comes from the existing `getRatingDataForGamePlayers(servergame.match.playerData, servergame.match.variant)` (reuse it).
- `gameConclusion` ← set only if `servergame.gameConclusion !== undefined`
- `moves` ← map each move to a `MovePacket` keeping its `clockStamp`: reuse `simplifyMove(m)` for the `token`, then add `clockStamp` when `m.clockStamp !== undefined` (e.g. `{ ...simplifyMove(m), ...(m.clockStamp !== undefined ? { clockStamp: m.clockStamp } : {}) }`). Do **not** call plain `simplifyMove` alone — it drops `clockStamp`, needed for rewind. Do **not** modify `simplifyMove` itself (other live-path callers rely on its shape).
- `clockValues` ← set only if `!servergame.untimed`, via `getGameClockValues(servergame)` (matches the existing narrowing in `getGameUpdateMessageContents`)

Export by adding `produceFullGameState` to gameutility's existing `export default { ... }` object.

## Out of scope / deferred

- **Do not** modify `sendGameInfoToPlayer`, `getGameUpdateMessageContents`, `JoinGameMessage`, `ServerGameInfo`, or any socket action — they keep working unchanged.
- **No** dead-game/DB producer (T4), HTTP endpoint (T5), socket changes (T6), or client (T7).

## Follow-up (not here — the reason this is additive)

The type overlap with `ServerGameInfo`/`JoinGameMessage` is temporary and tracked: a later task (earliest realistically T6, when the socket protocol is reshaped) refactors the live path onto `FullGameState` + role overlay, collapsing/removing those client definitions. They may be reworked entirely for the new page rather than preserved.

## Constraints

- Follow `CLAUDE.md`: reference source types (never re-export); compose, don't duplicate logic; no `Omit`/`Exclude` (use schema `.extend`); tight jsdoc; tabs.
- Additive except the `createseek` helper refactor, which must not change seek behavior.

## Acceptance

- `npm run type-check --silent` passes.
- `npm run lint --silent` passes (fix any pre-existing warning touched).
- `produceFullGameState` returns a value validating against `FullGameStateSchema`, built by reusing existing helpers + the new container helper.
- `createseek` still produces identical seek output (now via the shared helper).
