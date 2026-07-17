# Engine Build & Deploy Pipeline

How the Apeiron WASM chess engine gets from Rust source to a served `.wasm` on infinitechess.org:
why we rebuild it on our own GitHub fork instead of downloading upstream binaries directly, how our
fork's `build-wasm.yml` publishes a release, how this repo downloads and serves that release at
build time, and how an engine release auto-deploys the site. Pairs with
[BUILD.md](/docs/systems/BUILD.md) (the esbuild pipeline this plugs into).

## The three repos

| Repo                               | Role                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FirePlank/infinite-chess-engine`  | **Upstream** — where the engine (Rust crate `apeiron`) is actually developed. We never push engine code anywhere; this is the sole source of engine improvements.                                                                                                                  |
| `Infinite-Chess/apeiron`           | **Our fork.** It is **only ever one file ahead of upstream** (several commits ahead only in merges) — the added [`.github/workflows/build-wasm.yml`](#the-forks-build-wasmyml) — and otherwise only ever _behind_, pulling upstream to receive the latest engine, then rebuilding. |
| `Infinite-Chess/infinitechess.org` | **This repo** — the consumer. Downloads the fork's latest release at build time and serves it.                                                                                                                                                                                     |

### Why rebuild from source on our fork?

Security / supply-chain, same rationale as Lichess vs. Stockfish: we don't ship a binary an
upstream author released — we rebuild it ourselves from source we've pulled, on infrastructure we
control, so the served `.wasm` is reproducible from auditable source. The fork exists **only** to
attach our build+release workflow to upstream's source.

## Flow at a glance

```
upstream improves engine, bumps Cargo.toml version (on an Elo gain)
        │  we pull upstream → push to fork `main`
        ▼
fork build-wasm.yml:  wasm-pack build → zip pkg/ → GitHub Release (apeiron-wasm.zip)
        │  last step: POST workflow_dispatch → infinitechess.org deploy.yml (ref=prod)
        ▼
infinitechess.org deploy.yml (self-hosted):  npm run build → pm2 reload
        │  build runs downloadEngineWasm() → sees new release tag → downloads+extracts zip
        ▼
copyEngineToDist() → /engine/<hash>/ ;  manifest['engine'] + ['engineVersion']
        ▼
analysis and other pages serves the new engine at its new hashed URL; panel shows "Apeiron X.Y"
```

## The fork's `build-wasm.yml`

Lives in `Infinite-Chess/apeiron`, **not** in this repo — but a local clone sits adjacent to this
repo (sibling directory `../Infinite-Chess-apeiron`), we can read and edit it directly. Triggers on
push to the fork's `main` (i.e. after we pull upstream) or manual `workflow_dispatch`. Steps:

1. **Checkout** + install `wasm-pack`. (Rust toolchain is the runner default, pinned by the crate's
   `rust-toolchain.toml`.)
2. **`wasm-pack build --target web`** → emits `pkg/`: `apeiron.js` (glue), `apeiron_bg.wasm`, type
   defs, `package.json`, and — for the rayon multithreaded build — `snippets/wasm-bindgen-rayon-<hash>/src/workerHelpers.no-bundler.js`.
3. **Read version from `Cargo.toml`** → compose the release tag `v${version}+build.${run_number}`.
4. **Zip `pkg/`** (`cd pkg && zip -r ../apeiron-wasm.zip . -x ".*"`), preserving the nested
   `snippets/` tree.
5. **Create Release** with `apeiron-wasm.zip`, tagged/named as in step 3.
6. **Trigger the deploy** — `POST …/infinitechess.org/actions/workflows/deploy.yml/dispatches` with
   `{"ref":"prod"}`, authed by `secrets.INFINITECHESS_DISPATCH_TOKEN`.

### The version scheme — two identifiers, distinct jobs

The tag `v2.0.0+build.47` encodes both, and conflating them breaks things:

- **Display version** = the Cargo semver (`2.0.0`). Upstream bumps it **only on a strength (Elo)
  gain**, major/minor — patch stays `0`. Shown in the engine panel as major.minor (`Apeiron 2.1`).
  Because it deliberately does **not** move on most commits, it **cannot** be the download-staleness
  key.
- **Build id** = `+build.${run_number}`, a monotonic per-build counter. Makes every tag **unique**,
  so releases never clobber each other (rollback-safe) and the consumer's up-to-date check detects
  _every_ new build — including potential bug fixes that didn't change the display version.

Consumer side: `parseEngineVersion()` in [engine-wasm.ts](/build/engine-wasm.ts) strips the leading
`v` and everything from `+` onward → the display semver. `getVersionedEngineName()` in
[src/shared/chess/engine.ts](/src/shared/chess/engine.ts) trims that to major.minor for the panel.

## Consumer download — [build/engine-wasm.ts](/build/engine-wasm.ts)

Runs inside `npm run build` via [build/index.ts](/build/index.ts): `downloadEngineWasm()` is
**awaited**, then `copyEngineToDist()`, **both before** the esbuild client build so the engine's
hashed URL lands in the manifest (see [BUILD.md](/docs/systems/BUILD.md)). Engine binaries are
**not committed** — `src/client/pkg/` is gitignored; they persist on disk across builds (`npm run
clean` is `rimraf dist` only, and never touches `pkg/`).

`downloadEngineWasm()` logic, in order:

1. **`.local-build` opt-out** — if `pkg/.local-build` exists, skip the download entirely and set the
   version to `'dev'`. This is how a dev running their own local engine build (or a symlinked engine
   repo) keeps it from being overwritten by a release. Create it with `touch src/client/pkg/apeiron/pkg/.local-build`.
2. Read the `.engine-version` stamp (the tag of the copy on disk).
3. **Fetch the latest release** from `LATEST_RELEASE_API_URL` (`…/Infinite-Chess/apeiron/releases/latest`),
   zod-validated. On any network/validation failure: fall back to the existing local copy if present
   (build proceeds with the old engine), else error out.
4. **Up-to-date check** — if the stamped tag equals the remote tag _and_ `apeiron_bg.wasm` +
   `apeiron.js` exist, do nothing.
5. **New version** — find the asset `apeiron-wasm.zip`, fetch it fully into memory, `unzipSync`
   (via `fflate`) **before** touching disk (so a bad download doesn't destroy the working copy),
   then wipe `pkg/` wholesale and write every entry at its archive-relative path (recreating the
   `snippets/` tree). Finally, stamp `.engine-version` with the new tag.

The wipe (rather than overwrite-in-place) matters: without it, each release's hash-named `snippets/`
dir would accumulate in the persistent prod `pkg/`, and stale pre-rename files could linger.

## Serving — [copyEngineToDist()](/build/engine-wasm.ts)

Copies `apeiron.js` + `apeiron_bg.wasm` + `snippets/` into `dist/client/engine/<hash>/`, where
`<hash>` = first 8 hex of `sha256(glue + wasm)`. Sets `engineGlueUrl = /engine/<hash>/apeiron.js`.
[build/client.ts](/build/client.ts)'s manifest writer folds two non-esbuild-asset keys into
`dist/manifest.json`: `manifest['engine']` (the glue URL) and `manifest['engineVersion']` (the raw
semver) — because the engine glue is served **unbundled** and so isn't an esbuild entry point.

**Why unbundled + hashed:** rayon self-spawns its search threads via the glue's own
`import.meta.url`, resolving the sibling `.wasm` and `snippets/` as **real served files** — esbuild
bundling breaks that. The `<hash>` in the path content-busts browser/CDN caches whenever the engine
changes.

Runtime consumption:

- [analysis.njk](/src/server/views/analysis.njk) SSRs `manifest['engine']` into
  `window.analysisPageData.engineUrl`. The engine **name+version** is SSR'd separately — nunjucks
  computes an `engineNameVersioned` global from `manifest['engineVersion']` and injects it into the
  panel; the client never handles the version.
- [ceval.ts](/src/client/scripts/esm/views/analysis/ceval.ts) spawns the worker and posts `cmd:'init'`
  with `engineUrl`. [apeironanalysis.worker.ts](/src/client/scripts/esm/views/analysis/apeironanalysis.worker.ts)
  does `import(engineUrl)` → `wasm.default()` (loads the sibling `.wasm`). If the build exports
  `initThreadPool` it runs multithreaded **Lazy SMP** (needs the `snippets/` and a cross-origin-isolated
  page); otherwise it degrades to single-thread.
- This list isn't exhaustive — more consumers may exist, whether or not they are added here.

## Deploy — [.github/workflows/deploy.yml](/.github/workflows/deploy.yml)

Runs on the **self-hosted** prod machine. Concurrency group `deploy` with `cancel-in-progress:
false` — one deploy at a time; a second queues rather than being dropped. Two trigger paths, same
job, differing only by which steps run:

| Step                                                                          | On push to `prod` (code deploy) | On `workflow_dispatch` (engine release / manual) |
| ----------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------ |
| 1. Pre-deploy DB backup (loopback `/api/prepare-restart`; aborts if it fails) | ✅ `if: push`                   | ⏭️ skipped                                       |
| 2. `git pull && npm ci`                                                       | ✅ `if: push`                   | ⏭️ skipped                                       |
| 3. **`npm run build`**                                                        | ✅ always                       | ✅ always                                        |
| 4. `pm2 reload infinitechess`                                                 | ✅ always                       | ✅ always                                        |
| 5. Health check (curl homepage, expect 200)                                   | ✅ always                       | ✅ always                                        |

An **engine release triggers the dispatch path**: it does **not** pull infinitechess.org code or
reinstall deps — it just re-runs the build against the code already on `prod`. Step 3 is where the
new engine is picked up: `downloadEngineWasm()` sees the new release tag, downloads+extracts the new
zip, and esbuild rebuilds so the new content-hashed engine URL lands in the manifest.

**No downtime from engine fetch:** the old pm2 process serves through the _entire_ build (step 3),
so the only user-visible interruption is the `pm2 reload` swap in step 4 (~2.5s; dropped WebSockets
auto-reconnect). Engine download/extract time never touches users.

## Gotchas & maintenance

- **Asset-name contract.** The consumer hardcodes the asset name `apeiron-wasm.zip` and expects
  `apeiron.js` / `apeiron_bg.wasm` inside — names wasm-pack derives from the crate name `apeiron`.
  The workflow and consumer must agree on all three.
- **Never diverge the fork from upstream** except `build-wasm.yml`. All engine changes go upstream;
  the fork only pulls and rebuilds.
- **A bugfix won't change the displayed version** (patch stays 0 by design) — but `+build.N` still
  increments, so it still ships. Don't "fix" the version not moving.
- **`snippets/` in the release** is required for multithreading; verify it's inside the zip after any
  `build-wasm.yml` change.

## File map

| Concern                                                  | File                                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Download + extract + version parse                       | [build/engine-wasm.ts](/build/engine-wasm.ts)                                                                                       |
| Build orchestration (engine steps before esbuild)        | [build/index.ts](/build/index.ts)                                                                                                   |
| Manifest fold-in (`engine`, `engineVersion`)             | [build/client.ts](/build/client.ts)                                                                                                 |
| Engine crate metadata (display name, version formatting) | [src/shared/chess/engine.ts](/src/shared/chess/engine.ts)                                                                           |
| `engineNameVersioned` SSR global                         | [src/server/config/nunjucks.ts](/src/server/config/nunjucks.ts)                                                                     |
| Analysis page SSR (engineUrl, engine name)               | [src/server/views/analysis.njk](/src/server/views/analysis.njk)                                                                     |
| Worker: load glue, init threads                          | [src/client/scripts/esm/views/analysis/apeironanalysis.worker.ts](/src/client/scripts/esm/views/analysis/apeironanalysis.worker.ts) |
| Worker lifecycle / eval driver                           | [src/client/scripts/esm/views/analysis/ceval.ts](/src/client/scripts/esm/views/analysis/ceval.ts)                                   |
| Site deploy job                                          | [.github/workflows/deploy.yml](/.github/workflows/deploy.yml)                                                                       |
| Engine build+release job                                 | `Infinite-Chess/apeiron` → `.github/workflows/build-wasm.yml` (separate repo)                                                       |
