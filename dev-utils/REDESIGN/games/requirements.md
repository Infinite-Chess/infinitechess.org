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

## Side bar — item inventory

Items the side bar must host, in no particular order.

- **Board-view navigation** — undo transition, expand-to-fit-all, recenter. (Ported from the old play page's top navigation bar.)
- **View toggles** — arrow-indicators mode (defense / all / all + hippogonals / off), perspective mode, annotations mode (mobile only), collapse rays (mobile only). (Ported from the old play page's navigation bar.)
- **Game metadata** — time control, mode (rated vs. casual), speed (blitz, rapid, …). Basically, the seek's properties. Mode (rated vs. casual) does **not** get its own badge/icon. Also hosts the result banner when the game is over.
- **Player username containers** (per color) — name + clock + rating, with the rating-change delta (e.g. `+27`) shown on game end. No avatar/profile icon — the redesigned containers do not get one. `usernamecontainer.ts` is the OLD, DEPRECATED script for the old website's containers; take inspiration from its delta display but do not migrate it. The Player row on the homepage lobby is the best example right now of username containers, but the logic for the redesigned containers has not yet been normalized/written.
- **Spectator count** — shown when there are any spectators. Should look exactly like the viewer count above the lobby on the home page: an eye icon followed by a number, the whole thing carrying a `title` attribute.
- **Moves list** — Lichess-style. Top row: navigation buttons — rewind to beginning, rewind one ply, forward one ply, forward to front. Below: the move table — a leftmost column for the full-move number, then two ply columns (white, black). Each move is prefixed with a tiny silhouette of the piece type that moved (same technique as the variant-preview promotion tooltips); coordinates too long are truncated, with the full value via the `title` attribute on hover. Moves are clickable to jump to that position; the current ply is styled distinctly to stand out. A result line below all the moves on game end (score `0-1`, who won, and how).
- **Material captured per side** — silhouette style, like the variant-preview promotion tooltips. Rule: each side shows only its *surplus* after canceling like piece types against the other side; the side that is net ahead in points also shows a `+X` (estimated point lead), and the side that is behind shows no negative `-X`.
- **Chat system.** See its individual requirements in `chat_system.md`. On top of that: it also contains *static* notifications — a passive log/history of events like draw offers/rejections and rematch offers/rejections (no action buttons; the live accept/reject prompt lives in the game-actions area).
- **Game actions:**
  - Offer draw — plus a separate *live* item for the opponent's incoming draw offer, containing accept/reject buttons (distinct from the chat's static offer log).
  - Resign / Abort — mutually exclusive, sharing one slot: **abort** shows while the game is resignable (0–1 plies played, at least one player has not moved); **resign** otherwise.
  - Rematch — game over, opponent still connected. Grouped with the analysis-board button.
  - Analysis board — game over; jump to the analysis board.
- **Opponent-disconnect status** — Informs you when your opponent disconnected and in how many X seconds you will be able to claim victory. When the timer expires, instead of auto-resigning the player, show buttons to **claim victory** or **call a draw**. This is only visible if it is the opponent's turn, but that doesn't affect whether the timer is ticking on the server backend.

## Side bar — structure

Bar on the **left**, **fixed width** (340px); the canvas fills the remaining right side, top to bottom. The bar's background **is** the checkerboard background (the same one used on the other pages), so it scrolls with the bar rather than being a fixed page-wide layer behind it. The canvas's container gets its **own separate copy** of the checkerboard background.

Vertical zones, top → bottom:

1. **Board-view navigation + view toggles** — top of the bar.
2. **Game metadata** — also hosts the spectator count, and the game-over result banner.
3. **Opponent username container** — name + rating + clock + material captured.
4. **Moves list** — *scrolls* to fill slack (nav row on top, move table below, result line at the bottom on game end).
5. **Game actions** — offer-draw / resign-or-abort (the live incoming draw offer with accept/reject *replaces* these while active); rematch + analysis board when over.
6. **Opponent-disconnect status** — status text + claim-victory/draw buttons.
7. **Your username container** — name + rating + clock + material captured.
8. **Chat** — bottom; *scrolls* (log + static notifications).

Everything except the moves list and chat is fixed-height; those two flex to fill the leftover vertical space. Each has a **minimum height**; when there isn't enough screen height for them to expand, the bar overflows and the **whole bar becomes scrollable** (rather than nesting independent scroll regions inside a too-short bar).

**Responsive design is deferred** — to be planned only after this full-size desktop layout is finalized and built.

The three page states (open-invite / live / over) are a property of the **game page as a whole**, not this bar's structure — separate scope, not decided here.

## Asset inventory — SVGs

Icons the side bar needs, split by how they're sourced. (Anything not listed is pure text, no icon: rated/casual mode, username-container avatar, rematch, analysis board, claim-victory, call-a-draw.)

### Reuse existing (no work)

- **`svg-eye`** (`header.njk`) — spectator count.
- **Speed icons** — `svg-speed-bullet` / `-blitz` / `-rapid` / `-classical` / `-infinite` (`header.njk`) — game-metadata speed.
- **Board-view nav (Zone 1):** `#back` (undo transition), `#expand` (fit-all), `#recenter` (old `play.ejs`).
- **Mobile-only toggles** (deferred): `#annotations` (pencil), `#erase`, `#collapse` (old `play.ejs`).
- **Piece silhouettes** — `svgcache.getSilhouetteSVG()`, dynamic; covers the moves-list per-move prefix **and** material-captured. No art needed.

### Trivial — hand-written by the agent (kept consistent with each other)

- **Moves-list nav row — all 4 buttons:** skip-to-beginning, rewind one ply, forward one ply, skip-to-front. Authored fresh (not reused from the old play page) so the set matches.
- **Checkmark** — draw-offer accept (live prompt).
- **X** — draw-offer reject **and** the **abort** action (same glyph).
- **Hide-chat toggle** — agent's discretion on the glyph.

### Complex — provided

Put in header.njk as symbols:
1. **Arrow-indicators — 4 SVGs**, one per state: defense / all / all + hippogonals / off. Final source below.

   **defense:**
   ```html
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
   	<g transform="translate(7.95 2.13) scale(0.9)" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
   		<path d="M9 39.3h27v-3H9v3zm3.5-7 1.5-2.5h17l1.5 2.5h-20zm-.5 4v-4h21v4H12z" stroke-linecap="butt"/>
   		<path d="M14 29.8v-13h17v13H14z" stroke-linecap="butt" stroke-linejoin="miter"/>
   		<path d="m14 16.8-3-2.5h23l-3 2.5H14zm-3-2.5v-5h4v2h5v-2h5v2h5v-2h4v5H11z" stroke-linecap="butt"/>
   	</g>
   	<g fill="currentColor">
   		<polygon points="9.2,19 9.2,29 4.2,24"/>
   	</g>
   </svg>
   ```

   **all:**
   ```html
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
   	<g transform="translate(7.95 3.63) scale(0.9)" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
   		<path d="M9 39.3h27v-3H9v3zm3.5-7 1.5-2.5h17l1.5 2.5h-20zm-.5 4v-4h21v4H12z" stroke-linecap="butt"/>
   		<path d="M14 29.8v-13h17v13H14z" stroke-linecap="butt" stroke-linejoin="miter"/>
   		<path d="m14 16.8-3-2.5h23l-3 2.5H14zm-3-2.5v-5h4v2h5v-2h5v2h5v-2h4v5H11z" stroke-linecap="butt"/>
   	</g>
   	<g fill="currentColor">
   		<polygon points="9.2,20.5 9.2,30.5 4.2,25.5"/>
   		<polygon points="9.2,20.5 9.2,30.5 4.2,25.5" transform="rotate(45 28.2 25.5)"/>
   	</g>
   </svg>
   ```

   **all + hippogonals:**
   ```html
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
   	<g transform="translate(7.95 3.63) scale(0.9)" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
   		<path d="M9 39.3h27v-3H9v3zm3.5-7 1.5-2.5h17l1.5 2.5h-20zm-.5 4v-4h21v4H12z" stroke-linecap="butt"/>
   		<path d="M14 29.8v-13h17v13H14z" stroke-linecap="butt" stroke-linejoin="miter"/>
   		<path d="m14 16.8-3-2.5h23l-3 2.5H14zm-3-2.5v-5h4v2h5v-2h5v2h5v-2h4v5H11z" stroke-linecap="butt"/>
   	</g>
   	<g fill="currentColor">
   		<polygon points="9.2,20.5 9.2,30.5 4.2,25.5"/>
   		<polygon points="9.2,20.5 9.2,30.5 4.2,25.5" transform="rotate(26.57 28.2 25.5)"/>
   		<polygon points="9.2,20.5 9.2,30.5 4.2,25.5" transform="rotate(45 28.2 25.5)"/>
   	</g>
   </svg>
   ```

   **off:**
   ```html
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
   	<defs>
   		<mask id="off-slash" maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
   			<rect x="0" y="0" width="48" height="48" fill="white"/>
   			<line x1="10" y1="38" x2="38" y2="10" stroke="black" stroke-width="6" stroke-linecap="round"/>
   		</mask>
   	</defs>
   	<g mask="url(#off-slash)">
   		<g transform="translate(3.75 2.13) scale(0.9)" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
   			<path d="M9 39.3h27v-3H9v3zm3.5-7 1.5-2.5h17l1.5 2.5h-20zm-.5 4v-4h21v4H12z" stroke-linecap="butt"/>
   			<path d="M14 29.8v-13h17v13H14z" stroke-linecap="butt" stroke-linejoin="miter"/>
   			<path d="m14 16.8-3-2.5h23l-3 2.5H14zm-3-2.5v-5h4v2h5v-2h5v2h5v-2h4v5H11z" stroke-linecap="butt"/>
   		</g>
   	</g>
   	<line x1="10" y1="38" x2="38" y2="10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
   </svg>
   ```

   **Refactor when used:** the rook `<path>`s are identical across all four — define the rook once as a `<symbol>` and `<use>` it in each icon (placement `transform` on each `<use>`; the off icon wraps its `<use>` in the masked group):

   ```html
   <symbol id="svg-rook-silhouette" viewBox="0 0 45 45" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
   	<path d="M9 39.3h27v-3H9v3zm3.5-7 1.5-2.5h17l1.5 2.5h-20zm-.5 4v-4h21v4H12z" stroke-linecap="butt"/>
   	<path d="M14 29.8v-13h17v13H14z" stroke-linecap="butt" stroke-linejoin="miter"/>
   	<path d="m14 16.8-3-2.5h23l-3 2.5H14zm-3-2.5v-5h4v2h5v-2h5v2h5v-2h4v5H11z" stroke-linecap="butt"/>
   </symbol>
   ```

   Don't wire these to the runtime `svgcache.getSilhouetteSVG('rook')` — different (theme-tinted) mechanism, not worth the indirection.

2. **Perspective mode** toggle: Use the same one as the `main` branch's header bar's setting's dropdown's Perspective button svg. In addition, make sure it is credited: Author: IconPark. License: MIT License. Source: https://www.svgrepo.com/svg/336825/perspective.
3. **Resign / Report (chat) — flag**: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(2 -1) rotate(-12 12 12)"><path d="M4 22V3" /><path d="M4 4C7.5 2 10.5 6 14 4C15.4 3.2 16.6 3.3 18 4L18 12C16.6 11.3 15.4 11.2 14 12C10.5 14 7.5 10 4 12Z" fill="currentColor" /></g></svg>`

Put inline in game page, NOT inside header.njk:
4. **Offer draw:** `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><text x="6" y="2" font-family="sans-serif" font-size="18" font-weight="bold" text-anchor="middle" dominant-baseline="hanging">1</text><polygon points="15.375,2 17.875,2 7.875,22 5.375,22" /><text x="18" y="21.67" font-family="sans-serif" font-size="18" font-weight="bold" text-anchor="middle" dominant-baseline="alphabetic">2</text></svg>`