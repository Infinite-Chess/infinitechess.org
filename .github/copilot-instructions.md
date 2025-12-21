# Copilot Instructions for infinitechess.org

## Project Architecture

- **Monorepo Structure:** Contains `src/client` (frontend), `src/server` (backend), and `src/shared` (common logic/types).
- **Frontend:** Custom JS/TS, CSS, and assets in `src/client`. No major frameworks detected; uses vanilla and modular scripts.
- **Backend:** Node.js server in `src/server/server.js`, with API, game logic, and socket communication.
- **Shared Logic:** Utilities and chess logic in `src/shared`.
- **Assets:** Images, sounds, shaders, and translation files are organized under `src/client/images/`, `src/client/sounds/`, `src/client/shaders/`, and `translation/`.

## Developer Workflows

- **Start Dev Server:** `npm run dev` (uses nodemon for hot reload)
- **Build:** `node build/index.js` (custom build script)
- **Image Optimization:** `node optimize-images.js`
- **No standard test suite detected.** If adding tests, follow the structure in `src/shared` and `src/server`.

## Conventions & Patterns

- **Chess Logic:** Core chess rules and utilities are in `src/shared/chess/` and `src/shared/util/`.
- **API Design:** REST endpoints and socket handlers are in `src/server/api/` and `src/server/socket/`.
- **Config:** Server config in `src/server/config/`. Certificates in `cert/`.
- **Translations:** TOML files in `translation/` for i18n. News per locale in `translation/news/`. Any modification to the en-US.toml requires you update the version number at the top of the file, and reflect the change in `translation/changes.json`.
- **Assets:** Original images are placed in `dev-utils/image-sources/`. Use command `npm run optimize-images` to generate optimized versions into `src/client/img/`.

## Integration Points

- **Database:** Uses SQLite (`database.db`) and JSON files in `database/` for stats, bans, etc.
- **Socket Communication:** Real-time features via `src/server/socket/`.
- **External:** No major external APIs detected; relies on local assets and custom logic.

## Examples

- **Add a chess rule:** Edit or add to `src/shared/chess/`.
- **Add a REST API:** Create handler in `src/server/api/` and update routes in `src/server/routes/`.
- **Add a translation:** Update TOML in `translation/` and news in `translation/news/`.

## Key Files & Directories

- `src/client/` — Frontend code
- `src/server/` — Backend code
- `src/shared/` — Shared logic/types
- `database/` — Persistent data
- `dev-utils/` — Build and asset tools
- `src/client/img/`, `src/client/sounds/`, `src/client/shaders/` — Game assets
- `translation/` — Localization

## Key Guidelines

1. Follow code standards and best practices of today.
2. Maintain existing code structure and organization.
3. Perform testing for new complex functions to ensure their output is as expected.

---

**For questions or unclear patterns, ask for feedback or clarification from maintainers.**
