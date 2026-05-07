# Redesign TODO

---

## Page Redesigns

*Each page: new Nunjucks template extending `layout.njk`, new CSS file in `src/client/css/`, updated route handler with full SSR context, and updated/new TS where needed. Add shared CSS rules to `global.css` as you encounter the need for them.*

**Working with pages during the redesign:**
- **Redesigning a page** — replace its placeholder `.njk` stub with the real template; add a CSS file in `src/client/css/` and an esbuild entry point.
- **Removing a page** — delete its `.njk`, its CSS, and its entry point together; remove the route from `root.ts`.
- **Adding a new page** — add a route to `root.ts`, create a `.njk` template and a CSS file in `src/client/css/`, add an esbuild entry point.

- Redesign the **home (index)** page.

- Redesign other pages as you go. SSR all profile data (username, rating, join date, etc.). SSR initial batch of leaderboard rows; Snabbdom for the "Show More" interaction. SSR for news post "NEW" badges.

- Add the **Terms of Service** page — English only, rendered from a Markdown file, with an optional notice that the English version is authoritative.

- Add the **Privacy Policy** page — English only, same approach as ToS.

---

## Translation System Refactor

*Do this incrementally alongside page redesigns — add new keys in the right component as each page is built; don't migrate old keys upfront.*

- Restructure TOML translation files from one-file-per-page to one-file-per-feature-component (header nav, game UI, settings, leaderboard, profile, etc.). Do not migrate all existing keys, create new ones as we go, in the appropriate component. Do away with the `version` field.

---

## Deferred DB Writes

- Audit all route handlers and wrap non-critical DB writes (last-active timestamp updates, marking notifications as read, etc.) in `res.on('finish')` so they run after the response is sent. *(Best done after all pages are complete)*

---

## Late-Stage Polish

- Delete any unused theme-specific css variables in global.css

- Delete any unused css rules in all stylesheets.

- Delete everything related to old translations system - translationLoader (rename componentTranslationloader), generate-translation-types (remove that from `generate:types` script, too). Also delete `src/types/translations.ts`. Also remove `../types/**/*` from the `includes` properties of the server and client tsconfigs. Remove unused global declares from `src/client/types/global.d.ts`.

- Drop `i18next` package entirely. Write our own Accept-Language header parser middleware to replace getLanguageToServe() in translate.ts. Rename the `i18next` cookie, which controls manually switching languages. We should also drop support for specifying the language of the template desired with a lng query parameter, because users won't be able to manually go to the English-only version of the ToS, even if their i18next cookie was set to another language.

- Delete any straggling unused files - scripts, stylesheets, templates, etc.

- Add `<link rel="modulepreload">` for each page's JS entry points in its Nunjucks template. *(Do last, once every page's import graph is finalized)*

- Consider `@view-transition` if there's white flashes between page loads.

- Implement the audio autoplay fallback: detect when the browser has blocked audio before the first user gesture and display a muted indicator in the header (similar to Lichess's approach).
