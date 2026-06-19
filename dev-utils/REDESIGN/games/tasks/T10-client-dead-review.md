# T10 — Dead-game (review) load on the client

Part of the game-page redesign (see `../requirements.md`). Wire the **dead/review** path of the game page: for a concluded game, fetch the state over HTTP, parse the ICN for moves, and render via the **same new loader** from T9 — no socket.

Depends on T9 (entry + `loadGameFromState` + the new loader) and T5 (`GET /api/game/:id` → `DeadGameState`).

## Approach

Reuse T9's loader unmodified. `FullGameState` is just `GameStateBase + { moves, clockValues? }`, so a dead game can be **normalized into a `FullGameState`** (base fields straight from `DeadGameState`, `moves` parsed from the ICN, `clockValues` built from `finalClocks`) and handed to the existing `loadGameFromState`. The dead-only extras (`ratingChanges`) are a side-bar display concern.

The ICN is the source of truth **only** for moves + clock stamps (+ custom start position). Everything else — variant, players, time control, conclusion — comes from `DeadGameState`'s authoritative typed fields. So **discard the parsed ICN's metadata tags**; use them for nothing.

## Required changes

### 1. Dead branch in the entry — `views/game/game.ts`

In the `!isLive` branch (stubbed in T9):
- Fetch `GET /api/game/<base62 id>` (the base62 is in the page URL; or `base10ToBase62(window.gamePageData.id)`).
- Validate the JSON against `DeadGameStateSchema` (from `shared/types.ts`, T4). On non-OK / parse failure, show an error toast and bail (a 404 here means a race or a bad link).
- No socket is opened for dead games.

### 2. Parse ICN → moves

Reuse `icnconverter.ShortToLong_Format(deadState.icn)` (as the dormant `handleLoggedGameInfo` does) to get the move list. Take **only** `.moves` (mapped to `MovePacket[]`, preserving `clockStamp`) and, if present, a custom start position. Ignore the parsed `.metadata`.

### 3. Normalize to `FullGameState` + load

Construct a `FullGameState` from the `DeadGameState`:
- base fields (`id, rated, variant, timeControl, timeCreated, players, gameConclusion`) copied straight over,
- `moves` = the parsed moves,
- `clockValues` = built from `finalClocks` (`{ clocks: finalClocks }`, no `colorTicking` — game's over). For any color missing from `finalClocks` (guest), fall back to that color's last parsed `clockStamp`.

Determine `youAreColor` for board orientation only (the game is over — no controls): match the viewer's identity to `players` (logged-in username vs `players[color].username`); fall back to white POV if not a participant.

Call `loadGameFromState(fullGameState, youAreColor)` (T9). The conclusion is already set, so it loads into the review/end state.

### 4. Rating changes display

If `deadState.ratingChanges` is present, surface the per-player rating deltas in the side bar (reuse the existing rating-change UI, e.g. `guigameinfo.addRatingChangeToExistingUsernameContainers`, if it fits). Display only — no logic.

## Out of scope / deferred

- Spectator live view (T11), gamestart (T12).
- The dormant `'logged-game-info'` socket path stays as-is (retired later).
- Analysis-board / share buttons, full review controls polish — later.

## Constraints

- No socket for dead games. Reuse T9's `loadGameFromState`; do **not** fork a second loader.
- ICN → moves only; authoritative fields come from `DeadGameState`.
- Follow `CLAUDE.md`: reference source types; reuse; tight jsdoc; tabs.

## Acceptance

- `npm run type-check --silent` passes.
- `npm run lint --silent` passes (fix any pre-existing warning touched).
- Loading `/game/<concluded id>` fetches `DeadGameState`, parses the ICN for moves, and renders the finished game (board, move history, final clocks, conclusion) via the T9 loader with no socket opened; rating changes (if any) show in the side bar.
