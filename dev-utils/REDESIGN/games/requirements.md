# Game Page — Requirements

Running list of decided requirements for the redesigned game page.

## URL

- One canonical URL per game, regardless of role: `/game/:id`.
- `:id` is the numeric game id encoded in base62 (4 chars; ids span 0–62^4). Codecs already exist: `base10ToBase62` / `base62ToBase10` in `src/shared/util/uuid.ts`.
- Invalid / nonexistent id → render the 404 page in place (no redirect; URL stays).

## Role resolution (player vs. spectator)

- Resolved server-side from the refresh-token cookie identity (signed-in `user_id`, or `browser-id` for guests), matched against the game's player list. No role-specific URL or URL-embedded secret.
- Guests rely on the `browser-id` cookie (already auto-renewed on every page load; works fine).
- Spectators view from white's perspective (pure client JS after load).
- Player vs. spectator may differ only subtly. Build one base state; branch spectator tweaks in later.

## State delivery

- Neither shape sends a `MetaData` object — `MetaData` is the ICN's eyeball-only tag format, not the source of truth. Both spread the authoritative game properties as typed fields.
- Shared `GameStateBase` (typed core, both live & dead): `id`, `rated`, `variant`, `timeControl`, `timeCreated`, `players: PlayerGroup<ServerUsernameContainer>` (reuses the seek type; rating embedded per player), `gameConclusion?`.
  - **Live** `FullGameState` = base + `moves: MovePacket[]` (each carrying its `clockStamp`) + `clockValues?` (live ticking). Over the WebSocket on subscribe, then live deltas. Built from the in-memory `activeGames` entry. No HTTP endpoint.
  - **Dead** = base + `icn: string` + `ratingChanges?: PlayerGroup<PlayerRatingChangeInfo>` + `finalClocks?: PlayerGroup<number>` (clock at end — for non-move endings the ICN move stamps don't capture it). Over the HTTP endpoint (`GET /api/game/:id`), no socket. Built from the games-table columns + `player_games` + `members` — the server does NOT parse the ICN. The client parses the ICN only for moves + clock stamps (and the start position only for custom-position games; otherwise the variant code is source of truth). The ICN duplicating these fields in its own tags is fine (eyeball-only). No explicit `Cache-Control` — let the browser re-request: a game's moves are fixed, but player display names can change (account deletion; future username changes), so we don't pin stale names in cache.
- `FullGameState` and the dead type both extend `GameStateBase` (CLAUDE.md: one type extends the other). Base + live land in T2; dead in T4.
- Clock display rule: per-move `clockStamp` drives the clock shown when rewinding to any past move (live or dead); the live ticking `clockValues` governs only the current/front position.
- A socket must be able to subscribe to any requested game id (to spectate), not just the game its own identity is in. Today `joingame` infers the game from socket identity — it needs to accept a requested id.
- The state method sends raw (no app-level compression). States can be large (hundreds of KB on huge games), but compressing costs server CPU; not worth it. HTTP responses are still gzipped automatically by Cloudflare's edge.
- `GET /api/game/:id` needs its own rate limiter in `rateLimiters.ts` — responses can be large, so the global 200 req/min fallback in `rateLimit.ts` is too loose against bot abuse.

## Seek acceptance → game start

- On acceptance, server sends both players a socket message (example `{ action: 'gamestart', id }`).
- Clients hard-navigate to `/game/:id` (MPA hard navigation). Existing reconnect machinery handles the reload.
- On gamestart, play a notify sound (with a bit of reverb — already supported) *before* navigating, and await it so the hard-navigate doesn't cut it off. Cap the wait at 1.5s. Preload the sound on the lobby so there's no fetch delay.

## Architecture

- MPA, not SPA. No client-side router / in-page lobby→game transition.

## Client (game page)

- The game-page client must **not** reuse `main.ts` — that entry imports the entire old SPA (board editor, engines, every variant, etc.). A 2-human game page needs only a slim subset, so it gets its own dedicated entry that selectively reuses rendering modules. Importing the whole graph would bloat first load for no reason.
- The page's UI structure (canvas + side bar with clocks/moves/chat/material) is its **own task**, done before the client-render wiring. The side bar layout is genuine UI design — that task must consult on the design rather than inventing it. (The shell task, T3, deliberately did none of this.)

## Private invites

- Private "Challenge a friend" invites get a pre-start URL at `/game/:id`: on seek creation the owner is navigated there; the page shows seek info + share options (owner) or seek info + accept option (visitor). On accept, both clients reload into the now-live, re-SSR'd game.
