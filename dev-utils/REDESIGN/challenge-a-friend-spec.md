# Challenge a friend — design

The private-invite flow: **Challenge a friend** creates a private seek and sends its owner to a
holding page (the **challenge page**) at the future game's URL. Whoever opens that URL and clicks
Accept plays the owner; everyone else on the page becomes a spectator.

Everything in sections 1 and 2 is decided. Build it as written, with the **plain card** of 1.4. The
card's final layout is a separate pass (section 3).

Paths are from the repo root.

**Vocabulary.** `challenge` names the **page**, its socket route, its sockets and its tabs — never
the data. The data is always **a private seek**: an `AuthSeek` carrying a `private` group. There is
no `Challenge` type. This mirrors the lobby, where `lobby` names the page and its socket stream
while `seek` names the data.

**Mobile responsiveness is out of scope.**

---

## 1. Behaviour

### 1.1 Flow

1. In the game options modal, the **Challenge a friend** submit creates the challenge and navigates
   at once, like "Play against computer". No row appears in the lobby.
2. The owner lands on `/game/X`, where `X` is the id the game will have. Nothing exists there yet
   but the private seek.
3. The owner shares the link (copy control or QR code).
4. A visitor opening `/game/X` sees the same challenge page, with an Accept button.
5. On Accept, both players go into the game; every other tab on the challenge page becomes a
   spectator of it.

The challenge is a **private** game: `private: true` flows into the game. It stays spectatable by
anyone with the URL. Its existing consumers then activate: guests may chat
([chat.ts:43](/src/server/game/gamemanager/chat.ts#L43),
[gamePageController.ts:176-183](/src/server/controllers/gamePageController.ts#L176-L183)), stats
count it as private ([gameLogger.ts:252](/src/server/game/gamemanager/gameLogger.ts#L252)), chat
reports say "Visibility: Private"
([chatReport.ts:209-214](/src/server/game/gamemanager/chatReport.ts#L209-L214)), and a rematch keeps
it private ([onRematch.ts:90](/src/server/game/gamemanager/onRematch.ts#L90)).

### 1.2 The challenge page

**Shell.** Its own page — no board to play on, none of the game page's layout.
`<main class="bg-checkerboard-dimmed page-centered">` like
[login.njk:17](/src/server/views/login.njk#L17), holding **one card centred both ways**, in the
style of the `.auth-card` pages. The site header is the visitor's way out. `.page-centered`,
`.auth-card` and `.side-dot` live in [global.css](/src/client/css/global.css), so the shell and the
dot need no new CSS.

**On the card for everyone:**

- Every seek property a lobby row shows
  ([lobby.ts:415-494](/src/client/scripts/esm/views/index/lobby.ts#L415-L494)): owner username +
  elo (or the guest indicator); the **side dot** only when the owner fixed a colour (none for
  Random); the variant group icon + modifier icons + variant name; the speed icon + time-control
  label; rated / casual. The variant and speed **icons are rendered**, not just text.
- A **board preview** of the start position, **inline and always visible** (not on hover), for
  preset variants and custom positions alike. **Always White at the bottom**, for owner and visitor.
  **Its space is reserved from first paint:** the HTML gives the preview box its final size before
  any script runs, and nothing on the card moves when the preview finishes drawing.
- The **gamerule summary** — the same lines the game page's meta card prints.

**Owner only:** a way to copy the link; a **QR code** of the link (always paired with the link;
white quiet zone, strong contrast); a **Cancel** button.

**Visitor only:** an **Accept** button. When they can't accept, it's **disabled with its text
unchanged**, plus a separate short line saying why (see 1.8).

**Accept and Cancel grey out while their click is in flight** — `socketintents.isOutstanding`,
re-derived on the `SocketBus` `intents` event, as Resign and Abort do
([guigameactions.ts:123-124](/src/client/scripts/esm/views/game/gui/guigameactions.ts#L123-L124)).
That state shows **no** reason line; the reason line is only for 1.8's two eligibility cases.
There is **no** `isRouteReady` rule: a click made while the socket is down is held by the intent
layer and replayed on resync, so it stays greyed for the outage, then is sent or discarded — never
sent late.

**Not on the card:** a live viewer count; a "whoever has the link can accept" warning; a native
share button (`navigator.share`); a "waiting for your friend" line; a copy control or QR for the
visitor; a Decline button; an Edit control.

### 1.3 Wording

| Element | String |
| --- | --- |
| Owner's heading | "Challenge a friend" — the existing `index.script.lobby_buttons.challenge_friend` ([translation/index/en-US.toml:49](/translation/index/en-US.toml#L49)), read via `scriptT('index')` |
| Visitor's heading | "Challenge" |
| Accept button | "Accept" |
| Cancel button | "Cancel" |
| Browser tab title | "Challenge" |
| Side dot | The lobby's owner dot and its `title`, as a translation key (2.10) |
| Visitor in another game | "You're already in a game." then **"Rejoin game"** as an inline link to that game — the existing `lobby.ingame_banner` / `lobby.ingame_join` ([translation/index/en-US.toml:15-16](/translation/index/en-US.toml#L15-L16)). No trailing period on "Rejoin game" (and the lobby's button stays without one). Only "Rejoin game" is the link. It's a short line under the disabled Accept — *not* the lobby's full-width overlay banner ([index.njk:88-94](/src/server/views/index.njk#L88-L94)). |
| Signed-out visitor, rated challenge | "You must be signed in to play rated games." alone, no link — the existing `responses.seeks.rated_requires_signin` ([translation/responses/en-US.toml:32](/translation/responses/en-US.toml#L32)) |
| Seek properties | The lobby's own strings: `t.shared.variants[code]`, `t.shared.variant_groups.custom.display_label`, `t.shared.game_modes.*`, `t.shared.speeds[category]` |

**Copy confirmation is inline and temporary — never a toast** (e.g. a checkmark briefly replacing
the copy icon).

### 1.4 Layout — a plain card now, the real layout in a separate pass

The card's layout is **not** decided here. This build ships a **plain card**: every element of 1.2,
stacked top to bottom in the order listed there, calling the shared `seekProperties` macro (2.8),
with the preview box at 256×256 px and no styling beyond what `.auth-card` gives. The copy control
is a button labelled "Copy link" (key `copy_link`, 2.10).

**Scripts reach the card only through these ids.** They are the contract between the build and the
layout pass: a layout may move, wrap or restyle them, but never rename or remove them, and never
needs a script change.

| Id | Element | What script does with it |
| --- | --- | --- |
| `challenge-preview` | The preview `<canvas>` | Draws the board into it |
| `challenge-copy` | The copy control; carries the link in `data-url` | Copies the link; shows the inline confirmation |
| `challenge-cancel` | Cancel button (owner) | Sends `cancel`; greys while in flight |
| `challenge-accept` | Accept button (visitor) | Sends `accept`; greys while in flight or ineligible |
| `challenge-ingame` | The in-game line (visitor), starts hidden | Reveals / hides it |
| `challenge-ingame-join` | Its "Rejoin game" link | Sets `href` |
| `challenge-signin-required` | The signed-out reason line (visitor, rated only) | Reads its presence: on `outgame`, Accept stays disabled while it exists |

The QR, the heading, the seek properties and the rule lines are server-rendered only, and no
script touches them.

Left to the layout pass (section 3): placement of every element; whether owner and visitor cards
are one shape or two; what the copy control looks like, and so its label and key; whether the card
keeps the `seekProperties` macro or presents the properties differently; the preview box's size;
what belongs in `challenge.css` rather than being inherited; and whether the card follows the
lobby's rule of **omitting the variant group icon when a standard-group seek carries modifiers**
([lobby.ts:500-504](/src/client/scripts/esm/views/index/lobby.ts#L500-L504)), or always shows it.

### 1.5 Creating

- A challenge **may be rated.** The modal keeps its rated/casual row in `friend` mode (only
  `computer` hides it, [gamesetupmodal.ts:204](/src/client/scripts/esm/views/index/gamesetupmodal.ts#L204));
  `syncRatedButton` already forbids rated where it must.
- **One seek per user, public or private.** A new seek replaces the old one, as today
  ([createSeek.ts:60-61](/src/server/game/seeksmanager/createSeek.ts#L60-L61)). A replaced private
  seek sends its challenge tabs to `/`.
- **The lobby shows nothing** for a live private seek: no row, no banner.

### 1.6 Lifetime

- The private seek **outlives the owner's page.** It is not deleted when the owner's socket closes
  (a sleeping phone closes it too).
- **It expires after 10 minutes of owner absence** — while the owner has **no** challenge socket
  connected. The clock starts when the seek is created and whenever the owner's last challenge
  socket disconnects; any owner challenge socket connecting stops it. Being on the lobby doesn't
  count as present.
- **It does not survive a server restart.** Reconnecting challenge tabs are sent to `/`.
- **On cancel, expiry or replacement, every challenge tab goes to `/` — silently.** No toast, no
  explanation.
- **A URL naming no open private seek and no game is a plain 404**, whatever the reason.

### 1.7 Acceptance and where everyone goes

- The owner never sees Accept. A guest may accept a casual challenge; a rated one needs sign-in.
- **The notify sound plays to completion before navigating**, for everyone entering the game.
- **Players** go to `/game/X/<their colour>` (the lobby's `getGameUrl(id, role)`,
  [lobby.ts:250](/src/client/scripts/esm/views/index/lobby.ts#L250)). **Onlookers** go to plain
  `/game/X` and so view from White.
- **Losing an accept race** makes you an onlooker, exactly as above, with no error toast.
- **On accept, the seek's sockets split four ways:**

| Who | Where they go |
| --- | --- |
| The owner's chosen tab | into the game, as a player |
| The tab that clicked Accept | into the game, as a player |
| Any **other** tab of **those two people** | `/`, silently |
| **Every** tab of anyone else | into the game, as a spectator |

  "Player" means the owner and the accepter only. **Onlookers have no one-tab rule.**

- **Which owner tab is chosen:** the creating tab (`ownerTab`) if connected, else the owner's most
  recently connected challenge tab — the rule at
  [lobbyManager.ts:86-101](/src/server/game/seeksmanager/lobbyManager.ts#L86-L101), generalized in
  2.4.
- If **no** owner challenge tab is connected at accept, the owner is owed a navigate
  ([gameManager.ts:88-94](/src/server/game/gamemanager/gameManager.ts#L88-L94)): the first owner
  tab to reconnect — challenge page or lobby — is sent in.
- **Hard timing requirement:** the owner must reach the game page within ~5 s of the game being
  created, or the opponent sees a disconnect notice
  ([gameManager.ts:98-108](/src/server/game/gamemanager/gameManager.ts#L98-L108),
  [disconnect.ts:29](/src/server/game/gamemanager/disconnect.ts#L29)). The accept push to the
  owner's challenge tab is immediate.

### 1.8 Accept eligibility — live

Accept is enabled only when the visitor is **not in a game** and **not (guest and rated)**.

- The in-game line **renders its text server-side and starts hidden**; the socket reveals it and
  fills in the link's `href`. The client never writes the text. This is how the lobby's banner
  already works ([index.njk:88-94](/src/server/views/index.njk#L88-L94),
  [lobby.ts:265-270](/src/client/scripts/esm/views/index/lobby.ts#L265-L270)), and
  `lobby.ingame_banner` / `lobby.ingame_join` live outside `[script]`, so they cannot reach the
  browser. Updates reach the visitor's challenge tabs at the same two moments the lobby is told:
  when a game of theirs is created, and when they leave an ended one
  ([gameManager.ts:105](/src/server/game/gamemanager/gameManager.ts#L105),
  [gameLifecycle.ts:152](/src/server/game/gamemanager/gameLifecycle.ts#L152)).
- "Signed out + rated" is decided at render. Signing in or out in another tab reloads the challenge
  tab (socket `LOGGED_OUT`, or the `identity` BroadcastChannel,
  [validatorama.ts:21-57](/src/client/scripts/esm/util/validatorama.ts#L21-L57)). The server refuses
  both cases anyway ([acceptSeek.ts:32-34](/src/server/game/seeksmanager/acceptSeek.ts#L32-L34),
  [:52-54](/src/server/game/seeksmanager/acceptSeek.ts#L52-L54)).

### 1.9 Tabs, and a tab coming back

- **The owner may have the challenge page open in several tabs.** No one-tab rule.
- The page never idle-unsubscribes.
- Nobody can newly *load* the challenge page once the game exists — `/game/X` then serves the game
  page. But a tab already showing the challenge page (a phone that slept) reconnects and asks what
  happened. **It goes to the game page whenever that page exists, and to `/` only when the game page
  would 404:**

| Situation on reconnect | Result |
| --- | --- |
| Private seek still open | Stays |
| Game live, or over but still in memory (any number of moves, including a zero-move abort) | Game page — for a player, only per 1.7's one-tab rule; otherwise `/` |
| Game over, left memory, at least one move (saved) | Game page (same player rule) |
| Game over, left memory, zero moves (never saved) | `/` |
| Seek cancelled, expired, replaced, or server restarted | `/` |

### 1.10 URLs

- **The challenge page is `/game/X`**, and that is exactly what the copy control and the QR encode.
- A colour segment typed by hand (`/game/X/w`) still **renders the challenge page**, ignoring the
  segment — the route picks its template by state, and the colour is unread. *(The game page already
  serves three URLs for one game, so one-URL canonicality isn't a rule here.)*
- To let friends watch from your side, share the **game** URL once it starts — it carries your
  colour.

---

## 2. Design

### 2.1 Seeks and ids

- **A private seek lives in `activeSeeks`**, so one-seek-per-user and "entering a game deletes your
  seek" already apply. *(A separate collection would make every one-seek rule check two.)*
- **Privateness is the presence of a `private` group on `AuthSeek`**
  ([seekUtility.ts:18-27](/src/server/game/seeksmanager/seekUtility.ts#L18-L27)) — never a boolean,
  and never on `BaseSeek`, the lobby wire shape:

```ts
export interface AuthSeek extends BaseSeek {
	owner: AuthMemberInfo;
	ownerTab: string;
	variant: SeekVariant;
	/**
	 * Present only on a "Challenge a friend" invite — absent from the lobby, reachable only
	 * by its URL. Its presence is what makes the seek private.
	 */
	private?: {
		/**
		 * Deletes the seek once the owner has been away for 10 minutes.
		 * Armed only while they have no challenge socket connected.
		 */
		expiry?: NodeJS.Timeout;
		/** The sockets currently viewing this challenge's page. */
		subscribers: Set<CustomWebSocket>;
	};
}
```

  Deriving privateness from presence leaves no flag able to disagree with the state it describes,
  and makes a public seek holding a timer or subscribers unrepresentable. `if (seek.private)` reads
  as a boolean did. *(A discriminated union with helper types is more shape than one optional group
  earns.)*

- **The challenge page's sockets live on the seek**, as a game's spectators live on the game
  ([serverGameTypes.ts:162](/src/server/game/gamemanager/serverGameTypes.ts#L162),
  [gameSockets.ts:27-30](/src/server/game/gamemanager/gameSockets.ts#L27-L30)), so `activeSeeks`
  reaches them on the seek it is already deleting. Sound because a socket is only ever *retained*
  for an **open** private seek: a subscribe naming a game or nothing is answered and navigates away.
  *(A separate subscribers module would exist only to dodge an import ring that never arises this
  way.)*
- **Every seek reserves its game id at creation, and that id IS the seek's id.**
  - `createSeek` gets it from `activeGames.issueUniqueId`, replacing the seek-id loop
    ([createSeek.ts:81-84](/src/server/game/seeksmanager/createSeek.ts#L81-L84)).
    `activeSeeks.hasID`, `SeekIdSchema`, `SeekId` and `SEEK_ID_LENGTH`
    ([domain.ts:102-106](/src/shared/transport/domain.ts#L102-L106)) are deleted.
  - `issueUniqueId` ([activeGames.ts:39-45](/src/server/game/gamemanager/activeGames.ts#L39-L45))
    also skips ids held by open seeks (it imports `activeSeeks`; no cycle). A dead seek's id is
    freed.
  - `createGame` ([gameManager.ts:64-117](/src/server/game/gamemanager/gameManager.ts#L64-L117))
    **takes the id as a required first argument** and no longer makes or returns one; stays sync.
    `acceptSeek` passes the seek's id. `createEngineGame` and `onRematch` call `issueUniqueId`
    first (`onRematch`'s `let newGameID` goes).
  - **Ids are numbers everywhere** — memory, wire (`domain.GameIDSchema`), and the database, where
    `game_id` is an INTEGER primary key. Base62 exists **only inside a URL string**, encoded by
    [gameurl.ts:37](/src/shared/chess/util/gameurl.ts#L37) and decoded by `gamesManager.decodeID`.
    This covers `BaseSeek.id`, `acceptseek` / `cancelseek`, `ourseekid`, the seek-preview API and
    cache, and the lobby's maps and sets. The lobby's click handler converts the `data-seek-id`
    string ([lobby.ts:118](/src/client/scripts/esm/views/index/lobby.ts#L118)).
  - Lobby viewers therefore see each public seek's future game id — accepted.
  - *(Reserving an id only for private seeks would mean an optional field that must agree with
    `private`, and two paths in `createGame`. Base62 as the id type would give one id two types
    depending on which collection held it, at a cost on every database read and write.)*
- **Private seeks are invisible to the lobby:** `getAllSafe` and `getIDOfUser` skip them.
- **Private seeks survive leaving the lobby:** `deleteOfUser` gains an option (like its
  `dontBroadcast`) that spares private seeks, passed only by `deleteSeeksIfNotConnected`
  ([lobbyManager.ts:124-134](/src/server/game/seeksmanager/lobbyManager.ts#L124-L134)). Without it
  the owner's navigation off the lobby would delete the challenge within seconds.
- The `challenge` route and the challenge page act **only on private seeks.**

### 2.2 Creating a challenge

- `lobby/createseek` gains a **required** `private: z.boolean()`
  ([serverbound.ts:45-66](/src/shared/transport/serverbound.ts#L45-L66)); validation is unchanged.
  The wire stays a boolean; only the server's in-memory shape is 2.1's group.
- The modal keeps **one submit handler**, taking a boolean: the online submit passes `false`, the
  friend submit `true`, replacing the placeholder at
  [gamesetupmodal.ts:113](/src/client/scripts/esm/views/index/gamesetupmodal.ts#L113). Both read the
  identical form, so `handleOnlineSeek`
  ([:160-181](/src/client/scripts/esm/views/index/gamesetupmodal.ts#L160-L181)) is renamed, not
  copied.
- For a private seek the server replies to the creating socket only with **`lobby/challengecreated`**,
  value: the game id (`domain.GameIDSchema`). The lobby navigates to `gameurl.getGameUrl(id)` with
  `navigate.assign`. *(Reusing `lobby/ingame` would raise the rejoin banner on the owner's other
  lobby tabs.)*
- `acceptSeek` passes `private: seek.private !== undefined` to `createGame`
  ([acceptSeek.ts:93](/src/server/game/seeksmanager/acceptSeek.ts#L93)). `GameSetup.private` stays a
  required boolean.

### 2.3 The page route

`/game/:id/:color?` ([root.ts:87-95](/src/server/routes/root.ts#L87-L95)) renders:

1. `challenge.njk` if the id names an open **private** seek;
2. else `game.njk` if it names a game;
3. else a 404.

The handler picks the template by state, as the register route does
([root.ts:109-117](/src/server/routes/root.ts#L109-L117)). The route's existing
`crossOriginIsolation` applies to the challenge page too; it loads only same-origin assets.

**`challenge.njk`** is its own template extending `layout.njk`. Its state comes from
**`challengePageController.ts`**, and its client data is **`window.challengePageData`** (the house
pattern, [game.njk:11](/src/server/views/game.njk#L11)):

```ts
interface ChallengePageData {
	id: number;
	variant: SeekVariant;
}
```

`id` is what the client subscribes with and builds the game URL from on accept. `variant` is the
seek's own shape — a code for a preset, an ICN for a custom position — the same split
`GamePageData` carries, and what `challengepreview.ts` branches on. There is deliberately no `role`
or `isOwner`: `challengestate`'s `game` reply carries `role`, and every owner-vs-visitor difference
is already in the SSR'd DOM, so the client branches on element presence.

*(Extending `game.njk` fails — all four of its blocks are game-only. Fetching from
`/api/seek-preview` costs a round trip. Always sending an ICN would give the server a job it has
nowhere today, since only custom positions have one.)*

The controller renders for the owner (matched by `memberInfoUtil.eq(req.memberInfo, seek.owner)`)
the copy control, QR and Cancel; for anyone else, Accept and the two reason lines.

### 2.4 The `challenge` socket route

A fourth route, built like `game`'s id-keyed subscribe. Bump `PROTOCOL_VERSION`.

```ts
// serverbound.ts — beside ServerboundGameSchema
const ServerboundChallengeSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('subscribe'), value: domain.GameIDSchema }), // The page's own id.
	z.strictObject({ action: z.literal('accept') }),  // Visitor accepts this page's challenge.
	z.strictObject({ action: z.literal('cancel') }),  // Owner cancels it.
]);

// clientbound.ts — ClientboundLobbySchema gains
z.strictObject({ action: z.literal('challengecreated'), value: domain.GameIDSchema }), // Navigate to /game/<id>.

// clientbound.ts — the new route
const ChallengeStateMessageSchema = z.discriminatedUnion('kind', [
	z.strictObject({ kind: z.literal('open'), ingame: GameNavigationSchema.required().optional() }),
	z.strictObject({ kind: z.literal('gone') }),
	z.strictObject({ kind: z.literal('game'), role: typeschemas.PlayerSchema.optional() }),
]);
const ClientboundChallengeSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('challengestate'), value: ChallengeStateMessageSchema }),
	z.strictObject({ action: z.literal('ingame'), value: GameNavigationSchema.required() }),
	z.strictObject({ action: z.literal('outgame') }),
]);
```

`accept` and `cancel` carry no payload: the server reads which challenge from the socket's own
subscription, as every in-game action does
([gameRouter.ts:41-43](/src/server/game/gamemanager/gameRouter.ts#L41-L43)), so a socket cannot act
on a challenge it never subscribed to.

What each message makes the page do:

```ts
// challengestate — the page's whole state. The reply to every subscribe; pushed again when the challenge's fate changes.
| { kind: 'open'; ingame?: { id: number; role: Player } } // Nobody has accepted. `ingame` present: reveal the in-game line, point "Rejoin game" at /game/<id>/<role>, disable Accept.
| { kind: 'gone' }                                         // Nothing here for this tab. Go to '/', silently.
| { kind: 'game'; role?: Player }                          // Notify sound, then /game/X/<role> for a player, /game/X for an onlooker (X = the page's own id).

// Live changes after subscribe. This route's `ingame` never navigates anyone, so it carries no `navigate` flag:
ingame:  { id: number; role: Player }   // Reveal the line, point "Rejoin game" at this game, disable Accept.
outgame                                  // Hide the line; re-enable Accept unless guest + rated.
```

**Resolving `challengestate`** — nothing is stored; it's worked out on each subscribe:

1. The id names an open private seek → `open` (with `ingame` if the viewer is in a game).
2. Else the id names a game in memory (`activeGames`) or in the DB (`gamesManager.isLogged`) →
   `game`, for onlookers with no role; for a player, per the one-tab rule (1.7), else `gone`.
3. Else → `gone`.

A player's role comes from the in-memory game (`gameSockets.getRole`, which already falls back to
identity), or for a saved game `deadGameState.resolveParticipantColor` (guests can't be identified
there, so a guest player gets no role — as on the dead game page). Never from `activePlayers` alone:
players leave it the moment a game ends
([gameLifecycle.ts:150](/src/server/game/gamemanager/gameLifecycle.ts#L150)). A `challenge`
subscribe consumes the owner's owed navigate (`activePlayers.consumeNavigateNotice`), as a lobby
subscribe does ([lobbyManager.ts:151-159](/src/server/game/seeksmanager/lobbyManager.ts#L151-L159));
that notice is how a reconnecting player's tab is identified as the one that goes in.
`challenge/subscribe` naming a public seek answers `gone`. *(`game/notlive` can't serve here — its
contract is "reload into SSR", which 404s exactly where this page must go to `/`.)*

**Who pushes `challengestate`**

- **`activeSeeks` pushes `{ kind: 'gone' }`** whenever it deletes a private seek, to that seek's own
  subscribers, and clears each socket's `ws.metadata.subscriptions.challenge` — mirroring
  `gameSockets`' detach-everyone on eviction. It sends only that constant: it resolves nothing,
  since `challengeManager` imports it and a call back would ring the server's file graph. One rule
  at the store covers every way a seek dies — cancel
  ([cancelSeek.ts:36](/src/server/game/seeksmanager/cancelSeek.ts#L36)), replacement
  ([createSeek.ts:61](/src/server/game/seeksmanager/createSeek.ts#L61)), the owner starting a bot
  game ([createEngineGame.ts:58](/src/server/game/seeksmanager/createEngineGame.ts#L58)), and
  expiry. [lobbyManager.ts:133](/src/server/game/seeksmanager/lobbyManager.ts#L133) spares private
  seeks, so it deletes nothing and pushes nothing. *(Per-caller pushes would be four hand-held
  obligations, and a fifth site added later would strand every challenge tab.)*
- **`deleteByID` gains one option, `becomingGame`**, beside `dontBroadcast`. It states a fact — this
  seek is not dying, it is graduating into a live game — so `activeSeeks` skips its `gone` push and
  `challengeManager` pushes `{ kind: 'game', role }` once the game exists. Its JSDoc must state that
  fact **and** say plainly that no `gone` push goes out.
  [acceptSeek.ts:60](/src/server/game/seeksmanager/acceptSeek.ts#L60) is its only caller and passes
  both options, for two unrelated reasons.
  [acceptSeek.ts:62](/src/server/game/seeksmanager/acceptSeek.ts#L62) — `deleteOfUser`, the
  accepter's own seeks — stays plain, since if the accepter had their own challenge open it really
  is dead. *(A "don't notify" flag would invite anyone wanting silence for any reason; a fact flag
  can only be passed by lying.)*

**The expiry timer.** `challengeManager` holds the 10-minute constant, the `setTimeout` and the
`clearTimeout`, writing the handle onto `seek.private.expiry`. It is the only module that learns
when an owner arrives or leaves, so arming sits beside what triggers it;
[createSeek.ts:63](/src/server/game/seeksmanager/createSeek.ts#L63) calls it once after adding the
seek — the codebase's only seek-creation site. `activeSeeks` clears the handle on deletion with a
bare `clearTimeout`, inside the `if (seek.private)` branch it already needs, so every death path is
covered; a stale timer would otherwise fire against a freed and reissued id and delete an innocent
challenge.

**Server wiring** (in `src/server/game/seeksmanager/`):

| File | Job | Mirrors |
| --- | --- | --- |
| `challengeRouter.ts` | Routes `subscribe` / `accept` / `cancel` | [lobbyRouter.ts](/src/server/game/seeksmanager/lobbyRouter.ts) |
| `challengeManager.ts` | Subscribe, unsubscribe, the expiry timer, pushes, and building `challengestate` | [lobbyManager.ts](/src/server/game/seeksmanager/lobbyManager.ts) |
| `inGameStatus.ts` | The `ingame` / `outgame` broadcast, to the lobby's sockets and the challenge pages' | *(new)* |

**`inGameStatus.ts`** holds one function, `broadcast(user, navigatingSocket?)`, sync. It looks the
user's game up once via `activePlayers`, then loops **two** socket sets: the lobby's subscribers
(payload `{ id, role, navigate }`) and every open private seek's subscribers belonging to that user
(payload `{ id, role }`). It is **moved** out of
[lobbyManager.ts:189-206](/src/server/game/seeksmanager/lobbyManager.ts#L189-L206); its two callers
([gameManager.ts:105](/src/server/game/gamemanager/gameManager.ts#L105),
[gameLifecycle.ts:152](/src/server/game/gamemanager/gameLifecycle.ts#L152)) are unchanged in number.

One function with two loops, so a caller cannot reach one audience without the other — "mutate
`activePlayers`, then broadcast" is not an enforced pairing today. It gets its own module because
keeping it in `lobbyManager` would give that file a second subject and falsify its own header
invariant, "Each module broadcasts its own state". *(Precedent: `activeSeeks` already broadcasts to
`lobbySubscribers` without going through `lobbyManager`.)*

**Shared socket lookups.** `findSocketFromOwner`
([lobbyManager.ts:93](/src/server/game/seeksmanager/lobbyManager.ts#L93)) and `hasUser`
([lobbySubscribers.ts](/src/server/game/seeksmanager/lobbySubscribers.ts)) each become a helper
**taking the socket set**, and move out of their lobby-named homes. `acceptSeek` hands the first
either the lobby's sockets or the seek's own; `challengeManager` hands the second a seek's own
sockets for its owner-present check. Generalizing only one of the pair would fix one duplication
while creating the other.

**Also:** `socketTypes.ts` gains `subscriptions.challenge: { id }` beside `game` / `spectating`
([socketTypes.ts:24-39](/src/server/socket/socketTypes.ts#L24-L39)); `socketSubs.unsub` gains its
case, starting the owner-away clock when the owner's last challenge socket leaves; `messageRouter`,
`socketSend`'s `OutMessages`, and both schema envelopes gain the route. There is no unsubscribe
verb — the lobby remains the only stream detached in place, and a challenge subscription ends with
the socket. The server's import graph must stay acyclic (`npm run check`).

**Client wiring:** `socketsubs`' `SubscribedRoute` gains `'challenge'`; `SocketBus` gains a
`challenge` event; `socketreceive` dispatches it; `socketintents`' held/synced records gain
`challenge`, and the page calls `onRouteSynced('challenge')` after applying `challengestate` —
load-bearing, since that is what flushes and releases intents held through an outage. Accept and
Cancel go through `socketintents.submit`.

### 2.5 The challenge page's client

Its own page directory, `views/challenge/` — never a second entry inside `views/game/`, since pages
are islands. Three files, one per responsibility:

| File | Responsibility |
| --- | --- |
| `challenge.ts` | **Entry point + socket plumbing.** Subscribes, re-subscribes on `reconnect`, dispatches the three incoming actions, calls `onRouteSynced`. Copies [index.ts](/src/client/scripts/esm/views/index/index.ts), which is socket wiring and nothing else. |
| `challengecard.ts` | **Runs the card.** Page state, card DOM, the outgoing intents, and leaving the page — facets of one thing, since state drives the DOM, an intent's validity check reads the state, and leaving is triggered by state. [lobby.ts](/src/client/scripts/esm/views/index/lobby.ts) holds all four together. |
| `challengepreview.ts` | **The preview canvas.** Reads the position out of `challengePageData`; loads the variant module for a preset or parses the ICN for a custom position; builds a render context for the inline canvas; loads images and textures; draws once. The only async, asset-loading, WebGL-owning part, and the only code reaching `board/rendering/`. |

- Stylesheet `src/client/css/challenge.css`. Both it and `challenge.ts` join `ESMEntryPoints` in
  [build/client.ts](/build/client.ts) ([BUILD.md:45-52](/docs/systems/BUILD.md#L45-L52)) — a page's
  script and stylesheet are only built if listed.
- In [import-rules.ts](/scripts/modules/import-rules.ts), `views/challenge/` joins `SOCKET_PAGES`
  and the `board/` and `shared/chess/*` rules. Check with `page-reach.ts --why`.
- The page preloads the `notify` sound, as the lobby does.

### 2.6 The board preview

The preview's drawing moves out of
[variantpreviewtooltip.ts](/src/client/scripts/esm/board/variantselector/variantpreviewtooltip.ts)
into **`src/client/scripts/esm/board/rendering/previewrenderer.ts`**, a **thread-`ctx`** module
([GRAPHICS.md:118-124](/docs/systems/GRAPHICS.md#L118-L124)): it owns no state, and two previews
run it. Moved, not copied:

- building a `RenderContext` for a **given** canvas (`ensureGLReady`,
  [variantpreviewtooltip.ts:141-161](/src/client/scripts/esm/board/variantselector/variantpreviewtooltip.ts#L141-L161));
- loading a position's images and textures into a `ctx` (`ensureReady`, [:267-272](/src/client/scripts/esm/board/variantselector/variantpreviewtooltip.ts#L267-L272));
- drawing it into a `ctx` (`renderBoard`, [:274-312](/src/client/scripts/esm/board/variantselector/variantpreviewtooltip.ts#L274-L312)).

The tooltip builds one `RenderContext` for its own canvas and keeps only positioning, hover handling
and its rules text. The challenge card builds its own for its inline canvas. *(Importing the tooltip
instead would bind one context to its own canvas and drag in hidden DOM and document listeners.)*

### 2.7 Rule lines and seek properties — `seekProperties.ts`

The meta card's "Original seek's properties" block
([game.njk:89-116](/src/server/views/game.njk#L89-L116)) is exactly what the card shows. It moves out
of `gamePageController.ts` into **`src/server/controllers/seekProperties.ts`**, returning a
**`SeekPropertiesViewModel`**:

- Input: a setup (`StaticGameSetup`: variant, time control, creation time, modifiers) plus `rated`.
- Output: the variant (icon + name), the rule lines (`buildRuleLines` + `resolveGameRules` + the
  rule-line type move here, [gamePageController.ts:116-122](/src/server/controllers/gamePageController.ts#L116-L122),
  [:315-369](/src/server/controllers/gamePageController.ts#L315-L369)), the speed (icon + category),
  the time-control label, `rated`.
- `buildGameMetaViewModel` calls it; the game and analysis pages render exactly as today.
- `challengePageController` calls it with a setup built from the seek (`timeCreated` = now; a seek's
  variant fits `StaticGameSetup.variant` unchanged), then adds the owner, side dot and modifier
  icons — none of which the game or analysis pages show.

Rule lines are rendered on the server, like the meta card — never on the client.

### 2.8 The `seekProperties` macro

**`src/server/views/components/seekproperties.njk`**, macro **`seekProperties(props)`**, renders a
`SeekPropertiesViewModel`. It replaces the identical copies in `game.njk`
([:90-116](/src/server/views/game.njk#L90-L116)) and `analysis.njk`
([:136-161](/src/server/views/analysis.njk#L136-L161)); both pages render exactly as today. Import:
`{% from "components/seekproperties.njk" import seekProperties %}`.

### 2.9 QR code and the copied link

- Both the QR and the owner's copy control use **one string**: `urlUtils.getAbsoluteGameUrl(id)`
  ([urlUtils.ts:19-33](/src/server/utility/urlUtils.ts#L19-L33)), which switches on `NODE_ENV` —
  the real domain in production, `https://localhost:<HTTPSPORT_LOCAL>` in development. One source
  means the two can never disagree, and the link is always canonical. *(Raw `APP_BASE_URL` would
  bake the production domain into a development QR; `window.location.href` could copy a
  colour-segmented link, which 1.10 forbids.)*
- The QR is built **on the server while rendering the page, as inline SVG, for the owner only.**
  Fixed black-on-white that no theme can reach.
- Library: **`qr`** (github.com/paulmillr/qr), latest release, `^` range like every other package:
  `encodeQR(url, 'svg', { ecc: 'medium', border: 4 })` — sync, zero dependencies, bundled types.
  *(A client-side library would be downloaded by every visitor.)*

### 2.10 Translations

Read [TRANSLATIONS.md](/docs/systems/TRANSLATIONS.md) first. English only — other languages are
maintained by translators.

- New component **`translation/challenge/en-US.toml`**, template-side only, since the page ships no
  client strings of its own:

```toml
# Translation component: challenge page (/game/:id, before the game exists).
# Source template: src/server/views/challenge.njk

title = "Challenge"        # Visitor's heading, and the browser tab title.
accept = "Accept"
cancel = "Cancel"
copy_link = "Copy link"
```

  `copy_link` is the plain card's label (1.4); the layout pass may reword, rename or drop it.

- **`challenge.njk` borrows rather than copies**: `lobby.ingame_banner`, `lobby.ingame_join` and
  `lobby_buttons.challenge_friend` from `index` — the last via `scriptT('index')`, since it lives
  under `[script]`, as [index.njk:66](/src/server/views/index.njk#L66) and
  [analysis.njk:304](/src/server/views/analysis.njk#L304) already render it. `rated_requires_signin`
  comes from `responses`. No strings move. *(Precedent: `register-awaiting.njk` reads `register`.)*

- **The side dot's tooltip is a translation key**, and
  [lobby.ts:559](/src/client/scripts/esm/views/index/lobby.ts#L559) reads it too — it builds the
  sentence in English in code, interpolating a hardcoded "white"/"black", and is the only hardcoded
  user-facing string left in that file. A new `[seek]` section in
  `translation/shared/en-US.toml`, immediately after `[sides]`:

```toml
[seek] # Descriptions of a seek's properties, shown on the lobby row and the challenge card.
owner_side_white = "Invite owner chooses to be white"
owner_side_black = "Invite owner chooses to be black"
```

  It belongs in `shared` by this test: **does the string describe a seek, or an action on the
  lobby's UI?** Descriptions go in `shared`, alongside `variants`, `speeds`, `game_modes`, `sides`
  and `user_status` — all of which the challenge card uses. `index`'s `cancel_seek` / `accept_seek`
  are lobby *actions*, and the challenge page has no such row.

  Two complete sentences, not one with a `{color}` slot: a slot forces `[sides]`' capitalised
  "White" mid-sentence, and `toLowerCase()` on a translated word is a localization bug (German
  capitalises every noun). `lobby.ts`'s colour ternary picks a key instead of a word, the shape it
  already has. Its example-row comment at [index.njk:116](/src/server/views/index.njk#L116) words
  the tooltip differently again; update it too.

### 2.11 The seek-preview endpoint

`/api/seek-preview/:id` ([seekPreviewAPI.ts](/src/server/api/seekPreviewAPI.ts)) takes the id
**base62**, decoded with `gamesManager.decodeID`, and its route param is `:id` — matching every
other game-id URL ([gameAPI.ts:18](/src/server/api/gameAPI.ts#L18),
[chatReportAPI.ts:35](/src/server/api/chatReportAPI.ts#L35),
[gamePageController.ts:132](/src/server/controllers/gamePageController.ts#L132),
[analysisPageController.ts:55](/src/server/controllers/analysisPageController.ts#L55)). It adopts
[gameAPI.ts](/src/server/api/gameAPI.ts)'s status split: **400** for a malformed id, **404** for one
naming nothing. Its 400 for a non-custom seek is unchanged.

*(Decimal is cheaper — zero base conversions against three — but would make this the only game-id
URL in the codebase spelled differently.)*

### 2.12 Documentation

Update [WEBSOCKETS.md](/docs/systems/WEBSOCKETS.md): the route list, message catalog, and the
subscriptions table.

### 2.13 Do not guard

- **The owner can't be in a game while their private seek is open**: every route into a game deletes
  the player's seeks first ([acceptSeek.ts:62](/src/server/game/seeksmanager/acceptSeek.ts#L62),
  [createEngineGame.ts:58](/src/server/game/seeksmanager/createEngineGame.ts#L58)).
- **No zero-move check exists anywhere in this feature** — 1.9's table follows from "does the game
  page exist".
- **The intent lock cannot strand a button**: the server acks inside a `finally`
  ([socketReceive.ts:57-61](/src/server/socket/socketReceive.ts#L57-L61)), a socket close releases
  every sent-but-unacked lock, and an unsendable intent releases at once.

---

## 3. Still open

1. **The card's layout** — see 1.4. A separate design pass, run after the build is committed:
   - Draft several layouts, **one per branch** (`layout-a`, `layout-b`, …), each in its own worktree
     branched from the build commit. A layout changes only `challenge.njk`, `challenge.css` and the
     `challenge` TOML, and keeps 1.4's ids.
   - Naviary checks out each branch to compare them on the real page, then picks one.
   - The pick is delivered **unstaged** into Naviary's tree (`git cherry-pick -n`, then `git reset`)
     for his review. Every `layout-*` branch and worktree is then deleted.
   - Polishing the pick is ordinary work in his tree.