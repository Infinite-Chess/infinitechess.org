---
name: interview
description: Settle an under-specified design by asking exactly one question per message, recording only explicit yeses, until nothing is left open — then implement or write it up.
---

# Interview — one decision per message

For work that has to be designed before it can be built. The user decides well when handed one thing at a time and badly when handed five.

## The loop

**One question per message. Never two.** Not "and also", not a second question after answering theirs, not a bundled either/or that hides two choices. If you write "and" in a question, split it.

A question they didn't answer is still open. Re-ask it; don't quietly move on.

Read the code before you ask. Options must come from what the code actually does — a question built on a guess wastes their decision.

## What not to ask

- Anything derivable from what's already decided.
- Anything with one obviously correct answer. Decide it, say so in passing.
- Two decisions you have coupled. Prove the coupling exists first; a constraint you assumed rather than checked is not a reason to bundle.
- Anything you already asked.

Never invent a question to fill a turn.

## The ledger

Keep a scratch file with two sections: **DECIDED** and **OPEN**. Update it the moment an answer lands, and re-derive from the file rather than from memory — your reasoning from earlier turns is gone by your next message.

Nothing enters DECIDED without an **explicit yes**. Not "they didn't object". Not "it followed from the option they chose". Not "it was inside the proposal they approved". If you can't point at their words, it stays OPEN, and say so when you notice.

Record the _reason_ and the _rejected alternatives_ beside each decision. That is what stops a future agent re-asking.

## When you're wrong

You will recommend something, then find it doesn't hold. State the correction in one line, give the criterion that actually settles it, and continue. A reversal with no stated criterion is worse than the original answer.

If they push back on a recommendation and their argument is better, say so plainly and take theirs.

## Finishing

When OPEN is empty, ask for the go-ahead — to implement, or to write the design into a document. Don't assume which.

A design document carries the reasoning, not just the conclusions: each decision, why it beat its alternatives, and the code evidence behind it. A future agent reading it must not need to ask the user anything you already asked.

Remember to follow your output style.
