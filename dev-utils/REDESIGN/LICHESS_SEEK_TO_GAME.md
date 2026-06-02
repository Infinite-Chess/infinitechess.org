# Lichess: Seek Acceptance → Game Start Flow

Research into how Lichess transitions players from the lobby to a live game page. Referenced during the InfiniteChess.org redesign.
If more details are needed, lila repo is cloned one directory back from this repo.

---

## Game URL Format

Lichess uses two URL patterns for a game:

| URL | Route handler | Purpose |
|-----|--------------|---------|
| `/{8-char gameId}` | `Round.watcher` | Spectator view (anyone) |
| `/{12-char fullId}` | `Round.player` | Participant view (move controls) |

The **fullId** is `gameId + playerId` (8 + 4 chars). Each player in a game has a different fullId — same gameId, different 4-char playerId suffix. The playerId acts as a secret token proving participation.

---

## Server: Emitting the Redirect

When a seek/hook is accepted (`LobbySyncActor.scala`):

1. The `Biter` class creates the game.
2. `onStart` is called to notify other modules.
3. `LobbySocket` sends a **`"redirect"` socket message** to both players simultaneously, each receiving their own POV's fullId.

Message shape:
```json
{
  "t": "redirect",
  "d": {
    "id": "AbCdEfGhIjKl",
    "url": "/AbCdEfGhIjKl",
    "cookie": { "name": "lila2", "value": "<playerId>", "maxAge": 604800 }
  }
}
```

The `cookie` field is only present for **anonymous players**. It encodes their playerId so the game page can identify them without a login session.

---

## Client: Receiving the Redirect

**`ui/lobby/src/lobby.ts`**

```typescript
redirect(e: RedirectTo) {
  lobbyCtrl.setRedirecting();
  lobbyCtrl.leavePool();
  site.redirect(e, true); // true = play notification sound
}
```

**`ui/site/src/reload.ts`**

```typescript
export const redirect = async (opts: RedirectTo, beep?: boolean) => {
  if (beep) await promiseTimeout(site.sound.play('genericNotify'), 1000);
  // set anon cookie if present
  if (opts.cookie) { /* document.cookie = ... */ }
  location.href = '//' + location.host + '/' + opts.url;
};
```

Order of events on the client:
1. Play `genericNotify` sound (awaited, 1s timeout).
2. Set the anon cookie if provided.
3. Hard-navigate via `location.href`.

---

## Game Page: SSR'd, Server Decides Player vs. Spectator

The player/spectator distinction is entirely **server-side rendered**. There is no client-side check.

**`Round.watcher`** (8-char URL) — called for anyone visiting a game:
- Runs `playablePovForReq`, which checks if the visitor's `userId` or anon cookie matches a player in the game.
- If they **are** a participant → silently redirected to `renderPlayer` (their 12-char URL).
- If they are **not** a participant → rendered a read-only spectator/watcher view.

**`Round.player`** (12-char URL) — only reachable via the redirect:
- Calls `PreventTheft` to verify the visitor's identity matches the player at that fullId.
- If identity checks out → full SSR'd player page with move controls.
- If not → redirected back to the watcher URL.

The "theft prevention" logic (`TheftPrevention.scala`) checks logged-in users by `userId` and anonymous users by the `lila2` cookie value matching `pov.playerId`.

---

## Summary

```
Seek accepted
    │
    ▼
Server creates game, assigns fullId to each player
    │
    ├─► Socket message "redirect" → Player A (their fullId)
    └─► Socket message "redirect" → Player B (their fullId)
            │
            ▼
    Client plays notify sound, sets anon cookie, navigates
            │
            ▼
    Server SSR's game page (player or spectator view)
    based on session / cookie identity check
```
