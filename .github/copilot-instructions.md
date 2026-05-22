# Copilot Instructions for infinitechess.org

Each non-local session (working directory contains /home/runner/ or /github/) requires installing dependancies via `npm i --silent` first.

When you finish making any new changes to scripts, always ensure these checks pass: `npm run type-check --silent`, `npm run lint --silent`. You must repeat each of these commands, even if you only made a minor code change since your last check to fix one of their errors.

## Key Guidelines

1. Follow industry standards and best code practices of today.
2. Maintain existing code structure, organization, and consistency.
3. Perform testing for new complex functions to ensure their output is as expected.
4. Actual unit/integration tests are not required, unless explicitly asked for.
5. No types should ever be re-exported inside scripts. All imports of a type should reference the source.

## Project Architecture

- **Frontend:** TS, CSS, and assets in `src/client`. No major frameworks detected; uses vanilla and modular scripts. Bundled with **esbuild** (not Vite).
- **Backend:** Node.js server in `src/server/server.js`, with API, game logic, and socket communication.

## Key Files & Directories

- `src/client/` — Frontend code
- `src/server/` — Backend code
- `src/shared/` — Shared utilities and chess logic
- `dev-utils/` — Depricated code. Do not maintain. It is not imported by the source code.
- `translation/` — Localization

## Conventions & Patterns

- All typescript files' indentation is in tabs.
- All scripts have their file path on line 1. This is automatic via hook, you don't have to bother with maintaining it.
- Almost all scripts have a brief description of their purpose on lines 3-7+.
- Never use the Omit utility type. Instead, have one type extend the other.
- For quick search-replace during refactors, all arguments and variables of the FullGame type are named `gamefile`, and all of the Board type are `boardsim`. But be aware there is also a script and many import identifiers called `gamefile`.
- **Translations:** TOML files in `translation/` for i18n. News per locale in `translation/news/`. Any modification to the en-US.toml requires you update the version number at the top of the file, and reflect the change in `translation/changes.json`. Change notes in `changes.json` should be clear and concise, not containing more information than necessary, and always indicate the line numbers of the removed/added keys.
- **UI Changes:** When asked to make UI changes, please verify the changes look good via the integrated browser.
- **Rendering:** When asked to add new graphics and visuals to the game (canvas), refer to the Graphics Rendering Guide in `docs/GRAPHICS.md`.
- When determining which imports can safely be removed, the command `npm run lint --silent` automatically tells you what imports are unused.

## Integration Points

- **Database:** Uses SQLite via the `better-sqlite3` package.
- **Socket Communication:** Real-time features via `src/server/socket/`.

## VS Code Tool Notes

- **Rename Symbol:** To rename a symbol across all files that import it, point the rename symbol tool at the symbol's name inside a named `export { }` or `export type { }` block — this works for named exports only; `export default { }` object-style exports require manual renaming of all external call sites regardless of where the rename is applied.
