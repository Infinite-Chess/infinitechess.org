# Game-page redesign — task overview

Each task is its own `T#-*.md` doc and is meant to land as a single commit that passes `npm run type-check` + `npm run lint`. See `../requirements.md` for the decisions behind them. Order is dependency order (later tasks may depend on earlier ones).

## T14 — Custom-variant games: start, persist, restore (server) ([T14-custom-variant-games.md](T14-custom-variant-games.md))
The schema is ready (preset/custom `variant` union, nullable `variant` columns, `live_games.position`) but no game can start as custom yet — `createGame`/`initMatch` still throw. This task removes those throws and wires the server to build a game from the seek's custom position, persist it to `live_games` (`variant` null + `position` set), restore it across restarts, and convey the live position to the client loader. Also un-stales `docs/systems/LIVE_GAME_PERSISTENCE.md`. Independent of the T9–T12 client/protocol chain; orderable whenever custom games become a priority.
