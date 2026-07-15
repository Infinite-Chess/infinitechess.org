# Build System

How `src/` becomes the runnable `dist/`: esbuild bundling, entry points, the asset manifest,
content-hash caching, and the cpx asset copy. Covers adding new pages/assets and debugging
why an asset 404s or a template can't resolve its hashed filename.

## Pipeline at a glance

`npm run build` = `generate:types` → `clean` (rimraf dist) → `prod:assets` (cpx copy) →
`tsx build/index.ts`. Then `npm start` runs `dist/server/server.js`.

[build/index.ts](/build/index.ts) orchestrates, in order:

1. `setupEnv()` — ensures a valid `.env` exists.
2. `downloadEngineWasm() + copyEngineToDist()` — **awaited** (client bundle has a `.wasm` dependency on it).
3. `Promise.all([buildClient, buildServer])`.

Two modes, chosen by the `--dev` flag on `build/index.ts`:

- **Production** (no flag): one-shot esbuild `rebuild()`, then extra minification (SWC for JS,
  lightningcss for CSS). `--dev` is rejected if `NODE_ENV=production`.
- **Development** (`--dev`): esbuild **watch** mode, no extra minification.

## The two builds are separate from type-checking

esbuild **transpiles only — it does not type-check.** Type safety comes from `tsc -b`
(`npm run type-check`), driven by project references in [tsconfig.json](/tsconfig.json) →
`src/client/tsconfig.json` + `src/server/tsconfig.json` (both `composite`). The client config
includes `client/ + shared/ + types/`; the server config includes `server/ + shared/ + types/ +
tests/ + scripts/ + build/`. This split is what enforces the client/server/shared import rules.
A build can succeed while `type-check` fails, and vice-versa — always run both.

## Client build — [build/client.ts](/build/client.ts)

Bundled with **esbuild**. Two esbuild contexts:

- **ESM** (`format: 'esm'`, `bundle: true`, `splitting: true`) → `dist/client/`. Code splitting
  means shared deps become separate hashed chunks (`scripts/esm/[name]-[hash]`), loaded once per
  page instead of duplicated into each bundle.
- **CJS** (`format: 'cjs'`) → `dist/client/scripts/cjs/`, only for `htmlscript.ts`.

### ⚠️ Entry points are a manual list

`ESMEntryPoints` (and `CJSEntryPoints`) in [build/client.ts](/build/client.ts) are
hand-maintained arrays. **An ES module or CSS file is only built if it is an entry point or is
imported (transitively) by one.** When you add a page, you must add BOTH its stylesheet
(`src/client/css/foo.css`) and its client script (`src/client/scripts/esm/views/foo.ts`) to
`ESMEntryPoints`, or they silently won't be built and the template's manifest lookup will fail.
CSS files are listed as entry points directly (esbuild treats `.css` as bundleable).

Output is **content-hashed** (`[name]-[hash]`) so URLs are cache-bustable. Two options worth
knowing: `external: ['/fonts/*']` (font URLs in CSS are absolute web paths, not disk files —
esbuild would otherwise fail to resolve them) and `.glsl` files load as text with comments
stripped (relevant when adding shaders).

## Server build — [build/server.ts](/build/server.ts)

esbuild with `bundle: false` — every `.ts`/`.js` under `src/server/**` and `src/shared/**`
(glob, excluding `*.test.*`) is **transpiled 1:1** into `dist/` (ESM, sourcemaps on). No bundling,
no minification. Output mirrors the source tree.

## Non-bundled assets — `cpx`

Templates and binary/static assets are **not** processed by esbuild. They're copied verbatim by
`cpx` (`prod:assets` / `dev:assets --watch`): `png,jpg,webp,avif,svg,ico,gif,mp3,wav,opus,glsl,
md,woff2,woff,njk`. **`.njk` templates are copied, not compiled** → `dist/server/views/`. So a
new route referencing a new `.njk` works as soon as cpx copies it; in dev, the `--watch` cpx
propagates edits and Nunjucks re-reads (`watch: true` in non-prod).

## The manifest — the link between build output and templates

Because filenames are content-hashed, templates can't hardcode them. The flow:

1. The ESM build emits a `metafile`; `ManifestPlugin` calls `writeManifest()` on every
   (re)build's `onEnd`. (CJS has no manifest)
2. `dist/manifest.json` maps **logical name → hashed web path**, e.g.
   `"scripts/esm/views/login.ts"` → `"/scripts/esm/views/login-ABCD1234.js"` and
   `"css/login.css"` → `"/css/login-XXXX.css"`. (Keys strip `src/client/`; only true entry
   points are included — shared chunks are skipped.)
3. [src/server/config/nunjucks.ts](/src/server/config/nunjucks.ts) loads it as the Nunjucks
   global `manifest`. Templates reference assets via `{{ manifest['css/login.css'] }}` /
   `{{ manifest['scripts/esm/views/login.ts'] }}`. **The lookup key is the logical name, not the
   hashed one.**
4. Dev only: nunjucks `fs.watch`es the manifest and refreshes the global on change, so HTML
   always points at the current hash after a rebuild.

## Caching

Everything in `dist/client/` is served by
[staticAssets.ts](/src/server/middleware/staticAssets.ts) with a 1-year cache. The strategy
splits by how each asset is invalidated:

- **`.js` / `.css`** → `Cache-Control: immutable`. Safe to cache forever because the filename is
  content-hashed over the built output (`login-ABCD1234.js`): any change to that output yields a
  new hash → a new URL, so the old cached copy is never re-requested (Formatting and
  comment-only source edits compile to identical output). Templates resolve the current hash via the
  manifest, so the right URL ships automatically — nothing manual.
- **Everything else** (images, svg, audio, fonts) → cached 1 year but **not** immutable, since
  these filenames are stable. To bust them after editing the file, manually bump `?v=N` on the
  URL in the template.

## Other build inputs

- **`generate:types`** (runs before every build/dev): `tsx` scripts generate TypeScript types
  from the translation TOMLs. See [TRANSLATIONS.md](/docs/systems/TRANSLATIONS.md).
- **[build/env.ts](/build/env.ts)**: auto-generates `.env` with random token secrets if
  absent; validates `NODE_ENV ∈ {development, production, test}`.
- **[build/engine-wasm.ts](/build/engine-wasm.ts)**: downloads the latest Apeiron WASM
  release from GitHub into `src/client/pkg/apeiron/pkg/` (version-stamped). Network-failure
  tolerant — falls back to the existing local copy.

## `npm run dev`

`clean` then `concurrently` runs four watchers: `dev:build` (esbuild `--dev` watch),
`dev:tsc` (`tsc -b --watch --noEmit`, type errors only — separate from esbuild), `dev:assets`
(cpx `--watch`), and `dev:server` (`wait-on dist/server/server.js` then `nodemon`).

## Adding a new page — checklist

1. `src/server/views/foo.njk`, `src/client/css/foo.css`, `src/client/scripts/esm/views/foo.ts`.
2. **Register `foo.css` and `foo.ts` in `ESMEntryPoints`** in [build/client.ts](/build/client.ts).
3. Add the route in [root.ts](/src/server/routes/root.ts); template links assets via
   `{{ manifest['css/foo.css'] }}` and `{{ manifest['scripts/esm/views/foo.ts'] }}`.
4. Rebuild (or rely on dev watchers) so cpx copies the `.njk` and the manifest regenerates.
