# Website Redesign Plan

The website will undergo a complete redesign to modernize its look and feel, making it much more professional and expandable. Every single page is going to be overhauled- their look, and their underlying code.

## Deployment Environment

Self-hosted on a Mac, no VPS. SSD storage. Cloudflare in front. Low traffic — a few hundred unique visitors per day.

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

## SEO

Search engine optimization should be built in from the start of the redesign, not bolted on at the end. The Nunjucks migration creates the ideal opportunity to do this correctly, since there is now one central `layout.njk` shell.

### Base SEO Principles

For context, the fundamentals search engines evaluate are:

- **Crawlability** — `robots.txt` tells crawlers which paths to index or skip; a sitemap gives them a complete, prioritised list of URLs to visit.
- **Relevance signals** — `<title>`, `<meta name="description">`, and heading hierarchy (`<h1>`…`<h6>`) tell both crawlers and users what a page is about.
- **Canonical URL** — `<link rel="canonical">` tells search engines which URL is authoritative when the same content is accessible at multiple addresses (e.g. with/without a `?lng=` param).
- **Structured data** — JSON-LD blocks using Schema.org vocabulary enable rich results (e.g. sitelinks, breadcrumbs) in Google Search.
- **Social graph tags** — Open Graph (`og:*`) and Twitter Card (`twitter:*`) meta tags control how pages appear when shared on social platforms.
- **Multilingual signals** — `<link rel="alternate" hreflang="xx">` tags tell search engines which URL serves each language, preventing the same content in different languages from competing in rankings.
- **Performance / Core Web Vitals** — Google uses LCP, INP, and CLS as a ranking signal. Fast initial paint, low layout shift, and quick interaction response all matter.
- **Semantic HTML** — One `<h1>` per page, correct landmark elements (`<nav>`, `<main>`, `<footer>`, `<article>`, `<section>`), and descriptive `alt` text on images all help crawlers and screen readers understand page structure.

### Meta Tags in layout.njk

`layout.njk` is the single HTML shell for every page, making it the right place to define default SEO meta tags and expose `{% block %}` slots for per-page overrides.

- **`<title>`** — Already planned via `{% block title %}`. Keep it. Prefix with the page name; append `| Infinite Chess` as a suffix in the default layout block so the brand appears on every tab. Keep page names concise (≤ 60 characters total).
- **`<meta name="description">`** — Add a `{% block description %}` with a sensible site-wide default. Each public-facing page overrides it with a 1–2 sentence summary (≤ 160 characters). This text appears as the snippet in search results.
- **`<link rel="canonical">`** — Emit the canonical URL (scheme + host + clean pathname, without any `?lng=` parameter) on every page. The route handler injects it as a template variable. This is especially important for this site because the same HTML is reachable with different `?lng=` query strings.
- **Open Graph / Twitter Card tags** — Add default `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, and `twitter:card` tags in the layout; let pages override via a `{% block og %}` slot. Use a single default social-preview image (e.g. `/img/social-preview.png`, at least 1200 × 630 px) for pages that don't provide their own.
- **`<meta name="robots">`** — Add `<meta name="robots" content="noindex">` to pages that should not be indexed: `/login`, `/createaccount`, `/reset-password/…`, `/admin`, `/400`–`/500` error pages.

### robots.txt

Serve a static `robots.txt` from the document root (placed in `src/client/` so the existing `express.static` middleware picks it up):

```
User-agent: *
Disallow: /api/
Disallow: /admin
Disallow: /reset-password/
Sitemap: https://www.infinitechess.org/sitemap.xml
```

Block API endpoints, the admin panel, and password-reset tokens (which are private by nature). Expose the sitemap URL so crawlers register it automatically.

### Sitemap

A dynamic `GET /sitemap.xml` route in `src/server/routes/` generates a fresh sitemap on each request (the payload is tiny and generation is trivial). Include the stable public pages — `/`, `/play`, `/guide`, `/news`, `/leaderboard`, `/credits`, `/termsofservice` — with appropriate `<changefreq>` and `<priority>` values. Omit `/login`, `/createaccount`, `/reset-password/…`, member profiles, `/admin`, and error pages.

### Structured Data (JSON-LD)

Add a `{% block jsonld %}{% endblock %}` slot in `layout.njk`. On the homepage, inject a `WebApplication` schema object:

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Infinite Chess",
  "url": "https://www.infinitechess.org",
  "description": "Play infinite chess online against others or bots on an infinite board.",
  "applicationCategory": "Game",
  "operatingSystem": "All"
}
```

This enables potential rich results in Google Search and gives crawlers unambiguous machine-readable metadata about what the site is.

### hreflang for Multilingual Content

For every page served in multiple languages, emit a set of `<link rel="alternate" hreflang="xx" href="…">` tags pointing to each language variant. The route handler already knows the supported language list; it should inject it into the template as a variable so the layout renders the full `<link>` set. This prevents different language versions of the same page from competing against each other in search rankings.

### Semantic HTML

- Keep one `<h1>` per page that names the page's primary subject. Do not use `<h1>` for the site logo or wordmark — that belongs in a `<p>` or `<span>` inside `<header>`.
- Use landmark elements (`<nav>`, `<main>`, `<footer>`, `<article>`, `<section>`) as layout containers rather than generic `<div>`s — both accessibility and search engines benefit.
- Every `<img>` must carry a meaningful `alt` attribute. Decorative images (e.g. background textures) get `alt=""`.

### Performance & Core Web Vitals

Google uses Core Web Vitals (LCP, INP, CLS) as a ranking signal. The choices already made in this redesign address the main factors directly:

- SSR for the first paint eliminates client-side fetch waterfalls → fast LCP.
- Content-hashed assets with `Cache-Control: immutable` caching → repeat-visit LCP near zero.
- CSS custom properties with no layout-shifting JS patches → low CLS.
- Self-hosted Noto Sans (no Google Fonts CDN) → no render-blocking cross-origin requests.
- `<link rel="modulepreload">` (late-stage polish) → eliminates the ES module import waterfall.