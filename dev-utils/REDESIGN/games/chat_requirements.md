# Chat System — Requirements

Decided requirements for the game-page chat, split into behavior (what the user sees and
experiences) and implementation notes. Moderation/reporting is deferred to the last section.

## Behavior

### Visibility & access

- Participant-only. Spectators never see the chat panel; engine games never get one. (Already SSR'd this way in `game.njk`.)
- Guests are read-only, **except** in "Challenge a friend" games, where guests may also send.
- The chat works on the single game page (`/game/:id`). There is no pre-game page state — the panel exists only when the page renders a game.

### Messages

- Sender name prefixes each message: members by username, you guest as `(you)`, opponent guests as their color (e.g. `(black)`).
- 140-character cap. The input physically prevents typing past it (enforced as you type, *and* on submit, *and* server side
obviously later).
- No timestamps, no sounds, no unread indicator.
- Auto-scroll only sticks to the bottom when already at the bottom; a scrolled-up reading position is never disturbed.

### Sending & rate limiting

Rate-limit state is scoped **per game** — fresh each game. Two rules, both adopted from Lichess's flood model:

1. **Window:** reject if the sender's 5th-most-recent message in this game is younger than 10 seconds (max 4 per rolling 10s window).
2. **Duplicates:** reject only on an **exact match** against either of the sender's last 2 messages in this game (no edit-distance similarity).

Enforcement model:

- The client mirrors both rules. If a send would be rejected, it shows a small error above the input explaining why — **without sending and without clearing the input**. No round trip.
- If the client approves the send: the input clears immediately, and the message renders **only when the server's chat delta arrives** (no optimistic rendering).
- A server-side rejection after a client-approved send is only reachable by hackers/bots: it is **silent** — no error back, the message simply never renders. No text restoration logic exists for this path.
- The typed text is never lost: it clears only when the client approves the send; predicted rejections leave it in place.

### Static notices

The chat log doubles as a passive event log. Both sides see identical notices for every event:

- Draw offer extended / declined / accepted.
- Rematch offer / rejection.
- Opponent disconnected / reconnected, and the same for yourself.

Notices have no action buttons (the live accept/reject prompt lives in the game-actions area). They persist as part of the permanent log. They should also already be styled differently, iirc.

### Lifecycle

- Live messaging works from game start until the game is memory-evicted (`gameLifecycle.ts`) — at eviction there are no sockets to deliver to, so the chat is simply over.
- After eviction the whole chat (messages + notices) is locked read-only and persisted permanently. Both participants see the full log on the finished game's page; only the two participants ever see it, never the public.
- On account deletion, messages are kept — permanently linked to the game (the account row is deleted; user ids are never reused).

### Collapse behavior

- The hide-chat toggle collapses the panel to its bar. The collapsed state **resets each visit** (no persistence).

### Copy & localization

- All chat strings are hardcoded English for now. Localization of the entire game page (placeholder copy included) happens when the page is complete — out of scope here.

---

## Implementation notes

Decided alongside the behavior above; not user-facing.

- Rate-limit enforcement lives server-side per game in memory (mirrored by the client); the rules in *Sending & rate limiting* are the single source of truth for both sides.
- Draw offers/rejections/rematch events log into the chat window instead of toasting (replaces the TODOs in `drawoffers.ts`).
- The `.chat.collapsed` selectors in `game.css` were reviewed: four rules, each load-bearing — no bloat to remove.

---

## Deferred — moderation & reporting

Everything in this section is deferred until after the main chat ships. The exact report-form UX is undecided.

- **In-chat report button.** Captures: reporter, reported user, game id, the message(s), timestamp, and a reason picked from: Harassment / Child sexual content / Threats or violence / Other. After submitting, show the reporter a brief "report received" confirmation.
- **API endpoint** for submitting a chat report.
- **Moderation backend.** Reports notify the owner via email address (same email rating abuse reports already go to). The Admin Panel — which already bans users on repeated offense and logs admin actions — needs a control to delete all chat messages for a given game id.
- **Rate limiting on reports** themselves (anti-spam) — undecided.
