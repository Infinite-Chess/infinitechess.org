# Redesign TODO

## Infrastructure Prerequisites

- Create the `prod` branch in the GitHub repo, and switch the production server to pull from `prod` instead of `update-1.10`.

- Install PM2 on the production machine. Switch to PM2 for running the server. Verify we can view live logs. Verify we can view all logs. Verify that it auto restarts on crashes. Verify the server auto starts after rebooting the machine.

- Install the self-hosted GitHub Actions runner on the production machine.

- Write the GitHub Actions deploy workflow file with the three triggers. Verify each of them work as intended. Verify that restarts have near zero downtime.

- Assess whether the current WebSocket reconnection logic reconnects quickly enough after a `pm2 reload` to be invisible to players. If not, implement exponential backoff and implement clock compensation. If so, remove `allowinvites.json` and its polling mechanism — live game persistence makes pre-restart blocking unnecessary.

---

## Build Pipeline

- Add `entryNames: '[dir]/[name]-[hash]'` to the esbuild client build options in `build/client.ts` so JS and CSS output filenames are content-hashed.

- Add `metafile: true` to the esbuild client build and write a `writeManifest()` post-build function that reads esbuild's input→output map and writes `dist/manifest.json`.

- At server startup, load `dist/manifest.json` and expose the hashed filenames to the Nunjucks render context so templates can reference them.

- Update static asset middleware: serve hashed JS/CSS with `Cache-Control: immutable, max-age=31536000`; serve HTML with `Cache-Control: no-store`; serve images/fonts with `Cache-Control: max-age=31536000` (without `immutable`).

- Add to the Pull Request Requirements and Guidelines that whenever an image or font asset changes, we must append a `?v=2` manually in the template so browsers know to fetch the new version instead of using the cached one. (Not needed for JS/CSS since those are content-hashed).

---

## Nunjucks Migration

- Install `nunjucks` and `@types/nunjucks`; configure the Nunjucks environment in the Express app (set views directory, autoescape, etc.).

- Create `layout.njk` — the full HTML shell (`<html>`, `<head>`, `<body>`) with `{% block %}` slots for: page title, extra `<head>` tags, page stylesheet, body content, and page script.

- Delete `build/views.ts`; remove the `copy:views` script from `package.json`; remove `src/client/views` from `nodemon.json`'s watch list.

- Migrate all existing route handlers from `res.sendFile()` to `res.render()`, pointing each to a minimal placeholder `.njk` file that extends `layout.njk`. This keeps the site functional while individual pages are redesigned.

---

## CSS Foundation

- Create the shared stylesheet (`src/client/css/global.css`) with some CSS custom property variables for both `[data-theme="dark"]` and `[data-theme="light"]` (e.g. `--c-bg`, `--c-surface`, `--c-text`, `--c-brand`, `--c-border`).

- Add the inline `<script>` to `layout.njk <head>` that reads `localStorage` and sets `data-theme` on `<html>` before any CSS loads, preventing a flash of the wrong theme.

- Create a `@font-face` declaration for Noto Sans and the font-stack CSS into the shared stylesheet.

- Ensure our middleware is capable of serving fonts, with the same cache-control as other static assets.

- Add other CSS rules we think will be shared across all pages.

---

## Translation System Refactor

- Restructure TOML translation files from one-file-per-page to one-file-per-feature-component (header nav, game UI, settings, leaderboard, profile, etc.). Do not migrate all existing keys, create new ones as we go, in the appropriate component. Do away with the `version` field.

- Update `loadTranslations()` to remove versioning support entirely; delete `removeOutdated()`. Keep `deepMerge()` (fallback to English for missing keys).

---

## Shared Components

*All page redesigns depend on these being done first.*

- Redesign and implement the shared header component (`src/client/components/header/`) — Nunjucks partial, CSS (CSS-only responsive layout, no JS measurement), and TS. Server receives auth state via `req.memberInfo` and passes it to the template.

- Redesign and implement the shared footer component — Nunjucks partial and CSS.

- Implement logout-in-another-tab handling: on all socket-connected pages, call `window.location.reload()` when the socket logout event is received so the server re-renders the correct logged-out state.

- Install `snabbdom` — required before any page that uses it for reactive lists.

---

## Page Redesigns

*Each page: new Nunjucks template extending `layout.njk`, new colocated CSS file, updated route handler with full SSR context, and updated/new TS where needed.*

- Redesign the **home (index)** page.

- Redesign other pages as you go. SSR all profile data (username, rating, join date, etc.). SSR initla batch of leaderboard rows; Snabbdom for the "Show More" interaction. SSR for news post "NEW" badges.

- Add the **Terms of Service** page — English only, rendered from a Markdown file, with an optional notice that the English version is authoritative.

- Add the **Privacy Policy** page — English only, same approach as ToS.

---

## Deferred DB Writes

- Audit all route handlers and wrap non-critical DB writes (last-active timestamp updates, marking notifications as read, etc.) in `res.on('finish')` so they run after the response is sent. *(Best done after all pages are complete)*

---

## Late-Stage Polish

- Add `<link rel="modulepreload">` for each page's JS entry points in its Nunjucks template. *(Do last, once every page's import graph is finalized)*

- Consider `@view-transition` if there's white flashes between page loads.

- Implement the audio autoplay fallback: detect when the browser has blocked audio before the first user gesture and display a muted indicator in the header (similar to Lichess's approach).
