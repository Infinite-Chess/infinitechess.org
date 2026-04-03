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

## VS Code Tool Notes

- **Rename Symbol:** To rename a symbol across all files that import it, point the rename symbol tool at the symbol's name inside a named `export { }` or `export type { }` block — this works for named exports only; `export default { }` object-style exports require manual renaming of all external call sites regardless of where the rename is applied.

## Integrated Browser

- **Game interaction:** The infinite chess game board & pieces are on a canvas, which contents is only visible to you in screenshots. drag_element won't work on the canvas as it requires a DOM ref. Use run_playwright_code to probe board coordinates: hover page.mouse.move(sx, sy) at candidate screen positions and read await page.locator('#x').inputValue() / await page.locator('#y').inputValue() to map screen pixels to board squares.

- **Moving pieces:** Use explicit mouse.down()+mouse.up() pairs, not page.mouse.click() — the game's input loop polls isKeyDown per frame and click() is too fast. After clicking "Start Game" to start a local game, wait at least 2000ms before making any moves — the canvas game loop needs time to initialize.

- **Reading the board position:** press Digit5 (hold down for ~200ms so the game loop detects it) to trigger a clipboard copy of the ICN position string. Intercept it via: (1) inject `window._capturedClipboard=null; const orig=navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText=async(t)=>{window._capturedClipboard=t;navigator.clipboard.writeText=orig;return orig(t);}` into the page before pressing the key, then (2) `await page.keyboard.down('Digit5'); await page.waitForTimeout(200); await page.keyboard.up('Digit5');`, then (3) read `await page.evaluate(()=>window._capturedClipboard)`. navigator.clipboard.readText() will fail with permission denied — do not use it.
