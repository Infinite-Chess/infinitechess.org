# Game-page redesign — task overview

Each task is its own `T#-*.md` doc and is meant to land as a single commit that passes `npm run type-check` + `npm run lint`. See `../requirements.md` for the decisions behind them. Order is dependency order (later tasks may depend on earlier ones).

## T7 — Spectator support (server) ([T7-spectators.md](T7-spectators.md))
Server-only. Add a transient `spectators: Set<CustomWebSocket>` to `ServerGame` and a `spectating?: { id }` subscription marker. Fill T6's not-a-player branch: add to the set, send the initial `gamestate` with no overlay. Broadcast role-agnostic updates via `broadcastToSpectators` (reusing `move`/`gameratingchange` verbatim; move-triggered conclusions ride on `move`); non-move conclusions send a lean `gameconclusion` message (`gameConclusion` + final clocks only — spectators can't desync, so no full re-send). Never send spectators `participantState`/AFK/disconnect/draw-offer. Cleanup on unsub (`handleUnsubbing` `spectating` case), socket close, and `deleteGame`.

## T8 — Game-page UI structure (canvas + side bar) ([T8-game-page-structure.md](T8-game-page-structure.md))
Replace T3's empty `<main>` with the WebGL `<canvas>` + side bar (clocks, move history, chat, material) — **markup + CSS layout only, no behavior**. The implementing agent **must consult the user on the side-bar design** (using `design.md` "## Games" as a starting reference) rather than inventing it.

## T9 — Client entry + new loader (live player) ([T9-client-entry-live-player.md](T9-client-entry-live-player.md))
The game page gets its **own** slim entry (NOT `main.ts`; reuses the rendering bootstrap modules) and a **new purpose-built loader** that consumes `FullGameState` directly — building the `MetaData` the gamefile primitive needs from the typed fields (via `clientmetadatautil`) and calling `gameslot.loadGamefile` (no adapter to the old `startOnlineGame`). Wires the live player path: `subscribe {id}` → `gamestate` → loader → render; reuses `onlinegamerouter`'s `move`/`clock`/`gameupdate` delta handlers. Import-graph slimming is a **separate later refactor with the user**.

## T10 — Client dead/review load ([T10-client-dead-review.md](T10-client-dead-review.md))
The `!isLive` branch: fetch `GET /api/game/:id`, validate `DeadGameState`, parse the ICN **for moves only** (authoritative everything-else from the typed fields), normalize into a `FullGameState` (base + parsed moves + `clockValues` from `finalClocks`), and reuse T9's loader (no socket). Determine `youAreColor` for board orientation only; surface `ratingChanges` in the side bar.

## T11 — Client spectator view ([T11-client-spectator.md](T11-client-spectator.md))
A spectator's `gamestate` has no `youAreColor`, so T9's loader already renders white-POV. T11 adds: **read-only** enforcement (no `submitmove`/resign/abort/draw), verifying the reused delta handlers work with no self-color, and a new `gameconclusion` handler that **applies a non-move conclusion in place** (`gameConclusion` + final clocks from T7) without rebuilding the board.

## T12 — Gamestart wiring + notify sound (NOT YET WRITTEN — needs finalizing)
Design is mostly settled but the task doc still needs to be written. Direction: on seek acceptance, `createGame` sends both players a new `gamestart {id}` message (a lobby-route action) instead of the in-place `subscribeClientToGame`; the lobby client preloads a reverb notify, on `gamestart` **plays it and awaits it (1.5s cap, via T1's `whenEnded`)**, then hard-navigates to `/game/:id` (where it subscribes via T6). **Open detail to finalize:** the "initial join" grace — leaning toward reusing the existing **not-by-choice disconnect cushion** (`startDisconnectCushionTimerAndPersist`, ~5s silent grace before alerting the opponent / starting the auto-resign timer) at game creation, so a fast navigation reconnects silently and only a slow/no-show triggers the disconnect UX. `cancelDisconnectTimer` already clears the cushion (`startID`) on reconnect, so T6's reconnect side-effects cancel it. Pick the notify sound (`'bell'` + reverb is the candidate; no dedicated notify sound exists yet). Write up `T12-*.md` on this basis.
