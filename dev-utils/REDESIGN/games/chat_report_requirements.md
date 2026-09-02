# Report System — Requirements

**A separate system from the chat.** It reads the chat's entries as evidence and shares nothing
else: its own transport (HTTP, not the websocket), its own storage (none — email plus a log file),
its own CSS classes, its own rate limiting. The [chat system](chat_requirements.md) has no
dependency on this one; the chat ships and works with the flag button inert.

Ships **after** the main chat. Everything here is **decided**. A rejected alternative recorded in
_italics_ was rejected deliberately — don't re-open it without a new reason.

Three constraints from the owner govern every trade-off: he is **one person**, so simple beats
comprehensive; the system exists for **legal cover** and so users know they can protect
themselves; and it **must not be frictionless**, because a one-click report would flood him. The
one place richness wins over simplicity is the report **email**, which he reads by hand.

## Behavior

### The entry point

`game.njk` already SSRs `#btn-report` (the flag icon) into the chat bar, styled in `game.css`.
Only its behavior is missing; nothing about its markup or placement changes.

**The flag's appearance never varies with the state of the chat** — identical whether the log is
empty or full. Its only appearance change is the disabled state after a successful report.
_Rejected: greying it out until the first message arrives. A button that lights up the instant
someone speaks draws the eye and tempts clicks._

### The two popups

The flag opens a small **anchored dropdown**, in the style of the analysis page's
`#btn-analysis-actions` menu — **not** a full-page modal overlay. Clicking a reason **replaces
menu 1 with menu 2**, a confirmation naming that reason. Three clicks total: open, pick, confirm.

```
[flag] ▾
┌────────────────────────────┐        ┌──────────────────────────┐
│  Report the chat           │        │  Report the chat for     │
├────────────────────────────┤   →    │  Harassment or hate      │
│  Harassment or hate speech │        │  speech                  │
│  Threats or violence       │        │                          │
│  Sexual content            │        │   [ Cancel ] [ Report ]  │
│  Scam or phishing          │        └──────────────────────────┘
│  Child safety              │
│  Other                     │
└────────────────────────────┘
```

_Rejected: the `.modal-overlay` / `.modal` component in `index.css` — the owner overrode it in
favor of the dropdown look. Also rejected: one menu with a lit-up selection plus a Submit button
(the industry norm), which must hold selection state; the two-menu form holds none, because the
picked reason rides on the click._

**Menu 1's title row reads "Report the chat"** — the same words as the flag's tooltip, and the
in-house pattern (the analysis context menu's title names its subject, e.g. `12. Nf3`).
_Rejected: "Why are you reporting?", "Report opponent"._

**Menu 2 quotes the chosen label back on its own line**, verbatim:

```
Report the chat for
Harassment or hate speech

[ Cancel ]  [ Report ]
```

_Rejected: inlining it into a sentence ("Report opponent for harassment?"). Our labels are full
phrases, so an inline sentence would need a second, shorter word per reason._

**Reference implementation to copy — behavior only, not classes:**

| Piece                                                  | Where                                                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Markup shape, and the second menu                      | `analysis.njk` — `#analysis-actions-menu`, then `#continue-choice-menu`                                              |
| Open/close/toggle, and the outside-`pointerdown` close | `guianalysisactions.ts` — `toggleActionsMenu`, `closeActionsMenu`, `syncActionsToggle`, `openContinueFromHereChoice` |
| A11y                                                   | `aria-haspopup="menu"` and a synced `aria-expanded` on the toggle                                                    |
| Visual reference                                       | `.analysis-menu` in `analysis.css`                                                                                   |

Only ~40 lines of `guianalysisactions.ts` are popup machinery — the five functions above. Its
other ~170 lines are ICN export and the editor/lobby handoffs, none of which the report needs.

**The report popups get their own fresh CSS classes in `game.css`.** Do **not** reuse, rename or
promote `.analysis-menu`, `.analysis-context-menu` or `.analysis-context-title`, and do not move
them to `global.css`. The duplication is deliberate — it buys freedom to tweak the report popup
without disturbing the analysis page. **Do not propose de-duplicating them** — that is the owner's
call alone, once both designs are visually final.

### The reasons

```
1.  Harassment or hate speech     harassment
2.  Threats or violence           threats
3.  Sexual content                sexual
4.  Scam or phishing              scam
5.  Child safety                  child-safety
6.  Other                         other
```

Rows 1-2 are "someone is attacking me", rows 3-4 "someone is sending me filth or a con", row 5 the
one carrying a legal duty. "Other" is always last.

_Rejected: severity-first ordering (YouTube/X style, `Child safety` first) — with six short rows
nothing is buried, and it makes the popup grim for the majority reporting plain rudeness. The
draft's order, with `Threats` at row 4, was changed because a threat is likelier than sexual
content in a heated game._

**No free-text box, and no per-message selection.** A report always covers the whole chat.
_Why: the whole chat is snapshotted anyway, a textarea would need its own cap/trim/control-char
validation and would mail abuse straight to the owner, and with two people the reported user is
implied._

Notes on the six, so they aren't re-litigated:

- **"Child safety", not "child sexual content".** Kept separate from _Sexual content_ so the one
  category with a legal reporting duty isn't buried — but relabelled, as Discord and X do, because
  the chat is text-only: the realistic threat is grooming, not literal content.
- **Row 1 stays one row.** `Harassment` and `Hate speech` end in the same action.
- **Dismissed:** spam/ads, doxxing, illegal goods, sensitive media, impersonation (folds into
  scams), self-harm ("Other" catches it), and cheating / offensive-username — the last two have
  their own systems and would reach the wrong inbox.

#### The list is written once, in `chatReport.ts`

```ts
const REPORT_REASONS = [
	{ code: 'harassment', label: 'Harassment or hate speech' },
	{ code: 'threats', label: 'Threats or violence' },
	{ code: 'sexual', label: 'Sexual content' },
	{ code: 'scam', label: 'Scam or phishing' },
	{ code: 'child-safety', label: 'Child safety' },
	{ code: 'other', label: 'Other' },
] as const;
```

| Reader               | Use                                                              |
| -------------------- | ---------------------------------------------------------------- |
| `gamePageController` | Hands the list to `game.njk`, which loops it to SSR the six rows |
| `chatReportAPI.ts`   | Builds its zod enum from the codes                               |
| `chatReport.ts`      | Maps the code back to the label for the email subject            |

- **The wire carries the code, never the label** — `{"reason":"harassment"}`.
- **The menu markup is SSR'd and starts hidden**, like `#analysis-actions-menu`. The client never
  builds this HTML; it toggles `hidden` and reads `data-reason` off the clicked row.

_Rejected: typing the labels into `game.njk` and again server-side, as `analysis.njk` does for its
own menu — two copies would drift the first time a label is reworded._

**The list may not live in `chatReportAPI.ts`** — that is illegal, not merely worse.
[IMPORT_RULES.md](/docs/systems/IMPORT_RULES.md) points `src/server/` imports **down** a ladder:
`api/` is rung 9, `controllers/` rung 8, `game/` rung 7. `gamePageController` importing `api/`
points up and fails `npm run check`.

### After submitting

A **toast** reading **"Report sent."** — `toast.show(...)` from `components/toast.ts`, no `error`
flag. The wording matches the flag's new tooltip. _Rejected: a third popup state that swaps to
"Report sent" and self-closes — it needs a timer and another state._

The flag then **disables** for the rest of that page visit — greyed, not clickable, its tooltip
changing from "Report the chat" to "Report sent". **No tick or checkmark icon**; the disabled
state is the whole feedback.

### When a report fails

Two toasts, both `error: true`, chosen by the HTTP status alone. The flag stays enabled.

| Case                                | Toast                             |
| ----------------------------------- | --------------------------------- |
| Over the 8-per-day IP cap (**429**) | "You have sent too many reports." |
| Anything else                       | "Failed to submit report."        |

Nothing leaks: `express-rate-limit` runs **before** the route handler, so a 429 is reached without
the participation check ever running. _Rejected: one generic toast for every failure (an honest
user can hit the cap and would think the button was dead), and a distinct message per failure
(tells a hacker which check they tripped)._

Where each string lives:

- **"You have sent too many reports." is server-sent** — one new key,
  `[rate_limiting] chat_reports`, in `translation/responses/en-US.toml`, with the limiter using
  `makeHandler('chat_reports')`; the client displays the body's `message`. All nine existing limiters work
  this way, and [TRANSLATIONS.md](/docs/systems/TRANSLATIONS.md) requires localizing a response a
  _behaving_ client can surface.
- **"Failed to submit report." is hardcoded English in the client.** Forced: a network failure
  produces no server reply, so the client must hold the words. It also matches the
  [chat system](chat_requirements.md)'s rule that game-page copy stays hardcoded until the
  page-wide localization pass.
- **`t.shared.errors.fallback` is not used** — reserved for when the server emits no message.
- **The "not a participant" failure needs no localized string.** TRANSLATIONS.md leaves errors only
  a hand-crafted request can trigger as plain English literals.

### Nothing to report

**A report is refused when the game holds zero player messages.** Notices don't count — a game
whose only entries are a draw offer or a disconnect is still nothing to report.

- The **server** refuses; that's the trust boundary, and it's one `if` on the transcript it has
  already fetched.
- The **client** refuses too, using the message count it already tracks for its reconcile.
- The client checks **after the user confirms in menu 2**, not on flag-click. The popup behaves
  normally; the refusal lands where the success toast would have.
- The toast is the existing **"Failed to submit report."** — no new string, no explanation.

_Rejected: a flag-click check with a dedicated "There is nothing to report yet." toast — a new
string for a case nobody honest reaches._

### Who can report, and when

> **You can report exactly as long as the server can still prove you were a participant.**

| Situation           | Who can report         | The check                                                                          |
| ------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| Game live in memory | **Guests and members** | `memberInfoUtil.eqPartial(identifier, memberInfo)` against `game.match.playerData` |
| Game evicted        | **Members only**       | `deadGameState.resolveParticipantColor(id, user_id)`                               |

Both are the exact if/else `gamePageController` already runs to resolve `role`. Do not invent a
second participation check.

**Guests may report a live game**, deliberately: a guest in a public game can be insulted and
cannot reply, so denying them the flag would leave visible abuse unreportable.

**On `detached`, the flag hides — for guests only.** A member stays identifiable after eviction, so
keeps it. Mirrors what the [chat system](chat_requirements.md) decided for the chat _input_.

_This is load-bearing and not obvious. Eviction does **not** reload the page — it sends only
`{"action":"detached"}`, verified against `wsOutLog`. An earlier draft assumed a `subscribe` →
`notlive` → `window.location.reload()` chain closes the window; **it does not happen**. A guest
keeps a fully-rendered chat log on screen indefinitely after eviction, and without this rule their
flag would post reports the server can never attribute. Do not re-derive the reload chain._

**Online games are strictly two-player**, verified — every server-side "opponent" is
`typeutil.invertPlayer(ourRole)`. So the reported player is always the other one, and the server
derives it rather than accepting it on the wire.

## Backend design

### No table

A report is **emailed** to the owner and **written to a log file**. Nothing is stored in the
database. This mirrors rating abuse exactly: `abuseReport.reportMeasurement` writes to
`ratingAbuseLog` and emails via `emailService.sendRatingAbuseEmail`. The inbox is the queue.

Consequences: `mailer.ts`'s `EmailType` union gains **`'chat-report'`** (beside
`'rating-abuse-alert'`), and a new log name is used.

_Rejected: a `chat_reports` table alongside the email. It would answer "how many reports has this
user received?", at the cost of a permanent table and an admin command to read it back — but it was
never forbidden, so it is the first thing to revisit if queryable history is ever needed._

#### The log file: one line per report

The log is **`chatReportLog`**, sibling to `ratingAbuseLog`, holding **one summarised line per
report**, in this field order: **time, game id (numeric), reporter, reported, reason.**
**No transcript.**

`logEvents` writes one flat file that never rotates (only `reqLog`, `wsInLog` and `wsOutLog` roll
weekly), so appended transcripts would leave no way to see where one report ends and the next
begins. One line per report also answers "how many this month?" at a glance.

_Rejected: logging the full report text (unreadable in a flat file — size was never the issue, at
~35 KB per report), and one `.txt` file per report in a folder (`logEvents` cannot do it)._

**Accepted cost:** if the email send fails, the transcript is lost. `emailService` writes the
failure to `errLog`, the log line still names the game id, and the `chat_entries` rows are usually
still in the database.

### The wire

**An HTTP POST route**, not a websocket action.

```
POST /api/game/:id/report
Content-Type: application/json

{ "reason": "harassment" }
```

The game id rides in the **path**, because it is the resource being reported and
`GET /api/game/:id` already exists. Only the reason rides in the body; the server derives the rest.

- Precedent for a sub-path after a `:param`: `leaderboards.ts`'s `/:leaderboard_id/top`.
- **No params schema.** The URL game id is **encoded**, not a number — decode it with
  `gamesManager.decodeID(req.params['id']!)`, as `gameAPI.ts` and `gamePageController.ts` do.
- **`resolveAuth.resolve` is applied per-route**, the way `leaderboards.ts` does it, because
  `GET /api/game/:id` is public and must stay without it. It sets `req.memberInfo` with a `user_id`
  for members and a `browser_id` for guests — what both participation checks need.

_Rejected: a websocket action alongside `submitchatmessage`. Less code, but no socket exists on the
finished game page — and players report afterwards, once calm and re-reading the chat, not
mid-game. Also rejected: a flat `POST /api/report-chat` with the game id in the body._

### Validation, at the trust boundary

The server checks **exactly two things**:

1. **Was this user a participant in this game?** Nothing more about who they are.
2. **Does the game hold at least one player message?** See "Nothing to report".

The reason code is validated against the closed set, built from `REPORT_REASONS` and following the
house pattern in `editorSavesAPI.ts` — `safeParse(req.body)`, then `zodLogger.log(...)` on failure:

```ts
const ReportBodySchema = z.strictObject({ reason: z.enum(REASON_CODES) });
```

### Anti-spam — three guards, and nothing else

1. **The three-click popup.** The friction the owner asked for.
2. **The flag disables** after a successful report. Stops the honest double-click.
3. **8 reports per day, per IP.** One new rule in `middleware/rateLimiters.ts`, exported as
   **`chatReport`** — an `express-rate-limit` entry spreading `DEFAULT_OPTIONS` with
   `makeHandler('chat_reports')`. Limiters are already inert under vitest.

**No send buffer** — every report emails. _Rejected: rating abuse's 24-hour suppression window.
There is no table to hold the timestamp, rating abuse fires automatically while a report takes
three deliberate clicks, and a suppressed report loses a real complaint rather than a repeat of the
same machine verdict._

**No per-game report memory on the server.** _Rejected: allowing a repeat report only once a new
chat entry arrives. The state could only live in memory and a restart would wipe it — and fatally,
the rule never says **whose** entry, so an angry reporter types "a" and reports again. The IP cap
was always the real bound; duplicates are spotted by eye, which is what the game's date in the
email is for._

### The evidence snapshot

**A report must snapshot a full copy of the chat, with times down to the second — never reference
`chat_entries` rows by id.** Three things would otherwise destroy the evidence: a 0-move game
deletes its rows; the `deletechat` admin command would erase the very evidence being reviewed; and
`message_id` values can be reused after a delete.

### Order of work, and failure handling

```
participation check  →  message-count check  →  write the log line  →  respond 200  →  send the email
```

**Both refusals answer 403**, and success answers **200 with an empty body**. The status is all the
client reads — it branches on 429 and treats everything else alike — so the two refusals
deliberately look identical from outside.

**The email goes last.** It crosses the network to SES and can hang; the log append is instant and
local, so the record exists on disk before anything slow is attempted.

**There is no failure handling to write, because nothing can throw upward.** `logEvents.add`
try/catches its file write, and `emailService`'s senders try/catch and write to `errLog`. So the
only things that can fail a report are the two checks above, and both already produce the
"Failed to submit report." toast.

## The report email

Sent to the same address rating-abuse reports go to (`mailer.EMAIL_FROM_ADDRESS`).

**Subject: the reason, and nothing else** — so `Harassment or hate speech`, looked up from the code
on the wire. Urgent categories stand out in the inbox without opening anything.

**Body: styled HTML, readable at a glance.** It must carry enough to decide an action without
opening another tab.

### The report writes its own HTML

It does **not** use `emailTemplates.buildEmailShell`, the on-brand wrapper the verification and
password-reset emails use: that shell's card is fixed at **600px**, too narrow for a 140-character
transcript line, and its branding is aimed at users while the owner is the only reader.

_Rejected: building a shared "moderation email shell" now, for this email plus the planned
rating-abuse rewrite._ **Extract the redundancy when the second caller exists, not by predicting
it** — once both emails are real, a shared shell can be lifted from two actual examples.

### What it contains

| Group                   | Fields                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **The report**          | Reason; reporter and reported (name, `user_id`, **and which color each played**); when the report was sent                              |
| **The game**            | Game id (**numeric**); a link to it on the site; **date and time the game was played**; variant; rated; time control; private or public |
| **The reported player** | `joined` (account age), `game_count`, `last_seen`                                                                                       |
| **The chat**            | The full transcript, timestamps to the second, **including the static notices**                                                         |

**The email never says whether the game is live or finished**, and carries **no result, no
termination, no game duration and no move count.** Those four are exactly the fields a live game
cannot supply, so dropping them removes the whole live/dead branch from the body. The seven game
fields above all exist in memory for a live game and in the `games` row for a finished one.

_Rejected: "Game still in progress" in place of the result, and holding the report until the game
ends (which delays an urgent report, and the game may never end cleanly). Also excluded, having
been offered and declined: `login_count`, `username_history`, `roles`, per-player `score`, and
per-player elo._

**Guests carry no identifier.** A guest appears as `(Guest)` plus the colour they played.
**No `browser_id` appears anywhere in the report** — no admin command can act on one, so it is noise
in an email read by eye. Either person can be a guest, since guests can chat in private/friend
games. When the _reported_ player is a guest, the "reported player" block is omitted entirely,
because those fields come from the members tables.

### The layout

```
Harassment or hate speech                    ← large heading
Reported by   Naviary (12) · White
Reported      (Guest) · Black
Sent          2 Sep 2026, 14:03:11

GAME
Game id       193   [open]
Played        2 Sep 2026, 13:41
Variant       Classical
Mode          Rated
Time control  10+5
Visibility    Public

REPORTED PLAYER
Joined        4 Jan 2025
Games         312
Last seen     2 Sep 2026, 13:58

CHAT — as the reporter saw it
13:44:02  Naviary: hi
13:45:10  (You): hello
13:45:31  Opponent disconnected.
```

- **Headed sections of label/value rows**, not one long flat table. The reason and the two people
  sit at the top under no heading, because they are read first.
- **The transcript is monospaced**, so the timestamps line up into a scannable column.
- **`[open]` is the link**, sitting beside the numeric game id rather than replacing it.
- **A `user_id` is shown bare in parentheses** — `Naviary (12)`, no `#`.
- **The rated/casual row is labelled `Mode`**, the seek UI's own term (`index` translations), with
  the value `Rated` or `Casual`.

### Two formatting rules, and they are the important part

1. **No raw database values.** Every timestamp becomes a readable date and time.
2. **Every game property appears as the English string a user would see** — the same labels the
   seek-creation UI and the `game-meta` container use.

**Do not write new formatters.** `gamePageController.buildGameMetaViewModel` already produces them:

| Needed                   | Existing source                                         |
| ------------------------ | ------------------------------------------------------- |
| Time control label       | `clockutil.getTimeControlLabel(setup.timeControl)`      |
| Variant name             | `t.shared.variants[code]`, or the custom-position label |
| Rated, players per color | The same view model's own fields                        |

These take a `ScriptTranslations['shared']` object rather than a `req`, so the report passes the
**English** shared translations. _(`gameresultutil.getDisplay` was on this list and is no longer
used — the result banner sentence left with the result itself.)_

### The transcript is rendered from the reporter's point of view

`entryToParts(entry, readerRole, playerNames)` is reader-relative by design — the same entry reads
"You disconnected" for one player and "Opponent disconnected" for the other. **The email passes the
reporter's role**, so the owner sees exactly what the reporter saw. Because "You" means the
reporter, **the transcript carries a heading saying so**; the email names the reporter and their
colour immediately above it.

_Rejected: a third, neutral mode with no reader ("Black disconnected"). It reads better for an
outsider but adds a branch to a function the chat system also uses._

**Notices stay in the transcript.** Abuse usually follows a declined draw or a disconnect, so they
show the trigger — and keeping them is _less_ code, since `entryToParts` renders both kinds.

**Every id shown is numeric, so it can be pasted straight into `deletechat`** — but the link's
`href` must carry the **base62** id, because `/game/:id` runs `gamesManager.decodeID`, which is
base62-only. A numeric id there would not 404: `"193"` is itself valid base62 and would silently
resolve to a different game. So the link shows the numeric id as its text and hides the base62 one
in its `href`.

**The game link will not show the owner the chat**, because he is not a participant. The transcript
in the email is his only copy — which is why the snapshot is mandatory.

### The `.txt` attachment

The email carries a **`.txt` attachment holding the whole report** — every field above plus the
transcript, in plain text — so it can be dropped straight into an AI agent to judge. It is the
_full_ report, not a bare chat dump: the agent needs the metadata.

Named **`chat-report-<game_id>.txt`**, using the **numeric** id, so two saved reports never
collide and the name can be pasted straight into `deletechat`. _Rejected: a bare
`report.txt`, a date-prefixed name, and a `<pre>` block appended to the HTML body (which duplicates
the whole body inline and must be drag-selected)._

**Cost this incurs:** `mailer.ts`'s `SendMailOptions` is `{to, subject} & ({html} | {text})`. It
must be widened to carry attachments.

**Capability check, done:** nodemailer 8's SES transport builds the raw MIME message itself, so
attachments ride along. SES caps a message at 40 MB, and `.txt` is not a blocked type. _Not
verified by sending a real email._

## Chat moderation — the Admin Panel command

**Ships with this system.** Reviewing a report is only half the job; acting on it means erasing the
chat that was reported.

```
deletechat <game_id>
```

The panel is a command console: `POST /api/admin/command` dispatches on a command word in
`adminPanel.ts`'s switch (`ban`, `unban`, `delete`, `username`, `logout`, `userinfo`,
`updatecontributors`, `help`). So this is one new `case` calling `chatEntriesManager.removeOfGame`,
plus its `help` entry.

It is the **only** command taking a game id rather than a user identifier — say so in its `help`
text. _Rejected: `clearchat`, `wipechat`; neither matches an existing verb the way `delete` does._

## New files

| File                                                     | Holds                                                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/server/api/chatReportAPI.ts`                        | The route handler: decode the id, the two checks, the reply                                                            |
| `src/server/game/gamemanager/chatReport.ts`              | `REPORT_REASONS`, the evidence snapshot, the subject, the HTML body, the `.txt` attachment, the log line, and the send |
| `src/client/scripts/esm/views/game/gui/guichatreport.ts` | The popups: open/close, menu swap, POST, toast, disabling the flag                                                     |

The actual send goes in **`emailService.sendChatReportEmail`**, a new sibling of
`sendRatingAbuseEmail` in `src/server/utility/emailService.ts`, which already try/catches and logs
to `errLog`.

**Two server files, because handling the request and turning a report into words are separate
jobs** — mirroring rating abuse's trigger → `abuseReport.ts` → `emailService` → `mailer.send`.

- `chatReport.ts` sits in `gamemanager/`, **not** a folder of its own — a directory holding one file
  is not wanted, and `src/server/game` has no loose files. It lands beside the chat system's
  `chat.ts`, which it reads. _Its neighbour `cheatReport.ts` is unrelated — that one is a player
  claiming the opponent's move was illegal._
- `chatReportAPI.ts` is **new**, not a second function in `gameAPI.ts`: `api/` is one file per
  feature, `GET /api/game/:id` is a public unauthenticated **read** while this is an authenticated
  moderation **write**, and `gameAPI.ts` is 37 lines whose stated job is dead-game state. Only
  `gamesManager.decodeID` is shared, already called from three places.
- `guichatreport.ts` is separate from `guichat.ts`: that folder is already one file per widget, the
  two share nothing but a parent element, and merged they would be ~360 lines doing two unrelated
  jobs (~145 report, ~215 chat).
