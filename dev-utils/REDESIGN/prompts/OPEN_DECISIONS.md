# Open Decisions — resolve before/while implementing the register redesign

**Status: UNDECIDED.** These are gaps in the register-redesign plan that still need the
project owner's call. They are **not yet reflected** in the numbered prompt docs
(`00`–`05`). Read `00_OVERVIEW.md` first for the full design context; each item below notes
which chunk(s) it touches and gives a recommended default.

> Hand this doc, plus `00_OVERVIEW.md`, to the session where these get decided. Once
> decided, fold the choices into the relevant numbered prompt(s) and delete this file.

---

## 1. "Didn't get the email?" — resend + the re-register collision  ⟶ chunks 01 & 03
**The biggest gap.** There is currently no recovery path when the verification email never
arrives (spam, mistyped address). It also collides with the pending table's `UNIQUE`
constraints: a user who re-submits the form with the **same username/email** is told it's
"already taken" — by *their own* pending registration. Dead end.

**Recommended MVP:**
- The "Check your email" state gets a **"Resend email"** button (re-sends to the current
  pending row, identified by the pending cookie) and a **"Wrong email? Start over"** link
  (clears the pending cookie + row, returns to the form).
- On the register POST, if the submission matches the user's **own** pending row (matched
  via the cookie), treat it as an **update + resend** instead of a conflict. A collision
  with someone *else's* non-expired pending row is genuinely "taken".

Without this, anyone whose email is delayed or mistyped is stuck. Closest thing to
required. **Lean: include it.**

## 2. Pending-registration TTL (how long the verify link stays valid)  ⟶ chunk 01
We specced an `expires_at` column but never picked a duration. The old system gave
unverified accounts 3 days. The link should outlive a "I'll check it tonight" delay but not
linger forever. Note this is **separate** from the poll's ~20–30 min cap (which is only how
long the waiting tab actively watches — the link itself stays valid for the TTL).

**Lean: 24 hours.**

## 3. Existing unverified accounts at cutover (production data)  ⟶ chunk 02
When chunk 02 drops the `is_verified` column, any **currently-unverified real `members`
rows in production** instantly become treated as "verified" (the flag that marked them is
gone), and the 3-day `removeOldUnverifiedMembers` cleanup is also removed — so they'd be
silently grandfathered in as full accounts.

**Decide explicitly:**
- (a) **Grandfather them** (they're real people who just never clicked) — simplest, OR
- (b) Run a **one-time cleanup** of old unverified accounts *before* dropping the column.

**Lean: (a)** unless there's meaningful junk. Either way it must be a conscious line in the
chunk-02 PR description, not an accident.

## 4. Verify button: JS fetch vs plain form POST  ⟶ chunk 03
Chunk 03 currently has the "Verify my account" button POST via `serverFetch` (JS) so it can
**swap text in place**. That means it **won't work with JS disabled** — and email links
often open in odd in-app browsers. A plain `<form method="POST">` that full-navigates would
be equally scanner-proof and JS-independent, at the cost of the in-place-swap polish.

**Lean: keep the JS fetch** (matches `login.ts`, which already requires JS), but this is the
one spot where a no-JS fallback has extra value — owner's call.

---

## Minor items — intended to be baked in with the above (flag if you disagree)
These were judged safe defaults; they touch chunks 01 & 03. Confirm when resolving the above.

- **Inert GET `/verify/:token` still *reads* the token** (no writes) to choose what to
  display: the verify button (valid + unverified), "already verified — log in" (already
  promoted), or "link expired" (unknown/expired).
- **Poll idempotency:** keep the verified pending row until the cleanup sweep (do **not**
  delete it on first poll-success), so multiple/refreshed waiting tabs all resolve cleanly;
  the poll simply issues the session each time it sees verified.
- **Verified-row retention:** the cleanup keeps verified pending rows briefly (~1h) then
  deletes them; expired-unverified rows are swept on the normal schedule.

---

## When resolved
Fold each decision into its chunk doc:
- #1 → `01` (register POST resend/update logic, "start over" clear) + `03` (resend button,
  "wrong email" link, expired state).
- #2 → `01` (the `expires_at` value).
- #3 → `02` (cutover handling + PR note).
- #4 → `03` (verify button implementation).
- Minor items → `01` (poll/retention, inert GET read) + `03` (verify page states).

Then delete this file.
