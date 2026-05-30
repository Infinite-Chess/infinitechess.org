# Add a `client_only` flag for translation TOMLs

## Context

The per-component translation system (see [TRANSLATION_SYSTEM.md](../TRANSLATION_SYSTEM.md)) splits each TOML into two halves: everything under `[client]` is shipped to the browser via `clientT()`/`window.t`; everything outside `[client]` stays server-side via `templateT()`.

When a component is entirely client-side (e.g. `translation/shared/en-US.toml`, and likely most page-specific TOMLs going forward), every subtable header must be prefixed with `client.`:

```toml
[client.variants]
Classical = "Classical"

[client.variant_groups.standard]
name = "Standard"
description = "Normal rules apply."

[client.modifiers.slide-limit]
name = "Slide Limit"
description = "Pieces can't slide more than {n} squares"
```

The `client.` prefix on every section header is noisy and easy to forget. Goal: let an author opt the whole file into "client" mode with a single flag, so subtables can be written without the prefix.

## The change

Add a top-level boolean flag `client_only` that the loader recognizes. When set to `true`, the loader treats the entire parsed object (minus the flag itself) as the `client` half and leaves the `template` half empty. Backwards compatible — existing components without the flag behave exactly as today.

Example after the change:

```toml
client_only = true

[variants]
Classical = "Classical"

[variant_groups.standard]
name = "Standard"
description = "Normal rules apply."

[modifiers.slide-limit]
name = "Slide Limit"
description = "Pieces can't slide more than {n} squares"
```

`templateT('shared')` returns `{}`. `clientT('shared')` returns the same shape as before (variants, variant_groups, modifiers, etc., one level up from where they were declared).

## Implementation

### 1. Loader — [src/server/config/componentTranslationLoader.ts](../../../src/server/config/componentTranslationLoader.ts)

Find the function that splits a parsed component's data into `{ template, client }` for regular (non-`responses`) components. Today it pulls out the `client` subtable and routes everything else to `template`. Modify it:

- If the parsed object has `client_only === true`:
  - Remove the `client_only` key.
  - Route the entire remaining object into `client`.
  - Set `template` to `{}`.
- Else: existing behavior.

The function should still apply the XSS filter and `deepMerge` English fallback the same way.

### 2. Type generator — [scripts/generate-component-translation-types.ts](../../../scripts/generate-component-translation-types.ts)

`generateClientTranslations()` currently reads each component's English TOML and looks for `parsed['client']`. Update it: if `parsed['client_only'] === true`, treat the rest of the parsed object (excluding the `client_only` flag) as the client block. Else: existing behavior (look for `parsed['client']`).

The emitted `ClientTranslations` interface shape stays identical in both cases.

### 3. Documentation — [dev-utils/REDESIGN/TRANSLATION_SYSTEM.md](../TRANSLATION_SYSTEM.md)

Add a short section under "On-disk layout" or "Per-request usage in templates" describing the `client_only = true` shorthand. Mention it's optional and backwards-compatible.

### 4. Migrate existing client-only TOMLs

After the loader and generator support the flag, simplify any TOMLs that are currently entirely under `[client]`. As of this writing, that's at least:
- [translation/shared/en-US.toml](../../../translation/shared/en-US.toml)
- Likely several page-specific TOMLs added since (grep for `[client.` to find candidates).

For each: add `client_only = true` at the top, then unindent every section header by removing the `client.` prefix.

## Verification

1. `npm run generate:types` — confirm no diff in the generated [client-translations.d.ts](../../../src/client/types/client-translations.d.ts) after migrating an existing file to the flag form. The interface shape must stay byte-identical.
2. `npm run type-check --silent` — clean.
3. `npm run lint --silent` — clean.
4. Restart dev server. Load `/`. Verify:
   - `window.t.shared.variants.Classical` still resolves to `"Classical"` (or the localized equivalent).
   - The variant selector still renders variant names and group descriptions.
   - The variant preview tooltip still renders its narrative.
5. Backwards-compat smoke test: confirm a component *without* `client_only` and *with* a normal `[client]` block (e.g. a freshly-created page TOML) still works as before.

## Out of scope

- This is a quality-of-life refactor of the TOML authoring experience only. Do not change any translation strings, file structure, or runtime behavior beyond the parsing split.
- Do not change `responses` handling (it's already special-cased).
