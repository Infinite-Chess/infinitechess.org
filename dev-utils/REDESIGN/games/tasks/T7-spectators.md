# T7 — Spectator support (live games)

Part of the game-page redesign (see `../requirements.md`). Let any socket subscribe to a live game it is **not** a participant in, as a spectator: receive the initial state + live updates, but never player-private data, and never the ability to act. Fills the not-a-player branch left by T6. **Server-only.**

Depends on T6 (subscribe-by-id, `produceFullGameState`, `SubscribedGameState`, the new `subscribe`/`gamestate` actions).

## Model

- A spectator is **not** a player (no color, no `match.playerData` entry). Spectators are tracked in a per-game transient set, fed a read-only stream of the role-agnostic updates.
- Spectators receive: the initial `gamestate`, each `move`, the conclusion, and rating changes. They **never** receive `participantState`, AFK, disconnect, or draw-offer messages (those target player sockets only — no change needed there, just don't add spectator sends to them).

## Required changes

### 1. Per-game spectator set — `ServerGame` (`gameutility.ts`) + `initServerGame`

Add a transient `spectators: Set<CustomWebSocket>` to the `ServerGame` type, initialized to `new Set()` in `initServerGame` (covers both fresh games and DB-restored ones). It lives on the in-memory game object only — **not** in `match`, so it's never persisted/restored (confirm `liveGameValues` persistence doesn't serialize it).

### 2. Spectator subscription marker — `socketUtility.ts`

Add `spectating?: { id: number }` to `metadata.subscriptions` (a sibling of `game`, not an overload of it — keeps the player `game.color` type untouched, zero ripple to player code). It enables O(1) cleanup-on-close.

### 3. Fill the subscribe branch — `subscribetogame.ts` (T6)

In `onSubscribeToGame`, the `color === undefined` branch (currently a `// TODO(T7)` stub) becomes the spectator path:
- add the socket to `servergame.spectators`,
- set `ws.metadata.subscriptions.spectating = { id: gameId }`,
- send the initial state: `sendSocketMessage(ws, 'game', 'gamestate', produceFullGameState(servergame), replyToMessageID)` — i.e. a `SubscribedGameState` with `youAreColor`/`participantState` **omitted** (spectator view). Idempotent if already spectating.

### 4. Spectator broadcast helper — `gameutility.ts`

Add `broadcastToSpectators(servergame, action, value)`: iterate `servergame.spectators` and `sendSocketMessage(spectatorWs, 'game', action, value)` to each.

Insert spectator broadcasts at the existing player-broadcast sites, reusing the same role-agnostic payloads:
- **Move** — in `movesubmission`, right after `sendMoveToColor(servergame, opponentColor, moveRecord)`: broadcast the same `'move'` (`OpponentsMoveMessage`) to spectators. Extract the message construction currently inside `sendMoveToColor` into a small `buildMoveMessage(servergame, move)` reused by both (DRY), then `broadcastToSpectators(servergame, 'move', buildMoveMessage(...))`. This carries `gameConclusion` for move-endings, so move-triggered conclusions are covered here.
- **Non-move conclusion** — in `teardownGame` (`gamemanager.ts`), inside the `!isConclusionMoveTriggered` branch where `broadcastGameUpdate` fires: also `broadcastToSpectators(servergame, 'gameconclusion', <lean message>)`. Spectators are read-only and can't desync, so they need only the conclusion + frozen final clocks, **not** a full-state re-send: send the minimal `GameConclusionMessage` (`{ gameConclusion, clockValues? }`), not `produceFullGameState`. (This avoids the redundant rating-recompute DB read and keeps the spectator stream symmetric with participants — delta-only after the initial subscribe.)
- **Rating change** — at the `sendRatingChangeToAllPlayers` site (in `deleteGame`): `broadcastToSpectators(servergame, 'gameratingchange', <same value sent to players>)`.

(Standalone `'clock'` ticks are **not** broadcast to spectators — they stay clock-synced via the `clockValues` on each `'move'`. A future refinement could add finer clock sync; not needed now.)

### 5. Cleanup

- **Unsub / socket close** — `handleUnsubbing` (`generalrouter.ts`): add a `case 'spectating'` that removes the socket from its game's `spectators` set and clears `subscriptions.spectating`. (Use `subscriptions.spectating.id` → `getGameByID` to find the set.) The close path (`unsubSocketFromAllSubs`) iterates subscription keys and already calls `handleUnsubbing` per key, so this auto-covers disconnects. Also add `'spectating'` to `validUnsubs` so a client can explicitly unsub (the client send itself is T9).
- **Game deletion** — in `deleteGame`, mirror the player unsub loop for spectators: send each spectator the `'unsub'` game action, then clear `servergame.spectators`.

## Out of scope / deferred

- Client side (sending `subscribe` as a non-participant, handling spectator `gamestate`/`move`/`gameratingchange`, wiring new actions into client `socketschemas.ts`) — T9.
- Spectator count limits, spectator chat, "who's watching" lists — future.
- Standalone clock-tick sync to spectators — future refinement.

## Constraints

- **Server-only.** No client files.
- Spectators must never receive `participantState`, AFK, disconnect, or draw-offer messages. Verify no spectator broadcast is added at those sites.
- Follow `CLAUDE.md`: reference source types; reuse helpers; DRY (extract `buildMoveMessage`); tight jsdoc; tabs.

## Acceptance

- `npm run type-check --silent` passes.
- `npm run lint --silent` passes (fix any pre-existing warning touched).
- A socket that subscribes to a live game it doesn't participate in is added to `spectators`, receives a `gamestate` with no overlay, then receives `move`/conclusion/`gameratingchange` updates; it receives no AFK/disconnect/draw-offer/`participantState` messages. On unsub, socket close, or game deletion, it's removed from the set. The player path (T6) is unchanged.
