# Claude Instructions for infinitechess.org

When you finish making any new changes to scripts, always ensure these checks pass: `npm run type-check --silent`, `npm run lint --silent`. You must repeat each of these commands, even if you only made a minor code change since your last check to fix one of their errors. If there's an existing lint warning unrelated to your changes, fix it for bonus points.

## Key Guidelines

1. Follow industry standards and best code practices of today.
2. Maintain existing code structure, organization, and consistency.
3. Never re-exported types from inside scripts, always reference the source. Never use the Omit or Exclude utility types. Instead, have one type extend the other.
4. Avoid redundancy like the plague for maximum maintainability, scalability, and bug-avoidance. After implementing a change, always ask if there now exists redundancy with it or the rest of the code.
5. All jsdoc and comments must be high signal, concise, and tight, not containing bloat information callers don't need.
6. Unit/integration tests are not required for new features.

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
- Shell is zsh: always quote glob patterns in command args (e.g. `grep --include='*.ts'`), or zsh's nomatch aborts the command before it runs.
- Always Read a file's relevant lines in-session before editing it — grep/sed/Bash output doesn't count. It's the Edit tool's hard rule.
- All typescript files' indentation is in tabs, not spaces.
- prettier automatically enforces consistent styling.
- When determining which imports can safely be removed, the command `npm run lint --silent` automatically tells you what imports are unused.
- **Rendering:** When asked to add new complex graphics or visuals to the game (webgl canvas), refer to the Graphics Rendering Guide in `docs/GRAPHICS.md`.
- **System docs:** `docs/systems/` holds a deep-dive doc per major system — read the relevant one before touching its code so you don't have to dig to learn it. Currently: the build/esbuild pipeline (`BUILD.md`), the engine build & deploy pipeline (`ENGINE.md`), localization/TOML pipeline (`TRANSLATIONS.md`), account registration & verification (`REGISTRATION.md`), and the password-reset flow (`PASSWORD_RESET.md`).
