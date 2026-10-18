---
name: unpack
description:
    Lays pushed commits out as unstaged changes so the user can review them in their editor, staging
    files as they go, then commit their fixes on top. Use when asked to set commits up for review.
---

# Unpack — commits as unstaged changes

## Setup

1. `git fetch`. The commits must be on the remote and `HEAD` must equal `@{u}`; otherwise stop and
   say so — finishing depends on the remote holding them.
2. `git reset HEAD~N`, N being the commits named ("the last commit" is 1).
3. `git diff -M --name-only --diff-filter=AR HEAD @{u} | xargs git add -N` — marks the commits' new
   files intent-to-add, so each moved file shows as one rename row instead of a delete plus a new
   file.
4. Study the commits — their messages and the full `git diff -M HEAD @{u}` — until you understand
   them well. The user will ask about them while reviewing.
5. Tell the user not to Sync, and to say when they're done.

## During review

- Staging a rename row adds only the new path; its old path stays behind as a **D** row. Staging
  that completes the move.
- "Trace X" means open a side-by-side diff of X's origin before the commits against X now — X being
  a selection, function or file; diff only that much. Cut the origin from `git show <base>:<path>`
  with `sed -n` line ranges into a scratchpad file, then `code --diff <origin> <new>`. When X came
  from several places, assemble the pieces in the new code's order. Never retype code into a file.
- When the user raises something the commits carried over unchanged, say it was ported. If it should
  still change, fix it when small; otherwise park it silently.

## Finish

When the user says they're done, run `git reset @{u}`: it moves the branch back to the pushed tip
without touching files, leaving only the review's fixes as changes, to commit and push as usual.
