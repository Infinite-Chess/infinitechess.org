# Session Handoff — ICN → Gamefile Pipeline Consolidation

## Purpose of this doc

Captures the plan for de-duplicating the several code paths that turn an ICN (or
longformat) into a gamefile. Two commits remain; neither has been implemented.

---

## Where things stand

`variantSelector.validateIcnInput` caches the products of its one validation pass in
`icnResult` — the parsed `longFormat`, and (when the whole ICN is legal) the `GameFile`
that validating the moves already built.

But `getCustomPosition` still hands the analysis page the **raw ICN string**, so that page
re-does from scratch everything the validation gate already did.

---

## What we learned about the existing code

### The three consumers of one primitive

There is really **one core operation** — "construct a logic `GameFile` from
`variantOptions + moves`" — and three call sites are all thin wrappers around it:

| Call site                             | = the primitive, plus…                                               |
| ------------------------------------- | -------------------------------------------------------------------- |
| `gameformulator.formulateGame`        | variant resolution + `ensureVariantLoaded`; **returns** the gamefile |
| `positionvalidation.tryConstructGame` | try/catch → error code; returns the gamefile                         |
| `analysisloader.pasteGame`            | rendering (via `gameslot.loadGamefile`)                              |

The redundancy isn't "pasteGame vs formulateGame" specifically — it's that the
**construction itself is re-run per consumer**.

### The custom-ICN path builds the whole game twice

For the analysis page's From-ICN flow the same ICN→game pipeline runs end-to-end twice:

1. **Validation gate** (`variantSelector.validateIcnInput`): `ShortToLong_Format`
   → `variantOptionsFromLongFormat` → `movePacketsFromParsed` → `validatePosition` +
   `tryConstructGame`. Both the parse and the gamefile land in `icnResult`.
2. **The actual load** (`pasteGame`, via `analysissetup`): `ShortToLong_Format` **again**
   → re-resolve options → re-parse moves → `loadGamefile` → `initGameFile` for real.

Net per accepted paste: ICN parsed 2×, options resolved 2×, moves parsed 2×, game built 2× —
with the first parse sitting unused in `icnResult` the whole time.

### The cache unit is the parsed `longFormat`, not the options

`options`, `moves`, and metadata (`variant`, `dateTimestamp`, `timeControl`,
`presetAnnotes`) are **all derivations of the one `ShortToLong_Format` parse**. Threading
"options + moves" downstream is the wrong shape: it drops metadata and duplicates the
derivation. The thing to pass along is the **`longFormat`**.

This also avoids a latent correctness trap: validation derives options with
`variantOptionsFromLongFormat(longFormat, { fullMove: 1 })` — it **forces `fullMove: 1`** —
whereas a real load must preserve the ICN's `fullMove`. Deriving per-consumer from the
shared `longFormat` (validation normalizes, load preserves) is the only correct version;
caching validation's `options` for loading would clobber `fullMove`.

(`fullMove` is purely a display counter — `whosTurn` comes from `turnOrder[0]`,
`boardinit.ts:90` — so the override is safe for legality. It is not safe for loading.)

---

## Commit breakdown

Two commits. **Both are required** — the plan is not done until commit 2 lands. Each is
independently green (`type-check` + `lint`) and independently revertable.

Commit 2 does **not** collapse commit 1 into itself. Commit 1 is its prerequisite, not a
throwaway step it undoes: `pasteGame` taking a `LongFormatOut` is what makes it mergeable
with a longFormat-centric constructor at all.

### Commit 1 — "Thread the parsed longFormat into the analysis load"

- `getCustomPosition` (ICN case) → `{ kind: 'longFormat', longFormat }` instead of the raw
  ICN string.
- `pasteGame` takes a **pre-parsed `LongFormatOut`**; drop its internal `ShortToLong_Format`.
- `loadInitialGame` parses the server ICN once and passes it in; `analysissetup` passes the
  cached `longFormat`.

The analysis ICN case routes through **`pasteGame(longFormat)`**, _not_
`loadVariantOptions(options, moves)` — because options derive from the longFormat and the
metadata still needs it. `loadVariantOptions` stays as-is.

This removes the redundant re-parse and re-resolve per accepted paste; the duplicate
**build** goes away with commit 2.

### Commit 2 — "Unify the ICN → gamefile constructors"

Unify `formulateGame` + `tryConstructGame` + `pasteGame` into a single "longformat → built
gamefile" constructor, and remove the icnvalidator worker's double-build (`formulateGame`
called once without and once with the validate flag). `formulateGame` is the closest
existing shape (it already has a `validateMoves?: true` flag) and also currently reinvents
the `icnimport` helpers inline (`gameformulator.ts:31-48`) — that inline dup folds in here.
Commit 1 leaves everything longFormat-centric, so this extends it rather than rewriting it.
Clears the `analysisloader.ts:121` "REMOVE REDUNDANT LOGIC" TODO — delete it.

**The inline dup is not a trivial lift.** `gameformulator` takes a `LongFormatIn`
(`moves: MovePreprint[]`), while the `icnimport` helpers are typed for `LongFormatOut`
(`moves: MoveParsed[]`) — so replacing lines 31-48 with `movePacketsFromParsed` +
`variantOptionsFromLongFormat` requires reconciling In/Out first. That reconciliation is
part of this commit, which is why the dup can't be cleaned up ahead of it on its own.

**The worker's double-build is load-bearing — do not just delete a call.** Stage 2 and
stage 3 (`icnvalidator.worker.ts:76-109`) feed **different error buckets**
(`formulatorErrors` vs `illegalMoveErrors`, and distinct `phase` values in the error
report), and stage 4 consumes the stage-2 gamefile (`game.basegame.gameConclusion`). So
the unified constructor must return the gamefile **and** let the caller tell a construction
failure apart from an illegal move — e.g. a typed error from `initGameFile`. Note this is
strictly more than `tryConstructGame`'s contract, which deliberately collapses both into
`'moves_invalid'`; that collapse is fine for `variantSelector` (one error message either
way) but would silently merge the worker's two buckets. Preserving the worker's
attribution is an acceptance criterion.

If that error-attribution change wants its own review, it can trail as a 3rd commit —
everything above it is already green without it.

---

## Verification / close-out

`npm run type-check --silent` and `npm run lint --silent` must both be green.

## Key file references

- `src/client/scripts/esm/components/variantselector/variantSelector.ts` — `icnResult`,
  `validateIcnInput`, `getCustomPosition`
- `src/client/scripts/esm/views/analysis/analysisloader.ts` — `pasteGame`, `loadInitialGame`
- `src/client/scripts/esm/views/analysis/analysissetup.ts` — `loadSelection`
- `src/client/scripts/esm/game/chess/gameformulator.ts` — `formulateGame`
- `src/shared/chess/variants/positionvalidation.ts` — `tryConstructGame` / `validatePosition`
- `src/shared/chess/logic/icn/icnimport.ts` — `variantOptionsFromLongFormat`,
  `movePacketsFromParsed`, `getPositionAndSpecialRightsFromLongFormat`
- `src/client/scripts/esm/views/icnvalidator/icnvalidator.worker.ts` — the double-build
