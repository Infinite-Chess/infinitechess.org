# Copilot Instructions for infinitechess.org

Each non-local session (working directory contains /home/runner/ or /github/) requires installing dependancies via `npm i --silent` first.

When you finish making any new changes to scripts, always ensure these checks pass: `npm run type-check --silent`, `npm run lint --silent`. You must repeat each of these commands, even if you only made a minor code change since your last check to fix one of their errors. If there's an existing lint warning unrelated to your changes, fix it for bonus points.

## Key Guidelines

1. Follow industry standards and best code practices of today.
2. Maintain existing code structure, organization, and consistency.
3. Never re-exported types from inside scripts, always reference the source. Never use the Omit or Exclude utility types. Instead, have one type extend the other.
4. Avoid redundancy like the plague for maximum maintainability, scalability, and bug-avoidance. After implementing a change, always ask if there now exists redundancy with it or the rest of the code.
5. Unit/integration tests are not required for new features.

## Project Architecture

- **Frontend:** TS, CSS, and assets in `src/client`. No major frameworks detected; uses vanilla and modular scripts. Bundled with **esbuild** (not Vite).
- **Backend:** Node.js server in `src/server/server.js`, with API, game logic, and socket communication. Every html is SSR'd via Nunjucks. The old system used EJS and is being migrated away from during the website redesign.
- `src/` is split into three: `client/` (only client scripts may import), `server/` (only server scripts may import), and `shared/` both sides may import. Sometimes, refactors may call for migrating code from either side into `shared/`.
- **Database:** Uses SQLite via the `better-sqlite3` package.
- `dev-utils/` — Archived code. Do not maintain. No source code imports anything from here.
- `translation/` — Localization. Only maintain english TOMLs, not any other language.

## Useful Notes

- All scripts have their file path on line 1. This is automatic via hook, you don't have to bother maintaining it.
- Almost all scripts have a brief description of their purpose on lines 3-7+. Useful for gaining a quick understanding of them without bloating the context window.
- All typescript files' indentation is in tabs, not spaces.
- prettier automatically enforces consistent styling.
- **UI Changes:** When asked to make UI changes, please verify the changes look good via the integrated browser.
- When determining which imports can safely be removed, the command `npm run lint --silent` automatically tells you what imports are unused.
- **Rendering:** When asked to add new complex graphics or visuals to the game (webgl canvas), refer to the Graphics Rendering Guide in `docs/GRAPHICS.md`.

## VS Code Tool Notes

- **Rename Symbol:** To rename a symbol across all files that import it, point the rename symbol tool at the symbol's name inside a named `export { }` or `export type { }` block — this works for named exports only; `export default { }` object-style exports require manual renaming of all external call sites regardless of where the rename is applied.
