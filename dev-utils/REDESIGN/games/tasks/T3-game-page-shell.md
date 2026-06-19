# T3 — `/game/:id` page shell

Part of the game-page redesign (see `../requirements.md`). Stand up the new `/game/:id` page as an **empty shell only** — the same minimal scaffold every other page already has. It renders, 404s correctly, and wires a client entry into the build. It does **not** load or render any game state, and does **not** design the game UI.

## Scope guardrail (read first)

"Shell" means the standard empty page scaffold (like `src/server/views/play.njk` / `login.njk`): `{% extends "layout.njk" %}`, header, an empty `<main>`, footer, plus the page's style/script blocks. **Do NOT design the game interface** — no canvas, move bar, chat, clocks, or any game-specific layout. That is a later task. If you feel tempted to add game-UI structure, stop — it's out of scope.

## Required changes

### 1. Route — `src/server/routes/root.ts`

Register `page('/game/:id', handler)` (the existing `page()` helper runs `resolveAuth` + `attachRenderContext`, so the header renders its correct auth state). The handler:

1. **Validate the id (format).** Use a new shared helper `decodeGameId(idStr: string): number | undefined` — define it in `src/server/database/gamesManager.js` (it owns game-id concerns and already imports `game_id_upper_cap`). It is reused by T5's API endpoint, so it must live here, not be inlined. It returns the numeric id, or `undefined` if invalid. Internally: decode with `base62ToBase10` from `src/shared/util/uuid.ts` inside a try/catch (throws on invalid chars), and return `undefined` unless all hold:
   - decode succeeds,
   - result is `>= 0` and `< game_id_upper_cap`,
   - it is the **canonical** encoding: `base10ToBase62(decoded) === idStr` (rejects non-canonical forms like leading zeros, so each game has exactly one valid URL).

   In the route: `const decoded = decodeGameId(req.params.id);` — `undefined` ⇒ `send404` (step 3).
2. **Existence + liveness check.**
   - Live: `getGameByID(decoded)` from `src/server/game/gamemanager/gamemanager.js` — defined ⇒ live.
   - Else dead: `isGameIdTaken(decoded)` from `src/server/database/gamesManager.js` (export it if it isn't already) ⇒ dead.
   - Neither ⇒ the game doesn't exist.
3. **404 in place** for an invalid id OR a nonexistent game: call `send404(req, res)` (`src/server/middleware/send404.js`). This renders the error page at the same URL with a 404 status — no redirect. (Confirm `send404` is importable here; it already powers the catch-all.)
4. **Render the shell** for a real game: `res.render('game.njk', { ... })`, passing the data injected in step §3 of the template below.

### 2. Template — `src/server/views/game.njk`

Mirror the minimal scaffold of `play.njk`:

- `{% extends "layout.njk" %}`
- `{% set pageName = "Game" %}` (a literal for now; richer title/meta from game state is a later task)
- `{% block style %}` → `<link rel="stylesheet" href="{{ manifest['css/game.css'] }}" />`
- `{% block body %}` → `{% include "components/header/header.njk" %}`, an empty `<main class="game"></main>`, `{% include "components/footer/footer.njk" %}`
- `{% block script %}` → `<script type="module" src="{{ manifest['scripts/esm/views/game/game.ts'] }}"></script>`
- **SSR→client data channel:** inject the minimal data the client will need, following the existing `window.X = {{ value | json | safe }}` pattern used in `layout.njk`. Inject just `window.gamePageData = { id: <numeric id>, isLive: <bool> }` (the numeric decoded id, and whether it's a live game). This is the minimal channel; a later task extends it. Nothing else.

### 3. Client entry skeleton — `src/client/scripts/esm/views/game/game.ts`

A near-empty module: read `window.gamePageData` and do nothing meaningful yet (a `console.debug` of the value is fine, to prove the channel). **No game logic, no socket, no fetch** — those are later tasks. Add the standard file-path line-1 comment + a brief purpose comment (lines 3-7) per repo convention.

### 4. Stylesheet — `src/client/css/game.css`

A minimal stylesheet with the single top-level `.game { }` block (matching the `<main class="game">`), per the per-page CSS methodology in `stack.md`. May be essentially empty; do not style a game UI that doesn't exist yet.

### 5. Build wiring — `build/client.ts`

Add two entries to the entry-points array (alongside the existing ones):
- `'src/client/css/game.css'`
- `'src/client/scripts/esm/views/game/game.ts'`

## Out of scope / deferred

- Any game UI, canvas, panels, clocks, chat, move list.
- Loading/rendering game state (live socket = T6; dead fetch = T5; client render = T7).
- Role resolution, spectator handling.
- Rich `<title>`/og meta from game data.
- Translations (TOML) for the page — literal strings are fine for now.

## Notes for the implementer

- `isLive` is a best-effort hint at SSR time (a game could conclude between SSR and the client connecting); the later client task treats it as a starting hint, not gospel. Inject it anyway — the route already computed it, so re-looking-up later would be redundant.
- The existence check here (cheap: memory map + one indexed `EXISTS` query) is purely for the 404 decision; the later delivery tasks do their own full fetch. That's not redundant — different operations.

## Constraints

- Follow `CLAUDE.md`: match existing structure/conventions, tight comments, tabs, reference source types.
- Each created file gets its line-1 path comment (auto via hook) and a brief purpose blurb.

## Acceptance

- `npm run type-check --silent` passes.
- `npm run lint --silent` passes (fix any pre-existing warning touched).
- Building the client succeeds and `dist/manifest.json` contains the new `scripts/esm/views/game/game.ts` and `css/game.css` entries.
- Visiting `/game/<valid live or dead id>` renders the empty shell (header + empty main + footer); `/game/<malformed>` and `/game/<valid-format but nonexistent>` render the 404 page in place (404 status, URL unchanged).
