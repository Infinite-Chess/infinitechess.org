---
name: interview
description: Settle an under-specified design by asking exactly one question per message, recording only explicit yeses, until nothing is left open — then implement or write it up.
---

# Interview — one decision per message

For work that has to be designed before it can be built. The user decides well when handed one thing at a time and badly when handed five.

## The loop

**One question per message. Never two.** Not "and also", not a second question after answering theirs, not a bundled either/or that hides two choices. If you write "and" in a question, split it. Never number them — you don't know the count until you're done.

Settle what the user _experiences_ first, all of it, before a single question about the design behind it. Names you coin — a constant, a route, a flag — are decisions too: ask.

Let a subject close before opening the next. An answer that rules an option out is a turn in a conversation, not a resolution — never chase it with "so that settles it, next question".

A question they didn't answer is still open. Re-ask it whole: they skip questions it isn't yet their turn to answer, so a re-ask stripped of the detail they never read strands them.

Read the code before you ask. Options must come from what the code actually does — a question built on a guess wastes their decision.

## What not to ask

- Anything derivable from what's already decided.
- Anything already settled by the rulebook, IMPORT_RULES.md or MODULE_CONVENTIONS.md — one option following them and the other not IS the answer. Decide it, say so in passing.
- Anything where neither option carries a benefit. A question you had to manufacture a reason for is not a question.
- Two decisions you have coupled. Prove the coupling exists first; a constraint you assumed rather than checked is not a reason to bundle.
- Anything you already asked.

## The ledger

Keep a scratch file with two sections: **DECIDED** and **OPEN**. Update it the moment an answer lands, and re-derive from the file rather than from memory — your reasoning from earlier turns is gone by your next message.

Nothing enters DECIDED without an **explicit yes**. Not "they didn't object". Not "it followed from the option they chose". Not "it was inside the proposal they approved". If you can't point at their words, it stays OPEN, and say so when you notice.

Record the _reason_ and the _rejected alternatives_ beside each decision. That is what stops a future agent re-asking.

## When you're wrong

You will recommend something, then find it doesn't hold. State the correction in one line, give the criterion that actually settles it, and continue. A reversal with no stated criterion is worse than the original answer.

If they push back on a recommendation and their argument is better, say so plainly and take theirs.

## Finishing

Before you believe OPEN is empty, plan the build. Walk every file you would touch as if you were about to write it — signatures, shapes, names, and a permanent home for anything new that satisfies IMPORT_RULES.md and MODULE_CONVENTIONS.md. Everything that walk surfaces is a question you failed to ask. Ask it. The agent who builds this makes no design decisions, so a hole you leave is one they will fill for you without the user's approval.

Then ask for the go-ahead — to implement, or to write the design into a document. Don't assume which.

A design document is read by an agent who must build the thing without re-asking the user anything. Mirror the interview: behavior in one section, the design behind it in the next, every decision carrying its reason and the code evidence. Rejected alternatives get the one criterion that killed them, and never more room than the requirements they lost to.

Remember to follow your output style.
