# Game-page redesign — task overview

Each task is its own `T#-*.md` doc and is meant to land as a single commit that passes `npm run type-check` + `npm run lint`. See `../requirements.md` for the decisions behind them. Order is dependency order (later tasks may depend on earlier ones).

## T10 — Client dead/review load ([T10-client-dead-review.md](T10-client-dead-review.md))
The `!isLive` branch: fetch `GET /api/game/:id`, validate `DeadGameState`, parse the ICN **for moves only** (authoritative everything-else from the typed fields), normalize into a `FullGameState` (base + parsed moves + `clockValues` from `finalClocks`), and reuse T9's loader (no socket). Board orientation reads `gamePageData.role` (SSR-resolved in T8.5 — no client username match); surface `ratingChanges` in the side bar.

## T13 — Live socket-protocol reshape (cleanup) ([T13-live-protocol-reshape.md](T13-live-protocol-reshape.md)) — STUB
Deferred housekeeping: retire the dormant old `joingame` live path (continues T9 §5), de-dup the client `ServerGameInfo`/`JoinGameMessage` types against `GameStateBase`, and (low priority) slim the now-SSR'd `rated`/`players` off the wire. Gated on T9–T12 being landed + the canonical path + a consumer audit. Stub only — flesh out when the gates are near.

## T14 — Custom-variant games: start, persist, restore (server) ([T14-custom-variant-games.md](T14-custom-variant-games.md))
The schema is ready (preset/custom `variant` union, nullable `variant` columns, `live_games.position`) but no game can start as custom yet — `createGame`/`initMatch` still throw. This task removes those throws and wires the server to build a game from the seek's custom position, persist it to `live_games` (`variant` null + `position` set), restore it across restarts, and convey the live position to the client loader. Also un-stales `docs/systems/LIVE_GAME_PERSISTENCE.md`. Independent of the T9–T13 client/protocol chain; orderable whenever custom games become a priority.
