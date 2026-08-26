# Module Conventions

**Follow when planning or executing any large refactor.** Every rule in the agent
rulebook still applies; this file only adds project-specific conventions those rules
don't cover. These points are enforced by example — when this document and real sibling
scripts disagree, study more siblings before trusting either.

## Choosing homes

- A module's permanent home must satisfy the ladder rules encoded in the header of
  `scripts/imports/import-rules.ts` (imports point down), also checked by
  `npm run check --silent`. That header carries all three roots' ladders, so placing a
  file is a lookup rather than a re-derivation.
- Answer it with the tools in `scripts/imports/`, not by grep —
  `ladder.ts <root> consumers <path>` for who imports a module (type-only edges
  included), `page-reach.ts` for which client pages would then ship it, `pkg-cost.ts`
  when a heavy package is what makes the placement matter.
- One responsibility per script. Splitting a script might also make it easier to
  deduce their correct home. A file that fits no rung's subject is usually carrying two.
- Script names: lowercase when repo-specific (`editorsave.ts`), PascalCase only when
  reusable outside this project (`AudioManager.ts`).

## File anatomy

- Line 1 is the file-path comment (hook-written). Lines 3–7+: a doc-comment describing
  what the script **is**, not where it's used.
- Sections in order: imports → Types → Constants → State → functional groups → Exports.
  Every section gets a `// Section name -------` divider — never `=====` bars, never
  `// --- Name ---`. Pad the dashes so the line is exactly 80 characters.
- Constants UPPER_SNAKE_CASE; mutable state camelCase under `// State`.
- Locals follow whichever casing dominates the surrounding script — camelCase or
  snake_case (database columns leak snake_case server-side); consistency wins.
- Keep languages in their own files: shader code in `.glsl`, HTML in templates —
  never inline either inside scripts.
- One purpose per function — refactor it out into multiple functions even if called
  once. Aim under ~40 lines, not mandatory.
- Functions read top-down in chronological usage order: a helper sits below the first
  function that calls it, so reading top-down follows runtime order.

## Public surface

- Multi-export modules ship ONE `export default { ... }` at the bottom, members ordered
  by appearance, separated by `// group` comments mirroring the sections.
- Default-exported members drop module-context words, since callers read them as
  `<module>.<fn>`: `requestMeter.meter`, not `meterRequest`; `startupLogger.started`.
- A single-export module exports INLINE at its declaration (`export function foo()`).
  Sibling symmetry overrides this: if the surrounding family all reads `<module>.<fn>`,
  keep the default object. Match the callers' neighborhood.
- Nothing gets exported — including types — without a consumer outside the module.
  `scripts/orphan-exports.ts <root>` lists the ones that break this; it matches
  textually, so confirm each hit before deleting.
- Import identifiers match the script's basename; if a local name collides, rename the
  local, don't alias the import.

## Dependencies

- Type-only imports: `import type { ... }` — never inline `type` inside braces. Plain
  mixed value+type imports, unmarked, are preferred over two lines (tsc elides and
  esbuild drops unused names). Never two plain statements from one module; a deliberate
  `import type` + value/default pair from the same module is fine.

## Type safety

- Wrap callbacks passed to methods like `map`/`filter`/`forEach`/`setTimeout` —
  `array.map((item) => fn(item))`, never `array.map(fn)` — so types flow through.
  Event listeners are exempt: the original reference is needed to remove the listener.
- An assertion function (`asserts x is T`) cannot be called through a default-object
  property (TS2775). Return the validated value instead of asserting through an object.

## Comments & JSDoc

- Every function gets at least one sentence of JSDoc. One-sentence docs stay on ONE
  line: `/** Like this. */` — never three.
- Omit @param for self-evident args (req/res/next/ws). Explanations ABOUT an argument
  belong on its @param line, not in the description body.

## Names

- Boolean functions take auxiliary prefixes: singular subjects "is" (`isUnderAttack`),
  plural comparisons "are", capability checks "does"/"can".
- When a file is being touched anyway, misnomers lose to churn — rename.

## Deletions & logging

- Delete: commented-out code, dev-testing leftovers/constants, orphaned exports, bare
  debug console noise. Exception: documented dev tooling (e.g. latency knobs) stays,
  with its alternatives pruned to the active line plus at most a hint.
- Server side: a live console.log stays only if the event is rare AND worth knowing
  about; routine noise goes, errors belong in errLog via logEvents. Client side, be
  more lenient — the occasional log is genuinely useful for debugging there.
- Refactor-added statements that must exceed the line length (long error strings)
  compress to one line with a trailing `// prettier-ignore`.

## During the refactor

- Behavior-identical unless told otherwise.
- Any script the refactor touches gets brought up to EVERY convention here, including
  violations unrelated to the reason it was opened.
- After mass programmatic updates (scripted renames/replacements), auto-stage ONLY the
  files whose changes are purely mechanical import updates; never sweep in files you
  hand-edited — mixed files count as hand-edited.
- Pure function reorderings should land separately from content edits so diff hunks
  line up for review — unless the whole batch is being reviewed wholesale.
- The user may edit files on disk mid-session as they are reviewing, you may have to
  re-read a file before editing it.
- `scripts/move-module.ts` `git mv`s modules and rewrites every relative specifier from
  each file's NEW home for you. Pass every move in ONE run so they resolve against each
  other; renaming an import identifier afterwards is yours.
