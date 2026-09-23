---
name: review
description:
    Deep code review of a PR, one or more commits, or the working tree. Judges the approach first
    (unless it was already approved), then every line, against the rulebook and the codebase itself.
---

# Review — last line of defense

Review as if this codebase were yours and you were the last line of defense for it. Every line,
every design decision and the architecture beneath them was deliberately chosen. You are highly
opinionated. Nothing unnecessary, low-quality, over-complicated or bloated gets in, and nothing
regresses an existing invariant or convention.

Never fabricate findings to have something to report. If the code is genuinely good, say so.

## 1. Pin down the target

The user names one. If they don't, it's the working tree. Collect the diff **and** every scrap of
intent behind it:

| Target           | Diff                                                                                                | Intent                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **PR** `<N>`     | `gh pr diff <N>`                                                                                    | `gh pr view <N> --json baseRefName,headRefOid,changedFiles,additions,deletions,title,body` |
| **Commits**      | one: `git show <sha>` · range: `git diff <base>..<tip>`                                             | `git log --format='%H%n%B' <range>`                                                        |
| **Working tree** | `git diff HEAD`, plus every untracked file from `git status`, read in full — they appear in no diff | Whatever description the user pasted with the request                                      |

- **PR:** confirm the base rather than assuming `main`, and that the checked-out tree is at
  `headRefOid`. If the base has commits the PR lacks,
  `git fetch origin <base> && git merge origin/<base>`. Clean merge: commit it and carry on.
  Conflicts: resolve them, don't commit, and stop until the user says they've committed it.
- **Commits:** review the net result, but read each message — a later commit may deliberately undo
  an earlier one.

Intent is the author's framing, not evidence. Pull out every claim it makes — what it fixes, what it
changes — and verify each against the code. A claim with nothing behind it is a finding.

## 2. Read everything

Write the diff to a file in your scratchpad and read it in offset chunks until one ends on the final
line. Readers truncate silently around 2000 lines, and a prefix that stops mid-file looks complete.
Cross-check your file and line counts against `--stat` (or the PR's numbers). A hunk you never saw
is a change you'll review as though it isn't there.

Then read the actual source of everything the diff touches, **plus the neighbouring code it should
have reused**, so you judge against reality rather than the diff's own framing. Read
`docs/systems/IMPORT_RULES.md` and `docs/systems/MODULE_CONVENTIONS.md`, and any system doc the
rulebook routes the touched area to.

## 3. Judge the approach

**Skip this step only if the user says they already approved the approach.** A spec or plan the
intent mentions is not that approval, and never outranks the code: it inspired the changes, it
doesn't vouch for them. Code that faithfully follows a spec is judged like any other, and code that
_doesn't_ follow said spec may be justified if the approach is better.

Otherwise, before any line-level review, ask whether the change should exist in this shape at all:

- Is it needed? Is the problem real?
- Does it build a parallel system where an existing one should have been extended, or a new
  abstraction where an existing mechanism already fits?
- Is it the correct fix at the root, or a symptom patch?

Size is not an argument for merging; the author's effort is sunk cost. **If the approach is wrong,
stop here.** Don't polish code that shouldn't exist. Report the verdict with the alternative and its
honest trade-offs, and wait for the user.

## 4. Hunt

Every changed line is read and judged. Think about each change as though it were the only thing you
had to review, however large the diff.

- **Rulebook violations.** Every rule in `AGENTS.md` is a finding if broken.
- **Re-implementations** of what already exists — search by concept, not by name. The highest-value
  check. When you find a pair, check whether they already disagree: that's usually a live bug.
- **Redundancy** with other new code in the diff, or with existing code anywhere.
- **Behavioural bugs.** The user may have only smoke-tested this; assume nothing from that.
- **Unproven bugs.** A fix is only justified once the bug is shown to be real: prove the failing
  state is reachable from the code paths, or reproduce it in `sandbox/`. If you can't, assume there
  is no bug. Where only a live dev site could prove it, hand it to the user to verify.
- **Dead on arrival.** Migrations, shims, fallbacks and legacy branches with no prior state and no
  caller that can reach them.
- **Left behind.** Anything superseded by the new code but not deleted. Any export no longer used
  outside its module.
- **Scope creep.** Unrelated refactors, formatting churn, drive-by edits. Reduce the change to the
  part that needs it.
- **Preference and developer-QOL changes** specific to the author rather than the project.
- **Structure.** Is each new function in the best-fitting script, at the best vertical position
  among its siblings? Should any touched script's section grouping change?
- **Convention.** Judged against sibling files, not instinct — breaking their symmetry is a finding
  even when the code is fine alone.
- **Performance.** Name the trigger concretely: what input size or scenario makes it stutter, and
  what the user sees.
- **Every comment, JSDoc and doc file is a claim to verify**, not information — including ones
  outside the diff that it made false, and system docs in `docs/`. Comments hold only what is
  load-bearing: no history, no defensive trivia.
- **Net lines.** Could anything have been done more simply, in fewer lines?

## 5. Decisions go to the user first

Any moderate-or-larger design decision — the shape of a new system, a schema or interface awkward to
undo, extend-versus-build-alongside, anything setting a precedent, any ambiguous fix — goes to the
user, even when the answer looks clear to you. The test isn't your confidence; it's how hard the
call would be to walk back.

Raise each **the moment you hit it**, inline in chat, per rules 13-16: the problem, the options
ranked by correctness then simplicity, honest trade-offs, your pick. Wait for the call before
carrying on — never bank decisions up for the end, where they arrive buried. Once the user commits
to an option, that is the single direction the finding takes.

## 6. Act and report

**Working tree or commits.** Fix everything with one clear, correct answer without asking:
unambiguous bugs, stale comments, a duplicate that should call the existing helper, convention
breaks, type or lint errors, dead code. Fixes land uncommitted in the working tree for the user to
review. Re-run the checks until they pass. Report briefly:

- What you changed: one line per fix, with a link to the file and line, grouped so it scans.
- What you suspect but couldn't prove, and what would prove it.
- Nothing about what you checked and found good.

**PR.** Change nothing in the code. Write the full review to a markdown file in the project root,
standing alone for the PR author — no meta-commentary about the review process:

- Ordered by severity.
- One concrete directive per finding — never a menu of options.
- File and line cited for every point.
- Each failure stated concretely: what input or state, and what goes wrong.
- Confirmed separated from suspected; for each suspicion, what would prove it.
- Nothing about what was found good.

In chat, give only a brief summary.
