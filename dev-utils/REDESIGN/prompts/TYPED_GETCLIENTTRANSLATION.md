# Type-safe `getClientTranslation` on the server

## Context

[getClientTranslation](../../src/server/config/componentTranslationLoader.ts) returns `Record<string, any>`, so server-side reads of client-component translations are unchecked. The trigger to do this work is in [createseek.ts](../../src/server/game/invitesmanager/createseek.ts) (the `localizePositionError` helper): a typo in the cast `as { position_errors?: Record<string, string> }` would silently fall through to the runtime fallback.

This change makes `getClientTranslation` typed via the same generated `ClientTranslations` interface the client already uses. The browser's global `t` stays client-only — the server can never accidentally reference `t` directly, only its narrow `getClientTranslation('component', lang)` typed access.

## The split

The generated artifact splits in two:

- **`src/shared/types/client-translations.d.ts`** (new location): `export interface ClientTranslations { ... }`. Both client and server tsconfigs include `src/shared/`, so the interface is importable from both sides.
- **`src/client/types/globals.d.ts`** (existing file): add a `declare const t: ClientTranslations` (with the necessary `import type` or triple-slash reference). This file is in the client tsconfig only, so `t` is undefined on the server — any accidental server-side use errors as `Cannot find name 't'`.

## Changes

### 1. [scripts/generate-component-translation-types.ts](../../scripts/generate-component-translation-types.ts)

- Change `CLIENT_OUTPUT_FILE` from `src/client/types/client-translations.d.ts` to `src/shared/types/client-translations.d.ts`.
- Emit `export interface ClientTranslations { ... }` (add `export`).
- Drop the `declare const t: ClientTranslations;` line from the generated file — that declaration moves to `globals.d.ts` (which is hand-maintained, not generated).

### 2. [src/client/types/globals.d.ts](../../src/client/types/globals.d.ts)

Add at the bottom (or wherever fits):
```ts
/// <reference path="../../shared/types/client-translations.d.ts" />
declare const t: ClientTranslations;
```

(Use triple-slash reference rather than `import type` so the file stays a script and `declare const` remains a true global. If the file is already a module, wrap in `declare global { ... }`.)

### 3. [src/server/config/componentTranslationLoader.ts](../../src/server/config/componentTranslationLoader.ts)

Make `getClientTranslation` generic:
```ts
import type { ClientTranslations } from '../../shared/types/client-translations.js';

export function getClientTranslation<C extends keyof ClientTranslations>(
    component: C,
    lang: string,
): ClientTranslations[C] {
    // existing body; cast the return to ClientTranslations[C] before returning.
}
```

The runtime body stays the same — only the signature tightens.

### 4. [src/server/routes/root.ts](../../src/server/routes/root.ts)

The `clientT` middleware currently has signature `(component: string) => ...`. Update to match the new generic signature so templates keep working (`templateT` doesn't change).

### 5. [src/server/game/invitesmanager/createseek.ts](../../src/server/game/invitesmanager/createseek.ts)

Tighten the existing cast in `localizePositionError`:
- Drop the `as { position_errors?: Record<string, string> }` cast.
- Replace with: `const shared = getClientTranslation('shared', lang); return shared.position_errors[code] ?? code;`
- Remove the `TODO` comment that named this hole.

## Verification

1. `npm run generate:types` — the new file appears at `src/shared/types/client-translations.d.ts`; the old `src/client/types/client-translations.d.ts` is gone.
2. `npm run type-check --silent` — clean.
3. `npm run lint --silent` — clean.
4. Confirm client scripts still get `t.shared.x.y` autocomplete (the global from `globals.d.ts`).
5. Confirm server scripts importing `ClientTranslations` get the same shape.
6. Try writing `t.shared.x` in a server-only file — should error with `Cannot find name 't'`. This is the hard guarantee we want.
7. Try writing `getClientTranslation('not_a_real_component', lang)` — should error because `'not_a_real_component'` isn't `keyof ClientTranslations`.
8. Try writing `getClientTranslation('shared', lang).position_errors.fake_code` — should error.

## Out of scope

- Do not touch `getResponseTranslation` or its flat-dot type. A separate follow-up may overhaul that for consistency.
- Do not migrate any TOML structure. The on-disk format and the loader's `template`/`client` split are unchanged.
