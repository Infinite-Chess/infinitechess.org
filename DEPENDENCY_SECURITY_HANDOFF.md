# Dependency Security Remediation — Handoff

**Status:** `npm audit` went from **35 → 5** vulnerabilities. Working tree clean.
**Branch:** `redesign`
**Date of this handoff:** 2026-06-13
**Remaining:** 2 critical, 2 high, 1 moderate — all analyzed below with a recommended path.

> This document is self-contained. A fresh session (or a human) should be able to pick up the remaining work from here without re-deriving context.

> 🛑 **STOP-AND-ASK RULE (most important):** **Discuss with Naviary before making ANY decision.** This includes — but is not limited to — every major/breaking version bump, replacing or removing any package, choosing between alternatives, adding new fields (`engines`, `.nvmrc`, etc.), or any time a transitive vuln has no clean in-range fix. Do **not** act on a judgment call unilaterally. When in doubt, ask. Present options + a recommendation, then wait for his answer. Naviary reviews and commits every change himself.

---

## ⚠️ READ FIRST — Environment & workflow rules

These are non-negotiable for this project. Violating them is how things break.

### Node / npm

- **Use Node 22 for everything.** This workspace's default was set to 22 via `nvm alias default 22` (machine-local only — **not** in the repo). If you're in a _fresh_ workspace it will default to Node 24 again; run `nvm use 22` first.
    - Verify: `node -v` → `v22.x`, `npm -v` → `10.x`.
- **Why it matters — the lockfile gotcha that bit us:** Node 24 ships **npm 11**, Node 22 ships **npm 10**. npm 11 writes lockfiles that **omit platform-specific optional deps** (the `@esbuild/<platform>` entries). npm 10's `npm ci` then **fails** with `package.json and package-lock.json not in sync`. **CI and prod both run Node 22 / npm 10 with `npm ci`** — so a lock written by npm 11 breaks CI and the prod deploy. Always run `npm install` under Node 22 so the lock stays npm-10-portable. (The commit `Regenerate package-lock under npm 10 for CI/prod compatibility` fixed this; don't reintroduce it.)
- Package **version selection is independent of Node version** — npm picks from semver ranges, not the running Node. So our fixes are correct regardless; only the lockfile _format_ was Node/npm-sensitive.

### Production environment

- Prod is a **2014 Intel iMac on macOS Big Sur (macOS 11)** — cannot be upgraded. Deploy is a self-hosted GitHub Actions runner + **pm2** (`.github/workflows/deploy.yml`), and **the deploy runs `npm run build` on that box** — so build-time devDeps (esbuild, tsx, cpx2) must run there too.
- **Node 22 is both the floor and the ceiling** for prod. Do **not** adopt any dependency that requires Node > 22 or a newer macOS than Big Sur.
- History note: a past "mindless" update broke the native module `better-sqlite3` (no prebuilt binary for a too-new Node). That's why the project pins Node 22 LTS.

### How fixes must be done (Naviary's rules)

1. **One package per commit.** Naviary reviews and commits each fix himself — **do not run `git`** (don't stage, commit, or push). Apply the change, verify, and report.
2. For each fix, report: **a one-line "risk if unpatched" (with evidence)** and **a concise suggested commit name.**
3. **No npm `overrides`.** It's the maintainer's job to depend on safe versions. Prefer **bumping the parent** (the direct dep we declare) — even if it's a breaking change we adapt our code to.
4. **"Scenario 1" fixes are allowed and preferred when available:** a `npm update <pkg>` that moves a transitive dep up _within the range the parent already declares_ (lockfile-only, **not** an override). This honors the parent's own stated-safe range.
5. If a transitive vuln has **no** in-range update and **no** parent fix → **stop and discuss options.** Don't force it.
6. **Anything needing a real decision → discuss with Naviary first** (major bumps, replacing/removing a package, choosing between alternatives, no clean fix available, adding repo config). One decision at a time; resolve it before moving on. Default to asking rather than assuming — present options and a recommendation, then wait. See the STOP-AND-ASK rule at the top.

### Verification checklist (run for every fix, on Node 22)

```bash
nvm use 22
npm run type-check --silent      # tsc -b --noEmit
npm run lint --silent            # eslint .
npm test                         # vitest run (83 tests baseline)
npm run build                    # when the dep touches the build/runtime
npm ci                           # MUST pass on Node 22 (catches the lockfile gotcha)
```

Also exercise the actual code path the dep touches when feasible (e.g. run the asset copy, hit a route, generate types).

---

## ✅ Completed this session (17 commits, 35 → 5)

Each was its own commit, verified with type-check + lint + tests (and build/runtime where relevant).

| #   | Commit                                                         | Sev cleared    | Type                                                           |
| --- | -------------------------------------------------------------- | -------------- | -------------------------------------------------------------- |
| 1   | Patch express-rate-limit ReDoS (8.2.1 → 8.5.2)                 | high           | direct minor                                                   |
| 2   | Patch ws uninitialized memory disclosure (8.18.3 → 8.21.0)     | moderate       | direct minor                                                   |
| 3   | Patch smol-toml comment-line DoS (1.4.2 → 1.6.1)               | moderate       | direct minor                                                   |
| 4   | Patch node-forge signature/cert advisories (1.3.3 → 1.4.0)     | high           | direct minor                                                   |
| 5   | Remove unused i18next-http-middleware dependency               | high           | dead-dep removal                                               |
| 6   | Patch qs DoS via express 4.22.1 → 4.22.2 bump                  | moderate       | direct patch                                                   |
| 7   | Patch vitest UI RCE (4.0.2 → 4.1.8)                            | critical       | direct minor (+ cleared transitive `vite` high)                |
| 8   | Patch tsx bundled esbuild advisory (4.20.6 → 4.22.4)           | high           | direct minor                                                   |
| 9   | Bump wait-on 9.0.0 → 9.0.10 to pull safe axios/lodash/joi      | 2 high + 2 mod | parent bump (cleared axios, lodash, joi, follow-redirects)     |
| 10  | Bump @aws-sdk/\* 3.985 → 3.1068 to pull safe fast-xml-parser   | high + mod     | parent bump (cleared fast-xml-parser, @aws-sdk/xml-builder)    |
| 11  | Update flatted to 3.4.2 (within eslint's range)                | high           | scenario-1                                                     |
| 12  | Update ajv to 6.15.0 (within eslint's range)                   | moderate       | scenario-1                                                     |
| 13  | Update brace-expansion across 1.x/2.x/5.x (DoS fix)            | moderate       | scenario-1                                                     |
| 14  | Update path-to-regexp to 0.1.13 (ReDoS fix)                    | high           | scenario-1 (within express's `~0.1.12`)                        |
| 15  | Update yaml to 2.9.0 (stack-overflow DoS fix)                  | moderate       | scenario-1                                                     |
| 16  | Replace unmaintained cpx with maintained cpx2 fork             | high×2 + mods  | **package replacement** — removed 103 pkgs / −1,993 lock lines |
| 17  | Regenerate package-lock under npm 10 for CI/prod compatibility | —              | lockfile portability (see gotcha above)                        |

**Key context on the cpx2 swap (#16):** `cpx` was unmaintained and dragged in ancient `chokidar@1` + `micromatch@2` (the "snapdragon galaxy"). Replaced with `cpx2@9` (maintained fork, same `cpx` CLI/binary, both npm scripts unchanged). cpx2's `engines` (`^22.0.0 || >=24.0.0`) is what makes Node 22 the de-facto floor now.

---

## 🔧 Remaining work (5 vulns → 4 actions)

Do these **one at a time, one commit each**, in this recommended order. The first two are low-risk and clear 3 of the 5 (including **both criticals**). The last is the only genuine "discuss first" item.

### Action 1 — `concurrently` 9 → 10 ⭐ clears BOTH criticals

- **Fixes:** `concurrently` (critical) **and** `shell-quote` (critical, transitive). concurrently@9.2.1 hard-pins `shell-quote@1.8.3` (vulnerable); concurrently@10.0.3 uses `shell-quote@1.8.4`. Once concurrently no longer forces 1.8.3, npm hoists the single shared copy to 1.8.4, which **also** cleans cpx2's shell-quote. One bump, two criticals gone.
- **DECISION ALREADY MADE — it's safe.** concurrently@10 requires **Node ≥22**, which is _already_ the project floor (SETUP.md, CI, cpx2). concurrently is **dev-only** — used solely in the `dev` script (`concurrently -k "npm:dev:*" --prefix-colors "..."`); it's **never** run by CI or the prod deploy. Production is unaffected regardless.
- **CLI flags used (`-k`, `npm:dev:*`, `--prefix-colors`) are stable core features unchanged in v10.** The only breaking change in v10 is the Node-22 floor.
- **Apply:** in `package.json` devDependencies, `"concurrently": "^9.2.1"` → `"^10.0.3"`, then `npm install` (on Node 22).
- **Verify:** type-check, lint, tests, `npm ci`; then confirm `npm run dev` launches all four watchers without error (run with a timeout and kill, since it's long-running). Confirm `npm audit` shows concurrently **and** shell-quote both gone.
- **Risk if unpatched:** `shell-quote.quote()` fails to escape newlines in object `.op` values → possible shell command injection when untrusted input is passed to a shelled-out command (dev-tooling context). Critical by CVSS, low real exposure here (dev-only), but it's a **critical on every `npm i`**.
- **Suggested commit name:** `Bump concurrently 9 -> 10 to clear shell-quote critical`

### Action 2 — `picomatch` → 2.3.2 (scenario-1, clean)

- **Fixes:** `picomatch` (high). **Good news:** a 2.x fix exists — `picomatch@2.3.2` (vuln is `<=2.3.1`). The parents already allow it: `micromatch@4.0.8` (via lint-staged) and `chokidar@3.6.0` (via nodemon) both declare `picomatch ^2.3.1`, which 2.3.2 satisfies. So this is a **scenario-1 lockfile update — no parent bump, no override.**
- **Apply:** `npm update picomatch` (on Node 22). Confirm all `2.3.1` instances move to `2.3.2` (the `4.0.4` instances under vitest are already safe and unrelated).
- **Verify:** type-check, lint, tests, `npm ci`. (picomatch backs glob matching in lint-staged + nodemon — both dev-only.)
- **Risk if unpatched:** ReDoS + incorrect glob matching via method injection in POSIX character classes (high). Dev-only (lint-staged/nodemon), author-controlled patterns → low practical risk.
- **Suggested commit name:** `Update picomatch to 2.3.2 (ReDoS/glob-injection fix)`

### Action 3 — `esbuild` 0.25 → 0.28 (direct, build tool)

- **Fixes:** `esbuild` (high, our direct devDep is `0.25.9`; vuln range `0.17.0 - 0.28.0`, fix `0.28.1`). Note: `tsx` already bundles a safe `esbuild@0.28.1` internally; this is specifically **our top-level `esbuild` devDep** used by the build.
- **Usage to check for breakage:** `build/server.ts`, `build/client.ts`, `build/plugins.ts` use `esbuild.context(...)` (incremental/watch), `BuildOptions`, `Plugin`/`PluginBuild`, `Metafile`. The `context` API has been stable since 0.17, so 0.25→0.28 should be safe — **but esbuild documents small breaking changes per release**, so read the [esbuild changelog](https://github.com/evanw/esbuild/blob/main/CHANGELOG.md) for 0.26 / 0.27 / 0.28 and confirm nothing we use changed.
- **Apply:** `"esbuild": "^0.25.0"` → `"^0.28.1"`, then `npm install` (Node 22).
- **Verify (important — this is the build bundler):** full `npm run build` must succeed (client ESM + server + client CJS), plus type-check, lint, tests, `npm ci`. The CI `build` and `smoke-test` jobs and the prod deploy all run the build, so this must be solid.
- **Risk if unpatched:** esbuild's dev server lets any website send requests to it and read source/responses (high). The build uses `esbuild.context()`/`build()`, **not** `serve()`, so it's likely not exploitable here — but it's a high finding and esbuild is on the prod build box.
- **Decision note:** technically a 0.x "major-ish" bump of the build tool. Low risk given the stable `context` API, but **flag the changelog check to Naviary** before committing. Dev/build-only.
- **Suggested commit name:** `Bump esbuild 0.25 -> 0.28.1 (dev-server advisory)`

### Action 4 — `nodemailer` 7 → 8 ⚠️ DISCUSS FIRST (production email)

- **Fixes:** `nodemailer` (moderate). Our `package.json` declares `^7.0.11` (installed 7.0.11). **There is no 7.x fix** — the advisory covers `<=8.0.4`, fixed in **8.0.5+**; npm's suggested fix is `nodemailer@8.0.11`. So this is a **major bump 7 → 8** of a **production** dependency (sends account-verification / password-reset emails).
- **Usage:** `src/server/utility/mailer.ts` — uses `SESv2Client` + `SendEmailCommand` from `@aws-sdk/client-sesv2` (already bumped). Check whether nodemailer is used as the SES transport or for SMTP, and review the nodemailer 8.x migration notes / changelog for breaking changes in the transport + `sendMail` API the code relies on.
- **This is the one item that genuinely needs Naviary's sign-off** (production email + major version). Present the 8.x breaking-change summary and the diff to `mailer.ts` (if any) before committing.
- **Verify:** type-check, lint, tests (the account/login integration tests exercise the mailer path), `npm ci`. If feasible, do a real send test in a safe environment.
- **Risk if unpatched:** SMTP command injection via unsanitized `envelope.size` and via CRLF in the transport `name` (EHLO/HELO) (moderate). Exploitability depends on whether any of those fields are attacker-influenced.
- **Suggested commit name:** `Bump nodemailer 7 -> 8 (SMTP command injection fix)`

---

## After all four actions

Expected end state: **`npm audit` → 0 vulnerabilities.** Re-run the full verification checklist on Node 22 and confirm `npm ci` passes.

## Optional follow-ups discussed but de-scoped

- **Make Node 22 enforced for new contributors/workspaces** (currently nothing warns on wrong Node). Options: add `"engines": { "node": ">=22" }` to `package.json` (npm only _warns_) + `engine-strict=true` in `.npmrc` (hard error); and/or a `.nvmrc` containing `22`. Naviary marked auto-adopting Node 22 in new workspaces as **out of scope** for now.
- This handoff file (`DEPENDENCY_SECURITY_HANDOFF.md`) should be **deleted** once the remaining work is done.

## Quick reference — current 5 remaining

```
concurrently  critical  direct    9.2.1            -> Action 1 (bump to ^10.0.3)
shell-quote   critical  transitive 1.1.0 - 1.8.3   -> Action 1 (auto-resolves)
esbuild       high      direct    0.17.0 - 0.28.0  -> Action 3 (bump to ^0.28.1)
picomatch     high      transitive <=2.3.1         -> Action 2 (npm update -> 2.3.2)
nodemailer    moderate  direct    <=8.0.4          -> Action 4 (bump 7 -> 8, DISCUSS)
```
