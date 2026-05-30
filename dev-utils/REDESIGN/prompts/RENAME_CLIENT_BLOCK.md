# Rename the `[client]` block and its related code identifiers

## Context

Each translation TOML splits into two access channels:

- **Top-level keys** — read during template rendering (Nunjucks SSR or helper code preparing template context). Accessed via `templateT()` from templates and `getTemplateTranslation()` from server JS.
- **Keys under `[client]`** — accessed via typed property/bracket notation, by either the browser (when a template injects the component via `clientT()` into `window.t`) or by server JS at runtime (via `getClientTranslation()`).

The name `[client]` only made sense when this block was strictly for the browser. That's no longer the case: server JS reads its data too, and many components keep data under `[client]` that no template ever injects (so it never reaches the browser). The name lies about both audience and direction.

## Why the name is wrong

The `[client]` name implies an audience (the browser). The actual distinction the block encodes is an **access pattern** (typed property lookup vs. SSR walking). Concrete mismatches:

- A component holding server-emitted response strings has every key under `[client]` despite the browser never seeing any of them. The block name suggests the opposite.
- A pure-server utility that reads any of these keys via `getClientTranslation()` looks like it's reaching into client-only data — readers have to know the access-pattern convention to parse the intent.
- New contributors writing a TOML have to be told: "name your block `[client]` even though it's not for the client." That's a memorable footgun and a smell.
- Tooling and code that touches blocks named `[client]` (the loader, the type generator, any `client_only` flag, future docs) inherits the misleading vocabulary. The TS identifiers built on it — `ClientTranslations`, `getClientTranslation`, `clientT`, the generated `client-translations.d.ts` file — all carry the same misleading audience-claim.

## What we want from a new name

The replacement should:

1. **Describe the access pattern, not the audience.** "How you reach this data" (property lookup) is what's actually invariant.
2. **Be short.** TOML headers are written and read often.
3. **Not collide with reasonable top-level key names** anywhere in current or future TOMLs.
4. **Pair naturally with the top-level "for template rendering" half.** Reading a TOML's two halves should make the access asymmetry obvious without context.
5. **Survive a future where `getTemplateTranslation` and the top-level half also get a sharper name.** Whatever we pick should still make sense if the other side is later named `[template]` or similar.

## Candidate framings to consider

Not a final list — these are starting points to discuss. Each row describes the *framing* the candidate evokes; the actual word can be bikeshedded once the framing lands.

| Framing | Candidates | Why it fits | Why it might not |
|---|---|---|---|
| Access mechanism | `[lookup]`, `[bracket]`, `[indexed]` | Maps directly to "you reach this via `[]` or `.` from typed code." | "Lookup" or "bracket" feels abstract for a translation file. |
| Runtime vs render | `[runtime]`, `[live]` | Captures "this is consulted at request time, not baked into HTML at SSR." | Top-level data is also consulted at request time, technically. |
| Origin/destination of strings | `[emit]`, `[send]` | "Strings sent out: either to the browser to be looked up, or to a response body." | Misleading for keys read internally and never sent (rare but possible). |
| Layer/tier | `[js]`, `[code]`, `[script]` | "This half is consumed by code, the other half by templates." | `[js]` is slightly off since server is TS; `[code]` is vague. |
| Pure neutral marker | `[data]`, `[main]` | No semantic claim; pure structural divider. | Loses the educational value of the name. |
| Audience-neutral but explicit | `[shared]` | "Available to both browser and server, depending on injection." | `[shared]` is already used elsewhere (a component name); double duty causes its own confusion. |

The pair this block forms with the top-level half is worth considering during selection. If you imagine adding an explicit `[template]` or `[ssr]` block on the other side someday, the chosen name should still read coherently next to it.

## Scope of work (high level)

This rename is the most invasive of the translation refactor docs because it touches **every TOML file** plus the loader, type generator, any flag built on the old name, and the public TS surface (interface, getter, middleware helper, generated `.d.ts` filename).

1. **Loader**: replace every `parsed['client']` and `(...)?.client` with the new name. The split logic itself doesn't change.
2. **Type generator**: replace the `parsed['client']` check and the comment referring to `[client] table`. Rename the emitted interface (`ClientTranslations` → new name) and the generated file (`client-translations.d.ts` → new name to match). The interface property *contents* are unaffected (e.g. `t.shared.foo` stays `t.shared.foo` — only the TOML section header and the wrapping interface name change).
3. **Loader getter**: rename `getClientTranslation` to match the new vocabulary, in [componentTranslationLoader.ts](../../src/server/config/componentTranslationLoader.ts).
4. **Middleware helper**: rename `clientT` in [root.ts](../../src/server/routes/root.ts) and update every Nunjucks template that calls it. Grep `clientT(` to find usage sites.
5. **Global `t` declaration**: update `declare const t: ClientTranslations` in [globals.d.ts](../../src/client/types/globals.d.ts) and any triple-slash reference path to match the renamed file.
6. **Loader flag (if landed)**: rename the `client_only` boolean to match the new vocabulary.
7. **Migrate every TOML**: rewrite each `[client...]` table header (and dotted variants). A scripted find-and-replace handles this if the new name doesn't collide with existing top-level keys.
8. **Docs**: update the translation system reference and any other doc using the old term.
9. **No code consuming `t.foo.bar.baz` (browser or server) needs to change** — the in-memory shape is identical. Only the TOML authoring vocabulary, the wrapping interface name, the getter name, the middleware helper name, and the generated file name change.

The TOML-side rename and the TS-side rename should land together so the codebase never sits in a state where the section header and the consuming code disagree on vocabulary.

## Verification

1. `npm run generate:types` — the emitted interface body (property names and shapes) is byte-identical before and after; only the wrapper interface name and filename change.
2. `npm run type-check --silent` — clean. Any consumer still importing the old `ClientTranslations` name or calling `getClientTranslation` errors here.
3. `npm run lint --silent` — clean.
4. Restart the dev server. Spot-check a page that uses a now-renamed block: confirm strings still render (SSR) and `window.t.<component>` still populates (where applicable).
5. Grep for stragglers: `[client` in TOMLs; `ClientTranslations`, `getClientTranslation`, `clientT(`, `client-translations.d.ts` in code. All should be gone.

## Out of scope

- Do not introduce an explicit `[template]` (or equivalent) block for the top-level half in this pass. If desired, it's a separate change that can build on the chosen vocabulary.
- Do not rename `getTemplateTranslation` or `templateT`. Those serve the top-level half and aren't part of the misleading vocabulary being fixed here.
