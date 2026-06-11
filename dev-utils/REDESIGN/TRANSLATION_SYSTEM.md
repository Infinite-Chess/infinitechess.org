# Translation System (Developer Reference)

How the redesign-era, per-component, TOML-based translation system works on the server and in templates. This is the dev reference — see [TRANSLATIONS.md](../../docs/TRANSLATIONS.md) for translator workflow.

> The legacy flat-file i18next system (one `translation/<lang>.toml` per language) still loads in parallel via `translationLoader.ts`. The new system below is what all SSR Nunjucks pages use. New code should use the new system.

## On-disk layout

```
translation/
├── <component>/             one folder per feature: header, leaderboard, responses, ...
│   ├── en-US.toml           REQUIRED source; startup throws if missing
│   ├── de-DE.toml           optional per-language overrides
│   └── ...
├── news/                    excluded from the loader (see EXCLUDED_DIRS)
└── <lang>.toml              legacy flat i18next files (separate system)
```

A component's TOML may include a top-level `[script]` sub-table. Everything **outside** `[script]` is for server-side templating only; the `[script]` block is the **only** part that can be shipped to the browser. A component whose keys are *all* script-facing can set top-level `script_only = true` and write subtable headers without the `script.` prefix — see [translation/shared/en-US.toml](../../translation/shared/en-US.toml).

Config lives in [src/server/config/translationconfig.ts](../../src/server/config/translationconfig.ts) (`DEFAULT_LANGUAGE`, `TRANSLATION_FOLDER`, `EXCLUDED_DIRS`).

## Boot

[src/server/config/i18n.ts](../../src/server/config/i18n.ts) calls `loadComponentTranslations()` once at startup. That function ([componentTranslationLoader.ts](../../src/server/config/componentTranslationLoader.ts)):

1. Scans `translation/` for subdirectories (skipping `EXCLUDED_DIRS`).
2. Parses every `<lang>.toml` and runs all string values through an XSS filter that whitelists only `em / strong / b / i / br / span[class]`.
3. Splits each language's parsed object into `{ template, script }`.
4. **Fills missing keys from English** via `deepMerge` (so `en-US` keys absent in `de-DE` appear as English). Stale (out-of-date) translations are rendered **as-is** — Weblate is the source of truth for staleness.
5. Caches everything in a module-level `Map<component, Map<lang, ComponentEntry>>`.

## Per-request usage in templates

For every page request, [src/server/routes/root.ts](../../src/server/routes/root.ts) merges the base render context (built by `getBaseRenderContext` in [renderContext.ts](../../src/server/utility/renderContext.ts)) into `res.locals`, exposing on every template:

- `lang` — the resolved language code. `req.lang` is a lazy getter on the request prototype ([reqLanguage.ts](../../src/server/middleware/reqLanguage.ts)) that resolves the language (cookie → Accept-Language → default) on first access and caches it for the rest of the request, so it's available anywhere — including code that runs before the routers (e.g. the rate limiter / error handler).
- `templateT(component)` → the component's translation object **with `[script]` stripped out**. Use in `.njk` for strings only the server renders.
- `scriptT(component)` → the **contents of the `[script]` sub-table**, promoted one level (so `[script] foo.bar = "x"` becomes `{ foo: { bar: "x" } }`). Returns `{}` if the component has no `[script]` table.

In a Nunjucks template:

```njk
{% set t = templateT('header') %}
<button>{{ t.nav.learn }}</button>
```

### How client-side keys reach the browser

There is **no fetch and no client-side loader**. Client strings are inlined into the SSR'd HTML as a JSON literal inside a `<script>` tag, evaluated synchronously before any module scripts run. The flow:

1. The Nunjucks page (typically [layout.njk](../../src/server/views/layout.njk) for site-wide components, or an individual page template for page-specific ones) calls `scriptT('<component>')`.
2. Nunjucks's built-in `| json` filter serializes the returned object to JSON, and `| safe` tells Nunjucks not to HTML-escape the resulting JSON (safe because every string was already XSS-sanitized at load time by the loader's whitelist filter, which permits only `em / strong / b / i / br`).
3. The result is embedded as `window.t = { <component>: {...} };` in the `<head>`. Today, [layout.njk:38](../../src/server/views/layout.njk#L38) does this for `header`:

   ```njk
   <script>window.t = { header: {{ scriptT('header') | json | safe }} };</script>
   ```

4. Page-specific components extend the object instead of overwriting it. Add this in the page template's `{% block head %}`:

   ```njk
   <script>window.t = Object.assign(window.t || {}, { leaderboard: {{ scriptT('leaderboard') | json | safe }} });</script>
   ```

5. Client TS reads `t.<component>.<key>` — typed via the generated `ScriptTranslations` interface (see [Type generation](#type-generation)). The `t` symbol is declared globally, so no import is needed.

Because the data is baked into the HTML at request time, the user's language is already correct on first paint — no FOUC, no loading state, no round-trip. The trade-off is that adding or changing a client key requires a page reload (and `npm run generate:types` for the type to update).

## Server-emitted response strings

When the server itself (not a Nunjucks template) needs to emit a translated string — error responses, socket replies, validation messages — put the string in `translation/responses/<lang>.toml` and read it off the request-bound translations object `req.t`:

```ts
res.status(400).send(req.t.responses.auth.invalid_token);
```

`req.t` is a fully-typed `ScriptTranslations` accessor present on every Express request, mirroring the client-side global `t`. It's a lazy getter installed on the request prototype ([reqTranslations.ts](../../src/server/middleware/reqTranslations.ts)) that, on first access, reads the language off `req.lang` and caches a Proxy for the rest of the request. Because `req.lang` resolves itself lazily too, `req.t` works **everywhere** — including code that runs before the routers (e.g. the rate limiter), with no pipeline-ordering concerns.

For socket replies, the connection-bound `ws.t` is the equivalent — a `ScriptTranslations` accessor of the same shape, read the same way. It's built once when the socket connects ([openSocket.ts](../../src/server/socket/openSocket.ts)) and lives on the `CustomWebSocket` ([socketUtility.ts](../../src/server/socket/socketUtility.ts)). Unlike `req.t`, there's no lazy getter: the language is fixed at connection time, so the accessor is assigned eagerly — the Proxy still resolves each component lazily on first access.

When the caller holds only a resolved language code (e.g. SSR template-render code, or a queued email sender that resolved the language from the DB), use the lower-level primitive `getScriptTranslations(component, lang)` that the bound accessors delegate to.

There's nothing structurally special about `responses` — any component's script-facing strings are reachable the same way. The `responses` convention exists so server-emitted strings are visually grouped in one folder for translators.

## Type generation

`npm run generate:types` (auto-run by `build` and `dev:build`) executes [scripts/generate-component-translation-types.ts](../../scripts/generate-component-translation-types.ts), which produces **[src/shared/types/script-translations.d.ts](../../src/shared/types/script-translations.d.ts)** — `export interface ScriptTranslations`, one property per component with script-facing strings. Lives in `shared/` so both sides can consume it: client scripts read `t.header.x.y` via the global declared in [src/client/types/globals.d.ts](../../src/client/types/globals.d.ts); the server reads it through the request-bound `req.t` (typed as `ScriptTranslations`) or the underlying `getScriptTranslations<C>(component, lang): ScriptTranslations[C]` primitive.

Re-run `npm run generate:types` whenever you add a script-facing key.

## Adding a new component

1. Create `translation/<component>/en-US.toml`. Use `[table]` sub-tables for grouping; put any browser-side keys under a single top-level `[script]` table (or set `script_only = true` if every key is browser-side).
2. In the relevant Nunjucks template:
   ```njk
   {% set t = templateT('<component>') %}
   ```
3. If it ships any client strings, inject them into `window.t` in the page's `<head>`:
   ```njk
   <script>window.t = Object.assign(window.t || {}, { <component>: {{ scriptT('<component>') | json | safe }} });</script>
   ```
4. Run `npm run generate:types` so `t.<component>` becomes typed in client scripts.
5. Restart the server (the loader runs once at boot — TOML changes require a restart).

## Fallback / missing-key semantics — quick reference

| Situation                          | Behavior                                              |
| ---------------------------------- | ----------------------------------------------------- |
| Key missing in `<lang>.toml`       | Falls back to English via `deepMerge`                 |
| Key stale (English source changed) | Rendered as-is (Weblate flags staleness elsewhere)    |
| Whole `<lang>.toml` missing        | `getTemplateTranslations` / `getScriptTranslations` fall back to English |
| Component folder missing English   | Loader throws at startup                              |
| Key absent from English source     | Compile-time error (the property doesn't exist in the generated `ScriptTranslations`) |

## Target end state (post-refactor)

The system today runs **alongside** the legacy i18next system. The redesign roadmap ([todo.md § Translation System Refactor](./todo.md)) removes the old system entirely. Once that work lands, expect the following differences from what's documented above:

- **`i18next` dependency dropped.** The package is removed from `package.json`. Language resolution is handled by the `req.lang` lazy getter ([reqLanguage.ts](../../src/server/middleware/reqLanguage.ts)).
- **Legacy `translate.ts` functions deleted.** `getTranslation(key, lang)` and `getTranslationForReq(key, req)` are removed along with i18next — they front the old monolith TOML system. Every current call site holds a `req` or a `ws`, so they migrate onto the request/connection-bound translations accessors (`req.t` / `ws.t` — see [Server-emitted response strings](#server-emitted-response-strings)); the rare future caller that holds only a bare language code (e.g. a queued email sender resolving the language from the DB) uses the exported `getScriptTranslations(component, lang)` primitive directly.
- **Legacy loader deleted.** `src/server/config/translationLoader.ts` is removed. `componentTranslationLoader.ts` is renamed (e.g. to `translationLoader.ts`) since it's the only one left.
- **Legacy type generator removed.** `scripts/generate-translation-types.ts` is deleted and dropped from the `generate:types` npm script. Only `generate-component-translation-types.ts` remains.
- **Legacy type files deleted.** `src/types/translations.ts` is removed. `../types/**/*` is removed from the `include` arrays of the server and client tsconfigs. The `LegacyClientTranslations` type and the `translations` global declaration in [src/client/types/globals.d.ts](../../src/client/types/globals.d.ts) are deleted (they only exist to type EJS-era pages still using the flat-file `translations` object); `const t: ScriptTranslations` stays.
- **Legacy monolith TOMLs deleted.** All `translation/<lang>.toml` files at the top level are removed once their keys have been migrated into per-component folders (or judged not worth migrating).
- **`translation/` contains only component folders** (plus `news/`) after the cleanup.
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
| Language resolution (`req.lang`) | [src/server/middleware/reqLanguage.ts](../../src/server/middleware/reqLanguage.ts) |
| Request-bound translations (`req.t`) | [src/server/middleware/reqTranslations.ts](../../src/server/middleware/reqTranslations.ts) |
| Connection-bound translations (`ws.t`) | [src/server/socket/openSocket.ts](../../src/server/socket/openSocket.ts) |
| Per-request `res.locals` setup   | [src/server/routes/root.ts](../../src/server/routes/root.ts)         |
| Client-side `window.t` injection | [src/server/views/layout.njk](../../src/server/views/layout.njk)     |
| Type generation                  | [scripts/generate-component-translation-types.ts](../../scripts/generate-component-translation-types.ts) |
