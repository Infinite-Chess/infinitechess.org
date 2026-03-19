# Copilot Instructions for infinitechess.org

### ABOVE ALL: Follow the requirements and guidelines for pull requests found in `docs/GUIDELINES.md`!

Each non-local session requires installing dependancies via `npm i --silent`. Check the working directory: if it contains Users, it's local; if it contains /home/runner/ or /github/, it's a GitHub Actions runner.

BEFORE commiting any new changes, and before responding to review feedback, always ensure all workflow checks pass: `npm run lint --silent`, `npx npx tsc --noEmit`, and `npm test`. You must repeat each of these commands, even if you only made a minor code change since your last check to fix one of their errors.

## Key Guidelines

1. Follow industry standards and best code practices of today.
2. Maintain existing code structure, organization, and consistency.
3. Perform testing for new complex functions to ensure their output is as expected.
4. Actual unit/integration tests are not required, unless explicitly asked for.
5. Remember before committing changes, that all pull requests must follow the guidelines in `docs/GUIDELINES.md`.

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
- **Rendering:** When asked to add new graphics and visuals, refer to the Graphics Rendering Guide in `docs/GRAPHICS.md`.

## Integration Points

- **Database:** Uses SQLite via the `better-sqlite3` package (`database.db` located in the root, and JSON files in `database/` for stats, bans, etc.)
- **Socket Communication:** Real-time features via `src/server/socket/`.
- **External:** No major external APIs detected; relies on local assets and custom logic.

## VS Code Tool Notes

- **Rename Symbol:** To rename a symbol across all files that import it, point the rename symbol tool at the symbol's name inside a named `export { }` or `export type { }` block — this works for named exports only; `export default { }` object-style exports require manual renaming of all external call sites regardless of where the rename is applied.
