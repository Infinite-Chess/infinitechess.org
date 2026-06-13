# Dependency Security — Accepted Advisories Register

`npm audit` findings we **knowingly leave unpatched**, with the reason and the exact
condition to revisit. Plain `npm audit` has no allowlist, so these recur on every
audit — **check here first before "fixing" them.** Expected audit baseline = exactly
the rows below; anything beyond them is new.

**Prod constraint driving these:** the build box (2014 Intel iMac, **macOS Big Sur /
11**, runs `npm run build` on deploy) can't upgrade past **Node 22 / Big Sur**. Never
adopt a dep requiring Node > 22 or macOS > 11.

## Accepted advisories

| Package                              | Advisory                                                                 | Sev  | Why not fixed                                                                                                                                                                                                                                                         | Revisit when                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `esbuild` (direct devDep, `^0.25.0`) | [GHSA-gv7w-rqvm-qjhr](https://github.com/advisories/GHSA-gv7w-rqvm-qjhr) | high | Fix is `0.28.1`, but esbuild **0.27.0+ requires macOS 12** (Go 1.25/1.26 bump) → won't reliably run on the Big Sur build box. Advisory covers only esbuild's **Deno** install path (`NPM_CONFIG_REGISTRY` integrity); we use Node/npm, never Deno → no real exposure. | Prod moves to macOS 12+, **or** esbuild fixes it while still running on macOS 11. Then bump esbuild and delete this row. |
