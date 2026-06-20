# T11 — Spectator view on the client

Part of the game-page redesign (see `../requirements.md`). Make the live game page work for a **spectator** — someone subscribed to a live game they don't play in. Most of the loading already works through T9; this task adds the spectator-specific behaviors.

Depends on T9 (entry + `loadGameFromState` + live deltas) and T7 (server spectator broadcasts).

## What already works via T9

When a non-participant sends `subscribe {id}` (T9's entry), the server (T7) replies with a `gamestate` whose overlay is **omitted** (`youAreColor`/`participantState` absent). T9's `loadGameFromState(state, undefined)` then loads with `viewWhitePerspective = true` (white POV) — so the board renders correctly for a spectator already. T11 only adds the behaviors below.

## Required changes

### 1. Spectator (read-only) mode

When `gamestate.youAreColor` is `undefined`, the page is a spectator: it must be **read-only**. Ensure no participant-only action can be taken or sent:
- No move submission (selection/drag must not send `submitmove`).
- No resign / abort / draw-offer / draw-accept controls (hide/disable them).

Gate these on "are we a participant" (`youAreColor !== undefined`). Wire the online-game state so a `gamestate` with no `youAreColor` puts the page in spectator mode (e.g. `onlinegame.initOnlineGame` called with `youAreColor: undefined`, and the existing participant checks naturally block actions — verify they do).

### 2. Live deltas as a spectator

Spectators receive the same role-agnostic `move` / `gameratingchange` messages (T7), handled by the reused `onlinegamerouter` handlers (T9). Verify these work with **no self-color**: every `move` is someone else's, so the handler should just apply + animate it and update clocks. Fix any participant-centric assumption that breaks for a spectator (e.g. "it's now our turn" logic should be a no-op, not an error).

### 3. Conclusion while spectating

For **move-triggered** conclusions, the `move` message already carries `gameConclusion` → handled by the move handler, no extra work.

For **non-move** conclusions (resign/time/agreement/abort), T7 sends spectators a lean `gameconclusion` message (`GameConclusionMessage` = `gameConclusion` + final `clockValues`; no moves, no full state — the game is already loaded and a spectator can't desync). Add a `gameconclusion` handler that simply concludes the loaded game (`gamefileutility.setConclusion` + conclude) and applies the final clock values — no board rebuild. Wire the incoming `gameconclusion` action (carrying `GameConclusionMessageSchema`) into the client `GameSchema` in `socketschemas.ts` (T9 wires only `gamestate`, since `gameconclusion` is spectator-only).

## Out of scope / deferred

- Spectator count / "who's watching" UI, spectator chat — future.
- Gamestart navigation + sound (T12).
- Switching between spectating and playing in the same page session.

## Constraints

- Read-only must be airtight: a spectator must be unable to send `submitmove`/`resign`/`abort`/draw actions.
- Reuse T9's loader + the existing delta handlers; only add the spectator gating + the conclusion-sync guard.
- Follow `CLAUDE.md`: reference source types; reuse; tight jsdoc; tabs.

## Acceptance

- `npm run type-check --silent` passes.
- `npm run lint --silent` passes (fix any pre-existing warning touched).
- Subscribing to a live game you don't play in renders it from white's POV, read-only (no controls, no `submitmove` possible); incoming moves/clocks update the board live; a non-move conclusion concludes the game in place without a full reload. (Runtime depends on T6/T7.)
