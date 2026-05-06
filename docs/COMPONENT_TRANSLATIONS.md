# Component Translation System

This document describes the new component-based translation system being built for the redesigned website. It replaces the old monolithic per-language TOML files once all pages have been migrated.

[← Back to README](../README.md) | [Legacy translation guide](./TRANSLATIONS.md)

## Overview

Each feature area (header, footer, leaderboard page, etc.) has its own directory under `translation/` containing one TOML file per supported language. The English file is the authoritative source; all other languages fall back to English for any missing keys.

Translations are loaded once at server startup, cached in memory, and injected into every Nunjucks render context automatically by middleware.

---

## Directory structure

```
translation/
  header/
    en-US.toml       ← source of truth; run type generator after every change
    de-DE.toml
    fr-FR.toml
    ...
  footer/
    en-US.toml
    ...
  leaderboard/
    en-US.toml
    ...
```

Flat files directly under `translation/` (e.g. `translation/en-US.toml`) belong to the **legacy** system and will be deleted once migration is complete.

---

## TOML file structure

A component TOML has two conceptual sections:

### Server-side keys (SSR / Nunjucks)

All top-level tables and keys that are **not** under `[client]` are server-side only. They are available in Nunjucks templates via `{{ t.<component>.<key> }}`.

### `[client]` sub-table (browser JS)

Keys that JavaScript running in the browser needs go under `[client]`. They are **excluded** from the server-side object and instead serialised into `window.__t.<component>` so any client script can read them. The sub-table wrapper is stripped — access keys at the top level of the component object (e.g. `window.__t.header._test_hello`, not `window.__t.header.client._test_hello`).

### Example

```toml
# translation/leaderboard/en-US.toml

[headings]
title = "Leaderboard"
subtitle = "Top players by rating"

[client]
# Keys below are sent to the browser; not available in Nunjucks templates.
rank   = "Rank"
player = "Player"
rating = "Rating"
```

### TOML name-collision rule

A parent table (`[nav]`) **cannot** also have a same-named string key as one of its sub-tables. If `[nav.learn]` exists, the parent must not contain `learn = "..."`. Move the label into the sub-table as `label = "..."` instead.

---

## Type safety

### Generating types

After adding or editing any `en-US.toml`, regenerate TypeScript interfaces:

```bash
npx tsx scripts/generate-translation-types.ts
```

This produces two outputs:

| Output                                         | Contains                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/server/types/componentTranslations.ts`    | One interface per component (sans `[client]`), plus `SharedT` and `PageContext<P>` |
| `src/client/types/translations/<component>.ts` | `<Component>ClientT` interface (only when `[client]` exists)                       |

Never edit these files manually — they are always overwritten by the generator.

### Server-side types

`SharedT` describes what every Nunjucks template always receives (header, footer once created):

```ts
import type { SharedT, PageContext } from '../types/componentTranslations.js';

// res.locals.t is typed SharedT
// For page-specific translations, extend it:
function myRoute(req: Request, res: Response): void {
	const lang = getLanguageToServe(req);
	res.render('leaderboard.njk', {
		t: {
			...res.locals.t,
			page: getComponentTranslation('leaderboard', lang),
		} satisfies PageContext<LeaderboardTranslations>,
	});
}
```

### Client-side types

The generated interface lives at `src/client/types/translations/<component>.ts`:

```ts
import type { HeaderClientT } from '../../types/translations/header.js';

const headerT = window.__t?.header as HeaderClientT;
console.log(headerT._test_hello); // fully typed
```

`window.__t` is declared in `src/types/globals.d.ts` as `Record<string, Record<string, string>>` — enough for untyped access anywhere. For full type safety, import the generated interface and cast as shown above.

---

## Server-side usage (Nunjucks templates)

The `injectTranslations` middleware runs on every HTML request and populates `res.locals.t` with shared component translations. `res.locals` is automatically merged into the Nunjucks render context by Express, so templates receive `t` without any extra boilerplate.

```njk
{# src/server/views/components/header/header.njk #}
<button class="header-nav-link">{{ t.header.nav.learn }}</button>
```

For page-specific strings, route handlers extend `t` with a `page` key:

```njk
{# Template #}
<h1>{{ t.page.headings.title }}</h1>
```

```ts
// Route handler
res.render('leaderboard.njk', {
	t: { ...res.locals.t, page: getComponentTranslation('leaderboard', lang) },
});
```

---

## Client-side usage (browser JS)

The `tClient` object (same shape as `t` but containing only `[client]` keys) is serialised by `layout.njk` into an inline `<script>` tag:

```html
<script>
	window.__t = { header: { _test_hello: 'Hello from server-side translations!' } };
</script>
```

Read it in any client script:

```ts
import type { HeaderClientT } from '../../types/translations/header.js';

const headerT = window.__t?.header as HeaderClientT;
console.log(headerT._test_hello);
```

`window.__t` is populated before any `type="module"` scripts execute, so it is always available.

---

## How the middleware works

`src/server/middleware/injectTranslations.ts` runs on every request that sends HTML (`Accept: text/html`). For each component in `SHARED_COMPONENTS = ['header', 'footer']`:

1. Calls `getComponentTranslation(component, lang)` → sets `res.locals.t[component]`
2. Calls `getClientTranslation(component, lang)` → sets `res.locals.tClient[component]`

Both reads hit the in-memory cache built at startup — no disk I/O at request time.

`layout.njk` then serialises `tClient` to `window.__t` using the `tojson` Nunjucks filter, which escapes `<`, `>`, `&`, and `'` to their Unicode equivalents so the JSON is safe inside a `<script>` block.

---

## Adding a new component

1. Create `translation/<component>/en-US.toml` with the English strings.
2. Run `npx tsx scripts/generate-translation-types.ts`.
3. The component's server-side interface appears in `src/server/types/componentTranslations.ts`.
4. If it is a _shared_ component (present on every page), add its name to:
    - `SHARED_COMPONENTS` in `src/server/middleware/injectTranslations.ts`
    - The `alwaysPresentComponents` filter in `scripts/generate-translation-types.ts` (the array `['header', 'footer', 'common']`)
5. If it is _page-specific_, call `getComponentTranslation` in the route handler and pass as `t.page`.

---

## Adding keys to an existing component

1. Add the key to `translation/<component>/en-US.toml`.
2. Run `npx tsx scripts/generate-translation-types.ts` to update the TypeScript interfaces.
3. Optionally add the key to other language TOMLs; missing keys fall back to English automatically.

---

## Relationship to the legacy system

The old `translation/*.toml` / i18next system (`translationLoader.ts`) remains active alongside the new system. Both are initialised in `src/server/config/i18n.ts`. Once all pages are migrated:

- Delete `translation/*.toml` flat files
- Delete `translationLoader.ts`
- Remove the i18next initialisation from `i18n.ts`
- Remove the i18next dependency from `package.json`
