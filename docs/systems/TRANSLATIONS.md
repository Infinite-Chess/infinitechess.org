# Translation System (Developer Reference)

How the redesign-era, per-component, TOML-based translation system works on the server and in
templates. This is the dev reference — see [TRANSLATING.md](/docs/TRANSLATING.md) for translator
workflow.

> The legacy flat `translation/en-US.toml` is no longer loaded at runtime. It survives only as the
> source of the type for the client's legacy `translations` global, which dormant EJS-era pages
> still reference.

## On-disk layout

```
translation/
├── <component>/             one folder per feature: header, leaderboard, responses, ...
│   ├── en-US.toml           REQUIRED source; startup throws if missing
│   ├── de-DE.toml           optional per-language overrides
│   └── ...
├── news/                    excluded from the loader (see EXCLUDED_DIRS)
└── en-US.toml               legacy flat file, types only (see the note above)
```

A component's TOML may include a top-level `[script]` sub-table. Everything **outside** `[script]`
is for server-side templating only; the `[script]` block is the **only** part that can be shipped to
the browser. A component whose keys are _all_ script-facing can set top-level `script_only = true`
and write subtable headers without the `script.` prefix — see
[translation/shared/en-US.toml](/translation/shared/en-US.toml).

Config lives in [src/server/config/translationConfig.ts](/src/server/config/translationConfig.ts)
(`DEFAULT_LANGUAGE`, `TRANSLATION_FOLDER`, `EXCLUDED_DIRS`).

## Boot

[src/server/app.ts](/src/server/app.ts) calls `translationLoader.load()` once at startup. That
function ([translationLoader.ts](/src/server/config/translationLoader.ts)):

1. Scans `translation/` for subdirectories (skipping `EXCLUDED_DIRS`).
2. Parses every `<lang>.toml` and runs all string values through an XSS filter that whitelists only
   `em / strong / b / i / br / span[class]`.
3. Splits each language's parsed object into `{ template, script }`.
4. **Fills missing keys from English** via `deepMerge` (so `en-US` keys absent in `de-DE` appear as
   English). Stale (out-of-date) translations are rendered **as-is** — Weblate is the source of
   truth for staleness.
5. Caches everything in a module-level `Map<component, Map<lang, ComponentEntry>>`.

## Per-request usage in templates

For every page request, [src/server/routes/root.ts](/src/server/routes/root.ts) merges the base
render context (built by `getBaseRenderContext` in
[renderContext.ts](/src/server/utility/renderContext.ts)) into `res.locals`, exposing on every
template:

- `lang` — the resolved language code. `req.lang` is a lazy getter on the request prototype
  ([reqLanguage.ts](/src/server/config/reqLanguage.ts)) that resolves the language (cookie →
  Accept-Language → default) on first access and caches it for the rest of the request, so it's
  available anywhere — including code that runs before the routers (e.g. the rate limiter / error
  handler).
- `templateT(component)` → the component's translation object **with `[script]` stripped out**. Use
  in `.njk` for strings only the server renders.
- `scriptT(component)` → the **contents of the `[script]` sub-table**, promoted one level (so
  `[script] foo.bar = "x"` becomes `{ foo: { bar: "x" } }`). Returns `{}` if the component has no
  `[script]` table.

In a Nunjucks template:

```njk
{% set t = templateT('header') %}
<button>{{ t.nav.learn }}</button>
```

### How client-side keys reach the browser

There is **no fetch and no client-side loader**. Client strings are inlined into the SSR'd HTML as a
JSON literal inside a `<script>` tag, evaluated synchronously before any module scripts run. The
flow:

1. The Nunjucks page (typically [layout.njk](/src/server/views/layout.njk) for site-wide components,
   or an individual page template for page-specific ones) calls `scriptT('<component>')`.
2. Nunjucks's built-in `| json` filter serializes the returned object to JSON, and `| safe` tells
   Nunjucks not to HTML-escape the resulting JSON (safe because every string was already
   XSS-sanitized at load time by the loader's whitelist filter — see [Boot](#boot)).
3. The result is embedded as `window.t = { <component>: {...} };` in the `<head>`. Today,
   [layout.njk](/src/server/views/layout.njk) does this for `header` and `shared`:

    ```njk
    <script>window.t = { header: {{ scriptT('header') | json | safe }}, shared: {{ scriptT('shared') | json | safe }} };</script>
    ```

4. Page-specific components extend the object instead of overwriting it. Add this in the page
   template's `{% block head %}`:

    ```njk
    <script>window.t = Object.assign(window.t || {}, { leaderboard: {{ scriptT('leaderboard') | json | safe }} });</script>
    ```

5. Client TS reads `t.<component>.<key>` — typed via the generated `ScriptTranslations` interface
   (see [Type generation](#type-generation)). The `t` symbol is declared globally, so no import is
   needed. Its type claims every component, but a page only carries those it injects, so read only
   components injected on every page your module's directory ships to
   ([IMPORT_RULES.md](/docs/systems/IMPORT_RULES.md)): `gamegui` from `game/`, a page's own
   component from `views/<page>/`.

Because the data is baked into the HTML at request time, the user's language is already correct on
first paint — no FOUC, no loading state, no round-trip. The trade-off is that adding or changing a
client key requires a page reload (and `npm run generate:types` for the type to update).

## Server-emitted response strings

When the server itself (not a Nunjucks template) needs to emit a translated string — error
responses, socket replies, validation messages — put the string in
`translation/responses/<lang>.toml` and read it off the request-bound translations object `req.t`:

```ts
res.status(400).send(req.t.responses.auth.invalid_token);
```

`req.t` is a fully-typed `ScriptTranslations` accessor present on every Express request, mirroring
the client-side global `t`. It's a lazy getter installed on the request prototype
([reqTranslations.ts](/src/server/config/reqTranslations.ts)) that, on first access, reads the
language off `req.lang` and caches a Proxy for the rest of the request. Because `req.lang` resolves
itself lazily too, `req.t` works **everywhere** — including code that runs before the routers (e.g.
the rate limiter), with no pipeline-ordering concerns.

For socket replies, the connection-bound `ws.t` is the equivalent — a `ScriptTranslations` accessor
of the same shape, read the same way. It's built once when the socket connects
([socketOpen.ts](/src/server/socket/socketOpen.ts)) and lives on the `CustomWebSocket`
([socketTypes.ts](/src/server/socket/socketTypes.ts)). Unlike `req.t`, there's no lazy getter: the
language is fixed at connection time, so the accessor is assigned eagerly — the Proxy still resolves
each component lazily on first access.

When the caller holds only a resolved language code (e.g. SSR template-render code, or a queued
email sender that resolved the language from the DB), use the lower-level primitive
`translationLoader.getScript(component, lang)` that the bound accessors delegate to.

There's nothing structurally special about `responses` — any component's script-facing strings are
reachable the same way. The `responses` convention exists so server-emitted strings are visually
grouped in one folder for translators.

### Don't localize unreachable-by-a-good-client errors

If a response can only be triggered by a malformed request that a well-behaved client would never
send (e.g. a missing or wrong-typed body field), leave it as a plain English literal — no `req.t`
key. A real user never sees it; only hand-crafted/malicious requests do. Collapse all such
structural checks into one generic 400 ("Request body malformed.") rather than a customized string
per offending field — the sender already knows what they sent. Reserve localized response strings
for messages a behaving client can actually surface to a user.

## Interpolating dynamic values

Translated strings are static — there is no built-in interpolation. Put `{name}` placeholders in the
TOML value and resolve them with `interpolate.interpolate(template, vars)` from
[src/shared/util/interpolate.ts](/src/shared/util/interpolate.ts) (shared, so it works on both
sides; unknown placeholders are left intact):

```ts
// login_retry_in_other = "Failed to login, try again in {n} seconds."
interpolate.interpolate(req.t.responses.auth.login_retry_in_other, { n: 3 }); // "...in 3 seconds."
```

Keep the whole phrase in one key with placeholders — never assemble sentences by concatenation, so
translators can reorder words freely.

## Type generation

`npm run generate:types` (auto-run by `build` and `dev:build`) executes
[scripts/generate-component-translation-types.ts](/scripts/generate-component-translation-types.ts),
which produces
**[src/shared/types/script-translations.d.ts](/src/shared/types/script-translations.d.ts)** —
`export interface ScriptTranslations`, one property per component with script-facing strings. Lives
in `shared/` so both sides can consume it: client scripts read `t.header.x.y` via the global
declared in [src/client/types/globals.d.ts](/src/client/types/globals.d.ts); the server reads it
through the request-bound `req.t` (typed as `ScriptTranslations`) or the underlying
`translationLoader.getScript<C>(component, lang): ScriptTranslations[C]` primitive.

Re-run `npm run generate:types` whenever you add a script-facing key.

## Adding a new component

To localize a page, start with `npx tsx scripts/find-hardcoded-strings.ts <page>`: it lists the
hardcoded English in the page's templates and in every module its bundle ships. It's a heuristic
starting inventory, not a guarantee. It can't see:

- strings the server builds (the page's controller, socket replies, `responses`);
- single words that are lowercase or under four letters (`off`, `Yes`), or `Error` messages a catch
  later shows.

1. Create `translation/<component>/en-US.toml`. Use `[table]` sub-tables for grouping; put any
   browser-side keys under a single top-level `[script]` table (or set `script_only = true` if every
   key is browser-side).
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
6. To check nothing was missed, temporarily set `PSEUDO_LOC = true` in
   [translationLoader.ts](/src/server/config/translationLoader.ts): every translated string renders
   wrapped in `⟦…⟧`, so any plain text left on the page is hardcoded.

## Fallback / missing-key semantics — quick reference

| Situation                          | Behavior                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| Key missing in `<lang>.toml`       | Falls back to English via `deepMerge`                                                 |
| Key stale (English source changed) | Rendered as-is (Weblate flags staleness elsewhere)                                    |
| Whole `<lang>.toml` missing        | `translationLoader.getTemplate` / `.getScript` fall back to English                   |
| Component folder missing English   | Loader throws at startup                                                              |
| Key absent from English source     | Compile-time error (the property doesn't exist in the generated `ScriptTranslations`) |

## Target end state (post-refactor)

What remains of the legacy system exists only for the dormant EJS-era pages, and is removed once
they're migrated. Expect then:

- **Legacy type generator removed.** `scripts/generate-translation-types.ts` is deleted and dropped
  from the `generate:types` npm script. Only `generate-component-translation-types.ts` remains.
- **Legacy type files deleted.** `src/types/translations.ts` is removed, along with
  `"../types/**/*"` from the `include` of [src/shared/tsconfig.json](/src/shared/tsconfig.json) —
  the one place it's still listed (client and server reach `src/types/` through their project
  reference to shared). The `LegacyClientTranslations` type and the `translations` global
  declaration in [src/client/types/globals.d.ts](/src/client/types/globals.d.ts) are deleted (they
  only exist to type EJS-era pages still using the flat-file `translations` object);
  `const t: ScriptTranslations` stays.
- **Legacy monolith TOML deleted.** `translation/en-US.toml` is removed once its keys have been
  migrated into per-component folders, or deleted once no longer used.
- **`translation/` contains only component folders** (plus `news/`) after the cleanup.
- `translationLoader.ts`'s xss_options need to be tightened to only those html tags that actually
  appear in template strings.
- **[NAVIGATING.md](/docs/NAVIGATING.md) updated.** Its `src/client/views/` row still describes the
  legacy flow (EJS pages, the monolith `translation/en-US.toml`, and manual version bumps +
  `changes.json` entries). Rewrite it for the new system.
- **Once all pages are redesigned and real page usage is known: audit `shared/` for per-feature
  splitting to reduce bandwidth.** The `translation/shared/` component is injected into `window.t`
  on _every_ page sitewide (via `layout.njk`), so every string it holds ships on every page load
  whether or not that page uses it. The current convention is "anything used (or likely to be used
  post-redesign) on more than one page goes in `shared`," which is simple but means genuinely
  cross-page-but-not-universal string groups (e.g. account-field validation, used only on
  register/awaiting/resetpassword) ride along on the homepage, game, leaderboard, etc. that never
  reference them. When page usage is finalized, audit `shared`'s contents and split out string
  groups consumed only by a _handful_ of related pages into their own per-feature components (like
  `header`/`footer` already are), injected only where needed — leaving `shared` for what is _truly_
  universal (e.g. likely variant codes, sitewide error fallbacks, socket messages, etc.). This
  trades a little extra per-page injection wiring for a leaner baseline payload on every page. It's
  a deliberate convention change, not a one-off: do it across the board or not at all, since a
  single exception just makes the rule inconsistent.

When working on this refactor, the migration approach is: localize each new page by creating its
component TOML, deleting the migrated keys from the old monolith, and only deleting the legacy
infrastructure once nothing references it.

## Out of scope for this system

- **News posts** (`translation/news/<lang>/*.md`) — separate loader,
  [newsLoader.ts](/src/server/config/newsLoader.ts).
- **Terms of Service / Privacy Policy** — English only; markdown is too hard to diff for
  translators.

## File pointers

| Concern                                | File                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Loader, getters, deepMerge, XSS        | [src/server/config/translationLoader.ts](/src/server/config/translationLoader.ts)                   |
| Boot wiring                            | [src/server/app.ts](/src/server/app.ts)                                                             |
| Constants (folder, default lang)       | [src/server/config/translationConfig.ts](/src/server/config/translationConfig.ts)                   |
| Language resolution (`req.lang`)       | [src/server/config/reqLanguage.ts](/src/server/config/reqLanguage.ts)                               |
| Request-bound translations (`req.t`)   | [src/server/config/reqTranslations.ts](/src/server/config/reqTranslations.ts)                       |
| Connection-bound translations (`ws.t`) | [src/server/socket/socketOpen.ts](/src/server/socket/socketOpen.ts)                                 |
| Per-request `res.locals` setup         | [src/server/routes/root.ts](/src/server/routes/root.ts)                                             |
| Client-side `window.t` injection       | [src/server/views/layout.njk](/src/server/views/layout.njk)                                         |
| Type generation                        | [scripts/generate-component-translation-types.ts](/scripts/generate-component-translation-types.ts) |
