# Chat System — Requirements

Decided requirements for the game-page chat, split into behavior (what the user sees and
experiences) and the backend design. Moderation/reporting is deferred to the last section.

Everything here is **decided**. Where a rejected alternative is recorded, it was rejected
deliberately — don't re-open it without a new reason.

## Behavior

### Visibility & access

- Participant-only. Spectators never see the chat panel; engine games never get one. (Already SSR'd this way in `game.njk`.)
- Guests are read-only, **except** in "Challenge a friend" games, where guests may also send.
  The reason is bannability: a guest can't be punished for chat abuse, so we require them to
  either hold an account or be playing a friend.
- For a guest in a public game the input is present but unusable: placeholder reads
  **"Create an account to chat."**, and hovering shows the `not-allowed` cursor.
- The chat works on the single game page (`/game/:id`). There is no pre-game page state — the panel exists only when the page renders a game.

### Messages

- Sender name prefixes each message, **reusing the names the page already SSRs** into
  `meta.players` (`gamePageController.ts`) — the same names the seek list and player bars show:

  | Sender | Renders as |
  | --- | --- |
  | A member | `Naviary: hi` |
  | You, as a guest | `(You): hi` |
  | A guest opponent | `(Guest): hi` |

  A colon always follows the label, parentheses included.

  *This amends an earlier draft that wanted a guest opponent labelled by color, e.g. `(black)`.
  Rejected: one person carrying two different labels on the same screen reads as a bug, and
  with only two players `(Guest)` is never ambiguous.*
- Usernames resolve **at render time** — always the current name, never a snapshot. A renamed
  player's old messages show the new name; a deleted account shows `(Deleted User)`. This
  follows the house rule that player-name snapshots are stored nowhere; players are always
  referenced by `user_id`, which never changes.
- 140-character cap. The input physically prevents typing past it (enforced as you type, *and* on submit, *and* server side).
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
- **While disconnected the client refuses the send and leaves the text in the box** — the same
  treatment a rate-limited send gets. Gate it on the same condition that reveals the
  "You have disconnected." sidebar text (`.self-disconnect-status`).

### Static notices

The chat log doubles as a passive event log. Notices are worded **relative to the reader**
("You disconnected" vs "Opponent disconnected"), so each side sees the same event described
from its own point of view.

The closed set of eight notice codes:

| Code | Written when |
| --- | --- |
| `draw-offered` | A draw offer is extended |
| `draw-declined` | A draw offer is declined — **including** the auto-decline when the opponent moves |
| `draw-accepted` | A draw offer is accepted |
| `rematch-offered` | A rematch is offered, and the opponent had not already offered |
| `rematch-accepted` | The second player's offer completes the handshake |
| `disconnected` | A player's claim window opens |
| `reconnected` | That player returns |
| `cheat-detected` | A cheat report overturns the game |

Notes on the set:

- **There is no rematch *rejection*.** No such event exists — a player who doesn't want a
  rematch simply leaves. `rematch-offered` and `rematch-accepted` must be **two distinct
  codes**, because a dead log of only "offered" rows cannot reveal which one completed the
  handshake. `rematch-accepted` is never seen live (the rematch evicts the old game and
  navigates everyone away); it exists for the dead game's page.
- `disconnected` / `reconnected` are **live-game only**. Leaving during the post-conclusion
  rematch window (`opponentleft` / `opponentreturn`) gets **no** notice — leaving then is
  expected behavior, not an event worth logging.
- `cheat-detected` renders **generically** — the same sentence for both readers, naming nobody.
  Today the two sides get opposite toasts ("you cheated" / "opponent cheated"); a permanent log
  entry must not carry that accusation.
- **The game's own conclusion gets no notice** (resign, timeout, checkmate, abort,
  abandonment). The result banner already states it on both the live and dead page, and it is
  already stored on the `games` row — a notice would be a second copy that could disagree after
  a cheat-report overturn rewrites the result.

Notices have no action buttons (the live accept/reject prompt lives in the game-actions area). They persist as part of the permanent log, and are styled differently (`.chat-notice`).

**No optimistic rendering of notices either.** Offering a draw waits for the server's entry,
exactly like a chat message. The log is persisted server-side, and `socketintents` can drop a
held offer via `isStillValid()` — a locally-rendered notice for an offer that never landed
would sit in the live log forever and vanish on reload, so the live view and the dead page
would disagree.

These notices replace **all three** toasts in `drawoffers.ts`, and their TODO comments go with
them: "Opponent declined draw offer.", "Waiting for opponent to accept...", and "Draw declined".

### Lifecycle

- Live messaging works from game start until the game is memory-evicted (`gameLifecycle.ts`) — at eviction there are no sockets to deliver to, so the chat is simply over.
- After eviction the whole chat (messages + notices) is locked read-only and persisted permanently. Only the two participants ever see it, never the public.
- **Only signed-in participants see the log after eviction.** A guest who played and chatted
  loses access, because dead guests aren't identifiable — `player_games` stores `user_id` and
  never `browser_id`, and `gamePageController` resolves a dead game's role for members only.
  *Accepted deliberately.* The alternative — storing `browser_id` permanently in `player_games`
  — was rejected as a permanent identifying column added for one feature.
- The chat panel is hidden entirely for anyone not identifiable as a participant. The existing
  `gamePageData.role` gate in `game.njk` already does this.
- **The input is hidden entirely** (not merely disabled) once the game can no longer be chatted
  in, so users can see they can't send. The log stays visible and scrollable. Two places:
  - **SSR** — `game.njk`'s `.chat-input` gains an `isLive` condition; today it always renders.
  - **Client** — hide it when `detached` arrives mid-session.

  `detached` isn't a synonym for eviction, but it is the right trigger: both its senders mean
  chat is over (`gameLifecycle.evict`, and `onSubscribeRematch` for a game no longer in
  memory). A **server restart doesn't send it** — `gameRestart.prepForShutdown` detaches
  sockets without broadcasting — so a restart can't wrongly kill the input.
- On account deletion, messages are kept — permanently linked to the game (the account row is deleted; user ids are never reused).
- A game ending with **zero moves** is never written to the `games` table, so `/game/:id` 404s
  for it and no page could ever display its log. Its chat rows are therefore **deleted**.

### Collapse behavior

- The hide-chat toggle collapses the panel to its bar. The collapsed state **resets each visit** (no persistence).

### Copy & localization

- All chat strings are hardcoded English for now. Localization of the entire game page (placeholder copy included) happens when the page is complete — out of scope here.

---

## Backend design

### Database

One table. A row is **either** a player message **or** a notice — the two share every column
but the payload, so splitting them would gain nothing and lose their interleaved order.

```sql
CREATE TABLE IF NOT EXISTS chat_entries (
    message_id    INTEGER PRIMARY KEY,  -- reuses the rowid; orders the log
    game_id       INTEGER NOT NULL,
    player_number INTEGER NOT NULL,     -- the sender, or the player a notice is about
    message       TEXT,                 -- the typed text; NULL for a notice
    notice        TEXT,                 -- the event code; NULL for a message
    sent_at       INTEGER NOT NULL      -- epoch ms the server received it
);

CREATE INDEX IF NOT EXISTS idx_chat_entries_game
    ON chat_entries (game_id, message_id);
```

Why each part is the way it is:

- **`message_id` is a real declared column, not the implicit rowid.** `cacheAllColumns` in
  `database.ts` builds from `pragma_table_info`, which never lists `rowid`; an undeclared rowid
  would be invisible to `columnCache` and absent from `SELECT *`. Declaring it as
  `INTEGER PRIMARY KEY` names the existing rowid, so it costs zero extra bytes.
- **`message_id` is global, not per-game.** A per-game counter would need a genuinely stored
  column plus a `MAX + 1` read on every insert, buying only tidier numbers. Inserts omit the
  column; SQLite assigns it, and `lastInsertRowid` returns it if ever needed.
- **Order by `message_id`, never `sent_at`.** Timestamps tie (two entries in the same
  millisecond are reachable under load) and can move backwards when NTP corrects the clock.
  A rowid does neither.
- **Gaps in `message_id` are permanent and correct.** Concurrent games share one sequence, so a
  game's log already reads `100, 102, 107` before anything is ever deleted, and SQLite never
  renumbers. `message_id` is a **sort key, not a count**. Renumbering would be the dangerous
  option: any stored reference to an id would silently repoint at a different message.
  No `AUTOINCREMENT` — no table in this schema uses it, and ids reused from the top of the
  table are harmless because reads are scoped per game and report evidence is snapshotted
  rather than referenced.
- **No `user_id` column.** `player_number` already resolves to the account through
  `player_games`, so storing it again would be a second copy that can disagree.
- **`message` / `notice` are complementary**, exactly one non-NULL — the same shape as
  `live_games.variant` / `position`.
- **No foreign key to `games`.** Rows are written while the game is live, before its `games`
  row exists. That's why deletion is a manual call rather than a cascade.
- **The index makes a per-game read one ordered range scan.** Every column the dead-page query
  filters or sorts on (`game_id`, `message_id`) is in the index, in that order, so every row
  SQLite touches is a row it returns. 200 entries is microseconds on in-process
  `better-sqlite3`.

**Table name:** `chat_entries`, because a row can be a notice. Rejected: `chat_messages` (too
narrow), `chat_events` ("event" already means the `GameBus` / `EventBus` idea), `chat_records`
(`Record` is the suffix for every DB row *type* here), `chat_lines`, `chat_items`.

#### Written live, and surviving a restart

Entries are written to this permanent table **as they arrive**, not batched at eviction. The
live chat therefore survives a server restart, the same way live games already do.

This is safe in a way that moves are not, and the difference is worth understanding, because
the asymmetry looks wrong at first glance:

- The permanent form of moves is `games.icn`, which is not a list of moves at all. It is one
  serialized document needing values known only at the end (`Result`, `Termination`, rating
  diffs), and for a custom game it is the **only** record of the start position. A separate
  live representation is therefore unavoidable, and move rows would be a *second copy* of data
  the blob already has to hold.
- Chat has no such document and no end-of-game transformation. Its live form and its permanent
  form are the same list of entries.
- The move list is also **mutable** mid-game — a cheat report pops a move. Chat is
  **append-only**: nothing ever edits or removes an entry while the game runs.

#### Deletion

`chatEntriesManager.removeOfGame(id)` owns it. Three callers:

| Caller | When |
| --- | --- |
| `gameLogger.log` | The 0-move early return (a report landed *before* conclusion) |
| `gameLogger.updateOverturned` | The `else` branch only — a report landed on an already-logged game and popped it to 0 moves, beside `gamesManager.remove` |
| Admin Panel | Moderation, deferred |

`updateOverturned`'s **`if` branch (one or more moves left) touches the chat not at all**: the
`games` row survives, the page still renders, and the popped move has nothing to do with what
was said.

`gameLogger`'s rule that zero-move games are not recorded permanently is **left alone** — we do
not start logging a game just because it has chat.

For contrast: `games.game_id` cascades to `player_games` and `engine_games`, and foreign keys
are enforced without a pragma because `better-sqlite3` compiles with
`SQLITE_DEFAULT_FOREIGN_KEYS=1`. `chat_entries` cannot have that cascade — hence the manual call.

### The wire

Two new actions, and one existing message shape collapses.

| Direction | Action | Payload |
| --- | --- | --- |
| client → server | `submitchatmessage` | the typed text |
| server → client | `chatentry` | one entry — message **or** notice |

The names are asymmetric on purpose: the client can only ever submit a **message**, while the
server broadcasts an **entry**, which may be either.

**`message_id` is never sent to clients.** It is a global rowid, so exposing it would leak
roughly how much chat exists site-wide and at what rate.

#### `gamestate` becomes a discriminated union

The full log rides `participantState`, which is already the participant-only overlay and is
already omitted for spectators — so chat inherits exactly the gate it needs, for free.

But a finalized reconnect (`subscriberematch`) previously received `rematchstate`, not a
`gamestate`, so it had no way to carry the log. Rather than adding a third bespoke message,
`gamestate` becomes:

```
gamestate: { stage: 'active',    ...common, moves, clockValues?, ratingChanges?, forceSync? }
         | { stage: 'finalized', ...common }

common           = { spectators, participantState? }
participantState = { drawOffer, disconnect?, rematch?, chat }
```

- **Discriminated, not optional fields.** Making everything optional would type `moves` as
  optional while it is mandatory on the `subscribe` path, and the client could not tell "no
  moves sent" from "empty move list".
- **`stage` matches `onlinegame.ts`'s existing `GameStage`** (`'active' | 'finalized' |
  'evicted'`), so the reply *names the stage the client should move to*. `'active'` stays
  honest for a concluded-but-not-finalized game, which is exactly the window a cheat report
  lives in. `'evicted'` is not a `gamestate` shape — that case is the `detached` message.
- **`finalized` and `gameConclusion` are dropped from `common`.** The discriminator *is* the
  finalized flag, and keeping both is one more way for two values to disagree. The conclusion
  is frozen by then (cheat reports are refused once finalized), and any client in the finalized
  stage already holds it — a client that missed the `finalized` delta is still `'active'` and
  sends a plain `subscribe` instead.
- **`rematchstate` is deleted.** Its data already lives in `participantState.rematch`, built by
  the same function — it was a duplicate wire path for one value.

Chat riding `gamestate` costs nothing in size: `gamestate` already ships every move token on
every resync, and those reach hundreds of KB on large games. Moves dominate chat by far.

#### One attach reply

`gameSockets.sendGameState` becomes the single reply for both subscribe paths:

```
sendGameState(servergame, role, stage, forceSync)
```

`gameStateBuilder.buildStateMessage` gains `stage` and returns the lean shape for
`'finalized'`. `gameSockets.sendRematchState` is deleted; `gameLifecycle.applyConclusion` sends
the lean `gamestate` instead.

**This is the point of the change.** `onSubscribe.ts` and `onSubscribeRematch.ts` each
hand-rolled their own reply, which is why the spectator count was added to one and had to be
patched into the other with a broadcast. Chat would have been the second instance of the same
mistake.

That patch then moves: `onSubscribeRematch`'s `broadcastSpectatorCount` goes **inside the
spectator `else` branch**, and the comment above it is deleted (the participant branch's lean
`gamestate` now carries the count). A participant attaching doesn't change the count; a
spectator attaching does. Both subscribe files end up the same shape.

#### Addressing

Chat deltas go out via `gameSockets.broadcastToParticipants`, **never** `broadcastToEveryone`.
Chat is private to the two participants; relying on a spectator's client to hide it is not
privacy, because the frame was still sent and is readable on the wire.

#### No protocol version bump

`PROTOCOL_VERSION` is **not** incremented. Prod is already behind it, so that deploy forces
every client to refresh regardless — the documented exception in `WEBSOCKETS.md`.

### Validation, at the trust boundary

The zod schema for `submitchatmessage`:

- `.max(140)`. UTF-16 units, the same units the input's `maxlength` counts, so both sides hit
  the cap at the same instant (astral emoji count as 2 on both sides). Escape notation is six
  characters only on the wire; after `JSON.parse` it is one character, which is what zod sees.
- **Trim, then reject if empty. Store the trimmed form.** The client auto-trims before sending,
  but that is never trusted.
- **Reject any C0/C1 control character**, in these ranges:

  | Range | |
  | --- | --- |
  | U+0000 – U+0008 | NUL and the early control block |
  | U+000A – U+001F | LF (U+000A), CR (U+000D), and the rest of the ASCII control block |
  | U+007F | DEL |
  | U+0080 – U+009F | the C1 block |

  **U+0009 (tab) is deliberately excluded.** A tab *is* reachable without hacking: the HTML
  spec's value sanitization strips only line breaks from a text input, so pasting a tab inserts
  a real one. `.chat-log` sets no `white-space`, so it renders as a plain space. Rejecting it
  would silently punish a legitimate paste — silently, because rejections are silent.

  **Unicode format characters (RLO U+202E and friends) get no rule.** They are legitimate in
  Arabic and Hebrew text, and the client renders with `textContent`, so the worst case is
  odd-looking text rather than a security hole.

  The risk this closes is genuinely low — there is no XSS path, because the client uses
  `textContent` and never `innerHTML`. Its real value is keeping hostile strings away from
  every logger (removing the "remember to call `escapeLogNewlines`" obligation at every future
  call site), avoiding NUL truncation in DB tooling, and keeping the deferred email report
  well-formed.

**Every server-side rejection is silent to the client but logged to `hackLog`** — matching how
a bogus cheat report and an oversized frame are handled. Covers: over the rate limit, a
duplicate, a guest sending in a public game, over 140 characters, empty after trim, and control
characters. When logging the offending text, pass it through `logEvents.escapeLogNewlines`.

### Rate limiting

Held **in memory** on the `ServerGame`, not read back from the database.

One array per player: the last 5 entries as `{ sentAt, text }`. Rule 1 reads the oldest
`sentAt`; rule 2 reads the newest two texts. **One array, not two structures** — two could
drift apart. The shape mirrors `requestMeter.ts`'s rolling-timestamp array.

- **Not restored at boot.** Both rules reset on a restart. The cost is one doubled burst and
  possibly one duplicate, once per restart. Accepted.
- **Reading from `chat_entries` per send was rejected.** That query filters on `player_number`
  and `message IS NOT NULL`, neither of which is in the index, so SQLite fetches rows just to
  test and discard them. It would need a second index. (The dead-page full-log read has no such
  problem — see the index note above. The two queries differ in kind, not degree.)
- Store the last two **texts**, not hashes: a hash collision would falsely reject a legitimate
  message, to save about 1 KB per live game.

`sent_at` therefore earns its place through the deferred moderation report, not the rate limiter.

### Server-side write failure

Swallow the error — like `liveGameValues.persist`, so it can't crash a timer callback (notices
are appended from inside `disconnect.startClaimTimer`) — and **skip the broadcast**. Write
first, broadcast only on success.

The log is server-persisted precisely so the live view and the dead page agree. Broadcasting an
entry that isn't stored would show players a message that vanishes on reload — the same failure
mode that ruled out optimistic rendering.

### Where notices are written

| Code | Site |
| --- | --- |
| `draw-offered` / `draw-declined` / `draw-accepted` | `onOfferDraw.offer` / `.decline` / `.accept` |
| `rematch-offered` | `onRematch.offerRematch`, the relay branch |
| `rematch-accepted` | `onRematch.offerRematch`, the `createRematchGame` branch |
| `disconnected` | `disconnect.startClaimTimer`, beside the `opponentdisconnect` send |
| `reconnected` | `gameManager.runReconnectSideEffects`, beside `opponentreconnect` |
| `cheat-detected` | `cheatReport.concludeReportedGame`; `player_number` holds the **cheater** |

`startClaimTimer` is the single funnel for both kinds of disconnect — the 5-second cushion
expiring, and a deliberate tab close — so one write site covers both.

**Not `disconnect.cancelTimer`.** It is also called on game over via `cancelAllTimers`, which
would log a bogus "reconnected" every time a game ended while someone was away.

**The pairing is structural; no guard against two-in-a-row is needed.** `disconnected` is
written only inside `startClaimTimer`; `reconnected` only when `claimWindowWasSet` was true;
and `cancelTimer` clears `timeOpponentMayClaim`, so a second `startClaimTimer` cannot happen
without a real reconnect first.

**A server restart needs no suppression anywhere**, which is not obvious:

- **Shutdown writes no notice.** `prepForShutdown` calls `gameSockets.detachEveryone` directly,
  never `unsubscribeParticipant`, so `startClaimTimer` never runs.
- **Restore, claim window already open:** sets the fields directly without calling
  `startClaimTimer`, so no notice — and the pre-restart `disconnected` row is still in the
  database.
- **Restore, cushion or fresh:** these *do* call `startClaimTimer`, and it is each player's
  **first** notice, because their cushion never expired before shutdown.
- **Reconnecting after the restart** pairs correctly against the pre-restart row.

### The `private` flag

The guest-send exception needs a flag that doesn't exist yet.

- Add `private: boolean` to **`MatchInfo`** (beside `rated`) **and `GameSetup`** — without the
  latter, a rematch of a private game would come back public.
- Set it **once, at the seek-creation boundary**. Every writer downstream reads it, which
  deletes the three `private: 0` hard-codes and their "for now" comments in `gameLogger.ts`
  (twice) and `liveGameValues.ts`.
- The columns `games.private` and `live_games.private` already exist, so there is **no
  migration**.
- Nothing can produce `true` yet: the friend flow is a stub that toasts "not implemented yet",
  and `GameMode` is only `'casual' | 'rated'`. So the server rule today is simply that guests
  may not send.

The term `private` is kept. `unlisted` was considered — more accurate, since anyone with the
link can spectate — and rejected because renaming would mean migrating two shipped tables plus
the `player_stats` public/private counters.

### Rendering

#### Both live and dead pages SSR the rendered entries

The log exists at SSR time in both cases, so `.chat-log` is painted server-side on first
request. The sidebar is plain HTML and paints long before the `<canvas>` board does, and
`gamePageController`'s own doc states the page's principle: the sidebar paints on first request
without a socket or HTTP round-trip. Chat would have been the one exception.

**No new HTTP endpoint.** `GET /api/game/:id` is public and unauthenticated, and chat is
participant-only, so the log must never ride there. The existing `role` gate on the panel is
the whole access check.

**Share the logic, not the markup.** Put

```
entryToParts(entry, readerRole, playerNames) -> { cssClass, prefix, body }
```

in `shared/`. The notice-code-to-sentence mapping, the reader-relative wording, and name
resolution live there **once**. Nunjucks assembles tags with `autoescape: true`; the client
uses `textContent`. Only a three-line tag skeleton is written twice — that is not duplication
worth avoiding.

The eight notice sentences are **hardcoded English inside `entryToParts`**, per the copy rule
above. They must live there rather than in Nunjucks or the client, because both sides render
from the same codes and each sentence is reader-relative. They are swapped for the translation
system in the page-wide localization pass.

#### Client reconcile — no snabbdom

Follow `guimoveslist.ts`'s hand-rolled reconcile, **not** snabbdom.

The criterion, verified across all four list sites in the codebase: snabbdom is used where
entries **mutate or move** — the lobby seek list reorders, the analysis move *tree*
promotes/demotes/deletes and diffs review data into plies already on screen, the variant
selector's saved positions change. A hand-rolled reconcile is used where entries are
**immutable and only the tail changes** — the game page's flat move list.

Chat is the second category more strictly than the move list is. The move list still trims a
tail when a resync or cheat report rewinds moves; chat is append-only and never does. So its
reconcile has no truncate branch at all:

> render everything past what is already rendered.

Three things fall out for free: no diffing library, no flicker, and a scrolled-up reader is
never disturbed, because existing nodes are never touched. SSR needs no hydration step either —
the server paints N entries and the client starts from N.

**Reconcile by count, not by id** (ids never cross the wire). This rules out a plain *replace*
on `gamestate`: a replace would drop a delta that got ahead of a stale full log, whereas
append-past-count keeps it. WebSocket runs over TCP so messages never overtake each other on
the wire — the only reordering risk is the one we create ourselves by handling chat immediately
while queueing `gamestate`.

#### Client routing

`submitchatmessage` **bypasses `socketintents`** and sends directly, like moves and protocol
traffic. The intent layer is actively wrong for chat, in both of its states:

- **Held** (socket down): a second submit *replaces* the first. Type A, type B, reconnect —
  only B is sent, A is silently gone.
- **Outstanding** (sent, awaiting `ack`): a second submit is a *no-op*. B is silently gone.

Both behaviors are correct for "resign" or "offer draw", where a repeat click is the same wish
and the latest should win. Chat is the opposite: every send is distinct content.

Incoming, `onlinegamerouter`'s dispatch splits into two symmetric named functions:

```
routeWithoutGamefile(contents) -> boolean   // handled?
routeWithGamefile(contents)
```

`receiveMessage` stays thin: it tries the first, and if that didn't handle the message the
existing load/queue logic runs unchanged. `notlive`'s special-case at the top folds into the
new function.

Chat must not be queued behind the board load. It needs no gamefile — it renders from
`player_number`, the text, and the reader's own role, all available from `gamePageData` — and
stalling live entries behind the board load would undo the SSR-first-paint decision on exactly
the slow connections where it matters most.

For now `routeWithoutGamefile` holds only `chatentry` and `notlive`. **Auditing which other
routes could move into it is implementation-time work**, and it takes two criteria, not one:
the handler must genuinely not touch the gamefile, **and** there must be a benefit to handling
it early. `spectatorcount` is the clearest other candidate. `finalized` likely fails the second.
Untraced: `gameratingchange`, `detached`, `supersededbytab`, both `guidisconnect` cases, and the
four `gameactions` cases — several call `gameactions.refresh()`, which may read the gamefile.

### New files

| File | Holds |
| --- | --- |
| `src/server/game/gamemanager/chat.ts` | The router entry, validation, rate limiting, the row write, the delta broadcast, and the `appendNotice` helper the notice sites call |
| `src/server/database/chatEntriesManager.ts` | `insert` / `getOfGame` / `removeOfGame` |
| `src/client/scripts/esm/views/game/gui/guichat.ts` | The panel: reconcile, append, input handling |

`chat.ts` is **one** file, sibling to `drawOffers.ts` — not split into `onChat.ts` + `chat.ts`
the way `onOfferDraw.ts` / `drawOffers.ts` are. That pair splits because its rules are read from
three other places; chat has no such fan-out.

The shared `entryToParts` lives in `shared/`, since both the server (Nunjucks SSR) and the
client render from it.

---

## Deferred — moderation & reporting

Everything in this section is deferred until after the main chat ships. The exact report-form UX is undecided.

- **In-chat report button.** The button itself already exists — `game.njk` SSRs `#btn-report`
  with the flag icon in the chat bar; only its behavior is missing. Captures: reporter, reported user, game id, the message(s), timestamp, and a reason picked from: Harassment / Child sexual content / Threats or violence / Other. After submitting, show the reporter a brief "report received" confirmation.
- **A report must snapshot a full copy of the chat, with times down to the second — never
  reference `chat_entries` rows by id.** Three things would otherwise destroy the evidence: a
  0-move game deletes its rows; the Admin Panel's own "delete all chat for this game id"
  control would erase the evidence of the very report being reviewed; and `message_id` values
  from the top of the table can be reused after a delete.
- **API endpoint** for submitting a chat report.
- **Moderation backend.** Reports notify the owner via email address (same email rating abuse reports already go to).
- **A new Admin Panel command to delete all chat of a given game id.** The panel is a command
  console: `POST /api/admin/command` dispatches on a command word in `adminPanel.ts`'s switch
  (`ban`, `unban`, `delete`, `username`, `logout`, `userinfo`, `updatecontributors`, `help`).
  So this is one new `case` calling `chatEntriesManager.removeOfGame`, plus its `help` entry —
  and it takes a **game id**, not a user id, unlike every existing command.
- **Rate limiting on reports** themselves (anti-spam) — undecided.
