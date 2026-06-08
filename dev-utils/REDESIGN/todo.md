# Redesign TODO

---

## Page Redesigns

*Each page: new Nunjucks template extending `layout.njk`, new CSS file in `src/client/css/`, updated route handler with full SSR context, and updated/new TS where needed. Add shared CSS rules to `global.css` as you encounter the need for them.*

**Working with pages during the redesign:**
- **Redesigning a page** — replace its placeholder `.njk` stub with the real template; add a CSS file in `src/client/css/` and an esbuild entry point.
- **Removing a page** — delete its `.njk`, its CSS, and its entry point together; remove the route from `root.ts`.
- **Adding a new page** — add a route to `root.ts`, create a `.njk` template and a CSS file in `src/client/css/`, add an esbuild entry point.

- Redesign other pages as you go. SSR all profile data (username, rating, join date, etc.). SSR initial batch of leaderboard rows; Snabbdom for the "Show More" interaction. SSR for news post "NEW" badges.

- Add the **Terms of Service** page — English only, rendered from a Markdown file, with an optional notice that the English version is authoritative.
	- Add a `last_emailed_tos_version` INTEGER column to the `members` table (default 0) to track which ToS-update broadcast each member has been emailed — for when the ToS-update email broadcaster is built.

- Add the **Privacy Policy** page — English only, same approach as ToS.

- Delete all old ejs documents, stylesheets, and scripts related to the old pages.

- Should we have some special 429 "Too Many Requests" page or handling? Does sending the html for that page each rate limit effectively defeat the purpose? We're still sending just as much data each request??

---

## Translation System Refactor

- Localize each page. All keys should be well organized in their respective components. Keys needing to be accessible by the js should be put in the `[script]` object of the TOML, and can be accessed via the global `t` variable. Server-side keys needed for sending translated responses should be placed into the `responses` component TOML (which is `script_only`, so its keys live at the top level rather than under a `[script]` table), and can be accessed via `getScriptTranslationsForReq('responses', reqOrWs)`. As we create each new component TOML, delete related keys out of the old monolith English TOML.

- Analyze the remaining keys in the old monolith English TOML determine whether the stragglers should be deleted or migrated into new components. Delete all old monolith TOMLs.

- Delete everything related to old translations system - translationLoader (rename componentTranslationloader), generate-translation-types (remove that from `generate:types` script, too). Also delete `src/types/translations.ts`. Also remove `../types/**/*` from the `includes` properties of the server and client tsconfigs. Remove unused global declares from `src/client/types/global.d.ts`.

- Drop `i18next` package entirely. Write our own Accept-Language header parser middleware to replace getLanguageToServe() in translate.ts. Rename the `i18next` cookie, which controls manually switching languages. We should also drop support for specifying the language of the template desired with a lng query parameter, because users won't be able to manually go to the English-only version of the ToS, even if their i18next cookie was set to another language.

- Add a request/connection-bound translator so server code reads strings as ergonomically as the client global `t`: `req.t` (Express) and `ws.t` (socket), each a `ScriptTranslations`-typed Proxy built once from the resolved language, used component-first and fully typed — e.g. `req.t.responses.auth.invalid_token`. Build it on top of a `makeScriptTranslator(lang)` Proxy factory delegating to `getScriptTranslations`. Migrate the `getTranslation`/`getTranslationForReq` call sites (and the two existing `getScriptTranslations` callers) onto it, then **delete `getScriptTranslationsForReq`** (fully superseded). Keep `getScriptTranslations(component, lang)` exported as the bare-language escape hatch (e.g. a future queued email sender resolving language from the DB). Sequencing: `ws.t` has no collision and can land anytime; **`req.t` is blocked until i18next is dropped above**, since `i18next-http-middleware` already augments the Express request with a conflicting `t`.

- Restructure TOML translation files from one-file-per-page to one-file-per-feature-component (header nav, game UI, settings, leaderboard, profile, etc.). Do not migrate all existing keys, create new ones as we go, in the appropriate component. 

- Once all pages are localized: Setup Weblate.

- Rewrite the translation guide in `docs/TRANSLATIONS.md` to reflect the new system and Weblate. It should cover how to use Weblate, and also contain pointers for fast-tracking translation via AI by translating whole components at once. It should also include info about retaining any xss-whitelisted html tags they should not modify in strings, UNLESS wherever html tags are in use in strings, those templates are commented to clearly explain their presence and the need to preserve them, then they don't have to explicitly be explained in the guide, to keep it simpler.

---

## Deferred DB Writes

- Audit all route handlers and wrap non-critical DB writes (last-active timestamp updates, marking notifications as read, etc.) in `res.on('finish')` so they run after the response is sent. *(Best done after all pages are complete)*

---

## Late-Stage Polish

- Ensure you can't exceed db positions quota.

- Delete any unused theme-specific css variables in global.css

- Delete any unused css rules in all stylesheets.

- Double check sure any straggling unused files - scripts, stylesheets, templates, etc. related to the old system are deleted.

- Add `<link rel="modulepreload">` for each page's JS entry points in its Nunjucks template. *(Do last, once every page's import graph is finalized)*

- Consider `@view-transition` if there's white flashes between page loads.

- Optional: Implement the audio autoplay fallback: detect when the browser has blocked audio before the first user gesture and display a muted indicator in the header (similar to Lichess's approach).
