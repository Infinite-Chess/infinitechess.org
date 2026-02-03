# Copilot Instructions for infinitechess.org

### ABOVE ALL: Follow the requirements and guidelines for pull requests found in `docs/CONTRIBUTING.md`!

BEFORE commiting any new changes, and before responding to review feedback, always ensure all workflow checks pass: `prettier . --write`, `npm run lint --silent`, `npx npx tsc --noEmit`, and `npm test`. You must repeat each of these commands, even if you only made a minor code change since your last check to fix one of their errors.

## Key Guidelines

1. Follow code standards and best practices of today.
2. Maintain existing code structure and organization.
3. Perform testing for new complex functions to ensure their output is as expected.
4. Remember before committing changes, that all pull requests must follow the guidelines in `docs/CONTRIBUTING.md`.

## Project Architecture

- **Frontend:** TS, CSS, and assets in `src/client`. No major frameworks detected; uses vanilla and modular scripts.
- **Backend:** Node.js server in `src/server/server.js`, with API, game logic, and socket communication.

## Key Files & Directories

- `src/client/` — Frontend code
- `src/server/` — Backend code
- `src/shared/` — Shared utilities and chess logic
- `dev-utils/` — Depricated code. Do not maintain. It is not imported by the source code.
- `translation/` — Localization

## Conventions & Patterns

- **API Design:** REST endpoints and socket handlers are in `src/server/api/` and `src/server/socket/`.
- **Translations:** TOML files in `translation/` for i18n. News per locale in `translation/news/`. Any modification to the en-US.toml requires you update the version number at the top of the file, and reflect the change in `translation/changes.json`.

## Integration Points

- **Database:** Uses SQLite via the `better-sqlite3` package (`database.db` located in the root, and JSON files in `database/` for stats, bans, etc.)
- **Socket Communication:** Real-time features via `src/server/socket/`.
- **External:** No major external APIs detected; relies on local assets and custom logic.
