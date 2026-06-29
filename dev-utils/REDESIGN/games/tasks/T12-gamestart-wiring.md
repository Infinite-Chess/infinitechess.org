# T12 — Gamestart wiring + notify sound

Part of the game-page redesign (see `../requirements.md` § "Seek acceptance → game start").
On seek acceptance the server signals both players to navigate to `/game/:id`, plays a notify
sound first, and the players re-subscribe to the live game on the game page.

## Already landed (navigation portion)

The hard-navigate path is done:

- **Server** ([gamemanager.ts](../../../../src/server/game/gamemanager/gamemanager.ts) `createGame`):
  each connected player is sent a `gamestart` **lobby-route** message carrying the numeric game id,
  alongside the existing `subscribeClientToGame`.
- **Client schema** ([socketschemas.ts](../../../../src/client/scripts/esm/websocket/socketschemas.ts)):
  `gamestart` action (value = `GameIDSchema`) added to the lobby union.
- **Lobby client** ([lobby.ts](../../../../src/client/scripts/esm/views/index/lobby.ts) `onGameStart`,
  routed from [index.ts](../../../../src/client/scripts/esm/views/index/index.ts)): hard-navigates to
  `/game/${base62}`. Written `async` so the notify-sound await (below) slots in with no call-site change.

Grace for the navigation gap currently rides on existing machinery, but only **best-effort**. The
navigation closes the lobby socket → `unsubClientFromGameBySocket(ws, { unsubNotByChoice })` →
cushion *or* immediate timer depending on `unsubNotByChoice`; the game page then re-subscribes (T6)
→ `runReconnectSideEffects` → `cancelDisconnectTimer`. The catch: `unsubNotByChoice` comes from
`wasSocketClosureNotByTheirChoice(code, reason)` ([wsutil.ts](../../../../src/shared/util/wsutil.ts)),
which is **true only for close code 1006** (or a few specific reason strings). The lobby page — unlike
the game page — registers *no* `beforeunload` `closeSocket()`, so the browser tears the socket down
on navigation and the server usually sees **1006 → silent 5s cushion** (no opponent alert, canceled
on resubscribe). But a browser that sends a clean **1001 "going away"** (not in the not-by-choice
list) is treated as by-choice → the opponent gets a spurious "opponent disconnected" flash until the
resubscribe fires `opponentdisconnectreturn`. Remaining item 2 below removes this dependence on the
close code entirely.

## Remaining work

### 1. Notify sound (before navigating)

Play a notify sound on `gamestart` and **await it before the hard-navigate** so the navigation
doesn't cut it off, capped at 1.5s.

- **Pick the sound.** Candidate: `'bell'` (already a `SoundName` in
  [gamesound.ts](../../../../src/client/scripts/esm/game/misc/gamesound.ts)) with a touch of reverb
  (`reverbWetLevel` / `reverbDuration`, as `playGlassCrack` does). No dedicated notify sound exists
  yet — `'bell'` + reverb is the candidate to confirm/tune by ear. **Consult before finalizing.**
- **Preload it** in the lobby's existing `gamesound.preload(...)` block (top of
  [lobby.ts](../../../../src/client/scripts/esm/views/index/lobby.ts)) so there's no first-play fetch delay.
- **Play + await** in `onGameStart`: `playSoundEffect` returns a `SoundObject` whose `whenEnded` is a
  `Promise<void>`. Await `Promise.race([sound.whenEnded, <1.5s timeout>])`, then set
  `window.location.href`. Guard the `undefined` return (sound failed to load → navigate immediately).

### 2. Replace the in-place subscribe with the disconnect cushion

Today `createGame` still calls `subscribeClientToGame` on the lobby socket — which sends that socket
the full in-place game state right before it navigates away (wasted payload, and the lobby socket
shouldn't be a 'game' subscriber). Replace it:

- For each **connected** player, drop `subscribeClientToGame` and instead send `gamestart` +
  start the **silent** cushion via `startDisconnectCushionTimerAndPersist(servergame, player)`
  (same module). The re-subscribe on the game page cancels it; a tab-close still auto-resigns after
  the cushion. This keeps the no-show safety net that `subscribeClientToGame` previously provided via
  socket-close, **and makes the silent grace deterministic** — the cushion is armed up front, so it
  no longer depends on the browser's nav teardown happening to produce close code 1006 (the
  best-effort path described above), eliminating the spurious-disconnect-flash edge case.
- **Ordering caveat:** `startDisconnectCushionTimerAndPersist` calls `liveGameValues.onPlayerDisconnected`,
  which persists disconnect state. That must run **after** the game itself is persisted
  (`activeGames[id] = …` + `liveGameValues.onGameCreated`). Move the per-player emit/cushion loop
  below `onGameCreated`, or otherwise sequence it after persistence — don't persist a disconnect for
  a game row that doesn't exist yet.
- This un-blocks **T13 §"Continues / absorbs T9 §5"**: once nothing calls `subscribeClientToGame`
  in-place, T13 can collapse it to `attachClientToGame` and delete `sendGameInfoToPlayer` / the old
  `joingame` payload.

## Checks

`npm run type-check --silent` + `npm run lint --silent` must pass. Lands as one commit.
