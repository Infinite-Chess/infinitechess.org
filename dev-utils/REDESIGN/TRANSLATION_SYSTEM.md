# Translation System (Developer Reference)

How the redesign-era, per-component, TOML-based translation system works on the server and in templates. This is the dev reference — see [TRANSLATIONS.md](../../docs/TRANSLATIONS.md) for translator workflow.

> The legacy flat-file i18next system (one `translation/<lang>.toml` per language) still loads in parallel via `translationLoader.ts`. The new system below is what all SSR Nunjucks pages use. New code should use the new system.

## On-disk layout

```
translation/
├── <component>/             one folder per feature: header, leaderboard, ...
│   ├── en-US.toml           REQUIRED source; startup throws if missing
│   ├── de-DE.toml           optional per-language overrides
│   └── ...
├── responses/               special component — strings the server itself sends
│                            in HTTP/WS bodies (errors, system messages)
├── news/                    excluded from the loader (see EXCLUDED_DIRS)
└── <lang>.toml              legacy flat i18next files (separate system)
```

A component's TOML may include a top-level `[client]` sub-table. Everything **outside** `[client]` is for server-side templating only; the `[client]` block is the **only** part shipped to the browser.

Config lives in [src/server/config/translationconfig.ts](../../src/server/config/translationconfig.ts) (`DEFAULT_LANGUAGE`, `RESPONSES_COMPONENT`, `TRANSLATION_FOLDER`, `EXCLUDED_DIRS`).

## Boot

[src/server/config/i18n.ts](../../src/server/config/i18n.ts) calls `loadComponentTranslations()` once at startup. That function ([componentTranslationLoader.ts](../../src/server/config/componentTranslationLoader.ts)):

1. Scans `translation/` for subdirectories (skipping `EXCLUDED_DIRS`).
2. Parses every `<lang>.toml` and runs all string values through an XSS filter that whitelists only `em / strong / b / i / br`.
3. For regular components, splits each language's parsed object into `{ template, client }` (the `[client]` table is moved into `client`, everything else into `template`). The `responses` component skips the split and stores the parsed object whole.
4. **Fills missing keys from English** via `deepMerge` (so `en-US` keys absent in `de-DE` appear as English). Stale (out-of-date) translations are rendered **as-is** — Weblate is the source of truth for staleness.
5. Caches regular components in a module-level `Map<component, Map<lang, ComponentEntry>>`; caches `responses` in a separate `Map<lang, object>`.

## Per-request usage in templates

[src/server/routes/root.ts](../../src/server/routes/root.ts) installs middleware that, for every page request:

- Resolves the language via `getLanguageToServe(req)` ([translate.ts](../../src/server/utility/translate.ts)): query `?lng=` → `i18next` cookie → `req.i18n.resolvedLanguage` (Accept-Language) → `en-US`.
- Exposes two helpers on `res.locals`:
  - `templateT(component)` → the component's translation object **with `[client]` stripped out**. Use in `.njk` for strings only the server renders.
  - `clientT(component)` → the **contents of the `[client]` sub-table**, promoted one level (so `[client] foo.bar = "x"` becomes `{ foo: { bar: "x" } }`). Returns `{}` if the component has no `[client]` table.

In a Nunjucks template:

```njk
{% set t = templateT('header') %}
<button>{{ t.nav.learn }}</button>
```

### How client-side keys reach the browser

There is **no fetch and no client-side loader**. Client strings are inlined into the SSR'd HTML as a JSON literal inside a `<script>` tag, evaluated synchronously before any module scripts run. The flow:

1. The Nunjucks page (typically [layout.njk](../../src/server/views/layout.njk) for site-wide components, or an individual page template for page-specific ones) calls `clientT('<component>')`.
2. Nunjucks's built-in `| json` filter serializes the returned object to JSON, and `| safe` tells Nunjucks not to HTML-escape the resulting JSON (safe because every string was already XSS-sanitized at load time by the loader's whitelist filter, which permits only `em / strong / b / i / br`).
3. The result is embedded as `window.t = { <component>: {...} };` in the `<head>`. Today, [layout.njk:38](../../src/server/views/layout.njk#L38) does this for `header`:

   ```njk
   <script>window.t = { header: {{ clientT('header') | json | safe }} };</script>
   ```

4. Page-specific components extend the object instead of overwriting it. Add this in the page template's `{% block head %}`:

   ```njk
   <script>window.t = Object.assign(window.t || {}, { leaderboard: {{ clientT('leaderboard') | json | safe }} });</script>
   ```

5. Client TS reads `t.<component>.<key>` — typed via the generated `ClientTranslations` interface (see [Type generation](#type-generation)). The `t` symbol is declared globally, so no import is needed.

Because the data is baked into the HTML at request time, the user's language is already correct on first paint — no FOUC, no loading state, no round-trip. The trade-off is that adding or changing a client key requires a page reload (and `npm run generate:types` for the type to update).

## Server response strings (`responses` component)

When the server itself (not a Nunjucks template) needs to emit a translated string — error responses, socket replies, validation messages — the string lives in `translation/responses/<lang>.toml` and is fetched with `getResponseTranslation(key, reqOrWs)`:

```ts
import { getResponseTranslation } from '../config/componentTranslationLoader.js';

res.status(400).send(getResponseTranslation('auth.invalid_token', req));
```

The second argument can be either an `express.Request` or a `CustomWebSocket` — the function pulls the language from whichever (reading the cookie directly off socket metadata). `key` is typed as `ResponseTranslationKeys` (a dot-notation union auto-generated from `responses/en-US.toml` — see [Type generation](#type-generation)), so typos are caught at compile time.

## Type generation

`npm run generate:types` (auto-run by `build` and `dev:build`) executes [scripts/generate-component-translation-types.ts](../../scripts/generate-component-translation-types.ts), which produces:

- **[src/shared/types/client-translations.d.ts](../../src/shared/types/client-translations.d.ts)** — `export interface ClientTranslations`, one property per component that has a `[client]` table. Lives in `shared/` so both sides can consume it: client scripts read `t.header.x.y` via the global declared in [src/client/types/globals.d.ts](../../src/client/types/globals.d.ts); the server reads it through the typed `getClientTranslation<C>(component, lang): ClientTranslations[C]` helper. A typo in either the component name or a downstream key access errors at compile time.
- **[src/server/types/response-translations.ts](../../src/server/types/response-translations.ts)** — `ResponseTranslationKeys` dot-notation union from `responses/en-US.toml`. Used as the typed first argument to `getResponseTranslation`.

Re-run `npm run generate:types` whenever you add a key to a `[client]` table or to `responses/en-US.toml`.

## Adding a new component

1. Create `translation/<component>/en-US.toml`. Use `[table]` sub-tables for grouping; put any browser-side keys under a single top-level `[client]` table.
2. In the relevant Nunjucks template:
   ```njk
   {% set t = templateT('<component>') %}
   ```
3. If it has a `[client]` table, inject it into `window.t` in the page's `<head>`:
   ```njk
   <script>window.t = Object.assign(window.t || {}, { <component>: {{ clientT('<component>') | json | safe }} });</script>
   ```
4. Run `npm run generate:types` so `t.<component>` becomes typed in client scripts.
5. Restart the server (the loader runs once at boot — TOML changes require a restart).

## Fallback / missing-key semantics — quick reference

| Situation                          | Behavior                                              |
| ---------------------------------- | ----------------------------------------------------- |
| Key missing in `<lang>.toml`       | Falls back to English via `deepMerge`                 |
| Key stale (English source changed) | Rendered as-is (Weblate flags staleness elsewhere)    |
| Whole `<lang>.toml` missing        | `getTemplateTranslation` / `getClientTranslation` fall back to English |
| Component folder missing English   | Loader throws at startup                              |
| `getResponseTranslation` key absent | Logs to `errLog.txt`, returns the key itself          |

## Target end state (post-refactor)

The system today runs **alongside** the legacy i18next system. The redesign roadmap ([todo.md § Translation System Refactor](./todo.md)) removes the old system entirely. Once that work lands, expect the following differences from what's documented above:

- **`i18next` dependency dropped.** The package is removed from `package.json`. Language resolution is handled by a custom Accept-Language parser middleware that replaces today's `getLanguageToServe()` in [translate.ts](../../src/server/utility/translate.ts). The middleware reads the same precedence (cookie → Accept-Language → default) but without the i18next runtime.
- **Cookie renamed.** The `i18next` cookie (which stores the user's manual language override) is renamed to something system-neutral. Update any references in client code and socket metadata at the same time.
- **`?lng=` query parameter dropped.** The query-string override is removed. Reason: ToS / Privacy are English-only, and a sticky non-English cookie shouldn't be bypassable per-request (it would let users land on the English ToS in a way the design intentionally prevents).
- **Legacy loader deleted.** `src/server/config/translationLoader.ts` is removed. `componentTranslationLoader.ts` is renamed (e.g. to `translationLoader.ts`) since it's the only one left.
- **Legacy type generator removed.** `scripts/generate-translation-types.ts` is deleted and dropped from the `generate:types` npm script. Only `generate-component-translation-types.ts` remains.
- **Legacy type files deleted.** `src/types/translations.ts` is removed. `../types/**/*` is removed from the `include` arrays of the server and client tsconfigs. The `LegacyClientTranslations` type and the `translations` global declaration in [src/client/types/globals.d.ts](../../src/client/types/globals.d.ts) are deleted (they only exist to type EJS-era pages still using the flat-file `translations` object); `const t: ClientTranslations` stays.
- **Legacy monolith TOMLs deleted.** All `translation/<lang>.toml` files at the top level are removed once their keys have been migrated into per-component folders (or judged not worth migrating).
- **`translation/` contains only component folders** (plus `responses/` and `news/`) after the cleanup.
- `componentTranslationLoader.ts`s (or its renamed successor) xss_options need to be tightened to only those html tags that actually appear in template strings.

When working on this refactor, the migration approach in todo.md is: localize each new page by creating its component TOML, deleting the migrated keys from the old monolith, and only deleting the legacy infrastructure once nothing references it.

## Out of scope for this system

- **News posts** (`translation/news/<lang>/*.md`) — separate loader, [newsLoader.ts](../../src/server/config/newsLoader.ts).
- **Terms of Service / Privacy Policy** — English only; markdown is too hard to diff for translators.
- **Legacy flat TOMLs** (`translation/<lang>.toml`) — still served by the old i18next path. Migrate keys into per-component files as pages get redesigned.

## File pointers

| Concern                          | File                                                             |
| -------------------------------- | ---------------------------------------------------------------- |
| Loader, getters, deepMerge, XSS  | [src/server/config/componentTranslationLoader.ts](../../src/server/config/componentTranslationLoader.ts) |
| Boot wiring                      | [src/server/config/i18n.ts](../../src/server/config/i18n.ts)         |
| Constants (folder, default lang) | [src/server/config/translationconfig.ts](../../src/server/config/translationconfig.ts) |
| Language resolution              | [src/server/utility/translate.ts](../../src/server/utility/translate.ts) |
| Per-request `res.locals` setup   | [src/server/routes/root.ts](../../src/server/routes/root.ts)         |
| Client-side `window.t` injection | [src/server/views/layout.njk](../../src/server/views/layout.njk)     |
| Type generation                  | [scripts/generate-component-translation-types.ts](../../scripts/generate-component-translation-types.ts) |
