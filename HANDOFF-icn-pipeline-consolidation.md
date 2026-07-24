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

| Call site                             | = the primitive, plus…                                               |
| ------------------------------------- | -------------------------------------------------------------------- |
| `gameformulator.formulateGame`        | variant resolution + `ensureVariantLoaded`; **returns** the gamefile |
| `positionvalidation.tryConstructGame` | try/catch → error code; returns the gamefile                         |
| `analysisloader.pasteGame`            | rendering (via `gameslot.loadGamefile`)                              |
| seek-flatten (new)                    | compress-to-single-position                                          |

The redundancy was never "pasteGame vs formulateGame" specifically — it's that the
**construction itself is re-run per consumer**.

### The custom-ICN path builds the whole game twice

For the analysis page's From-ICN flow the same ICN→game pipeline runs end-to-end twice:

1. **Validation gate** (`variantSelector.validateIcnInput`): `ShortToLong_Format`
   → `variantOptionsFromLongFormat` → `movePacketsFromParsed`
   → `validatePosition` + `tryConstructGame`. `tryConstructGame` **builds and returns the
   full gamefile, and `validateIcnInput` throws it away**; the parsed moves are discarded,
   and the resolved options land in `icnResult.options`.
2. **The actual load** (`pasteGame`, via `analysissetup`): `ShortToLong_Format` **again**
   → re-resolve options → re-parse moves → `loadGamefile` → `initGameFile` for real.

Net per accepted paste: ICN parsed 2×, options resolved 2×, moves parsed 2×, game built 2×.

### The pivotal constraint: flattening needs a _built_ gamefile

`gamecompressor.gamefileToPositionOptions` (and `GameToPosition` underneath it) replays
`move.state` and `move.changes` off `MoveFull[]`. Those precomputed change-sets **only
exist after the game is constructed** — a raw `MovePacket` is just `{token, clockStamp}`.
So you **cannot** flatten position+moves from ICN tokens; you must build the gamefile first.

Crucially, `tryConstructGame` **already builds and returns** exactly such a gamefile —
`validateIcnInput` just drops it on the floor. Keeping it gives the flatten for free.

The flatten primitive lives in **`gamecompressor`**, which `copyGame` already calls for its
own single-position copy. `copyGame` stays as-is: its clipboard output legitimately _wants_
the metadata that a seek must omit.

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

---

## The agreed plan

**Shape** — `icnResult` in `variantSelector` becomes the cache for the one parse + one build.
It must be a **discriminated union, not one flat object**, because its two sources are not the
same thing:

```ts
let icnResult:
	| { kind: 'saved'; isValid: boolean; options: VariantOptions }
	| { kind: 'icn'; isValid: false; longFormat: LongFormatOut }
	| { kind: 'icn'; isValid: true; longFormat: LongFormatOut; gamefile: GameFile }
	| null = null;
```

Why not a flat `{ isValid, options, longFormat?, gamefile? }`:

- **Saved positions have no `longFormat` to derive from.** Cloud/local saves are stored as
  `VariantOptions`, not as ICN-at-rest — `ecloudstore.ts:74-79` already does the
  `ShortToLong_Format` → `variantOptionsFromLongFormat` parse itself and hands out
  `EditorSaveState.variantOptions` (same for `readLocal`). So in the saved arm `options`
  **is** the source of truth; there is nothing to re-derive it from.
- **In the ICN arm `options` is redundant _and_ lossy.** It's derived with
  `{ fullMove: 1 }` forced (`variantSelector.ts:574`), so a flat always-present `options`
  leaves a wrong-for-loading value in the cache for a future caller to reach for — exactly
  the `fullMove` clobber warned about above. Re-deriving from `longFormat` when needed is
  free: `variantOptionsFromLongFormat` is a pure object-literal adapter, no re-parse.
- **`gamefile` stops being optional.** The seek-flatten path cannot be reached without a
  built gamefile, instead of needing a non-null assertion or a dead branch.
- The `kind` tag mirrors `selection.kind` but earns its keep: TS cannot narrow `icnResult`
  from `selection.kind`.
- Keeps the `state_global` reconciliation (`Partial<GlobalGameState>` on `LongFormatBase`
  vs `GlobalGameState` on `VariantOptions`) confined to the saved arm.

Rejected alternative: unify on `longFormat` by fabricating one for saved positions. It's
cheap (`variantOptionsToICN` already builds that exact literal inline) but it makes the
invariant "`longFormat` is a parsed ICN" false, and `gamefile` is still ICN-only — so you
end up with a union anyway, just a less honest one.

### 1. `src/client/scripts/esm/components/variantselector/variantSelector.ts`

- `validateIcnInput` stores `{ kind: 'icn', longFormat, gamefile }` into `icnResult` (no
  `options` — see Shape above); `validateSavedPosition` stores `{ kind: 'saved', options }`.
- Seek-flatten (ICN case):
  `variantOptionsToICN(gamecompressor.gamefileToPositionOptions(icnResult.gamefile))`
  — reuses the existing `variantOptionsToICN` (empty metadata, compact, size-limited).
  **Fixes the raw-ICN-with-moves bug.** Sourced from a dedicated method, not
  `getInviteVariant` — see "Flatten lazily at seek-send time" below.
- `getCustomPosition` (ICN case): return `{ kind: 'longFormat', longFormat }` instead of
  the raw ICN string.
- Add `GameFile` + `gamecompressor` imports.

### 2. `src/client/scripts/esm/views/analysis/analysisloader.ts` + `analysissetup.ts`

- `pasteGame` takes a **pre-parsed `LongFormatOut`** instead of an ICN string (drop its
  internal `ShortToLong_Format`).
- `loadInitialGame` parses the server ICN once and passes it in.
- `analysissetup` passes the cached `longFormat` from `getCustomPosition`.

The analysis ICN case routes through **`pasteGame(longFormat)`**, _not_
`loadVariantOptions(options, moves)` — because options derive from the longFormat and the
metadata still needs it. `loadVariantOptions` stays as-is.

### 3. Unify the constructors _(sequenced last — 1 & 2 are its prerequisites)_

Unify `formulateGame` + `tryConstructGame` + `pasteGame` into a single
"longformat → built gamefile" constructor, and remove the icnvalidator worker's
double-build (`formulateGame` called once without and once with the validate flag).
`formulateGame` is the closest existing shape (it already has a `validateMoves?: true`
flag) and also currently reinvents the `icnimport` helpers inline
(`gameformulator.ts:31-48`) — that inline dup folds in here. Everything in 1 & 2 is already
longFormat-centric, so this extends it rather than rewriting it. This is what finally clears
the `analysisloader.ts:121` "REMOVE REDUNDANT LOGIC" TODO.

**The inline dup is not a trivial lift.** `gameformulator` takes a `LongFormatIn`
(`moves: MovePreprint[]`), while the `icnimport` helpers are typed for `LongFormatOut`
(`moves: MoveParsed[]`) — so replacing lines 31-48 with `movePacketsFromParsed` +
`variantOptionsFromLongFormat` requires reconciling In/Out first. That reconciliation is
part of this item, which is why the dup can't be cleaned up ahead of it as its own commit.

**The worker's double-build is load-bearing — do not just delete a call.** Stage 2 and
stage 3 (`icnvalidator.worker.ts:76-109`) feed **different error buckets**
(`formulatorErrors` vs `illegalMoveErrors`, and distinct `phase` values in the error
report), and stage 4 consumes the stage-2 gamefile (`game.basegame.gameConclusion`). So
the unified constructor must return the gamefile **and** let the caller tell a construction
failure apart from an illegal move — e.g. a typed error from `initGameFile`. Note this is
strictly more than `tryConstructGame`'s contract, which deliberately collapses both into
`'moves_invalid'`; that collapse is fine for `variantSelector` (one error message either
way) but would silently merge the worker's two buckets. Preserving the worker's
attribution is an acceptance criterion for this item.

---

## Flatten lazily at seek-send time, not per-change

The obvious home for the flatten is **inside `getInviteVariant`**. But that function is called
on **every** `onChange` (via `gameSetupModal.syncRatedButton` → `isRatedAllowed`), and
`isRatedAllowed` only reads `variant.kind` — it **ignores the position string**. So
flattening in `getInviteVariant` runs a flatten+serialize on every keystroke for a value
the frequent caller discards (non-trivial for large positions).

So: keep `getInviteVariant` cheap and flatten **only on actual seek-send**
(`handleOnlineSeek`). Note it **cannot** be done "in the lobby" / `createSeek` — flattening
needs the **built gamefile cached in `variantSelector`**, which that layer doesn't have;
rebuilding there would reintroduce the redundancy we're removing. So the shape is a
dedicated `variantSelector` method (e.g. `getSeekPositionICN()`) sourced from the cached
`icnResult.gamefile`, called only on submit.

Build it this way from the start. Flattening in `getInviteVariant` is functionally correct
but wasteful per-keystroke, so there is no reason to write that version first and replace it.

## The ICN preview tooltip shows the position _after_ moves

`handleDisplayPreviewHover` (`variantSelector.ts:603-619`) currently previews
`icnResult.options` — the ICN's **starting** position, so an ICN with moves previews as the
pre-move board, which is not what the user is about to load.

With the gamefile now cached this is nearly free: preview
`gamecompressor.gamefileToPositionOptions(icnResult.gamefile)` (the same flatten the seek
path uses) instead of the starting options.

Falls out of the union shape cleanly:

- `kind: 'icn'`, `isValid: true` → flatten the cached `gamefile`.
- `kind: 'icn'`, `isValid: false` → no gamefile exists (the moves never validated), so fall
  back to `variantOptionsFromLongFormat(longFormat, { fullMove: 1 })` — the starting
  position. Today's behavior, and correct: there is no legal post-move position to show.
- `kind: 'saved'` → `options` as-is (saves have no moves).

The saved-position previews in `handleSavePreview` are untouched.

---

## Commit breakdown

Three commits. **All three are required** — the plan is not done until commit 3 lands. Each
is independently green (`type-check` + `lint`) and independently revertable.

Commit 3 does **not** collapse commits 1 & 2 into one. They are its prerequisites, not
throwaway steps it undoes: the cached-gamefile shape is what the unified constructor feeds,
and `pasteGame` taking a `LongFormatOut` is what makes it mergeable with a longFormat-centric
constructor at all. Doing them separately keeps the seek bugfix and the analysis
de-duplication reviewable on their own.

### Commit 1 — "Cache the built gamefile; flatten custom-position seeks"

- `icnResult` becomes the discriminated union (see Shape).
- `validateIcnInput` stores `longFormat` + `gamefile` (keeping what `tryConstructGame`
  returns instead of discarding it); `validateSavedPosition` stores `options`.
- Seek flatten via `gamefileToPositionOptions` → `variantOptionsToICN` — **fixes the
  raw-ICN-with-moves rejection bug**.
- Preview tooltip shows the post-moves position.
- `getCustomPosition` is **left returning the raw ICN string** — it still has
  `element_icnInput.value` to hand, so nothing forces the analysis change yet. This is the
  seam that keeps commit 2 separate.

Implement the seek flatten **directly in its lazy form** (`getSeekPositionICN`, called from
`handleOnlineSeek`) rather than writing the per-`onChange` version first and replacing it —
see the refinement section above.

### Commit 2 — "Thread the parsed longFormat into the analysis load"

- `getCustomPosition` (ICN case) → `{ kind: 'longFormat', longFormat }`.
- `pasteGame` takes a pre-parsed `LongFormatOut`; drop its internal `ShortToLong_Format`.
- `loadInitialGame` parses the server ICN once; `analysissetup` passes the cached
  `longFormat`.

This is the commit that removes the double parse/resolve/build per accepted paste.

### Commit 3 — "Unify the ICN → gamefile constructors"

- Merge `formulateGame` + `tryConstructGame` + `pasteGame` into the single
  longFormat → gamefile constructor; reconcile `LongFormatIn`/`LongFormatOut` and drop
  `gameformulator`'s inline reinvention of the `icnimport` helpers.
- Give the constructor a failure result that separates "construction threw" from "illegal
  move" (see section 3), then collapse the icnvalidator worker to one build.
- Clears the `analysisloader.ts:121` "REMOVE REDUNDANT LOGIC" TODO — delete it.

The largest of the three, and the only one touching `gameformulator` or the worker. If the
worker's error-attribution change wants its own review, it can trail as a 4th commit —
everything above it is already green without it.

---

## Verification / close-out

- `npm run type-check --silent` and `npm run lint --silent` must both be green.
- One detail to confirm during implementation (do not change the plan's shape):
  `buildMetaDataFromGamefile` is **not** on the seek path (we go through
  `variantOptionsToICN`, which uses empty metadata) — good, keeps seek ICN small and
  under `POSITION_STRING_THRESHOLD`.

## Key file references

- `src/shared/chess/variants/positionvalidation.ts` — `tryConstructGame` / `validatePosition`
- `src/client/scripts/esm/game/chess/gameformulator.ts` — `formulateGame`
- `src/client/scripts/esm/game/chess/gamecompressor.ts` — `compressGamefile`,
  `GameToPosition`, `gamefileToPositionOptions`
- `src/client/scripts/esm/game/chess/copygame.ts` — `copyGame`
- `src/client/scripts/esm/components/variantselector/variantSelector.ts` — `validateIcnInput`,
  `getInviteVariant`, `getCustomPosition`, `variantOptionsToICN`, `icnResult`
- `src/client/scripts/esm/views/analysis/analysisloader.ts` — `pasteGame`, `loadInitialGame`
- `src/client/scripts/esm/views/analysis/analysissetup.ts` — `loadSelection`
- `src/shared/chess/logic/icn/icnimport.ts` — `variantOptionsFromLongFormat`,
  `movePacketsFromParsed`, `getPositionAndSpecialRightsFromLongFormat`
- `src/client/scripts/esm/views/icnvalidator/icnvalidator.worker.ts` — the double-build (commit 3)
