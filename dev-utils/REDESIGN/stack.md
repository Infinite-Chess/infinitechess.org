# Website Redesign Plan

The website will undergo a complete redesign to modernize its look and feel, making it much more professional and expandable. Every single page is going to be overhauled- their look, and their underlying code.

## Deployment Environment

Self-hosted on a Mac, no VPS. SSD storage. Cloudflare in front. Low traffic — a few hundred unique visitors per day.

## Infrastructure Prerequisites

These things must be in place before the redesign begins.

- **Perform move legality checks server-side** for all variants without a ton of pieces. Reject illegal moves instead of continuing to depend on cheat reports from the opponent.

- **Live game state persistence to SQLite.** On each move, write game state (game JSON, clock values, whose turn, timestamp) to a `live_games` table. On server startup, rehydrate in-memory game objects from this table so interrupted games survive restarts. All active game timers must be reinstated. Don't worry yet about compensating clocks for downtime duration.

- **PM2 as the process manager.** PM2 keeps the Node.js server running independently of any terminal session, survives reboots, and supports zero-downtime reloads (websockets still need to reopen and resync to game). It installs once on the machine (not as a project dependency). Manual deploy command: `git pull && npm ci --silent && npm run build && pm2 reload infinitechess`. On each server startup, log the timestamp and PID to `logs/startupLog.txt` (e.g. `2026-03-10 14:32:03 | Server started. PID: 5389`). Useful commands: `pm2 logs infinitechess` to tail logs; `du -sh ~/.pm2/logs/*` to check log disk usage. Very whether downtime is enough to noticeably interrupt games. If so, implement the warning mechanism described in the next section. To get the server auto-starting when logging in after a reboot, run `pm2 startup` and follow the instructions it outputs.

- **Automated deployment via self-hosted GitHub Actions runner.** The runner installs as a system service on the server machine (auto-starts on boot, no maintenance). All development and PR merges go into `main`; merge `main` → `prod` to release. Three workflow triggers: (1) **push to `prod`** — full deploy (`git pull && npm ci && npm run build && pm2 reload infinitechess`); (2) **`workflow_dispatch`** — manual trigger from the GitHub Actions UI or CLI, with an optional `warning_seconds` input; (3) **`repository_dispatch: hydrochess-release`** — triggered by hydrochess's `build-wasm.yml` after a new engine release, rebuilds with the new WASM artifacts and reloads (skips `git pull`). `allowinvites.json` and its polling mechanism are removed entirely — game state persistence makes blocking new games before a restart unnecessary. On deploy, go straight for the above command, when it is finished, it should start a new process and kill the old one, will zero downtime (websockets automatically reconnect when closed, and resync to the game). If it turns out that this downtime is long enough that players live in games should be warned of restarts, do things this way: Before deploying, the runner calls `POST /API/prepare-restart` on `localhost` (authenticated via a `RESTART_SECRET` shared between `.env` and GitHub Actions secrets), which broadcasts a countdown warning to all connected clients. After the warning expires, clients in a game see "Server is restarting, your game will resume soon" and the deploy proceeds. We can now record the exact time server shut down, and use that to give players clocks back the time they lost during the restart. See [github-actions-runner.md](github-actions-runner.md) for a detailed breakdown of how the runner works for this method, and integrates with the server.

- Be aware we might have to change the websocket reconnection logic to use exponential backoff. Decide whether this is necessary depending on how well/quickly clients reconnect after a restart with current logic.

- **Automated DB backups.** Currently, the OS is performing automatic backups, and I am doing manual ones on server updates. Let's have the server itself create a backup once per day and immediately before every deploy. Backups go in a `backups/` directory with timestamped filenames. Backups older than 30 days are purged automatically.

## Technical Stack & Decisions

### Build Pipeline

- **esbuild:** Extend the existing pipeline in `build/`. Two additions to `build/client.ts`: (1) `entryNames: '[dir]/[name]-[hash]'` for content-hashed output filenames; (2) `metafile: true` plus a `writeManifest()` post-build function that reads esbuild's input→output map and writes `dist/manifest.json`. The server loads this manifest at startup and injects the correct hashed filenames into every Nunjucks render.

- **Content-hashed asset caching:** JS and CSS files are emitted as `main.[hash].js` / `styles.[hash].css` and served with `Cache-Control: immutable, max-age=31536000` — browsers cache them forever and fetch a new URL automatically when content (and thus the file fingerprint) changes. HTML is served with `Cache-Control: no-store` and always embeds the current hashed filesnames. For images and other static assets referenced directly in templates (e.g. `<img src="/img/king_w.png">`), use `Cache-Control: max-age=31536000` (without `immutable`) and append a `?v=2` query string manually in the template when the file changes. Reserve `immutable` only for build-pipeline-hashed files.

- **Nunjucks** replaces EJS as the server-side templating engine. Layout inheritance is the key benefit: one `layout.njk` defines the full `<html>`/`<head>`/`<body>` shell with named `{% block %}` slots, and every page file just `{% extends "layout.njk" %}` and fills in its title, styles, and body content. Changing a favicon or global meta tag means editing one file. Logic stays in route handlers; templates only use `{% for %}` / `{% if %}`. `build/views.ts` is deleted entirely — it only existed to pre-render every EJS template × every language to static `.html` files because the old server had no SSR capability. With Nunjucks, HTML is rendered at request time, `dist/client/views/` no longer exists, `root.ts` switches from `res.sendFile()` to `res.render()`, and `nodemon.json` no longer needs to watch `src/client/views`.

### Page Architecture

- **Proper MPA.** Each major feature lives on its own page — no cramming everything into one giant page. Pages are bandwidth-aware: each page only loads the JS it needs. This matters slightly less now that scripts are indefinitely cached after the first load, but it still keeps things clean and fast on first visit.

- **SSR (server-side render) everything that affects the first paint.** The server renders the full HTML — header auth state, notification badge count, member profile data, news "NEW" badges — before sending the response. The client never needs to fetch these or patch the DOM on load. Use client-side fetching only for things triggered by user interaction or that need live updates (e.g. leaderboard "Show More", editor saves, preferences writes).

- **Snabbdom for data-driven in-page reactivity.** Use it when DOM content is generated from data at runtime — leaderboard lists, chat windows, live game panels. Don't use it for static content known at author time (e.g. the fairy piece carousel in the Guide), or for pre-authored fixed elements like modals and tab panels that are simply shown/hidden. Each Snabbdom component needs a plain module-level `state` object and a `render(state)` function that should return a virtual DOM tree via `h()`. State is a plain JS object updated directly on socket events or user interactions.

### CSS & Styling

- **CSS methodology:** One shared stylesheet for global styles, plus a per-page stylesheet for each page. Short, descriptive class names scoped with native CSS nesting — no BEM, no prefixes. Each page's stylesheet has one top-level block matching its `<main>` class (e.g. `.login { .form-field {} }`), preventing any bleed between pages. lightningcss in the existing build pipeline handles transpilation for older browsers. Utility classes (`.hidden`, `.italic`, `.flex`, etc.) are hand-rolled and added to the shared stylesheet when redundancy appears — no Tailwind. CSS files are colocated with the component they style (e.g. `src/client/components/header/header.css`).

- **CSS custom property light/dark theme system.** A `[data-theme]` attribute on `<html>` (e.g. `data-theme="dark"`) selects a block of several semantic CSS variables (`--c-bg`, `--c-surface`, `--c-text`, `--c-brand`, `--c-border`, etc.) defined in the shared stylesheet. Switching themes is one `setAttribute` call plus a `localStorage` write. A small inline `<script>` in `<head>` reads `localStorage` and sets the attribute before any CSS loads, preventing a flash of the wrong light/dark theme on page load.

- **Font stack:** `"Noto Sans", Verdana, sans-serif` (Lichess font). Self-host Noto Sans (not loaded from Google Fonts CDN, but via `@font-face`) to avoid the extra DNS/connection overhead and the 1-day CSS cache expiry that Google Fonts carries. Font files are served with `Cache-Control: immutable, max-age=31536000` alongside JS/CSS. Ensure our middleware is capable of serving fonts, with the same cache-control as other static assets.

- **Header layout without JS measurement.** The header renders its correct auth state (logged-in vs. logged-out) entirely server-side. CSS container queries or a CSS-only overflow fallback handle layout at different widths. Language-width variation is the remaining open challenge.

### Auth & Session

- **Keep the existing dual-token auth system unchanged** — no backend migration needed. The refresh token (`jwt`) is already an `httpOnly` cookie sent on every request including page navigations. `verifyJWT` middleware already reads it and sets `req.memberInfo`, so Nunjucks SSR gets full auth context for free. Short-lived access tokens (managed by `validatorama.ts`) are kept for API calls — they encapsulate the DB-skipping refresh logic and have only 3 call sites. The one known limitation: pages without a websocket (currently only the editor) can go stale after logout in another tab, which we accept.

- **Logout in another tab:** When a socket-connected page receives the logout event, call `window.location.reload()` rather than trying to swap out header elements on the client. This lets the server re-render the correct logged-out state with no need to hide/show DOM elements in JS.

- **Defer non-critical DB writes with `res.on('finish')`.** Since SSR means the server is doing more DB work per request, use `res.on('finish')` to delay writes that don't affect the response — e.g. updating the user's last-active timestamp or marking notifications as read — until after the response has already been sent.

### Localization

- **Weblate-compatible translation system.** One TOML file per website feature (header nav, game UI, settings, leaderboard, profile, etc.) — dozens of components total. Weblate automatically marks strings in other languages as stale when the English source changes. No `removeOutdated()` function is needed. Stale translations are rendered as-is rather than falling back to English. `deepMerge()` is still kept for strings that are entirely absent in a given language (fallback to English). Markdown/article content is not run through Weblate but can optionally be translated manually by trnaslators. Components no longer need a version field for versioning, `loadTranslations()` should not support versioning.

- **No translations for ToS or Privacy Policy** — English only, sourced from markdown files. Optionally include a notice in the document that the English version takes precedence if they are ever translated. Markdown is too hard to version-control for translators in a way that communicates exactly what changed, so these pages are excluded from the translation pipeline.

### Late-Stage Polish

- **`<link rel="modulepreload">`** for each page's JS entry points, injected into the page HTML. This lets the browser fetch all ES modules in parallel from the first response, eliminating the waterfall of sequential import round trips. Add this last, once each page's import graph is finalized. Lower priority since scripts are cached indefinitely after the first load anyway.

- **White flash on navigation.** `@view-transition { navigation: auto }` with `::view-transition-old(root), ::view-transition-new(root) { animation-duration: 0s }` in the shared stylesheet eliminates a potential white flash between page loads by holding the old page visible until the new one is ready to paint — no crossfade, but an instant cut.

- **Audio autoplay fallback.** If the browser blocks the first move's sound, when navigating to tbr game page, before the first user gesture, refer to Lichess's approach as a reference: they show a small red mute icon in the header when audio is blocked. See: https://lichess.org/faq#autoplay