# WebSocket System

How the client and server talk over the live socket: the routed message envelope, the shared
schemas that are the single source of truth for both directions, receipts (echo/ack), the
heartbeat that detects a dead connection, subscriptions, the intent layer that survives a
disconnect, and what a closure costs you depending on whether you caused it.

There is **exactly one socket per tab**, lazily opened by the first message that needs it and
auto-closed once nothing is subscribed. All live gameplay, the lobby, and spectating ride it.

## The wire

Every frame is JSON with a `route` discriminator. Four shapes exist, two per direction:

| Direction       | Shape                                                    | Notes                                                     |
| --------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| server → client | `{ id, route, contents: { action, value? } }`            | `route` ∈ `general` \| `lobby` \| `game`                  |
| server → client | `{ route: 'echo' \| 'ack', contents: <id> }`             | A receipt. Carries no id of its own, is never echoed back |
| client → server | `{ id, route, contents: { action, value? }, needsack? }` | `needsack` is `true` or absent — never `false`            |
| client → server | `{ route: 'echo', contents: <id> }`                      | A receipt                                                 |

`id` is a fresh 10-digit number (`uuid.generateNumbID(10)`) per routed message. **The two
directions have independent id spaces** — an id only ever means "the message I sent under it".
`value` is omitted entirely for actions carrying none (never `null`).

### The three routes

- **`general`** — protocol/UX traffic that belongs to no stream: heartbeat ping, protocol version,
  toasts and console relays, and the lobby sub/unsub verbs.
- **`lobby`** — the seek list, viewer count, and in-game status.
- **`game`** — everything about one live game.

Note the asymmetry: `sub`/`unsub` for the **lobby** are `general` actions, while attaching to a
**game** is `game`/`subscribe` (it needs an id) and detaching happens on socket close or by
server command. Leaving a game is a page navigation, so there is no in-place game unsub verb.

## Schemas — the single source of truth

Both contracts live in `shared/`, split by direction:

| File                                         | Declares                       | Server                                      | Client                                                           |
| -------------------------------------------- | ------------------------------ | ------------------------------------------- | ---------------------------------------------------------------- |
| [serverbound.ts](/src/shared/serverbound.ts) | everything the client may send | **value-imports** and validates at the edge | **type-imports only** (erased at build; stays out of the bundle) |
| [clientbound.ts](/src/shared/clientbound.ts) | everything the server may send | type-imports only                           | **value-imports** and validates at the edge                      |

That split is the whole reason the two directions aren't one file: bundling them together would
drag zod schemas the client only needs as _types_ into its bundle.

A schema belongs in these files only if it exists **solely** as websocket message contents.
Domain values also used by HTTP or SSR (`TimeControl`, `MovePacket`, `OutSeek`, `ClockValues`,
`SeekId`…) live in [domain.ts](/src/shared/domain.ts) and are imported by both.

Everything is a `z.discriminatedUnion` of `z.strictObject`s, so an unknown action or an extra
property is a validation failure, not silently-ignored data.

### Type plumbing

[socketutil.ts](/src/shared/util/socketutil.ts) exports the helpers both send functions are built
from: `MessageMap` (route → message union), `RouteAction<M,R>`, `ActionValue<M,R,A>`, and `Exact<V,Shape>`.
`Exact` matters: TypeScript's excess-property check only fires on fresh object literals, so a
message assembled into a variable first would smuggle extra keys onto the wire. `Exact` on the
`value` parameter catches them however the caller built it.

Each side then declares its own `OutMessages` map ([socketSend.ts](/src/server/socket/socketSend.ts),
[socketsend.ts](/src/client/scripts/esm/socket/socketsend.ts)) for the direction it sends, which is
what makes `socketsend.send(ws, 'game', 'move', …)` fully type-checked on route/action/value.

### Adding a message

1. Add a `z.strictObject` to its route's union in the file for that direction — `value` omitted
   entirely if the action carries none.
2. Handle it. Server: that route's router ([generalRouter.ts](/src/server/socket/generalRouter.ts),
   [lobbyrouter.ts](/src/server/game/seeksmanager/lobbyrouter.ts),
   [gamerouter.ts](/src/server/game/gamemanager/gamerouter.ts)). Client: the `general` switch in
   [socketreceive.ts](/src/client/scripts/esm/socket/socketreceive.ts), or a `SocketBus` listener
   for `lobby`/`game`.
3. Send it through that direction's send function — never `socket.send` directly.
4. **Bump `PROTOCOL_VERSION`** — unless prod is already behind it (see below).

Every switch on a route or action ends in a `satisfies never` default, so an unhandled action is a
compile error rather than a silent no-op.

## Message catalog

### Serverbound (client → server)

| Route     | Action                                     | Payload                                                           |
| --------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `general` | `sub` / `unsub`                            | `'lobby'` — the only subbable value                               |
| `lobby`   | `createseek`                               | variant, time, color, mode, modifiers (rated combos re-validated) |
| `lobby`   | `cancelseek` / `acceptseek`                | `SeekId`                                                          |
| `lobby`   | `createengine`                             | variant, time, color, strengthLevel                               |
| `game`    | `subscribe`                                | game id — attach + get full state                                 |
| `game`    | `subscriberematch`                         | game id — attach + get rematch state only                         |
| `game`    | `submitmove`                               | `{ move, moveNumber, gameConclusion? }`                           |
| `game`    | `abort` / `resign` / `engineresign`        | —                                                                 |
| `game`    | `claimvictory` / `claimdraw`               | —                                                                 |
| `game`    | `offerdraw` / `acceptdraw` / `declinedraw` | —                                                                 |
| `game`    | `offerrematch`                             | —                                                                 |
| `game`    | `report`                                   | `{ reason, opponentsMoveNumber }`                                 |

### Clientbound (server → client)

| Route     | Action                                            | Meaning                                                                                             |
| --------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `general` | `ping`                                            | Heartbeat. Expects only the echo every message gets                                                 |
| `general` | `protocolversion`                                 | Sent the instant the socket opens; mismatch → client reloads                                        |
| `general` | `notify` / `notifyerror`                          | Toast. **Already translated server-side** (`ws.t`)                                                  |
| `general` | `print` / `printerror`                            | Console relay                                                                                       |
| `lobby`   | `lobbystate`                                      | Full snapshot on subscribe: seeks, our seek id, viewer count, in-game status                        |
| `lobby`   | `seekslist` / `viewercount`                       | Live deltas                                                                                         |
| `lobby`   | `ingame` / `outgame`                              | We are (not) in a game. `ingame.navigate` decides _this tab_ goes there vs. shows the rejoin banner |
| `game`    | `gamestate`                                       | The full live state; the `subscribe` reply and every forced resync                                  |
| `game`    | `move`                                            | Opponent's move + move number + clocks + any conclusion                                             |
| `game`    | `clock`                                           | Clock values alone                                                                                  |
| `game`    | `gameconclusion`                                  | Non-move-triggered conclusion (for those who can't desync)                                          |
| `game`    | `gameratingchange`                                | Per-player rating deltas                                                                            |
| `game`    | `finalized`                                       | Result locked in permanently                                                                        |
| `game`    | `unsub`                                           | Game evicted from memory — stop expecting updates                                                   |
| `game`    | `notlive`                                         | The id you subscribed to isn't live → client reloads into SSR                                       |
| `game`    | `leavegame`                                       | Another tab took over this game; this tab goes home                                                 |
| `game`    | `opponentdisconnect` / `opponentdisconnectreturn` | Claim window opened / cancelled                                                                     |
| `game`    | `drawoffer` / `declinedraw`                       | Draw offer relays                                                                                   |
| `game`    | `rematchstate` / `rematchoffer`                   | Rematch overlay state / opponent offered                                                            |
| `game`    | `opponentleft` / `opponentreturn`                 | Opponent left/returned to the post-game rematch window                                              |
| `game`    | `ingame`                                          | A rematch was agreed — navigate to the new game                                                     |

## Receipts: echo vs. ack

Two different questions, two different receipts. **Neither is ever echoed back** (that would loop).

- **`echo`** — "your message _arrived_". Sent by the receiver the moment a routed message passes
  validation, before any handling. Purely a liveness/RTT signal.
- **`ack`** — "your message has been _handled_". Server-only, and only for messages the client
  flagged `needsack`. Sent in a `finally` after the router returns, so **it is sent even if the
  handler threw** — an ack promises the message was processed, not that it succeeded. An action
  stuck outstanding forever is worse than one acked after failing.

The client's echo round-trip time is what feeds the ping meter
([pingmeter.ts](/src/client/scripts/esm/components/header/pingmeter.ts)) and the clock ping
adjustment ([pingManager.ts](/src/client/scripts/esm/views/game/pingManager.ts)).

**Echoes are deliberately unlogged and unmetered server-side.** An echo isn't traffic the client
chose to send — we oblige one per message _we_ send — so charging their rate budget for our own
send volume would close honest sockets.

## Liveness: heartbeat + echo timers

Constants are shared in [socketutil.ts](/src/shared/util/socketutil.ts):
`HEARTBEAT_INTERVAL_MS = 10 000`, `ECHO_TIMEOUT = 5 000`.

| Mechanism               | Server                                                                                    | Client                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Echo timer**          | Armed per sent message. No echo in 5s → `ws.terminate()`                                  | Armed per sent message. No echo in 5s → `dropSocket()`                                  |
| **Heartbeat**           | Rescheduled on every send **and** every non-echo receive. Idle 10s → sends `general/ping` | —                                                                                       |
| **Inactivity watchdog** | — (covered by the ping's own echo timer)                                                  | Rescheduled on **every** incoming message. Silent for 15s (10 s + 5 s) → `dropSocket()` |

So a dead peer is detected in **≤15 s from either side**. The client's watchdog is only armed
while it has subscriptions; an unsubscribed socket is closing on its own idle timer anyway.

`terminate()` / `dropSocket()` rather than a graceful `close()` is deliberate: a closing handshake
with a peer already concluded unreachable can only _stall_ the `close` event — and every
consequence of the disconnection (dropping subscriptions, telling the opponent) waits on that
event. `dropSocket()` still emits a close frame in case the wire turns out to be fine, but detaches
its handlers and runs the local teardown itself with a synthetic `(1006, '')`.

`ws`'s own `closeTimeout` is lowered to **2500 ms** (from 30 s) in
[socketServer.ts](/src/server/socket/socketServer.ts) for the same reason.

## Opening a connection

`wss://<hostname>[:port]` — no path, no query, no subprotocol. Auth rides on cookies in the
upgrade request. [socketOpen.ts](/src/server/socket/socketOpen.ts) gates every upgrade, in order:

1. **Origin** must be present, and must equal `APP_BASE_URL` outside development → `1008 ORIGIN_ERROR`.
2. **IP** resolvable → `1008 UNIDENTIFIABLE_IP`.
3. **User-agent** present → `1008 USER_AGENT_REQUIRED` (scanner bots routinely omit it).
4. **`browser-id` cookie** present → `1008 AUTHENTICATION_NEEDED` (i.e. cookies disabled).
5. **`ws.metadata` attached** — subscriptions, cookies, userAgent, memberInfo, socket id, IP,
   echo timers — along with `ws.t`, the request's resolved translations (the socket's mirror of
   `req.t`).
6. **Rate limit**, keyed on the metadata's `IP|user-agent` → `1009 TOO_MANY_REQUESTS`, and _every_
   socket from that IP is closed too.
7. **IP socket cap**, max **10** → `1009 TOO_MANY_SOCKETS`.
8. **Auth** resolved from the `jwt` refresh-token cookie (`resolveAuth_WebSocket`); no token simply
   means guest, identified by `browser-id` alone.
9. **Session socket cap**, max **5** per jwt → `1009 TOO_MANY_SOCKETS`. Signed-in sockets only,
   which is why it can't run before step 8.

Finally the socket is registered, logged, given its listeners, and sent `general/protocolversion`.

**Sockets expire after 15 minutes** (`MAX_WEBSOCKET_AGE_MS`, [socketRegistry.ts](/src/server/socket/socketRegistry.ts)),
closing with `1000 CONNECTION_EXPIRED` — which the client treats as involuntary and immediately
reconnects through. Users must therefore re-present authentication at least every 15 minutes.

### Rate limit and payload cap

WebSockets share the HTTP limiter ([rateLimit.ts](/src/server/middleware/rateLimit.ts)), keyed on
`IP|user-agent`: **200 requests/minute** in production (400 in dev), counting HTTP requests and
socket messages together. Both the upgrade and every incoming message are metered — except echoes.

`MAX_PAYLOAD_BYTES = 500 000`. The `ws` receiver rejects anything larger straight from the frame
header, closing `1009` with no reason. **This directly caps how far pieces can move in online
games** — a move token is 4 coordinates, so 500 KB allows ~125 000 digits each.

## Closing a connection

### Codes and reasons

Reasons are a closed set in [socketutil.ts](/src/shared/util/socketutil.ts)'s `ClosureReasons`.
Both sides see both groups: a browser answers a close frame by echoing the code and reason it
received, so a reason the _server_ sent still comes back to it.

| Reason                   | Code | Sent by | Involuntary? |
| ------------------------ | ---- | ------- | ------------ |
| `CONNECTION_EXPIRED`     | 1000 | server  | ✅           |
| `ORIGIN_ERROR`           | 1008 | server  | ❌           |
| `UNIDENTIFIABLE_IP`      | 1008 | server  | ❌           |
| `USER_AGENT_REQUIRED`    | 1008 | server  | ❌           |
| `AUTHENTICATION_NEEDED`  | 1008 | server  | ❌           |
| `LOGGED_OUT`             | 1008 | server  | ❌           |
| `TOO_MANY_REQUESTS`      | 1009 | server  | ❌           |
| `TOO_MANY_SOCKETS`       | 1009 | server  | ✅           |
| `CLOSED_BY_CLIENT`       | 1000 | client  | ❌           |
| `CLOSED_BY_CLIENT_RENEW` | 1000 | client  | ✅           |

Reasonless closures: `1009 ""` (over `MAX_PAYLOAD_BYTES`), `1006 ""` (network failure / server
down / a terminated socket), `1001 ""` (tab closed without cleanup), `1002` / `1007` (`ws`
rejecting a malformed frame or bad UTF-8). **1006 is always involuntary.**

`LOGGED_OUT` is pushed from outside the socket layer — logout, account deletion, and password
reset all call `socketRegistry.closeAllOfSession` / `closeAllOfMember`.

### Voluntary vs. involuntary — what it costs you

`wasSocketClosureInvoluntary(code, reason)` is the single decision point, consumed by
[socketClose.ts](/src/server/socket/socketClose.ts) → `unsubSocketFromAllSubs(ws, involuntary)`.
Involuntary means _the client had no control_, and buys a grace period:

| Subscription       | Voluntary closure                                                  | Involuntary closure                                  |
| ------------------ | ------------------------------------------------------------------ | ---------------------------------------------------- |
| `lobby`            | Seeks deleted immediately (if no other connection)                 | **5 s cushion**, then deleted if still not connected |
| `game` (live)      | Opponent's claim window opens **immediately**; engine clock frozen | **5 s cushion**, then the claim window opens         |
| `game` (concluded) | Rematch offer withdrawn, opponent told, evict check now            | Same, after a **5 s cushion**                        |
| `spectating`       | Just detach — no timers, no opponent to notify                     | Same                                                 |

The server drops **all** subscriptions on close regardless: without a socket to push to, a
subscription is meaningless. The grace periods live in the game/lobby managers, not the socket.

### Disconnection consequences in a live game

Owned by [disconnect.ts](/src/server/game/gamemanager/disconnect.ts) and
[claimdisconnect.ts](/src/server/game/gamemanager/claimdisconnect.ts). See
[LIVE_GAME_PERSISTENCE.md](/docs/systems/LIVE_GAME_PERSISTENCE.md) for how all of this is persisted
across a server restart.

```
socket closes
   │ involuntary?                         voluntary (closed tab, navigated away)
   ▼                                         │
5s cushion  ── reconnects → cancelled        │
   │ elapsed                                 ▼
   └──────────────► claim window opens ◄─────┘
                    60s if involuntary AND resignable, else 10s
                    opponent gets `opponentdisconnect` { millisUntilClaimable, voluntary }
                       │
                       ├─ they reconnect → `opponentdisconnectreturn`, window cancelled
                       └─ window elapsed → opponent may `claimvictory` / `claimdraw`
```

The claim window is **just a timestamp**, validated on demand when a claim arrives — no timer
fires on its own. The opponent may sit and do nothing, and loses the chance the instant the
disconnected player returns.

If **both** players end up disconnected, a 5-minute timer concludes the game unattended: draw by
abandonment, an abort if not yet resignable, or an engine win by disconnect in an engine game.

### Client-side close handling

[socketclose.ts](/src/client/scripts/esm/socket/socketclose.ts) clears pending timers, dispatches
`closed` (then `connection-lost` if involuntary _and_ we had subs), clears its sub flags, and:

| Trigger                              | Response                                                           |
| ------------------------------------ | ------------------------------------------------------------------ |
| `1006`                               | `scheduleReconnect()` — backoff `[0, 2500, 5000] ms`, last repeats |
| `1001`                               | Nothing (page unloaded)                                            |
| `CONNECTION_EXPIRED`                 | `resubAll()` immediately                                           |
| `TOO_MANY_SOCKETS`                   | `resubAll()` after 10 s                                            |
| `TOO_MANY_REQUESTS` / `ORIGIN_ERROR` | Enter a 10 s timeout that blocks all connecting, then `resubAll()` |
| `AUTHENTICATION_NEEDED`              | Toast: cookies required                                            |
| `LOGGED_OUT`                         | `validatorama.reloadAfterLogout()`                                 |
| `CLOSED_BY_CLIENT`                   | Nothing — our own frame coming back                                |
| `CLOSED_BY_CLIENT_RENEW`             | Unreachable: `dropSocket()` detaches `onclose` before sending it   |

A `beforeunload` listener closes with `CLOSED_BY_CLIENT` so the server knows the departure was
deliberate. `'pagehide'` is **not** usable: it defers the close event until the user _returns_.

`resubAll()` merely dispatches `reconnect` on the SocketBus; each subsystem re-subscribes itself,
and the first outgoing message lazily reopens the socket. A bfcache restore (`pageshow` with
`persisted`) calls it too — the socket is long gone by the time the page comes back.

## Subscriptions

| Key          | Server metadata | Attach                               | Detach                                      |
| ------------ | --------------- | ------------------------------------ | ------------------------------------------- |
| `lobby`      | `boolean`       | `general`/`sub` `'lobby'`            | `general`/`unsub`, or socket close          |
| `game`       | `{ id, color }` | `game`/`subscribe` (participant)     | Socket close, or server `unsub`/`leavegame` |
| `spectating` | `{ id }`        | `game`/`subscribe` (non-participant) | Socket close, or server `unsub`             |

**Clients may only ever request `lobby`.** `sub` accepts nothing else; the game keys are
attached server-side by `subscribe`, which resolves participant-vs-spectator itself from
`getSocketRoleInGame()` (subscription metadata, falling back to identity for a fresh reconnect).

Client-side, [socketsubs.ts](/src/client/scripts/esm/socket/socketsubs.ts) tracks only `lobby` and
`game` booleans — a spectator's attachment is also `game`. This is a **local intent record**, not
authoritative state: it exists so a reconnect knows what to re-request, and so the socket knows
when it may auto-close. It is wiped on every close.

A second socket subscribing as the same player **evicts the first**: the old tab gets `leavegame`
and navigates home.

### Game (re)subscription: `subscribe` vs. `subscriberematch`

The client's [onlinegame.ts](/src/client/scripts/esm/views/game/onlinegame.ts) tracks a
monotonic `stage`, which decides what a reconnect asks for:

| Stage         | Meaning                                        | Reconnect sends                    |
| ------------- | ---------------------------------------------- | ---------------------------------- |
| `undefined`   | Nothing loaded — initial page load             | `subscribe` (bootstraps the board) |
| `'active'`    | Live game; the move list can still change      | `subscribe` (full resync)          |
| `'finalized'` | Result locked in; only rematch offers can move | `subscriberematch` (lean)          |
| `'evicted'`   | Server deleted the game from memory            | Nothing at all                     |

Server-side replies: [onSubscribe.ts](/src/server/game/gamemanager/onSubscribe.ts) sends
`gamestate` (with a `participantState` overlay for participants, without it for spectators), or
`notlive` if the id isn't in memory — the client then reloads so SSR serves the dead review page or
a 404. [onSubscribeRematch.ts](/src/server/game/gamemanager/onSubscribeRematch.ts) sends
`rematchstate`, or `unsub` if the game has since been evicted.

A dead game is loaded over **HTTP**, not the socket
([deadgameloader.ts](/src/client/scripts/esm/views/game/deadgameloader.ts)) — it
normalizes the fetched state into the same `gamestate` shape and no socket is opened at all.

## Resync and desync

`gamestate` is the universal repair message. [resyncer.ts](/src/client/scripts/esm/views/game/resyncer.ts)
rewinds and forwards our board until it matches the server's move list, validates each opponent
move as it goes (reporting cheating where the game permits it), and applies the conclusion.

- If the server's list is a strict **prefix** of ours, the game hasn't concluded, and we're allowed
  to submit the difference, we don't rewind — we just submit the missing moves.
- **`forceSync: true`** overrides that: the client must match the server exactly, dropping its
  trailing move instead of resubmitting it. Set _only_ when the server rejected that move (illegal,
  or over the duration-scaled distance cap) — otherwise the client would resubmit it forever.
- A `move` whose `moveNumber` isn't the expected next one triggers `setInSync(false)` +
  `subscribeToGame()`, i.e. a self-service full resync.
- While `inSync` is false the client **does not send moves**; they're submitted automatically once
  the resync completes.
- The client may **refuse** a `gamestate`: an illegal opponent move in it aborts the reconciliation,
  leaving our board deliberately short of the server's. `inSync` goes back to false and the route is
  never marked synced, so held intents stay held.

A refusal self-heals wherever a cheat report is possible: the server pops the offending move, aborts,
and pushes a fresh `gamestate` to everyone ([cheatreport.ts](/src/server/game/gamemanager/cheatreport.ts)).
Where it isn't (spectators, engine games, server-validated games), the board stays a move behind
indefinitely — intended, not an oversight.

Clock values in any incoming game message are ping-adjusted **at receipt** (half the last RTT
subtracted from the ticking color) inside `onlinegamerouter.receiveMessage`, before any buffering,
so a deferred handler doesn't mis-stamp the loss deadline.

Messages arriving before the gamefile's logical part exists are **queued** and replayed on
`game-loaded`; the very first `gamestate` is what bootstraps the game when nothing is loaded.

## The SocketBus

[SocketBus.ts](/src/client/scripts/esm/socket/SocketBus.ts) is the client's typed event bus; nothing
imports a socket handler directly, handlers self-register.

| Event             | Fired when                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `opening`         | A connection attempt starts                                                                |
| `closed`          | The socket closed, for any reason                                                          |
| `connection-lost` | Right after `closed`, if involuntary and we had subs (so its handlers override `closed`'s) |
| `reconnect`       | Subsystems should re-subscribe                                                             |
| `ping`            | An echo returned; detail is the RTT in ms                                                  |
| `intents`         | Intent lock or route readiness changed                                                     |
| `lobby` / `game`  | A validated incoming message for that route                                                |

## The intent layer (client)

[socketintents.ts](/src/client/scripts/esm/socket/socketintents.ts) sits above the raw transport for
**user-triggered** actions (create/cancel/accept seek, create engine game, abort, resign, engine
resign, claim victory/draw, draw offers, rematch offers). Two problems it solves:

1. **A click must survive a disconnect** — but must not be replayed blindly, because by the time we
   reconnect the world may have moved on. So an intent that can't go out now is _held_, and
   re-checked against the server's authoritative state via its `isStillValid()` callback the moment
   its route resyncs. Held intents expire after **10 s** (a backstop; correctness comes from the
   validity check).
2. **Impatient clicking must not multiply** — an intent stays _outstanding_, locked by
   `` `${route}/${action}` ``, until its `ack` arrives. Submitting an already-outstanding action is a
   no-op; submitting one still _held_ replaces it, so what goes out is the user's latest wish.

A route is "ready" only when the socket is OPEN **and** we hold that route's synced state.
`onRouteSynced(route)` must be called once the state is **applied**, not merely received — the
validity checks read it. On `closed`, every route un-syncs and every _sent-but-unacked_ lock is
released (we can't know whether it landed; the coming resync replaces whatever it acted on).

Every lock/readiness change dispatches `intents` on the SocketBus so dependent buttons re-derive
their disabled state.

**Protocol traffic bypasses this entirely** and calls `socketsend.send()` directly: echoes,
sub/unsub, re-subscribing, and move submission. Deferring the messages a resync itself depends on
would deadlock, and moves have their own reconciliation in the resyncer.

## Protocol version

`PROTOCOL_VERSION` in [socketutil.ts](/src/shared/util/socketutil.ts) is compiled into both sides
and announced by the server the instant a socket opens. A client whose compiled-in copy differs is
running pre-change code and `location.reload()`s — scripts are content-hashed, so a plain reload is
guaranteed to fetch the new ones.

**Increment it by 1 whenever the socket messages change at all.** The exception is when prod is
still behind the current value: that deploy will already force every client to refresh, and it
makes no difference whether they were one version behind or two.

## Logging and dev tooling

- **Server** ([socketLogger.ts](/src/server/socket/socketLogger.ts)) writes unconditionally: opens
  and every inbound message to `wsInLog/`, every outbound to `wsOutLog/`. Messages are truncated at
  2048 chars. Each upgrade gets an `R` correlation id, each inbound message a `W` one, so every log
  line a message produces shares an id.
- **Client** ([socketlogger.ts](/src/client/scripts/esm/socket/socketlogger.ts)) is a dev toggle, off
  by default — press `3` on the game page ([controls.ts](/src/client/scripts/esm/game/misc/controls.ts)).
  On, it prints routed traffic and adds 1 s of simulated send latency. Echoes _we_ send are never
  printed; incoming ones only if `alsoPrintIncomingEchos` is flipped.
- **Server-side simulated latency**: `SIMULATED_WEBSOCKET_LATENCY_MS` in
  [socketSend.ts](/src/server/socket/socketSend.ts). Guarded to throw if non-zero in production.
- Malformed messages are logged (`logZodError` → errLog server-side, console client-side) and
  **not replied to**. The client also skips echoing them — it can't know whether it should.

## Gotchas

- **`ws` silently drops sends on a CLOSING/CLOSED socket.** Both send paths return early on a
  non-OPEN socket rather than log a phantom send and arm an echo timer for a reply that can't come.
- **Never send from outside the send functions.** They own the echo timer, heartbeat reschedule,
  logging, and id — bypassing them breaks liveness detection. To reach a game's players, use
  [gamesockets.ts](/src/server/game/gamemanager/gamesockets.ts)'s `sendMessageToColor` /
  `broadcastToSpectators` / `broadcastToEveryone`, which resolve the sockets and call through.
- **`ws.t`, not raw strings.** `notify`/`notifyerror` values are user-facing and must already be
  translated server-side from the socket's bound translations.
- **The idle auto-close is 10 s with zero subscriptions**, reset on every outgoing message. A tab
  with no subs will not hold a socket open.
- **Malformed-frame errors from `ws` are swallowed** (`WS_ERR_*` in `socketOpen.onerror`) — flaky
  client stacks echoing 1006 onto the wire are benign and would otherwise flood errLog. Oversized
  messages are the exception and land in hackLog.
- **Sockets never survive a server restart.** `prepGamesForShutdown()` detaches them all. Everyone
  connected at shutdown gets a fresh 5 s cushion on restore; anyone already mid-cushion or
  mid-claim-window resumes the persisted remainder instead.

## File map

| Concern                                            | File                                                                                                                                                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared constants, closure taxonomy, type helpers   | [socketutil.ts](/src/shared/util/socketutil.ts)                                                                                                                                                                                               |
| Contracts                                          | [serverbound.ts](/src/shared/serverbound.ts), [clientbound.ts](/src/shared/clientbound.ts), [domain.ts](/src/shared/domain.ts)                                                                                                                |
| **Server** — stand up server, payload/close limits | [socketServer.ts](/src/server/socket/socketServer.ts)                                                                                                                                                                                         |
| Upgrade gating, metadata, listeners                | [socketOpen.ts](/src/server/socket/socketOpen.ts)                                                                                                                                                                                             |
| Registry, caps, expiry, mass-closure               | [socketRegistry.ts](/src/server/socket/socketRegistry.ts)                                                                                                                                                                                     |
| Send, receipts, echo timers, heartbeat             | [socketSend.ts](/src/server/socket/socketSend.ts)                                                                                                                                                                                             |
| Validate, meter, echo, route                       | [socketReceive.ts](/src/server/socket/socketReceive.ts)                                                                                                                                                                                       |
| Close teardown                                     | [socketClose.ts](/src/server/socket/socketClose.ts)                                                                                                                                                                                           |
| Subscription attach/detach                         | [socketSubs.ts](/src/server/socket/socketSubs.ts)                                                                                                                                                                                             |
| Routers                                            | [messageRouter.ts](/src/server/socket/messageRouter.ts), [generalRouter.ts](/src/server/socket/generalRouter.ts), [lobbyrouter.ts](/src/server/game/seeksmanager/lobbyrouter.ts), [gamerouter.ts](/src/server/game/gamemanager/gamerouter.ts) |
| `CustomWebSocket` shape                            | [socketTypes.ts](/src/server/socket/socketTypes.ts)                                                                                                                                                                                           |
| Game socket attach/detach, send helpers, broadcast | [gamesockets.ts](/src/server/game/gamemanager/gamesockets.ts)                                                                                                                                                                                 |
| Disconnect cushion + claim windows                 | [disconnect.ts](/src/server/game/gamemanager/disconnect.ts), [claimdisconnect.ts](/src/server/game/gamemanager/claimdisconnect.ts)                                                                                                            |
| Lobby subscriber set + broadcasts                  | [lobbysubscribers.ts](/src/server/game/seeksmanager/lobbysubscribers.ts), [lobbymanager.ts](/src/server/game/seeksmanager/lobbymanager.ts)                                                                                                    |
| **Client** — connection lifecycle, reconnect       | [socketconnection.ts](/src/client/scripts/esm/socket/socketconnection.ts)                                                                                                                                                                     |
| Send, echo timers, inactivity watchdog             | [socketsend.ts](/src/client/scripts/esm/socket/socketsend.ts)                                                                                                                                                                                 |
| Validate, echo, dispatch                           | [socketreceive.ts](/src/client/scripts/esm/socket/socketreceive.ts)                                                                                                                                                                           |
| Close handling, reconnect policy, timeouts         | [socketclose.ts](/src/client/scripts/esm/socket/socketclose.ts)                                                                                                                                                                               |
| Local subscription record                          | [socketsubs.ts](/src/client/scripts/esm/socket/socketsubs.ts)                                                                                                                                                                                 |
| Intent hold/lock layer                             | [socketintents.ts](/src/client/scripts/esm/socket/socketintents.ts)                                                                                                                                                                           |
| Event bus                                          | [SocketBus.ts](/src/client/scripts/esm/socket/SocketBus.ts)                                                                                                                                                                                   |
| Game-route handling, stage machine, resync         | [onlinegamerouter.ts](/src/client/scripts/esm/views/game/onlinegamerouter.ts), [onlinegame.ts](/src/client/scripts/esm/views/game/onlinegame.ts), [resyncer.ts](/src/client/scripts/esm/views/game/resyncer.ts)                               |
| Lobby-route handling                               | [index.ts](/src/client/scripts/esm/views/index/index.ts), [lobby.ts](/src/client/scripts/esm/views/index/lobby.ts)                                                                                                                            |
