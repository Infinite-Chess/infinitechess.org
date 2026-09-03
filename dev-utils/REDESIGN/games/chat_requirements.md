# Chat System — Requirements

Decided requirements for the game-page chat, split into behavior (what the user sees and
experiences) and the backend design.

**The report system is a separate system**, specified in its own document —
[chat_report_requirements.md](chat_report_requirements.md). It consumes the chat's data but shares none of
its lifecycle, wire or storage decisions. Nothing here depends on it.

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
  Spelled as the **`disabled` attribute** (`.chat-input:disabled` supplies the cursor), so no
  client-side permission check exists anywhere — there is no path from a disabled input to a
  send. The server's own guest rejection is independent of it, not a backstop for it.
- The chat works on the single game page (`/game/:id`). There is no pre-game page state — the panel exists only when the page renders a game.

### Messages

- Sender name prefixes each message, **reusing the names the page already SSRs** into
  `meta.players` (`gamePageController.ts`) — the same names the seek list and player bars show:

    | Sender           | Renders as    |
    | ---------------- | ------------- |
    | A member         | `Naviary: hi` |
    | You, as a guest  | `(You): hi`   |
    | A guest opponent | `(Guest): hi` |

    A colon always follows the label, parentheses included.

    _This amends an earlier draft that wanted a guest opponent labelled by color, e.g. `(black)`.
    Rejected: one person carrying two different labels on the same screen reads as a bug, and
    with only two players `(Guest)` is never ambiguous._

- Usernames resolve **at render time** — always the current name, never a snapshot. A renamed
  player's old messages show the new name; a deleted account shows `(Deleted User)`. This
  follows the house rule that player-name snapshots are stored nowhere; players are always
  referenced by `user_id`, which never changes.
- 140-character cap. The input physically prevents typing past it (enforced as you type, _and_
  on submit, _and_ server side). `MAX_CHAT_MESSAGE_LENGTH` lives in
  `shared/util/chatratelimit.ts` beside the flood rules, and is imported by both the zod schema
  and the client's submit check. `game.njk` keeps a bare `maxlength="140"` with a comment naming
  that constant — Nunjucks can't import TypeScript, and this is exactly how the auth pages carry
  their own caps (`components/forms.njk`).
- No timestamps, no sounds, no unread indicator.
- Auto-scroll only sticks to the bottom when already at the bottom; a scrolled-up reading position is never disturbed.
- **No profanity filter.** Messages are never blocked, censored or masked, and the existing
  `accountValidation.checkProfanity` (used on usernames) is not reused here. A username is
  broadcast to every player, which is what justifies filtering it; a chat is private between two
  people. A word list also cannot tell swearing from abuse, and abuse is what the
  [report system](chat_report_requirements.md) exists to catch — with context, judged by a human.
  _Rejected: Lichess's model, where `shutup` lets the message through but auto-reports the sender.
  That suits a site with a mod team; here every auto-report would land in one inbox. Also rejected:
  a per-user preference masking profane words client-side, which would ship the `obscenity` package
  in the game page bundle._

### Sending & rate limiting

Rate-limit state is scoped **per game** — fresh each game. Two rules, both adopted from Lichess's flood model:

1. **Window:** reject if the sender's 5th-most-recent message in this game is younger than 10 seconds (max 4 per rolling 10s window).
2. **Duplicates:** reject only on an **exact match** against either of the sender's last 2 messages in this game (no edit-distance similarity).

Both rules live in **one shared module**, `shared/util/chatratelimit.ts`, so neither side
reimplements them: `check(history, text, now)` returns a rejection reason or nothing, and
`record(history, text, now)` pushes and trims the history to 5. The client maps a reason to its
error text; the server maps it to its `hackLog` line. Drift is impossible by construction.

_Home: shared placement goes by subject, and a flood limiter over user text owes nothing to
chess, so `shared/util/` (rung 1) is its rung. It imports nothing, so it can't point up a
ladder, and that rung carries no page-reachability rule._

Enforcement model:

- The client mirrors both rules by calling that module. If a send would be rejected, a small
  error shows above the input explaining why — **without sending and without clearing the
  input**. No round trip. One `<div class="chat-error hidden">` sits between `.chat-log` and
  `.chat-input`, cleared on the next keystroke:

    | Trigger               | Text                          |
    | --------------------- | ----------------------------- |
    | Over the window limit | Slow down, too many messages. |
    | Duplicate             | You just said that.           |
    | Disconnected          | You are disconnected.         |

- **Enter sends.** Same pattern as the variant selector's ICN field (`variantselector.ts`),
  minus its `shiftKey` guard — a single-line `<input>` has no newline to suppress.
- If the client approves the send: the input clears immediately, and the message renders **only when the server's chat delta arrives** (no optimistic rendering).
- **The client's mirror is rebuilt from the log, never carried in page state.** It keeps the same
  `{ sentAt, text }[]` history the server does, but a page refresh cannot blind it: every
  `gamestate` carries the full log, so the client replays its own messages through `record` and
  the history comes back with the page. A `chatentry` delta then records into it as normal.
  _(This is why entries carry a timestamp on the wire at all. Without one the window rule would be
  unmirrorable after a reload, and the silent-rejection design below would rest on a false claim.)_
- **Its `sentAt` is in the CLIENT's clock, converted at receipt.** The wire carries `millisAgo`, a
  duration — never a server instant, per the house rule on `ClockValues.timeColorTickingLosesAt`.
  The client translates it into its own clock the moment the message lands:

    ```ts
    const sentAt = Date.now() - entry.millisAgo - pingmanager.getHalfPing();
    ```

    The half-ping is the inbound transit, mirroring `adjustClockValuesForPing`. There is nothing
    outbound to correct: the server stamps a send whenever it receives it, and that lands a few
    tens of ms in the player's favour.

- **The conversion happens up front in `receiveMessage`, above the message queue** — beside
  `adjustClockValuesForPing`, for the same reason its comment gives. A `gamestate` can sit in
  `messageQueue` for as long as the board takes to load; converting after that would stamp every
  message as far newer than it is. So the flood history is updated at **receipt**, and rendering
  happens later when the queue flushes. A `gamestate` rebuilds the history, a `chatentry` records
  into it — each exactly once, so a replayed message is never re-stamped.
- A server-side rejection after a client-approved send is only reachable by hackers/bots — the
  mirror above cannot go stale — so it is **silent**: no error back, the message simply never
  renders. No text restoration logic exists for this path.
- The typed text is never lost: it clears only when the client approves the send; predicted rejections leave it in place.
- **While disconnected the client refuses the send and leaves the text in the box** — the same
  treatment a rate-limited send gets. Gate it on the same condition that reveals the
  "You have disconnected." sidebar text (`.self-disconnect-status`).

### Static notices

The chat log doubles as a passive event log. Notices are worded **relative to the reader**
("You disconnected" vs "Opponent disconnected"), so each side sees the same event described
from its own point of view.

The closed set of nine notice codes, and the English each renders as. Every row stores
`player_number` — the player the notice is _about_ — so the wording is picked from whether the
reader is that player:

| Code                     | Written when                                                                      | Reader is that player                        | Reader is the other               |
| ------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------- |
| `draw-offered`           | A draw offer is extended                                                          | You offered a draw.                          | Opponent offered a draw.          |
| `draw-declined`          | A draw offer is declined — **including** the auto-decline when the opponent moves | You declined the draw offer.                 | Opponent declined the draw offer. |
| `draw-accepted`          | A draw offer is accepted                                                          | You accepted the draw offer.                 | Opponent accepted the draw offer. |
| `rematch-offered`        | A rematch is offered, and the opponent had not already offered                    | You offered a rematch.                       | Opponent offered a rematch.       |
| `rematch-accepted`       | The second player's offer completes the handshake                                 | You accepted the rematch.                    | Opponent accepted the rematch.    |
| `disconnect-voluntary`   | A player's claim window opens, and they left on purpose                           | You disconnected.                            | Opponent disconnected.            |
| `disconnect-involuntary` | A player's claim window opens, and their network dropped                          | You lost connection.                         | Opponent lost connection.         |
| `reconnected`            | That player returns                                                               | You reconnected.                             | Opponent reconnected.             |
| `cheat-detected`         | A cheat report overturns the game                                                 | Cheating was detected. The game was aborted. | _(same)_                          |

"Opponent", no article, matching the sidebar's existing copy in `guidisconnect.ts`.

Notes on the set:

- **The two disconnect codes are named off the wire, not off their sentences.** There is only
  ONE socket action, `opponentdisconnect`, and it carries the distinction in a `voluntary`
  boolean — so the codes mirror `opponentdisconnect` + that field rather than inventing a second
  event name. (`connection-lost` was rejected outright: `SocketBus` already declares an event by
  that exact name meaning **our own** socket dropped, and a stored code sharing it would make
  every grep ambiguous.)
- **They are two codes rather than one, on purpose.** Voluntariness is only _inferred_ —
  `wasSocketClosureInvoluntary` reads it off the socket close code, so a rage-quit closing as
  1006 and a flaky stack emitting 1001 are both mislabelled. That argues for showing one neutral
  sentence. But the rows are permanent and can never be repaired retroactively, so collapsing
  them at write time would destroy a distinction we could never recover. Store both, and keep the
  choice of what to display open. `startClaimTimer` already holds `involuntary`, so it is a
  ternary at the single write site. Their two sentences also match the live sidebar word for
  word, which one shared sentence would not.
- **`draw-declined` stays reader-relative even for the auto-decline.** Moving really is
  declining — the client already models it that way (`user-move-played` → `closeDraw()`) — and
  the opponent's side needs "Opponent declined the draw offer." to be true regardless. A
  reader-agnostic carve-out for one code would break the only wording rule the set has.
- **There is no rematch _rejection_.** No such event exists — a player who doesn't want a
  rematch simply leaves. `rematch-offered` and `rematch-accepted` must be **two distinct
  codes**, because a dead log of only "offered" rows cannot reveal which one completed the
  handshake. `rematch-accepted` is never seen live (the rematch evicts the old game and
  navigates everyone away); it exists for the dead game's page.
- The two disconnect codes and `reconnected` are **live-game only**. Leaving during the post-conclusion
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

**Removing the first one deletes the whole `drawdecline` path.** That toast _is_ the entire body
of `onOpponentDeclinedOffer`, which is the message's only handler, and no client state depends on
it arriving: the client tracks `isAcceptingDraw` (an offer _from_ the opponent) and
`plyOfLastOfferedDraw` (when _we_ last offered), and a decline touches neither — the offer-draw
button's enablement reads only the second. So the handler, its router case, the `drawdecline`
action in `clientbound.ts`, and the server send in `onOfferDraw.decline` all go. The offerer still
finds out: the `draw-declined` notice is broadcast to both participants.

### Lifecycle

- Live messaging works from game start until the game is memory-evicted (`gameLifecycle.ts`) — at eviction there are no sockets to deliver to, so the chat is simply over.
- After eviction the whole chat (messages + notices) is locked read-only and persisted permanently. Only the two participants ever see it, never the public.
- **Only signed-in participants see the log after eviction.** A guest who played and chatted
  loses access, because dead guests aren't identifiable — `player_games` stores `user_id` and
  never `browser_id`, and `gamePageController` resolves a dead game's role for members only.
  _Accepted deliberately._ The alternative — storing `browser_id` permanently in `player_games`
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

- Clicking anywhere on the chat bar besides the report button shows the pointer cursor, and clicking toggles the panel open/closed
  to just its bar. The collapsed state **resets each visit** (no persistence).

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
    sent_at       INTEGER NOT NULL      -- epoch ms the server recorded it
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
(`Record` is the suffix for every DB row _type_ here), `chat_lines`, `chat_items`.

#### Written live, and surviving a restart

Entries are written to this permanent table **as they arrive**, not batched at eviction. The
live chat therefore survives a server restart, the same way live games already do.

This is safe in a way that moves are not, and the difference is worth understanding, because
the asymmetry looks wrong at first glance:

- The permanent form of moves is `games.icn`, which is not a list of moves at all. It is one
  serialized document needing values known only at the end (`Result`, `Termination`, rating
  diffs), and for a custom game it is the **only** record of the start position. A separate
  live representation is therefore unavoidable, and move rows would be a _second copy_ of data
  the blob already has to hold.
- Chat has no such document and no end-of-game transformation. Its live form and its permanent
  form are the same list of entries.
- The move list is also **mutable** mid-game — a cheat report pops a move. Chat is
  **append-only**: nothing ever edits or removes an entry while the game runs.

#### Deletion

`chatEntriesManager.removeOfGame(id)` owns it. Three callers:

| Caller                        | When                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `gameLogger.log`              | The 0-move early return (a report landed _before_ conclusion)                                                             |
| `gameLogger.updateOverturned` | The `else` branch only — a report landed on an already-logged game and popped it to 0 moves, beside `gamesManager.remove` |
| Admin Panel                   | Moderation — the delete-chat-of-a-game-id command, shipping with the [report system](chat_report_requirements.md)         |

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

| Direction       | Action              | Payload                           |
| --------------- | ------------------- | --------------------------------- |
| client → server | `submitchatmessage` | the typed text                    |
| server → client | `chatentry`         | one entry — message **or** notice |

The names are asymmetric on purpose: the client can only ever submit a **message**, while the
server broadcasts an **entry**, which may be either.

**`message_id` is never sent to clients.** It is a global rowid, so exposing it would leak
roughly how much chat exists site-wide and at what rate.

#### The entry shape

One type serves both the `chatentry` delta and the full log on `participantState`. Its home is
`clientbound.ts` — the entry exists only as clientbound message contents.

```ts
/** The closed set of static event notices the chat log can hold. */
export type ChatNoticeCode = z.infer<typeof ChatNoticeCodeSchema>;
const ChatNoticeCodeSchema = z.literal([
	'draw-offered', 'draw-declined', 'draw-accepted',
	'rematch-offered', 'rematch-accepted',
	'disconnect-voluntary', 'disconnect-involuntary', 'reconnected',
	'cheat-detected',
]); // prettier-ignore

/** What every chat log entry carries, message or notice. */
const ChatEntryBaseSchema = z.strictObject({
	/** The sender, or the player a notice is about. */
	player: typeschemas.PlayerSchema,
	/** How long ago the server recorded it. A duration, never an instant — the two clocks aren't in sync. */
	millisAgo: z.number(),
});

/** One line of the chat log: a player's typed message, or a static event notice. */
export type ChatEntry = z.infer<typeof ChatEntrySchema>;
const ChatEntrySchema = z.discriminatedUnion('kind', [
	ChatEntryBaseSchema.extend({ kind: z.literal('message'), text: z.string() }),
	ChatEntryBaseSchema.extend({ kind: z.literal('notice'), code: ChatNoticeCodeSchema }),
]);
```

- **Tagged, not exactly-one-of.** `kind` narrows in one step, and matches the discriminator
  `gamestate` gains below. _Rejected: two branches told apart only by which field is present —
  the tag costs one field and buys uniform narrowing._
- **`text`, not `message`.** `entry.message` beside `kind: 'message'` reads badly, and `text`
  matches the shared flood module's `check(history, text, now)`.
- **A duration, not a timestamp.** `ClockValues.timeColorTickingLosesAt` states the house rule:
  the server never sends an instant for the client to compare against its own clock, because the
  two aren't in sync. `DisconnectInfo.millisUntilClaimable` is the shape to copy. The client
  converts on receipt, adjusting for half-ping exactly as `adjustClockValuesForPing` does — see
  the Enforcement model above. The stored `sent_at` column keeps a real epoch ms; only the wire
  differs.
- **`millisAgo` rides every entry, notices included.** The log is uniformly timestamped rather than
  timestamped only where a rule happens to need it today. It is **not** a sort key — order comes
  from array position, which the server built from `message_id`; see the ordering note above.
  Nothing displays it, and only the reader's own message entries are ever read for it.
- **`text` carries no `.max(140)`.** A clientbound schema is what the client checks OUR OWN server
  against. The cap belongs on the serverbound side, where the trust boundary actually is.
- **No zod enums**, here or anywhere — `z.literal([...])` with an array, matching `serverbound.ts`.
- `player` is written once on the base rather than per branch, so the two branches can't drift.
  Its comment reads the same as the `player_number` column's, deliberately.

#### `gamestate` becomes a discriminated union

The full log rides `participantState`, which is already the participant-only overlay and is
already omitted for spectators — so chat inherits exactly the gate it needs, for free.

But a finalized reconnect (`subscriberematch`) previously received `rematchstate`, not a
`gamestate`, so it had no way to carry the log. Rather than adding a third bespoke message,
`gamestate` becomes:

```
gamestate: { kind: 'full', ...common, moves, finalized, clockValues?, gameConclusion?, ratingChanges?, forceSync? }
         | { kind: 'lean', ...common }

common           = { spectators?, participantState? }
participantState = { drawOffer, disconnect?, rematch?, chat? }
```

- **`chat` is `ChatEntry[]`, oldest first, and OPTIONAL.** Its two states mean different things:
  `[]` is a real chat with nothing said yet; **absent** means the game has no chat at all, which
  today means an engine game. That mirrors how `rematch` is set only when `getRematchOfferInfo`
  returns something.

- **The shape follows the REQUEST, not the game's lifecycle stage.** `subscribe` is always
  answered `full`; `subscriberematch` is always answered `lean`. This is not a preference — a
  client asking for the full state may be bootstrapping a board from nothing, and the server
  cannot tell whether it already holds one. Picking the shape from the game's stage would answer
  a finalized-but-lingering game with a moveless reply, and a plain page refresh during the
  rematch window is the everyday case. Give them what they asked for.
- **Discriminated, not optional fields.** Making everything optional would type `moves` as
  optional while it is mandatory on the `subscribe` path, and the client could not tell "no
  moves sent" from "empty move list".
- **`kind` names the reply, so `finalized` survives** — on the `full` shape only. Because the
  discriminator now tracks the request, it can no longer double as the finalized flag. The `lean`
  shape needs no copy: only a client already at stage `'finalized'` ever sends `subscriberematch`.
  So the fact still has exactly one home and nothing can disagree.
  _(Rejected: naming the variants `'active'` / `'finalized'` after `onlinegame.ts`'s `GameStage`.
  A `full` reply for a finalized game would then be a lie about the game.)_
- **`gameConclusion` also sits on `full` only.** It is frozen by the time a `lean` reply is even
  possible — cheat reports are refused once finalized — and any client sending `subscriberematch`
  already holds it.
- **`'evicted'` has no `gamestate` shape at all** — that case is the `detached` message.
- **`rematchstate` is deleted.** Its data already lives in `participantState.rematch`, built by
  the same function — it was a duplicate wire path for one value. Its single push, at conclusion,
  is replaced below.

Chat riding `gamestate` costs nothing in size: `gamestate` already ships every move token on
every resync, and those reach hundreds of KB on large games. Moves dominate chat by far.

#### One attach reply

`gameSockets.sendGameState` becomes the single reply for both subscribe paths:

```
sendGameState(servergame, role, kind, forceSync)
```

`gameStateBuilder.buildStateMessage` gains `kind` and returns the lean shape for `'lean'`.

**This is the point of the change.** `onSubscribe.ts` and `onSubscribeRematch.ts` each
hand-rolled their own reply, which is why the spectator count was added to one and had to be
patched into the other with a broadcast. Chat would have been the second instance of the same
mistake.

That patch then moves: `onSubscribeRematch`'s `broadcastSpectatorCount` goes **inside the
spectator `else` branch**, and the comment above it is deleted (the participant branch's lean
`gamestate` now carries the count). A participant attaching doesn't change the count; a
spectator attaching does. Both subscribe files end up the same shape.

#### The rematch overlay at conclusion

`gameSockets.sendRematchState` is deleted with **no replacement message**.
`gameLifecycle.applyConclusion` sends `opponentleft` instead, to any participant whose opponent
has no socket.

The overlay is two booleans, and at conclusion `offered` is always false — nobody could have
offered before the game was over. So the only fact worth pushing is `present`, and only when it
is false. `opponentleft` already means exactly that ("their socket is gone, the game is over"),
carries no payload, and `guigameactions.onOpponentLeft` already sets both booleans correctly.
The button's repaint comes from the board's own `game-concluded` event, not from any message, so
sending nothing in the common case is safe.

- **Why anything is needed at all:** `opponentleft` only fires from `onPostGameLeave`, which runs
  when someone leaves _after_ the conclusion. A player already gone when the game ended never
  triggers it, and `guigameactions`'s `opponentPresentPostGame` defaults to `true` — so without
  this, Rematch lights up for an opponent who isn't there.
- **Not a full `gamestate`.** That would ship an entire move list to carry one boolean, on the
  one path where large games are already expensive.
- **Engine games return early.** `playerData` holds humans only — the engine lives in
  `match.engineParticipant` — so an engine opponent reads as "no socket" and would wrongly
  disable Rematch. `getRematchOfferInfo` already special-cases this; mirror it.
- The turn player also receives `participantState.rematch` inside the `gamestate` `conclude()`
  sends them. It carries the same `present: false`, so the two agree rather than conflict.

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

    | Range           |                                                                   |
    | --------------- | ----------------------------------------------------------------- |
    | U+0000 – U+0008 | NUL and the early control block                                   |
    | U+000A – U+001F | LF (U+000A), CR (U+000D), and the rest of the ASCII control block |
    | U+007F          | DEL                                                               |
    | U+0080 – U+009F | the C1 block                                                      |

    **U+0009 (tab) is deliberately excluded.** A tab _is_ reachable without hacking: the HTML
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
duplicate, a guest sending in a public game, **an engine game**, over 140 characters, empty after
trim, and control characters. When logging the offending text, pass it through
`logEvents.escapeLogNewlines`.

**Engine games have no chat, period.** `game.njk` already gates the panel on
`role is defined and not engineGame`, so nothing an engine game writes could ever be read. One
guard in `chat.ts` covers both directions: `appendNotice` returns early, and a
`submitchatmessage` is dropped (silently, per above). The notice sites stay ignorant of it.
Without the guard, every engine game would write at least one permanent row nobody can render —
the two disconnect codes and `reconnected` fire when the human leaves and returns, and
`rematch-accepted` fires because `offerRematch` calls `createRematchGame` directly for engines.
The `submitchatmessage` half is a trust-boundary check, not an optimization: a hand-crafted
client can still send one.

That guard covers the two **write** paths only. **Reads are gated by their callers instead**, with
no guard in the read path at all. The SSR reader serves dead games too, where no `ServerGame`
exists — it reads the table directly and must decide engine-ness for itself, so a guard further
down could never fire, and an unreachable guard comes out. Both read sites already hold the fact:
`gamePageController` has `engineGame` as a local, and `gameStateBuilder` already calls
`gameUtility.isEngineGame`.

### Rate limiting

Held **in memory** on the `ServerGame`, not read back from the database.

One array per player: the last 5 entries as `{ sentAt, text }`. Rule 1 reads the oldest
`sentAt`; rule 2 reads the newest two texts. **One array, not two structures** — two could
drift apart. The shape mirrors `requestMeter.ts`'s rolling-timestamp array.

The client holds the same shape, but its `sentAt` is in the **client's** clock, converted at
receipt (see the Enforcement model). Each side's history is internally consistent, and the two
instants are never compared across the wire — only the `millisAgo` duration crosses it.

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

| Code                                               | Site                                                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `draw-offered` / `draw-declined` / `draw-accepted` | `onOfferDraw.offer` / `.decline` / `.accept`                                                                                       |
| `rematch-offered`                                  | `onRematch.offerRematch`, the relay branch                                                                                         |
| `rematch-accepted`                                 | `onRematch.offerRematch`, the `createRematchGame` branch                                                                           |
| `disconnect-voluntary` / `disconnect-involuntary`  | `disconnect.startClaimTimer`, beside the `opponentdisconnect` send. It already holds `involuntary`, so the code is a ternary on it |
| `reconnected`                                      | `gameManager.runReconnectSideEffects`, beside `opponentreconnect`                                                                  |
| `cheat-detected`                                   | `cheatReport.concludeReportedGame`; `player_number` holds the **cheater**                                                          |

`startClaimTimer` is the single funnel for both kinds of disconnect — the 5-second cushion
expiring, and a deliberate tab close — so one write site covers both.

**Not `disconnect.cancelTimer`.** It is also called on game over via `cancelAllTimers`, which
would log a bogus "reconnected" every time a game ended while someone was away.

**The pairing is structural; no guard against two-in-a-row is needed.** A disconnect code is
written only inside `startClaimTimer`; `reconnected` only when `claimWindowWasSet` was true;
and `cancelTimer` clears `timeOpponentMayClaim`, so a second `startClaimTimer` cannot happen
without a real reconnect first.

**A server restart needs no suppression anywhere**, which is not obvious:

- **Shutdown writes no notice.** `prepForShutdown` calls `gameSockets.detachEveryone` directly,
  never `unsubscribeParticipant`, so `startClaimTimer` never runs.
- **Restore, claim window already open:** sets the fields directly without calling
  `startClaimTimer`, so no notice — and the pre-restart disconnect row is still in the
  database.
- **Restore, cushion or fresh:** these _do_ call `startClaimTimer`, and it is each player's
  **first** notice, because their cushion never expired before shutdown.
- **Reconnecting after the restart** pairs correctly against the pre-restart row.

### The `private` flag

The guest-send exception needs a flag that doesn't exist yet.

- Add `private: boolean` to **`MatchInfo`** (beside `rated`) **and `GameSetup`** — without the
  latter, a rematch of a private game would come back public.
- **Required on both, never optional.** Both `MatchInfo` builders declare an explicit return type,
  so a required field makes the compiler enumerate every site that fails to supply it. Optional
  would silently drop the flag on any path that forgets — which is exactly how the restore path
  below went missing in the first draft.
- Set it **once, at the seek-creation boundary**. Every writer downstream reads it, which
  deletes the three `private: 0` hard-codes and their "for now" comments in `gameLogger.ts`
  (twice — the `games` insert and the `player_stats` public/private counters) and
  `liveGameValues.ts`.

A `MatchInfo` is born in **four** places, and all four must supply it:

| Site                                   | Value                                                          |
| -------------------------------------- | -------------------------------------------------------------- |
| `acceptSeek`                           | The human seek — hardcoded `false` until the friend flow ships |
| `createEngineGame`                     | Always `false`                                                 |
| `onRematch.offerRematch`               | Inherits `oldMatch.private`                                    |
| `liveGameRestore.reconstructMatchInfo` | `gameRow.private === 1`                                        |

**That last one is the reader the flag would otherwise have nowhere.** `MatchInfo` has two
independent builders — `gameUtility.initMatch` from a `GameSetup`, and `reconstructMatchInfo` from
DB rows — and nothing but the required field ties them together. Without it a server restart would
silently turn a friend game public and strip its guests of the right to chat.

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

**The database is the only source, live game included.** There is no in-memory entry list on the
`ServerGame` — only the rate-limit history. Rows are written as they arrive, so the table is
always current, and a second in-memory copy could only ever disagree with it. That also means a
restart needs no chat restore work: the rows never left.

Two read sites, both calling the manager directly:

| Site                                   | Reads                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `gamePageController.getPageState`      | The SSR'd log, for a live **or** dead game — it already resolves `role` for both |
| `gameStateBuilder.getParticipantState` | `participantState.chat`, on every `gamestate`                                    |

```ts
chatEntriesManager.getOfGame(game_id: number): ChatEntriesRecord[]  // rows, like every sibling manager
chat.toEntry(record: ChatEntriesRecord, now: number): ChatEntry      // the row → wire mapper
```

- **No `chat.getLog` wrapper.** With the engine check pushed to the callers it would wrap a single
  call and add nothing.
- **`toEntry` takes `now`** because the wire carries `millisAgo`, a duration, not the stored
  `sent_at` instant. One reading serves a whole log, so every entry in one message is measured
  from the same moment. `getParticipantState` already has `const now = Date.now()` in scope for
  `millisUntilClaimable`.
- **`toEntry` lives in `chat.ts`**, not in the manager — a manager handles rows, not application
  logic — and not in a live-only module, since the SSR site maps dead games through it too. `chat.ts`
  already builds the row on the write side, so the row ↔ entry knowledge sits in one file.
  `gamePageController` importing from `gamemanager/` is already routine there.
- **Each caller decides whether to read at all.** SSR reads only when `role !== undefined` and the
  game is not an engine game; `getParticipantState` only when not an engine game. A spectator and
  an engine game each trigger no query.
- A DB read per subscribe is fine: the index makes it one ordered range scan (see the Database
  section), and a subscribe is not a hot path. `gameStateBuilder` already reads the leaderboard from
  the database in `buildStaticState`, so this breaks none of its "pure builder" rule.

**The socket's copy of the log is load-bearing, not decoration.** SSR paints pixels; the client
needs the entry _data_ to derive its flood mirror. That is why both carry it. The client learns
where SSR stopped by counting `.chat-log`'s children.

**`GamePageState` gains the log as its own field** — a sibling of `meta`, never inside it.
`GameMetaViewModel` is derived wholly from `StaticGameState` and holds nothing that changes; chat
does. The only thing chat borrows from it is the habit of precomputing for Nunjucks, which can't
call TypeScript:

```ts
/** The SSR'd chat log, already run through `entryToParts`. Absent for spectators and engine games. */
chat?: ChatEntryParts[];
```

`gamePageData` gains no raw log — the client gets entry data over the socket.

**Share the logic, not the markup.** Put

```
entryToParts(entry, readerRole, playerNames) -> { cssClass, prefix, body }
```

in `shared/`, where `prefix` is **absent for a notice** — a notice has no sender, and `''` would
claim it has an empty one. The notice-code-to-sentence mapping, the reader-relative wording, and
name resolution live there **once**. Nunjucks assembles tags with `autoescape: true`; the client
uses `textContent`. Only the tag skeleton is written twice — that is not duplication worth
avoiding, but the two must match exactly, so here it is:

```njk
{# game.njk #}
{% for e in chat %}
<div class="{{ e.cssClass }}">{% if e.prefix %}<span class="chat-sender">{{ e.prefix }}</span> {% endif %}{{ e.body }}</div>
{% endfor %}
```

```ts
// guichat.ts
const div = document.createElement('div');
div.className = parts.cssClass;
if (parts.prefix !== undefined) {
	const sender = document.createElement('span');
	sender.className = 'chat-sender';
	sender.textContent = parts.prefix;
	div.append(sender, ` ${parts.body}`);
} else div.textContent = parts.body;
```

A row `div` holding a `span` for the distinct sub-part is the in-house shape already — see
`div.move-row` / `span.move-num` in `guimoveslist.ts`. The sender gets its own element so its
name can be styled apart from the message text; folding both into one flat string would be
simpler but would make that permanently impossible.

`cssClass` is `chat-message` or `chat-notice`. Three CSS changes:

```css
.chat-log {
	/* ...existing... */
	overflow-wrap: anywhere; /* A 140-char unbroken paste must not scroll the panel sideways. */
}

/* Messages need no rules yet: left aligned and full emphasis are both the default.
   Kept as the named counterpart to .chat-notice, and as the landing spot for the next change. */
.chat-message {
}

/* The sender's name, ahead of their message. */
.chat-sender {
	font-weight: 600;
}
```

`.chat-notice` already carries the centering and muted color it needs, and does not change. The
empty `.chat-message` block is deliberate — prettier keeps it and there is no stylelint here.

**`playerNames` is added to `GamePageData`.** `entryToParts` needs the display names, and while
the server has them in `meta.players`, `meta` is the Nunjucks view model — it never reaches the
browser. `window.gamePageData` is the only SSR→client channel, and it carries no names, so a
**live** entry arriving over the socket has nothing to build its label from. One field,
`playerNames: PlayerGroup<string>`, filled from the same values `meta.players` uses, so both
sides resolve identically by construction. Not gated on `role`: the names are already in the
page's HTML for spectators too, so there is nothing to withhold and no branch to get wrong.

_Rejected: scraping `.meta-players .username` from the DOM — `game.njk` marks that region
SSR-OWNED, and it would couple chat to the player-list markup with no compile-time link.
Also rejected: putting the sender's name on every `chatentry` — it repeats the name per message,
does nothing for the SSR'd backlog, and a mid-game rename would make old and new entries
disagree, which is exactly what render-time resolution exists to prevent._

The nine notice sentences are **hardcoded English inside `entryToParts`**, per the copy rule
above. They must live there rather than in Nunjucks or the client, because both sides render
from the same codes and each sentence is reader-relative. They are swapped for the translation
system in the page-wide localization pass.

#### Client reconcile — no snabbdom

Follow `guimoveslist.ts`'s hand-rolled reconcile, **not** snabbdom.

The criterion, verified across all four list sites in the codebase: snabbdom is used where
entries **mutate or move** — the lobby seek list reorders, the analysis move _tree_
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

**Reconcile by count, not by id** (ids never cross the wire). This rules out a plain _replace_
on `gamestate`: a replace would drop a delta that got ahead of a stale full log, whereas
append-past-count keeps it. WebSocket runs over TCP so messages never overtake each other on
the wire — the only reordering risk is the one we create ourselves by handling chat immediately
while queueing `gamestate`.

#### Client routing

`submitchatmessage` **bypasses `socketintents`** and sends directly, like moves and protocol
traffic. The intent layer is actively wrong for chat, in both of its states:

- **Held** (socket down): a second submit _replaces_ the first. Type A, type B, reconnect —
  only B is sent, A is silently gone.
- **Outstanding** (sent, awaiting `ack`): a second submit is a _no-op_. B is silently gone.

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

**One thing stays above that split, in `receiveMessage` itself**: the `millisAgo` → `sentAt`
conversion, right beside `adjustClockValuesForPing` and above the queue push. A `gamestate` can
sit in `messageQueue` for as long as the board takes to load, and converting after that would
stamp every message as far newer than it is — the identical hazard that comment already names for
the ticking clock's loss deadline. Rendering still happens later, when the queue flushes.

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

| File                                               | Holds                                                                                                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server/game/gamemanager/chat.ts`              | The router entry, validation, rate limiting, the row write, `toEntry` (the row → `ChatEntry` mapper both read sites use), the delta broadcast, and the `appendNotice` helper the notice sites call |
| `src/server/database/chatEntriesManager.ts`        | `insert` / `getOfGame` / `removeOfGame`                                                                                                                                                            |
| `src/client/scripts/esm/views/game/gui/guichat.ts` | The panel: reconcile, append, input handling                                                                                                                                                       |
| `src/shared/util/chatratelimit.ts`                 | The two flood rules, the 5-entry history shape, and `MAX_CHAT_MESSAGE_LENGTH` — called by both sides                                                                                               |
| `src/shared/components/chatentry.ts`               | `entryToParts`: the notice sentences, reader-relative wording, and name resolution                                                                                                                 |

`chat.ts` is **one** file, sibling to `drawOffers.ts` — not split into `onChat.ts` + `chat.ts`
the way `onOfferDraw.ts` / `drawOffers.ts` are. That pair splits because its rules are read from
three other places; chat has no such fan-out.

`entryToParts` lives in `shared/components/` — the rung for SSR-shared UI pieces — since both the
server (Nunjucks SSR) and the client render from it. It type-imports the entry shape from
`shared/transport/`, a sideways edge on the same rung, and that rung is reachable from the game
page. The flood rules go in `shared/util/` instead: they are policy over user text, not a UI
piece, and they must stay importable without dragging zod anywhere.
