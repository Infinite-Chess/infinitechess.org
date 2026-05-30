# Drop the `responses` special-case from the translation system

## Context

The translation system has a special `responses` category for strings the server JS emits (HTTP error bodies, WebSocket notify messages). It has its own loader path, its own flat-dot type emission (`ResponseTranslationKeys`), and its own access function (`getResponseTranslation(key, reqOrWs)`). After the [TYPED_GETCLIENTTRANSLATION](./TYPED_GETCLIENTTRANSLATION.md) change lands, server JS has type-safe nested access to any component's `[client]` data via `getClientTranslation`. At that point the `responses` category is redundant: it can become a regular component with everything under `[client]`, accessed via the same generic API.

The result: server JS access for runtime-emitted strings converges on `getClientTranslation`. `getTemplateTranslation` continues to serve template-render data (Nunjucks SSR + helper code preparing template context — e.g. picking a random splash to pass into the template). One less type emission, one less loader special case, one less mental category to map onto.

Bandwidth note: `[client]` blocks only ship to the browser when a Nunjucks template explicitly calls `clientT('component')`. The migrated `responses` component is never injected anywhere, so its strings stay server-side at runtime even though they're typed under `[client]`.

## Prerequisite

[TYPED_GETCLIENTTRANSLATION](./TYPED_GETCLIENTTRANSLATION.md) must have landed. `getClientTranslation` is generic over `keyof ClientTranslations` and returns `ClientTranslations[C]`.

## Changes

### 1. Migrate TOML files

Keep the directory and component name `responses` (it accurately describes the content). Move every top-level key in each language file under a `[client]` block:

```toml
# Before: translation/responses/en-US.toml
[auth]
invalid_token = "..."

[user]
not_found = "..."
```

```toml
# After: translation/responses/en-US.toml
[client.auth]
invalid_token = "..."

[client.user]
not_found = "..."
```

Repeat for every `translation/responses/<lang>.toml` file. No translator-facing strings change; only the table prefix.

### 2. Loader — [componentTranslationLoader.ts](../../src/server/config/componentTranslationLoader.ts)

- Delete `responsesStore` and any responses-specific load path. `responses` becomes a regular component loaded into the same `componentStore` map as everything else.
- Delete `getResponseTranslation` entirely.
- Verify `loadComponentTranslations` no longer branches on `RESPONSES_COMPONENT`.

### 3. Config — [translationconfig.ts](../../src/server/config/translationconfig.ts)

- Delete the `RESPONSES_COMPONENT` constant and its export. No callers should remain after step 2.

### 4. Type generator — [generate-component-translation-types.ts](../../scripts/generate-component-translation-types.ts)

- Delete `generateResponseTranslations()` and any flat-dot/dotted-union logic.
- Delete the `RESPONSE_OUTPUT_FILE` constant and its emission.
- Delete the generated file `src/server/types/response-translations.ts`.
- Confirm `generateClientTranslations()` now naturally picks up the `responses` component (it scans `getComponentNames()` and includes any with a `[client]` block).

### 5. Call site migration

Every existing `getResponseTranslation('a.b.c', reqOrWs)` becomes a typed bracket-access chain off `getClientTranslation('responses', lang)`. Language resolution moves from being internal to the function to being inline at the call site.

Suggested helper to keep call sites tight:

```ts
// src/server/utility/translate.ts (or wherever fits)
export function getLang(reqOrWs: Request | CustomWebSocket): string {
    return reqOrWs instanceof WebSocket
        ? reqOrWs.metadata.cookies.i18next ?? tconfig.DEFAULT_LANGUAGE
        : getLanguageToServe(reqOrWs);
}
```

Then call sites become:

```ts
// Before:
res.status(400).send(getResponseTranslation('auth.invalid_token', req));

// After:
res.status(400).send(getClientTranslation('responses', getLang(req)).auth.invalid_token);
```

Or, when multiple keys are used in one handler:
```ts
const t = getClientTranslation('responses', getLang(req));
res.status(400).send(t.auth.invalid_token);
// ...
res.status(500).send(t.system.server_error);
```

Use `git grep getResponseTranslation` to find every site. The migration is mechanical; the TS compiler catches anything missed (the function no longer exists).

### 6. Tighten the `localizePositionError` call site

[createseek.ts](../../src/server/game/invitesmanager/createseek.ts) currently uses `getClientTranslation('shared', lang) as { position_errors?: ... }`. With `getClientTranslation` typed (per the prerequisite), the cast is already gone. Nothing extra needed here — flagged only so the agent doesn't re-add a cast by reflex.

### 7. Runtime missing-key behavior

The deleted `getResponseTranslation` had a runtime warning + raw-key fallback for missing translations. With typed nested access this becomes unnecessary:
- Missing English keys → compile-time error (the property doesn't exist in `ClientTranslations['responses']`).
- Missing non-English keys → already filled from English via `deepMerge` at load time.

No replacement logging needed. Strictly better: errors caught earlier.

## Verification

1. `npm run generate:types` — emits only the `ClientTranslations` interface; no `response-translations.ts` file appears.
2. `npm run type-check --silent` — clean. Any unmigrated `getResponseTranslation` call site errors here.
3. `npm run lint --silent` — clean.
4. `git grep getResponseTranslation` — no results.
5. `git grep RESPONSES_COMPONENT` — no results.
6. `git grep response-translations` — no results (config or imports).
7. Server runtime: trigger an error path that previously used `getResponseTranslation` (e.g. login with an invalid token). Confirm the localized response string still appears in the user's language.
8. Browser: inspect `window.t` on any page — `responses` should not be present (no template calls `clientT('responses')`).
9. Switch the `i18next` cookie to a language with no overrides and re-trigger the same error — confirm English fallback works (the deepMerge path).

## Out of scope

- The `[client]` block name is awkward when used for purely-server-emitted strings. A rename (e.g. to `[bracket]`, `[js]`, `[shared]`, etc.) is a separate concern. See [CLIENT_ONLY_TOML_FLAG](./CLIENT_ONLY_TOML_FLAG.md) for the related syntactic cleanup.
- Do not split or rename existing responses subtables. Translators see the same keys, just nested under `[client]`.
