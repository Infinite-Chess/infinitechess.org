# Session Handoff — ICN → Gamefile Pipeline Consolidation

## Purpose of this doc

Captures the insight and the agreed plan for de-duplicating the several code paths
that turn an ICN (or longformat) into a gamefile, and for adding **move-flattening**
to custom-position seek creation. Nothing has been implemented yet — this is the
pre-implementation handoff.

---

## The trigger / new requirement

Custom-position **seek creation** sends an ICN to the server, and the server
**rejects ICNs that contain moves**. So the client must convert `starting position + moves`
into a **single-position ICN** (all moves applied, move list dropped) before sending.

Today `getInviteVariant()` for the From-ICN case sends `element_icnInput.value` — the
**raw ICN, moves included** — which the server would reject. This is a latent bug the
flattening work fixes.

---

## What we learned about the existing code

### The four consumers of one primitive

There is really **one core operation** — "construct a logic `GameFile` from
`variantOptions + moves`" — and four call sites are all thin wrappers around it:

| Call site                          | = the primitive, plus…                                               |
| ---------------------------------- | -------------------------------------------------------------------- |
| `gameformulator.formulateGame`     | variant resolution + `ensureVariantLoaded`; **returns** the gamefile |
| `positionvalidation.validateMoves` | try/catch → error code; **discards** the gamefile                    |
| `analysisloader.pasteGame`         | rendering (via `gameslot.loadGamefile`)                              |
| seek-flatten (new)                 | compress-to-single-position                                          |

The redundancy was never "pasteGame vs formulateGame" specifically — it's that the
**construction itself is re-run per consumer**.

### The custom-ICN path builds the whole game twice

For the analysis page's From-ICN flow the same ICN→game pipeline runs end-to-end twice:

1. **Validation gate** (`variantSelector.validateIcnInput`): `ShortToLong_Format`
   → `variantOptionsFromLongFormat` → `movePacketsFromParsed`
   → `validatePosition` + `validateMoves`. `validateMoves` **builds the full gamefile
   via `initGameFile` and throws it away**; the parsed moves are discarded, and the
   resolved options land in `icnResult.options`.
2. **The actual load** (`pasteGame`, via `analysissetup`): `ShortToLong_Format` **again**
   → re-resolve options → re-parse moves → `loadGamefile` → `initGameFile` for real.

Net per accepted paste: ICN parsed 2×, options resolved 2×, moves parsed 2×, game built 2×.

### The pivotal constraint: flattening needs a _built_ gamefile

`gamecompressor.GameToPosition` (used by `compressGamefile(gf, true)`) replays
`move.state` and `move.changes` off `MoveFull[]`. Those precomputed change-sets **only
exist after the game is constructed** — a raw `MovePacket` is just `{token, clockStamp}`.
So you **cannot** flatten position+moves from ICN tokens; you must build the gamefile first.

Crucially, `validateMoves` **already builds** exactly such a gamefile (then discards it).
Retaining that build gives the flatten for free.

### The cache unit is the parsed `longFormat`, not the options

`options`, `moves`, and metadata (`variant`, `dateTimestamp`, `timeControl`,
`presetAnnotes`) are **all derivations of the one `ShortToLong_Format` parse**. Threading
"options + moves" downstream is the wrong shape: it drops metadata and duplicates the
derivation. The thing to hold onto and pass along is the **`longFormat`**.

This also fixes a latent correctness point: validation derives options with
`variantOptionsFromLongFormat(longFormat, { fullMove: 1 })` — it **forces `fullMove: 1`** —
whereas a real load must preserve the ICN's `fullMove`. Deriving per-consumer from the
shared `longFormat` (validation normalizes, load preserves) is the only correct version;
caching validation's `options` for loading would clobber `fullMove`.

### `fullMove` does not affect legality (so one build serves both)

`whosTurn` comes from `turnOrder[0]` (`boardinit.ts:90`), **not** from `fullMove`. So
`fullMove` is purely the display counter. The `{ fullMove: 1 }` override in validation is
therefore safe for legality, and **one gamefile build can serve both validation and the
seek-flatten**. (The flattened seek position will carry a 1-based `fullMove`; this is
cosmetic and matches "start a new game from this position".)

### `copygame` is not the helper's home

`copyGame` is already a thin wrapper: `compressGamefile(gf, single)` →
`LongToShort_Format` → clipboard. The reusable flatten primitive lives in
**`gamecompressor`** (`GameToPosition` + the start-state build inside `compressGamefile`),
which `copyGame` already calls. So nothing moves _out of_ copygame; the seek path just
reuses gamecompressor too. `copyGame`'s clipboard output legitimately _wants_ the metadata
that a seek must omit, so `copyGame` stays as-is.

---

## The agreed plan (items 1–6; item 7 deferred)

**Shape** — `icnResult` in `variantSelector` becomes the cache for the one parse + one build:

```ts
{ isValid: boolean; options: VariantOptions;
  longFormat?: LongFormatOut;   // From-ICN only — source for analysis load
  gamefile?: GameFile }         // From-ICN only — source for seek flatten
```

### 1. `src/shared/chess/variants/positionvalidation.ts`

- `validateMoves` currently builds then discards. Refactor it to **return the build**:
  `(options, moves, revealErrors) → GameFile | 'moves_invalid'`.
- Rename to **`tryConstructGame`** — it now constructs-and-returns; a construction crash
  still means `'moves_invalid'` (contract preserved). Sole caller is `variantSelector`.
- Add the `GameFile` type import.

### 2. `src/client/scripts/esm/game/chess/gamecompressor.ts` _(helper's real home)_

- Extract `buildStartState(gamefile)` from `compressGamefile` (kill the duplicated
  start-state build).
- Add `gamefileToPositionOptions(gamefile): VariantOptions` — flattens all moves → the
  current position's `VariantOptions`.
- `copygame.ts` untouched.

### 3. `src/client/scripts/esm/components/variantselector/variantSelector.ts`

- `validateIcnInput` stores `longFormat` + the returned `gamefile` into `icnResult`.
- `getInviteVariant` (ICN case):
  `variantOptionsToICN(gamecompressor.gamefileToPositionOptions(icnResult.gamefile))`
  — reuses the existing `variantOptionsToICN` (empty metadata, compact, size-limited).
  **Fixes the raw-ICN-with-moves bug.**
- `getCustomPosition` (ICN case): return `{ kind: 'longFormat', longFormat }` instead of
  the raw ICN string.
- Update the `validateMoves`→`tryConstructGame` import; add `GameFile` + `gamecompressor`
  imports.

### 4. `src/client/scripts/esm/views/analysis/analysisloader.ts` + `analysissetup.ts`

- `pasteGame` takes a **pre-parsed `LongFormatOut`** instead of an ICN string (drop its
  internal `ShortToLong_Format`).
- `loadInitialGame` parses the server ICN once and passes it in.
- `analysissetup` passes the cached `longFormat` from `getCustomPosition`.

### Deviation from the originally-brainstormed item 6

Analysis ICN case routes through **`pasteGame(longFormat)`**, _not_
`loadVariantOptions(options, moves)` — because options derive from the longFormat and the
metadata still needs it. `loadVariantOptions` stays as-is.

---

## Possible refinement — flatten lazily at seek-send time (not per-change)

The plan above flattens **inside `getInviteVariant`**. But that function is called on
**every** `onChange` (via `gameSetupModal.syncRatedButton` → `isRatedAllowed`), and
`isRatedAllowed` only reads `variant.kind` — it **ignores the position string**. So
flattening in `getInviteVariant` runs a flatten+serialize on every keystroke for a value
the frequent caller discards (non-trivial for large positions).

Refinement: keep `getInviteVariant` cheap and flatten **only on actual seek-send**
(`handleOnlineSeek`). Note it **cannot** be done "in the lobby" / `createSeek` — flattening
needs the **built gamefile cached in `variantSelector`**, which that layer doesn't have;
rebuilding there would reintroduce the redundancy we're removing. So the shape is a
dedicated `variantSelector` method (e.g. `getSeekPositionICN()`) sourced from the cached
`icnResult.gamefile`, called only on submit.

This is optional and can follow the initial change — flattening in `getInviteVariant`
is functionally correct, just wasteful per-keystroke.

## Explicitly deferred — Item 7 (separate change, must NOT force rework of 1–6)

Unify `formulateGame` + `tryConstructGame` + `pasteGame` into a single
"longformat → built gamefile" constructor, and remove the icnvalidator worker's
double-build (`formulateGame` called once without and once with the validate flag).
`formulateGame` is the closest existing shape (it already has a `validateMoves?: true`
flag) and also currently reinvents the `icnimport` helpers inline
(`gameformulator.ts:32-48`) — that inline dup folds in here. Everything in 1–6 is already
longFormat-centric, so #7 extends it rather than rewriting it. This is what finally clears
the `analysisloader.ts` "REMOVE REDUNDANT LOGIC" TODO.

---

## Verification / close-out

- `npm run type-check --silent` and `npm run lint --silent` must both be green.
- Two details to confirm during implementation (do not change the plan's shape):
    - `buildMetaDataFromGamefile` is **not** on the seek path (we go through
      `variantOptionsToICN`, which uses empty metadata) — good, keeps seek ICN small and
      under `POSITION_STRING_THRESHOLD`.
    - `state_global` type reconciliation between `SimplifiedGameState` (partial) and
      `VariantOptions` (`GlobalGameState`).

## Key file references

- `src/shared/chess/variants/positionvalidation.ts` — `validateMoves` / `validatePosition`
- `src/client/scripts/esm/game/chess/gameformulator.ts` — `formulateGame`
- `src/client/scripts/esm/game/chess/gamecompressor.ts` — `compressGamefile`, `GameToPosition`
- `src/client/scripts/esm/game/chess/copygame.ts` — `copyGame`
- `src/client/scripts/esm/components/variantselector/variantSelector.ts` — `validateIcnInput`,
  `getInviteVariant`, `getCustomPosition`, `variantOptionsToICN`, `icnResult`
- `src/client/scripts/esm/views/analysis/analysisloader.ts` — `pasteGame`, `loadInitialGame`
- `src/client/scripts/esm/views/analysis/analysissetup.ts` — `loadSelection`
- `src/shared/chess/logic/icn/icnimport.ts` — `variantOptionsFromLongFormat`,
  `movePacketsFromParsed`, `getPositionAndSpecialRightsFromLongFormat`
- `src/client/scripts/esm/views/icnvalidator/icnvalidator.worker.ts` — the double-build (item 7)
