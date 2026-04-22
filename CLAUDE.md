# Claude Instructions for infinitechess.org

### ABOVE ALL: Follow the requirements and guidelines for pull requests found in `docs/GUIDELINES.md`!

When you finish making any new changes, always ensure all workflow checks pass: `npm run lint --silent`, `npx npx tsc --noEmit`, and `npm test`. You must repeat each of these commands, even if you only made a minor code change since your last check to fix one of their errors.

## Key Guidelines

1. Follow industry standards and best code practices of today.
2. Maintain existing code structure, organization, and consistency.
3. Perform testing for new complex functions to ensure their output is as expected.
4. Actual unit/integration tests are not required, unless explicitly asked for.
5. Remember before committing changes, that all pull requests must follow the guidelines in `docs/GUIDELINES.md`.
6. No types should ever be re-exported inside scripts. All imports of a type should reference the source.

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

- **Translations:** TOML files in `translation/` for i18n. News per locale in `translation/news/`. Any modification to the en-US.toml requires you update the version number at the top of the file, and reflect the change in `translation/changes.json`. Change notes in `changes.json` should be clear and concise, not containing more information than necessary, and always indicate the line numbers of the removed/added keys.
- **UI Changes:** When asked to make UI changes, please verify the changes look good via the integrated browser.
- **Rendering:** When asked to add new graphics and visuals to the game (canvas), refer to the Graphics Rendering Guide in `docs/GRAPHICS.md`.

## Integration Points

- **Database:** Uses SQLite via the `better-sqlite3` package.
- **Socket Communication:** Real-time features via `src/server/socket/`.
