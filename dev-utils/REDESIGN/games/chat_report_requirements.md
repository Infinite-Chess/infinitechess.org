# Report System — Requirements

**A separate system from the chat.** It reads the chat's entries as evidence, and nothing else
about it is shared: its own transport (HTTP, not the websocket), its own storage (none — email
plus a log file), its own CSS classes, its own rate limiting. The
[chat system](chat_requirements.md) has no dependency on this one; the chat ships and works with
the flag button inert.

Ships **after** the main chat. Everything below is **decided** unless it appears under
"Still open".

## Why this system exists

Stated by the owner, and it governs every trade-off below:

1. **He is one person.** The system must be simple, not comprehensive.
2. **Legal cover**, and users knowing they have a way to protect themselves from abuse.
3. **It must not be frictionless.** A one-click report would flood him. Friction is a feature
   here, deliberately traded against convenience to cut fake reports.

Where "simple" and "thorough" conflict below, simple wins — except in the report *email*, which
is deliberately rich, because he reviews each one by hand and wants to decide an action without
opening anything else.

## Behavior

### The entry point

`game.njk` already SSRs `#btn-report` (the flag icon) into the chat bar, styled in `game.css`.
Only its behavior is missing. Nothing about the button's markup or placement changes.

### The two popups

The flag opens a small **anchored dropdown**, in the style of the analysis page's
`#btn-analysis-actions` menu — **not** a full-page modal overlay.

*Rejected: the `.modal-overlay` / `.modal` component in `index.css`. It was the original
recommendation (an existing, already-styled component, and a modal is naturally the "are you
sure" friction). The owner overrode it in favor of the analysis-page dropdown look.*

Clicking a reason **replaces menu 1 with menu 2**, a confirmation naming that reason, with
Cancel and Report buttons. Three clicks total: open, pick, confirm.

```
[flag] ▾
┌────────────────────────────┐        ┌──────────────────────────┐
│  <title>                   │        │  Report opponent for     │
├────────────────────────────┤   →    │  harassment?             │
│  Harassment or hate speech │        │                          │
│  Sexual content            │        │   [ Cancel ] [ Report ]  │
│  Scam or phishing          │        └──────────────────────────┘
│  Threats or violence       │
│  Child safety              │
│  Other                     │
└────────────────────────────┘
```

*Rejected: one menu holding a lit-up selected reason plus a Submit button — closer to the
industry norm (Lichess, YouTube, Discord, X and Chess.com all use a radio list plus an explicit
Submit), but it must hold selection state, light it, and disable Submit until a reason is
picked. The two-menu form holds no state at all: the picked reason rides on the click.*

Menu 1 carries a **title row** describing what the popup is.

**Reference implementation to copy — behavior only, not classes:**

| Piece | Where |
| --- | --- |
| Markup shape, and the second menu | `analysis.njk` — `#analysis-actions-menu`, then `#continue-choice-menu` |
| Open/close/toggle, and the outside-`pointerdown` close | `guianalysisactions.ts` — `toggleActionsMenu`, `closeActionsMenu`, `syncActionsToggle`, `openContinueFromHereChoice` |
| A11y | `aria-haspopup="menu"` and a synced `aria-expanded` on the toggle |
| Visual reference | `.analysis-menu` in `analysis.css` |

**The report popups get their own fresh CSS classes in `game.css`.** Do **not** reuse, rename or
promote `.analysis-menu`, `.analysis-context-menu` or `.analysis-context-title`, and do not move
them to `global.css`. The duplication is deliberate: it buys freedom to tweak the report popup's
look without disturbing the analysis page. *Any later de-duplication is the owner's own call,
made once both designs are visually final — not the implementing agent's.*

### The reasons

```
1.  Harassment or hate speech
2.  Sexual content
3.  Scam or phishing
4.  Threats or violence
5.  Child safety
6.  Other
```

Ordered most-common first, "Other" always last. **Not a locked-in list** — the implementing
agent may tweak wording and order with the owner. Cheap to change, because a reason is only a
string on the wire and a row in a menu; it is not a database column.

**No free-text box.** The reporter picks a reason and nothing else.

*Why: the whole chat is snapshotted anyway, so the evidence is already complete. A textarea
would need its own length cap, trim and control-character rejection at the trust boundary — the
same work the chat input needs — and would become a channel for mailing abuse straight to the
owner's inbox.*

**No message selection either.** A report always covers the whole chat. *Rejected: per-message
picking — click targets, a selected state, ids on the wire, and marking them in the email. With
only two people in a chat the reported user is implied, and 140-character messages are short
enough to read whole.*

How the list was reached, so it isn't re-litigated:

- The starting draft was four: Harassment / Child sexual content / Threats or violence / Other.
- A from-scratch sweep of Lichess, Chess.com, Discord, YouTube and X surfaced **two genuine
  misses**: *Sexual content* (Chess.com lists it separately; a victim may not file it under
  harassment) and *Scam or phishing* (dismissed at first as "spam has no audience", which is
  wrong — a scam targets exactly one person, and one reader is all it needs).
- **Dismissed, with reasons that held:** spam/ads (one reader, 140 chars, rate-limited — nothing
  to gain), doxxing (no audience in a two-person private chat), illegal goods and sensitive media
  (text only), impersonation (folds into scams), self-harm (very rare; "Other" catches it),
  cheating and offensive-username (separate existing systems — these would reach the wrong inbox).
- **The competing principle, considered and not chosen:** "one bucket per distinct action" would
  collapse the list to four (child = legal escalation, threats = urgent, everything else = ban,
  other). Rejected because a vague "abuse" label pushes sexual content and scams into "Other",
  and a fat "Other" pile defeats the whole point of a label being useful at a glance.
- **"Child safety", not "child sexual content".** Kept separate from *Sexual content* because
  merging buries the one category carrying a legal reporting duty (a US provider must report
  apparent CSAM to NCMEC) inside the ordinary pile. But the two labels read as near-duplicates,
  so the label was fixed instead of the split — Discord and X both pair adult content with
  "**Child safety**". Second reason, specific to this codebase: **the chat is text-only**, so
  literal child sexual *content* is near-impossible; the realistic threat on a site where
  children play chess is an adult grooming or soliciting a minor, which "Child safety" covers
  and the old label did not.
- **Row 1 stays on one row.** Splitting into `Harassment` + `Hate speech` was offered and
  rejected — both halves end in the same action.

### After submitting

A **toast**: `toast.show(...)` from `components/toast.ts`, the same component every other
confirmation on the site uses. *Rejected: a third popup state that swaps to "Report sent" and
self-closes — it needs a timer and another state.*

The flag button then **disables** for the rest of that page visit — greyed, not clickable, its
tooltip changing from "Report the chat" to "Report sent". **No tick or checkmark icon**; the
disabled state is the whole feedback.

### Who can report, and when

One rule covers both:

> **You can report exactly as long as the server can still prove you were a participant.**

| Situation | Who can report | The check |
| --- | --- | --- |
| Game live in memory | **Guests and members** | `memberInfoUtil.eqPartial(identifier, memberInfo)` against `game.match.playerData` |
| Game evicted | **Members only** | `deadGameState.resolveParticipantColor(id, user_id)` |

Both checks are the exact if/else `gamePageController` already runs to resolve `role`. Do not
invent a second participation check.

**Guests may report a live game**, deliberately. The chat gives guests read access while a game
is live (read-only in a public game, read *and* write in a friend game), so a guest in a public
game is the most exposed person on the site — insulted, and unable to reply. Denying them the
flag would leave visible abuse unreportable.

**On `detached`, the flag hides — for guests only.** A member keeps it, because a member stays
identifiable after eviction. This mirrors what the [chat system](chat_requirements.md) already decided for the chat *input*.

*This is load-bearing, and the reason is not obvious. Eviction does **not** cause the page to
reload. It sends only `{"action":"detached"}` — verified live against `wsOutLog`. An earlier
draft of this design wrongly assumed a `subscribe` → `notlive` → `window.location.reload()`
chain closes the window; **it does not happen**. So a guest keeps a fully-rendered chat log on
screen indefinitely after eviction, and without this rule their flag would sit there posting
reports the server can never attribute. Do not re-derive the reload chain.*

## Backend design

### No table

A report is **emailed** to the owner and **written to a log file**. Nothing is stored in the
database.

This mirrors the rating-abuse precedent exactly: `abuseReport.reportMeasurement` writes to
`ratingAbuseLog` via `logEvents.add` and emails via `emailService.sendRatingAbuseEmail`. The
inbox is the queue.

*Rejected: a `chat_reports` table plus the email. It would allow "how many reports has this user
received?", at the cost of a permanent table and an admin-panel command to read it back. Not
chosen — but never explicitly forbidden either, so if a future decision genuinely needs
queryable report history, this is the one to revisit first.*

Consequences: `mailer.ts`'s `EmailType` union gains a member, and a new log name is used.

### The wire

**An HTTP POST route**, not a websocket action.

*Rejected: a websocket action alongside `submitchatmessage`. It is less code — the socket
already knows the game and the player — but no socket exists on the finished game page, so the
flag would have to be hidden on the very page that holds the evidence. Players rarely report
mid-game; they are busy and angry. They report afterwards, once calm and re-reading the chat.*

The payload is the game id and the reason code. The server derives everything else.

### Validation, at the trust boundary

The server checks **exactly one thing**: was this user a participant in this game? Nothing more.

The reason code is validated against the closed set by a zod schema, like every other
serverbound message.

### Anti-spam — three guards, and nothing else

1. **The three-click popup.** The friction the owner asked for.
2. **The flag disables** after a successful report (see above). Stops the honest double-click,
   which is the common case.
3. **8 reports per day, per IP.** One new rule in `middleware/rateLimiters.ts` — an
   `express-rate-limit` entry spreading `DEFAULT_OPTIONS` with `makeHandler(...)` for the 429
   body. Limiters are already inert under vitest.

**No per-game report memory on the server.** *A smarter dedupe was proposed and briefly adopted:
accept a repeat report on the same game only if at least one **new chat entry** arrived since
that player's last report. It correctly permits a second, genuine report when abuse continues,
which a flat one-per-game block would silence. Two things killed it:*

- *The state can only live in memory (there is no table), so a restart wipes it. A finished game
  would be reportable "once per server uptime", not once ever. A protection that leaks there is
  not worth its complexity on live games either.*
- ***The fatal one:** the rule never says **whose** entry. On a live game the angry reporter just
  types "a" in chat and the count goes up. Type, report, type, report. Fixing that means
  requiring a new entry from the **opponent** — more logic, more state, still wiped by a restart.*

*The IP cap was always the real bound. Duplicates are instead spotted by eye, which is what the
game's date and time in the email is for.*

### The evidence snapshot

**A report must snapshot a full copy of the chat, with times down to the second — never
reference `chat_entries` rows by id.** Three things would otherwise destroy the evidence:

- a 0-move game deletes its rows;
- the Admin Panel's own "delete all chat for this game id" control would erase the evidence of
  the very report being reviewed;
- `message_id` values from the top of the table can be reused after a delete.

### Server-side write failure

Not yet decided — see "Still open".

## The report email

Sent to the same address rating-abuse reports already go to (`mailer.EMAIL_FROM_ADDRESS`).

**Subject: the reason, and nothing else.** So `Harassment or hate speech`. Urgent categories
stand out in the inbox without opening anything.

**Body: styled HTML, easily readable and eyeballable.** It must carry enough for the owner to
decide an action without opening another tab.

### What it contains

| Group | Fields |
| --- | --- |
| **The report** | Reason; reporter and reported (name, `user_id`, **and which color each played**); when the report was sent |
| **The game** | Game id; a URL link to it on the site; **date and time the game was played**; result + termination; move count; variant; rated; time control; game duration; private or public |
| **The reported player** | `joined` (account age), `game_count`, `last_seen` |
| **The chat** | The full transcript, timestamps to the second, **including the static notices** |

Deliberately **excluded**, having been offered and declined: `login_count`, `username_history`,
`roles`, per-player `score`, and per-player elo / elo change.

### Two formatting rules, and they are the important part

1. **No raw database values.** Every timestamp is converted to a readable date and time.
2. **Every game property appears as the English string a user would see** — the same sentence
   the game page's result banner shows, and the same labels the seek-creation UI and the
   `game-meta` container use.

**Do not write new formatters for any of this.** `gamePageController.buildGameMetaViewModel`
already produces every one of those strings:

| Needed | Existing source |
| --- | --- |
| Result banner sentence | `gameresultutil.getDisplay(conclusion, t.shared)` → `{ score, text }` |
| Time control label | `clockutil.getTimeControlLabel(setup.timeControl)` |
| Variant name | `t.shared.variants[code]`, or the custom-position label |
| Rated, move count, players per color | The same view model's own fields |

These take a `ScriptTranslations['shared']` object rather than a `req`, so the report passes the
**English** shared translations. (The email is to the owner; the
[chat system](chat_requirements.md)'s standing rule of hardcoded English until the page-wide
localization pass applies here too.)

**Why notices are in the transcript:** abuse usually follows a declined draw or a disconnect, so
the notices show the trigger. Including them is also *less* code — `entryToParts` renders both
kinds already, so keeping them means writing no filter.

**Note on the game link:** the owner is not a participant, so that page will **not** show him the
chat. The transcript in the email is his only copy. This is exactly why the snapshot is
mandatory.

### The `.txt` attachment

The email also carries a **`.txt` attachment holding the whole report** — every field above plus
the transcript, in plain text — so it can be dropped straight into an AI agent to judge.

It is the *full* report, not a bare chat dump: the agent needs the metadata to make an informed
call.

*Rejected: a `<pre>` block appended to the HTML body. Cheaper (no type change), but it duplicates
the entire body inline and must be drag-selected.*

**Cost this incurs:** `mailer.ts`'s `SendMailOptions` is `{to, subject} & ({html} | {text})`. It
must be widened to carry attachments.

**Capability check, done:** nodemailer 8 with `@aws-sdk/client-sesv2`. Nodemailer's SES transport
builds the raw MIME message itself and hands SES the finished thing, so attachments ride along.
SES caps a message at 40 MB, and `.txt` is not a blocked type. *Not verified by sending a real
email.*

## Chat moderation — the Admin Panel command

**Ships with this system.** Reviewing a report is only half the job; acting on it means being
able to erase the chat that was reported.

**A new Admin Panel command to delete all chat of a given game id.** The panel is a command
console: `POST /api/admin/command` dispatches on a command word in `adminPanel.ts`'s switch
(`ban`, `unban`, `delete`, `username`, `logout`, `userinfo`, `updatecontributors`, `help`). So
this is one new `case` calling `chatEntriesManager.removeOfGame`, plus its `help` entry — and it
takes a **game id**, not a user id, unlike every existing command.

**The command word is not locked in** — settle it with the owner at implementation. It is only a
string in a switch and a line in `help`, so it is cheap to change.

This is the second reason the evidence snapshot above is mandatory: running this command on a
reported game erases the rows the report would otherwise have pointed at.

## Still open

| # | Question | Notes |
| --- | --- | --- |
| 1 | **What the reporter sees when a report fails.** | Failures: over the 8/day cap, or the server can't confirm participation. Candidates: one generic error toast for any failure (recommended — an honest user *can* hit the cap, and silence leaves them clicking a dead button); silent, like a rejected chat message; or a distinct message per failure (helps the honest user, tells a hacker which check they tripped). |
| 2 | **Is there a send buffer, like rating abuse's 24-hour one?** | `abuseReport` suppresses a repeat email for the same user within 24h. Never discussed for reports. |
| 3 | **The route path** for the POST endpoint. |  |
| 4 | **The log file name.** | Sibling to `ratingAbuseLog`. |
| 5 | **Exact popup copy.** | The menu-1 title, and menu 2's confirmation sentence. |
| 6 | **Reason wording and order.** | Deliberately left unlocked; settle with the owner at implementation. |
| 7 | **Where the server-side report module lives**, and its file name. | The [chat system](chat_requirements.md) puts chat at `src/server/game/gamemanager/chat.ts`; reporting is a separate system and need not sit there. |
| 8 | **What identifies a guest** in the email, given guests have no `user_id`. |  |
| 9 | **Behavior when the game is still live at report time.** | There is no `games` row yet, so result, termination and duration do not exist. The game's date must come from the in-memory game's start time. |
| 10 | **Server-side failure handling** — what happens if the email send or log write throws. | The [chat system](chat_requirements.md)'s chat-write rule (swallow, skip the broadcast) is a precedent, but reporting has no broadcast. |
