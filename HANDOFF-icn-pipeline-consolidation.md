# Session Handoff — ICN → Gamefile Pipeline Consolidation

## Purpose of this doc

Captures the plan for de-duplicating the several code paths that turn an ICN (or
longformat) into a gamefile. One commit remains; it has not been implemented.

---

## Where things stand

`variantSelector.validateIcnInput` caches the products of its one validation pass in
`icnResult` — the parsed `longFormat`, and (when the whole ICN is legal) the `GameFile`
that validating the moves already built. `getCustomPosition` hands that `longFormat`
straight to `analysisloader.pasteGame`, so the analysis page no longer re-parses the ICN
or re-resolves its options.

What's still duplicated is the **build**: for an accepted paste the gamefile is
constructed twice — once by the validation gate, once by the real load.

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

### Derive per-consumer from the longFormat; never share derived options

Validation derives its options with
`variantOptionsFromLongFormat(longFormat, { fullMove: 1 })` — it **forces `fullMove: 1`** —
whereas a real load must preserve the ICN's `fullMove`. So the shared unit is the
`longFormat`; each consumer derives from it (validation normalizes, load preserves).
Caching validation's `options` for loading would clobber `fullMove`.

(`fullMove` is purely a display counter — `whosTurn` comes from `turnOrder[0]`,
`boardinit.ts:90` — so the override is safe for legality. It is not safe for loading.)

Construction also **mutates** what it's handed (`initGameFile` writes `slideLimit` onto
`variantOptions.gameRules`, which is the longFormat's own object), which is why
`getCustomPosition` deep-copies before handing its cached parse out.

---

## Commit breakdown

### Commit 1 — "Unify the ICN → gamefile constructors"

Unify `formulateGame` + `tryConstructGame` + `pasteGame` into a single "longformat → built
gamefile" constructor, and remove the icnvalidator worker's double-build (`formulateGame`
called once without and once with the validate flag). `formulateGame` is the closest
existing shape (it already has a `validateMoves?: true` flag) and also currently reinvents
the `icnimport` helpers inline (`gameformulator.ts:31-48`) — that inline dup folds in here.
Everything is already longFormat-centric, so this extends it rather than rewriting it.
Clears the `analysisloader.ts:123` "REMOVE REDUNDANT LOGIC" TODO — delete it.

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

### Commit 2 (optional) — split out the error attribution

If that error-attribution change wants its own review, it can trail as a 2nd commit —
everything above it is already green without it.

---

## Verification / close-out

`npm run type-check --silent` and `npm run lint --silent` must both be green.

## Key file references

- `src/client/scripts/esm/game/chess/gameformulator.ts` — `formulateGame`
- `src/shared/chess/variants/positionvalidation.ts` — `tryConstructGame` / `validatePosition`
- `src/client/scripts/esm/views/analysis/analysisloader.ts` — `pasteGame`
- `src/shared/chess/logic/icn/icnimport.ts` — `variantOptionsFromLongFormat`,
  `movePacketsFromParsed`, `getPositionAndSpecialRightsFromLongFormat`
- `src/client/scripts/esm/components/variantselector/variantSelector.ts` — `icnResult`,
  `validateIcnInput`, `getCustomPosition`
- `src/client/scripts/esm/views/icnvalidator/icnvalidator.worker.ts` — the double-build
