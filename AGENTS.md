# infinitechess.org

## Project architecture

- **Frontend:** TS, CSS and assets in `src/client`. No major frameworks — vanilla, modular scripts.
  Bundled with **esbuild**, not Vite.
- **Backend:** Node.js server at `src/server/server.js` — API, game logic, socket communication.
  Every html is SSR'd via Nunjucks; the old EJS system is being migrated away from during the
  website redesign.
- **Database:** SQLite, via the `better-sqlite3` package.
- **`src/` is split three ways:** `client/` (only client scripts may import), `server/` (only server
  scripts may import) and `shared/` (both sides may import).
- **`scripts/`** is a toolbox of developer and CI automation utilities. Maintain alongside `src/`.
- **`dev-utils/`** is archived. Do not maintain it, and note that no source code imports from it.

## Useful notes

- The shell is zsh locally, bash on runners: always quote glob patterns in command args (e.g.
  `grep --include='*.ts'`), or zsh's nomatch aborts the command before it runs.
- Line 1 of every script is its file path, written automatically by a hook when committing — don't
  maintain it. Lines 3-7+ usually hold a brief description of the script's purpose, enough to
  understand it without reading the whole thing.
- TypeScript indents with tabs, not spaces. Prettier enforces styling automatically.
- `npm run lint --silent` names every unused import — use it instead of working out removals by
  hand.
- A fresh checkout has no `dist/`, and a cloud one no `node_modules` either: `npm ci` if needed,
  then `npm run build` once before your first `npm run check` — the integration tests need the built
  manifest.
- Read a file's relevant lines in-session before editing it. Grep, sed or shell output doesn't
  count.
- Ad-hoc scripts — anything you write to answer a question rather than ship a change — go in the
  gitignored `sandbox/`, run from the repo root: `npx tsx sandbox/<name>.ts`. Written outside the
  repo they inherit no `node_modules` and no `"type": "module"`, so top-level `await` fails.
- When changing legal-move, check, checkmate or game-end logic, run `npm run validate-icn` yourself
  on the validator dataset (ask me for its path) before your first edit and after. For refactors and
  speed-ups the fingerprint must not change.

## Agent rulebook

These rules must be followed at ALL times, without exception, unless I explicitly request something
that contradicts them. If two rules genuinely conflict for a given task, or one of them can't be
followed, tell me.

### Talking with me

1. Link exact code lines EVERY time you name them, even if you already linked them earlier in the
   response. For new code, link the existing code it sits beside. I should never have to search for
   or slowly browse to the code the conversation is about.

2. Never use the harness's ask-user/question tool; ask every question inline in the chat.

3. When you have multiple questions for me, ask them ONE at a time. Several things I have to answer
   make it hard for me to focus and overwhelm me. Wait to raise subsequent questions until you are
   confident I am happy with the resolution of the prior one.

4. If you ask a question, and I reply about the earlier topic instead of answering, wait until it is
   fully settled before re-asking for my answer on it. When you do re-ask, give me the question in
   its original detail. Do not expect me to scroll up through several messages to see what you're
   referring to; I often skip reading your replies if I'm still talking about the prior subject. If
   I re-ask, do the same: answer self-contained, with the original details.

### Making decisions

5. All decisions that affect the design or organization of the codebase have the greatest risk of
   introducing tech debt and maintenance cost. When you come across one of these, first read all
   touched _and_ related files in FULL, not just snippets of them, _then_ come to your own best
   recommendation. Decisions made without sufficient context are the greatest source of all wrong
   calls.

6. Get my explicit approval of every behavior change first: how user experience, logic, or
   conditions change, with no code, and why. Then get it for any design decision the implementation
   carries. Small changes — a comment update, rename, reference update, or lint fix — need neither
   approval nor mention.

7. Follow the industry standards and best practices of today. Always opt for the _correct_
   architecture and design pattern, never the quickest or easiest one for that reason. The correct
   solution makes things more maintainable, scalable, and bug-resistant.

8. You scowl at lines added, and are overjoyed by lines removed. Lines added are code complexity,
   cost, redundancy, maintenance, tech debt. Lines removed are simplicity, cleanliness, consistency,
   symmetry, beauty, automation. All code changes should reflect this. Desired or asked-for features
   justify the lines they require.

9. To decide whether an issue is worth fixing at all, weigh all options by benefit over cost. If a
   fix is too complex, it might not be worth its gain. If the worst that can happen if the issue
   remains is small, it may still be worth fixing if the fix is super simple.

10. If we're having a hard time deciding between options, that's a sign of a deeper architectural
    problem: ask why it is even a hard decision in the first place. I believe that all code
    decisions should be _easy_, and that if they are _not_ then it's an issue with the architecture
    that is binding us. Uncover that binding; attack that.

11. When fixing a bug, first ask why the bug was allowed to happen in the first place. If a better
    architecture would have prevented it from ever occurring, that is the fix. Otherwise, trace it
    to its root cause; never patch a symptom.

### Writing code

12. Before adding _any_ new mechanism, helper, etc., go looking for the existing one — search by
    concept, not by name. Extend it, or note to me why it can't be extended.

13. Avoid redundancy like the plague. After every change, ask what is now redundant with it or with
    the rest of the code.

14. If a new addition supersedes any existing code, delete the old code in the same work.

15. Strive for sibling files to have symmetry and consistency. This increases our ability to detect
    patterns within them, which allows us to write cleaner code. If a change would introduce
    asymmetry or inconsistencies between sibling scripts, that is a red flag: weigh that cost over
    its benefit, even against rule 7. A better architecture per rule 10 may be able to fix the issue
    while _retaining_ symmetry.

16. All files, variables, and functions should be well-named, reflecting their purpose. If after
    editing one its responsibilities have changed, rename it if its current name no longer best
    reflects its new responsibility.

17. Prefer deriving over storing. No flag, cache, copy or denormalized column that can disagree with
    the thing it mirrors.

18. User-facing strings go through the translation system, unless their page isn't localized yet;
    those wait for it.

19. Follow the module conventions below for every script, new ones _and_ whenever touching them.

### Correctness and cost

20. No unreachable guards. For all defensive checks, trace the call sites and prove whether the
    state is actually reachable. An unneeded guard tells a future developer "plan for this" and
    wastes their time forever, so it comes out. Check the inverse too: a guard that looks decorative
    but is load-bearing should say so in a comment. This never applies at a trust boundary, where
    rule 21 wins.

21. Validate everything crossing the trust boundary. What can a hand-crafted client, request or
    message do? Is anything persisted or acted on without validation? Does anything downstream trust
    data that isn't trustworthy?

22. Type honesty. No `any`, no cast that contradicts a declared type, no widened union or non-null
    assertion standing in for a real invariant. Values set, cleared or valid together share one
    discriminated union or object, so illegal combinations can't be typed.

23. Judge hot-path code (per frame, move or piece) on cost, not just correctness. Optimize where we
    can.

### Comments

24. Comment bloat is one of the largest weaknesses of LLMs; understand that about yourself.
    Documentation is meant to be concise, only conveying the most important information. Signs of AI
    bloat are:
    - Comments and documentation getting **longer**. It's typical for an agent to have made things
      _longer_. Imagine the final state of documentation only getting longer for eternity —
      countless details of everything unrelated, no agent or human is going to want to read that.
    - Staple-ons which serve to amend existing comments. Prefer **rewriting** the comments from
      scratch instead.
    - Prior code state talk. We do not need to concern ourselves with old state. Move on mentally;
      do not give old code state free rent forever in our mind. We are _focused_ on the next work.
    - Common sense things, or that which can be inferred from nearby comments.
    - Statements explaining or justifying why code is the way that it is. Me asking you why code is
      that way isn't me arguing with you about making it a different way; it's me hyper-looking for
      improvements; you do not have to justify it again to me every time I stare at a comment. If I
      accept it, it needs no self-justification comment.
    - A new variable or function's JSDoc length is longer than, or asymmetric against, sister
      variables and functions in the same script.
    - Doc files getting excessively long. If all its info is truly load-bearing, consider whether
      whole sections should be dropped, or if it covers unrelated things, consider splitting the doc
      as a whole.

25. If how something's implemented makes you believe it's a bug, but I confirm it is intended
    behavior, concisely explain that in a comment so future agents don't unnecessarily flag it
    again.

### System docs

26. Before touching any system below, **read its doc in full first**. Each holds context about said
    system otherwise scattered across many scripts; without it, you may make wrong calls.
    - Any TOML or translation: `docs/systems/TRANSLATIONS.md`. Only maintain English TOMLs.
    - The build system: `docs/systems/BUILD.md`. The build process does not change unless it must.
    - Render contexts, or adding graphics: `docs/systems/GRAPHICS.md`
    - Websockets, client or server: `docs/systems/WEBSOCKETS.md`
    - ICN (Infinite Chess Notation): `docs/systems/ICN.md`. Read before creating ICNs.
    - The Apeiron engine's WASM build: `docs/systems/ENGINE.md`
    - Adding or moving a file in `src/`: `docs/systems/IMPORT_RULES.md`
    - Saving live games to the database: `docs/systems/LIVE_GAME_PERSISTENCE.md`
    - Password reset: `docs/systems/PASSWORD_RESET.md`
    - Account registration: `docs/systems/REGISTRATION.md`

### Stored data

27. Anything stored permanently needs a reason to be stored forever; anything identifying needs a
    reason to be identifying.

28. Never write a memory without my okay. Memory lives on one device; what you learn about the repo
    belongs in its docs or this file.

### Issues outside the work

29. If, while we're working on changes, you notice an unrelated issue or bug somewhere else, do
    **not** distract me from the current work. Park it, and bring it up only after the current work
    has been committed; do not mention it before then. An issue with changes you made this session
    _should not be parked_: if you created the issue, you need to resolve it too, _before_ we
    commit.

30. Park issues by appending them to a scratch file outside the repo. It has to be a written file,
    never a mental note: your reasoning from earlier turns isn't retained. Re-read that file every
    time we commit. If your reply ends the session, as in an `@claude` run, close it with every
    parked issue in full, inside a collapsed `<details>`.

31. Raise parked issues one at a time. Once we've committed the current work, mention the single
    _next_ most pressing issue only. Per rule 3, do **not** flood me with multiple issues at once. I
    will decide if we should focus on it next from there. If I ask you for a prompt to have another
    agent look into it, after giving it to me, consider it delegated, and remove it from the scratch
    file.

32. If you realize two implementations of one idea exist, park that per rule 31 too. If they
    disagree, that's a live bug. If it only became a second implementation after your changes, then
    per rule 29 you created it, so it also needs to be resolved before we commit.

### Finishing work

33. After making changes, search for any JSDoc or comment they made false; make sure they aren't
    stale. Make sure touched files' description headers have not become stale. Then go back over all
    documentation and comments you touched or added, _look for the signs_ of AI bloat listed in rule
    24, and _fix_ them.

34. After finishing changes that modified at least one script, run `npm run check --silent` —
    format, types, lint, import rules, and tests — and get it passing. Repeat after every subsequent
    fix, unless all you edited was a comment. Fix formatting-only failures with `npm run format`. If
    you can't get it passing, let me know.

35. Consider whether any of your running sandbox scripts would actually be of use to future agents
    after we commit this work, being moved to a permanent location, even if they would need to be
    repurposed. If so, recommend that.

36. If the changes affect what users see and experience, get confirmation from me that things work
    as expected. Never spin up a dev server yourself to check; it costs too many tokens and too much
    time.

37. After that point, I usually either choose to have you use the `review` skill on your own
    changes, or go straight to directing you to commit.

### Committing

38. Never commit until I explicitly ask you to. All changes are reviewed by me first. The exception
    is a branch of your own that is the only way the work reaches me — a worktree task branch, or a
    cloud run's branch. Commit there as normal without asking, then for a worktree deliver and clean
    up per rule 40, and for a cloud run push, since I review it on GitHub. Otherwise, I stage files
    as I review them, so expect your changes to move into the index mid-session — a clean `git diff`
    doesn't mean your edits vanished.

39. When I _do_ ask you to commit, split unrelated changes into their own commits, then `git push`
    immediately after. On a branch whose name won't match its remote's (`pr/<author>/<number>`, from
    `gh pr checkout` of a fork PR), bare `git push` aborts — read the remote and branch from
    `branch.<current>.remote` and `branch.<current>.merge` in `git config`, then push explicitly:
    `git push <remote> HEAD:<branch>`.

40. When I ask for work in a worktree, run its whole lifecycle yourself — I never type any of these
    commands. Create it in `.worktrees/`, branched from the branch I have checked out, never from
    `main`: `git worktree add .worktrees/<task> -b <task> <my-branch>`. Node walks up to the repo's
    `node_modules`, so it needs no install. Commit there per rule 38. Only when requested, deliver
    it unstaged into my working tree with `git cherry-pick -n <task>` and `git reset`, so I review
    it in my own editor. Immediately remove the worktree and delete the branch — any revision I ask
    for afterwards is ordinary work in my tree.

41. After committing, move to the trash (no irreversible delete) all remaining sandbox scripts you
    created that are deemed no longer needed. Any repurposed ones should have already been moved out
    per rule 35. Any not added by you, belonging to other sessions, should be cleared _if_ those
    sessions are not fresh.

## Module conventions

A touched script gets brought up to _every_ convention here, including violations unrelated to the
reason it was opened. These are enforced by example — when this section and real sibling scripts
disagree, study more siblings before trusting either.

### Choosing homes

- A module's permanent home must satisfy the import rules: what its directory may import, and which
  pages may ship it. [IMPORT_RULES.md](docs/systems/IMPORT_RULES.md) documents the rules and the
  placement workflow; `npm run check --silent` enforces them.
- Answer it with the tools in `scripts/modules/`, not by grep — `importers.ts <substr>` for who
  imports a module (type-only edges included), `page-reach.ts` for which client pages would then
  ship it, `pkg-cost.ts` when a heavy package is what makes the placement matter.
- One responsibility per script. Splitting a script might also make it easier to deduce their
  correct home. A file that fits no rung's subject is usually carrying two.
- Script names: multi-word basenames are lowercase compounds under `src/client/` and `src/shared/`
  (`editorsave.ts`; dashes fine), and camelCase under `src/server/` and `src/tests/`
  (`refreshTokenManager.ts`). PascalCase is reserved for modules reusable outside this project
  (`AudioManager.ts`).

### File anatomy

- Line 1 is the file-path comment (hook-written). Lines 3–7+: a doc-comment describing what the
  script **is**.
- Sections in order: imports → Types → Elements → Constants → Schemas → State → functional groups →
  Exports. Every section gets a `// Section name -------` divider — never `=====` bars, never
  `// --- Name ---`. Pad the dashes so the line is exactly 80 characters.
- Constants UPPER_SNAKE_CASE; mutable state camelCase under `// State`.
- Locals follow whichever casing dominates the surrounding script — camelCase or snake_case
  (database columns leak snake_case server-side); consistency wins.
- Keep languages in their own files: shader code in `.glsl`, HTML in templates — never inline either
  inside scripts.
- One purpose per function — refactor it out into multiple functions even if called once. Aim under
  ~40 lines, not mandatory.
- Functions read top-down in chronological usage order: a helper sits below the first function that
  calls it, so reading top-down follows runtime order.

### Public surface

- Multi-export modules ship _one_ `export default { ... }` at the bottom, members ordered by
  appearance, separated by `// group` comments mirroring the sections.
- Default-exported members drop module-context words, since callers read them as `<module>.<fn>`:
  `requestMeter.meter`, not `meterRequest`; `startupLogger.started`.
- A single-export module exports _inline_ at its declaration (`export function foo()`). Sibling
  symmetry overrides this: if the surrounding family all reads `<module>.<fn>`, keep the default
  object. Match the callers' neighborhood.
- Nothing gets exported — including types — without a consumer outside the module.
  `scripts/modules/orphan-exports.ts <root>` lists the ones that break this; it matches textually,
  so confirm each hit before deleting.
- Import identifiers match the script's basename; if a local name collides, rename the local, don't
  alias the import.

### Dependencies

- Type-only imports: `import type { ... }` — never inline `type` inside braces. Plain mixed
  value+type imports, unmarked, are preferred over two lines (tsc elides and esbuild drops unused
  names). Never two plain statements from one module; a deliberate `import type` + value/default
  pair from the same module is fine.

### Type safety

- Wrap callbacks passed to methods like `map`/`filter`/`forEach`/`setTimeout` —
  `array.map((item) => fn(item))`, never `array.map(fn)` — so types flow through. Event listeners
  are exempt: the original reference is needed to remove the listener.
- An assertion function (`asserts x is T`) cannot be called through a default-object property
  (TS2775). Return the validated value instead of asserting through an object.
- Never re-export a type; always reference the source.
- Never use `Omit` or `Exclude` — have one type extend the other.

### Comments & JSDoc

- Every function gets at least one sentence of JSDoc. Docs under 100 characters stay on _one_ line:
  `/** Like this. */` — never three.
- Omit @param for self-evident args (req/res/next/ws). Explanations _about_ an argument belong on
  its @param line, not in the description body.

### Names

- Boolean functions take auxiliary prefixes: singular subjects "is" (`isUnderAttack`), plural
  comparisons "are", capability checks "does"/"can".
- When a file is being touched anyway, misnomers lose to churn — rename.

### Deletions & logging

- Delete: commented-out code, dev-testing leftovers/constants, orphaned exports, bare debug console
  noise. Exception: documented dev tooling (e.g. latency knobs) stays, with its alternatives pruned
  to the active line plus at most a hint.
- Server side: a live console.log stays only if the event is rare AND worth knowing about; routine
  noise goes, errors belong in errLog via logEvents. Client side, be more lenient — the occasional
  log is genuinely useful for debugging there.
- Statements that must exceed the line length (long error strings) compress to one line with a
  trailing `// prettier-ignore`.

### During a refactor

- Behavior-identical unless told otherwise.
- After mass programmatic updates (scripted renames/replacements), auto-stage _only_ the files whose
  changes are purely mechanical import updates; never sweep in files you hand-edited — mixed files
  count as hand-edited.
- Pure function reorderings should land separately from content edits so diff hunks line up for
  review — unless the whole batch is being reviewed wholesale.
- `scripts/modules/move-module.ts` `git mv`s modules and rewrites every relative specifier from each
  file's _new_ home for you. Pass every move in _one_ run so they resolve against each other;
  renaming an import identifier afterwards is yours.
