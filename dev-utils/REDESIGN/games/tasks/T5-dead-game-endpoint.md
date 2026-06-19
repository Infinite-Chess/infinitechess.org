# T5 — `GET /api/game/:id` endpoint + rate limiter

Part of the game-page redesign (see `../requirements.md`). Expose the dead-game state over HTTP. The client fetches this for **concluded** games (live games use the WebSocket instead — T6). Depends on T4 (`produceDeadGameState`) and reuses the `decodeGameId` helper from T3.

Pattern to mirror: the existing `GET /api/seek-preview/:seekId` one-off endpoint (handler `src/server/api/SeekPreviewAPI.ts`, wired in `src/server/routes/api.ts` with `seekPreviewLimiter`).

## Required changes

### 1. Handler — `src/server/api/GameAPI.ts`

Add `getGameState(req, res)` for `GET /api/game/:id` (`:id` is base62, same as the page URL):

1. **Validate id:** `decodeGameId(req.params.id)` (the shared helper from T3, in `gamesManager.js`). `undefined` ⇒ `res.status(400).send(...)` (malformed format).
2. **Build state:** `produceDeadGameState(decoded)` (T4). `undefined` ⇒ `res.status(404).send(...)` — the game isn't a logged concluded game. (A still-live game isn't in the `games` table yet, so it also 404s here; that's fine — the client only calls this endpoint for dead games.)
3. **Respond:** `res.json(deadGameState)`. Do **not** set any explicit `Cache-Control` header — let the browser re-request. A concluded game's *moves* never change, but player display names can (account deletion now → `"(Deleted User)"`; user-changeable usernames in the future), so we don't want a stale name pinned in cache.

No `resolveAuth`: dead games are public to view (the `private` column is always `0` today; private-invite gating is a deferred future feature — out of scope).

### 2. Rate limiter — `src/server/middleware/rateLimiters.ts`

Add a dedicated limiter following the existing pattern:

```ts
/** Dead-game state fetch limiter. Responses can be large; tighter than the global 200/min fallback. */
export const gameStateLimiter = rateLimit({
	windowMs: 1000 * 60, // 1 minute
	max: 30,
	...default_options,
});
```

`max: 30/min` is a starting point (in line with `editorLoadLimiter`): generous for a human opening several finished games, tight against scraping the id space. Since responses aren't cached, every request hits the origin (DB reads + a potentially large payload), so this limiter matters more than it would with edge caching. Tune the number if desired.

### 3. Wire it — `src/server/routes/api.ts`

In the "one-off endpoints" section, alongside the seek-preview route:

```ts
router.get('/game/:id', gameStateLimiter, getGameState);
```

## Out of scope / deferred

- Live games (T6 socket), client fetch/render (T7).
- Private-game access gating (no private games exist yet).

## Constraints

- Follow `CLAUDE.md`: match the existing API/limiter conventions, reference source types, tight jsdoc, tabs.

## Acceptance

- `npm run type-check --silent` passes.
- `npm run lint --silent` passes (fix any pre-existing warning touched).
- `GET /api/game/<base62 of a concluded game>` returns the `DeadGameState` JSON (no explicit `Cache-Control` set); a malformed id ⇒ 400; a valid-format but non-concluded/nonexistent id ⇒ 404.
