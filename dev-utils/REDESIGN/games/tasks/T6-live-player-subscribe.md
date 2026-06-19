# T6 — Subscribe-by-id + live state delivery (players)

Part of the game-page redesign (see `../requirements.md`). Add the **final** socket protocol for the new game page to subscribe to a live game *by id* and receive the full live state. This task covers the **player** path only; spectators are T7. **Server-only** — it does not touch the dormant old client.

## Context

- The old game client (`game/main.ts` + `onlinegamerouter` + `gameloader`) is **dormant** — `main.ts` is commented out of `build/client.ts`, and the only sender of the old `joingame` action is that dormant entry. So no active client consumes the current `JoinGameMessage`.
- Therefore: **leave the old `joingame` action, `JoinGameMessage` schema, `onJoinGame`, and all `onlinegamerouter`/`gameloader` code untouched.** They stay dormant and type-check unchanged. The new client (T9) consumes the new protocol added here and retires the old path then.
- The new protocol added here is the end-state, not throwaway: client subscribes by id → server sends the full state.
- T2 added `produceFullGameState(servergame)` (live `FullGameState`). T6 wraps it with the per-player overlay.

## The new protocol

- **Incoming (client → server):** new game-route action `subscribe` carrying the numeric game id. The client knows the numeric id from `window.gamePageData.id` (injected in T3).
- **Outgoing (server → client):** new game-route action `gamestate` carrying a `SubscribedGameState`.
- Ongoing live deltas (`move`/`clock`/`gameupdate`) already broadcast to the color's player socket — **no change needed**; once attached below, the player receives them via the existing machinery.

## Required changes

### 1. Shared type — `src/shared/types.ts`

Add the subscribe-response shape (extends T2's `FullGameStateSchema`):

```
SubscribedGameState = FullGameState + {
  youAreColor?: Player,                 // present iff the subscriber is a participant
  participantState?: ParticipantState,  // present iff participant (ongoing game)
}
```

`SubscribedGameStateSchema = FullGameStateSchema.extend({ youAreColor: PlayerSchema.optional(), participantState: ParticipantStateSchema.optional() })`. Both fields are populated for players (this task); T7 reuses this exact type for spectators by omitting both. Do **not** include `forceSync` — that's a resync concept; a fresh subscribe carries the whole state.

### 2. Incoming action — `src/server/game/gamemanager/gamerouter.ts`

Add to `GameSchema`: `z.strictObject({ action: z.literal('subscribe'), value: z.number().int().nonnegative() })`. Route it in the "actions that don't require a game" switch (like `joingame`/`resync`, since it resolves the game itself) to a new `onSubscribeToGame(ws, gameId, messageId)`.

### 3. Subscribe handler — new file `src/server/game/gamemanager/subscribetogame.ts`

`onSubscribeToGame(ws, gameId, replyToMessageID?)`:

1. `const servergame = getGameByID(gameId)` (`gamemanager.js`). If `undefined` (not a live game — it may be concluded/served over HTTP instead, or nonexistent), send the existing `'nogame'` game action and return.
2. `const color = gameutility.doesSocketBelongToGame_ReturnColor(servergame.match, ws)`.
3. **Player path** (`color !== undefined`):
   - Attach without the old payload: `subscribeClientToGame(servergame, ws, color, { sendGameInfo: false })` (reuses the existing attach + "another window connected → leavegame" handling + sets `ws.metadata.subscriptions.game`).
   - Send the new state: `sendSocketMessage(ws, 'game', 'gamestate', value, replyToMessageID)` where `value: SubscribedGameState = { ...produceFullGameState(servergame), youAreColor: color, participantState: getParticipantState(servergame, color) }`. (Add a small `sendSubscribedGameState(...)` helper in `gameutility.ts` next to `sendGameInfoToPlayer`, building it via the new producer — do not reuse the old `sendGameInfoToPlayer`.)
   - Run the same reconnect side-effects `onJoinGame` does after attaching: if it's their turn cancel the auto-AFK-resign timer (+ `liveGameValues.onPlayerAFKReturn` if one was active), `cancelDisconnectTimer(match, color)`, and `liveGameValues.onPlayerReconnected(servergame, color)`. To avoid duplicating that block, extract it into a shared helper used by both `onSubscribeToGame` and `onJoinGame` (e.g. in `joingame.ts` or `afkdisconnect.ts`).
4. **Not a player** (`color === undefined`): the subscriber is a spectator → **out of scope for T6**. For now `return` without subscribing (no active client reaches this branch before T7 + T9). Leave a clear `// TODO(T7): spectator subscription` marker. T7 replaces this branch.

## Out of scope / deferred

- Spectators (T7) — the not-a-player branch.
- The client side: sending `subscribe`, handling `gamestate`, wiring `SubscribedGameState`/the new action into client `socketschemas.ts` (T9).
- Removing the dormant old `joingame`/`onlinegamerouter`/`gameloader` path (T9).
- Dead games (already over HTTP, T5).

## Constraints

- **Server-only.** Do not edit client files (`socketschemas.ts`, `onlinegamerouter`, `gameloader`, `main.ts`) or the old `joingame` path.
- Follow `CLAUDE.md`: reference source types; reuse existing helpers (`subscribeClientToGame`, `doesSocketBelongToGame_ReturnColor`, `getParticipantState`, `produceFullGameState`); no `Omit`/`Exclude` (schema `.extend`); tight jsdoc; tabs.

## Acceptance

- `npm run type-check --silent` passes.
- `npm run lint --silent` passes (fix any pre-existing warning touched).
- A socket that sends `subscribe` with the id of a live game it participates in is attached to that game and receives a `gamestate` message validating against `SubscribedGameStateSchema` with `youAreColor` + `participantState` set; an id of no live game yields `nogame`. The old `joingame` path is byte-for-byte unchanged.
