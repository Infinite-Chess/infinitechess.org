# T10 — Dead-game (review) load on the client

Part of the game-page redesign (see `../requirements.md`). Wire the **dead/review** path of the game page: for a concluded game, fetch the state over HTTP, parse the ICN for moves, and render via the **existing loader** used for the live game path — no socket.

## Approach

Reuse the existing live-path loader unmodified. `FullGameState` is just `GameStateBase + { moves, clockValues? }`, so a dead game can be **normalized into a `FullGameState`** (base fields straight from `DeadGameState`, `moves` parsed from the ICN, `clockValues` built from `finalClocks`) and handed to the existing `loadGameFromState`. The dead-only extras (`ratingChanges`) are a side-bar display concern.

The ICN is the source of truth **only** for moves + clock stamps (+ custom start position). Everything else — variant, players, time control, conclusion — comes from `DeadGameState`'s authoritative typed fields. So **discard the parsed ICN's metadata tags**; use them for nothing.

## Required changes

### 1. Dead branch in the entry — `views/game/game.ts`

In the `!isLive` branch:
- Fetch `GET /api/game/<base62 id>` (the base62 is in the page URL; or `base10ToBase62(window.gamePageData.id)`).
- Match the rest of the codebase's behavior when parsing fetch responses, whether they validate the json against a schema (we would use DeadGameStateSchema) or just cast to the trusted result. On non-OK (or parse failure if we are parsing), show an error toast and bail (a 404 here means a race or a bad link).
- No socket is opened for dead games. Dead = evicted from memory.

### 2. Parse ICN → moves

Reuse `icnconverter.ShortToLong_Format(deadState.icn)` to get the move list. Take **only** `.moves` (mapped to `MovePacket[]`, preserving `clockStamp`) and, if present, a custom start position (custom position seeks are already allowed, and starting games with them will shortly be allowed, so we must support them). Ignore the parsed `.metadata`.

### 3. Normalize to `FullGameState` + load

Construct a `FullGameState` from the `DeadGameState`:
- base fields (`id, rated, variant, timeControl, timeCreated, players, gameConclusion`) copied straight over (some of these might have since moved into the gamePageData global),
- `moves` = the parsed moves,
- `clockValues` = built from `finalClocks` (`{ clocks: finalClocks }`, no `colorTicking` — game's over). For any color missing from `finalClocks` (guest), fall back to that color's last parsed `clockStamp`.

`role` is **already resolved server-side and injected into `window.gamePageData` (the SSR route matches the viewer's identity against the game's `player_games` rows). Do **not** re-match usernames client-side — read `gamePageData.role` (undefined = white POV).

Call `loadGameFromState(fullGameState, gamePageData.role)`. The conclusion is already set, so it loads into the review/end state. A dead game is always concluded, so its game-meta `.result-banner` skeleton is **SSR'd visible + filled already** (via `gameresultutil.getResultDisplay`, not `.hidden`) — leave it as-is (don't toggle or rebuild it); The move-list handler (guimoveslist.ts) still renders the in-table `.game-result`.

### 4. Rating changes display

The base name + rating in each `.username-embed` is **SSR'd already**; only the rating **delta** is a client concern here. If `deadState.ratingChanges` is present, inject the per-player `.eloChange` into the SSR'd `.username-embed`s (present in both `.player-bar` and `.meta-players`) — **not** via the old `guigameinfo.addRatingChangeToExistingUsernameContainers` (on the `main` branch), which targets the old DOM. Display only — no logic. Do not utilize usernamecontainer.ts, that script is old and depricated for the username embeds on the old website pages.

### Follow-up: resync landing on a dead game

The old `'logged-game-info'` socket path is retired — dead-game state is served over HTTP, and a
resync to a game no longer in memory now just gets `unsub` (it was logged/concluded → client keeps
the result it's showing) or `nogame` (never logged → aborted before any move). See `onSubscribe.onSubscribeToGame()`. Also at this stage, we need to decide with the user whether to do away with the 'nogame' websocket message action or keep it.

Gap to close here: a client that resyncs a game it believed **live** (and was live at the time of SSR'ing) but which has since concluded + been evicted (before the http fetch was received) may **not** have seen the conclusion —
a bare `unsub` leaves it stuck on a stale live-looking board. It should instead receive the dead state (or be
redirected to `GET /api/game/:id`). This couples with the finalization work (clients that know a game is finalized
stop full-resyncing it and ask only for rematch state), so decide the two together. Present the options we have to the user, including brief up and downsides of each, and your own recommendation.

## Constraints

- No socket for dead games. Reuse `loadGameFromState`; do **not** fork a second loader.
- ICN → moves (+ custom position when applicable) only; authoritative fields come from `DeadGameState`.
- Follow `CLAUDE.md`: reference source types; reuse; tight jsdoc; tabs.

## Acceptance

- `npm run type-check --silent` passes.
- `npm run lint --silent` passes (fix any pre-existing warning touched).
- Loading `/game/<concluded id>` fetches `DeadGameState`, parses the ICN for moves, and renders the finished game (board, move history, final clocks, conclusion) via the existing loader with no socket opened; rating changes (if any) show in the side bar.
