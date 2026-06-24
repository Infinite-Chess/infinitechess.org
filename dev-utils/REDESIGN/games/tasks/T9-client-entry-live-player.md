# T9 — Game-page client entry + new loader (live player)

Part of the game-page redesign (see `../requirements.md`). Build the new game page's **own** client entry (NOT `main.ts`) and a **new, purpose-built loader** that consumes the new state shapes directly, then wire the **live player** path end-to-end: subscribe by id → receive `gamestate` → load & render → live deltas.

Depends on T6 (server `subscribe`/`gamestate`), T8 (canvas + side-bar structure), T2 (`FullGameState`/`SubscribedGameState`), and **T8.5 (lands first)**.

> **T8.5 changes two assumptions in this doc:**
> 1. **Role comes from `window.gamePageData.youAreColor`** (SSR-resolved), *not* from the
>    `gamestate` overlay. `SubscribedGameState` no longer carries `youAreColor` — only an optional
>    `participantState`. Wherever this doc says "youAreColor from the state/overlay," read it as
>    "`gamePageData.youAreColor`."
> 2. **The static side-bar regions are SSR'd** (game-meta info, white/black participant list,
>    player-bar names + ratings, `XX:XX` clock placeholders). The render handlers below (§D / the
>    "T8 side-bar structure" note) must **not** re-render those — they own only dynamic content
>    (live clock values, eloChange deltas, moves, material, result, spectator count, chat).

## Approach (confirmed)

- **No `main.ts`.** This page gets its own slim entry. It's fine if it initially pulls in much of the existing `game/` graph by reusing modules — slimming is a **separate, later iterative refactor** (done with the user), not part of this task.
- **New loader, not an adapter.** Do **not** bridge the new state into the old `gameloader.startOnlineGame`. Write a new loader for this page that consumes `FullGameState`/`SubscribedGameState` directly and calls the lower-level primitive `gameslot.loadGamefile(...)`. `gameslot.loadGamefile` takes the gamefile's source-of-truth fields directly (`timeControl`, `variant`, `dateTimestamp`, …).
- Reuse lower-level primitives and existing live-delta handlers; replace only the entry + load orchestration.

## T8 side-bar structure — new DOM handlers needed

T8 rebuilt the game page with all-new markup and class names, so the **side-bar DOM population is not reusable** from the old page — only the data-level delta handlers (§4, which touch the gamefile + canvas) carry over. The old `guigameinfo` / clock-DOM code targets the old selectors. Plan for new render handlers against the actual T8 structure (note: the static username containers are SSR'd by T8.5, so the only remaining username-container client concern is the dynamic `.eloChange` delta — see T10 §4):

- **Clocks** — a `.clock` in each `.player-bar`; the side to move is marked by `.tempo` on its `.player-bar` (whole-bar highlight). The `XX:XX` placeholder + bar orientation are SSR'd (T8.5); this handler writes the **live ticking values** into the existing `.clock`.
- **Move list** — `.moves-table` of `.move-row`s (`.move-num` + `.ply` cells: `.move-piece` silhouette + `.move-coord`, truncated with full value in `title`). The **game-over result renders *inside* this table** (`.game-result`, appended after the last move so it scrolls away with the moves) — not as a separate region.
- **Material** — `.material` bars (`#material-top` / `#material-bottom`): inject one `.material-piece` svg per surplus piece via `svgcache.getSilhouetteSVG`, plus a `.material-lead` (e.g. "+2").
- **Usernames / ratings** — `.username-embed` (`.username` + `.elo`) in both `.player-bar` (board POV) and `.meta-players` (white/black list) is **SSR'd by T8.5** — not rendered here. The client only adds the dynamic **`.eloChange`** delta on game end (rating change), into the SSR'd embeds.
- **Coordinate readout** — editable `#coord-x` / `#coord-y` inputs in `.coords`; wire "jump the view to these coordinates" on edit/Enter.
- **State slots** — chat collapse toggle (`.chat.collapsed`), and draw-offer / disconnect / result blocks toggled via `.hidden`.

## Required changes

### 1. New entry — `src/client/scripts/esm/views/game/game.ts`

Replace the T3 skeleton with the real entry. Reuse the rendering bootstrap that `main.ts` does (`webgl.init`, `camera.init`, `game.init`, the game loop via `loadbalancer`/`frameratelimiter`, the `beforeunload` socket-close listener. You can take inspiration from how variantPreviewTooltip.ts reuses much of the rendering bootstrap itself. Our case will be a little different because the game page canvas needs continuous rendering, and all other features like arrow indicators, etc. so our implementation will be require slightly more scripts to reuse) — import the same modules. Then:
- Read `window.gamePageData` (`{ id, isLive, youAreColor? }` — T8.5 added the SSR-resolved `youAreColor`).
- **Live** (`isLive`): open the socket and send the new `subscribe` action with the numeric `id` (replaces `main.ts`'s `send('game','joingame')`). Handle the incoming `gamestate` via the new loader. Live deltas reuse existing handlers (§4).
- **Dead** (`!isLive`): out of scope here — stub/defer to T10.

### 2. New loader — `src/client/scripts/esm/views/game/gameStateLoader.ts` (or similar)

`loadGameFromState(state: FullGameState, youAreColor?: Player)`:
- `gameslot.loadGamefile` takes the gamefile's source-of-truth fields directly. `FullGameState` already carries them as typed fields, so the loader forwards them straight: `timeControl`, `variant` (already a `VariantCode`), `dateTimestamp` ← `state.timeCreated`. (Player names/elos for the side bar are **SSR'd by T8.5** — the loader does not render them; `state.players` is still available if any dynamic player-derived rendering needs it.)
- `youAreColor` is the caller-supplied role from `window.gamePageData.youAreColor` (T8.5), not a field of `state`.
- `viewWhitePerspective = youAreColor === undefined || youAreColor === WHITE` (spectator/white POV).
- Call `gameslot.loadGamefile({ timeControl: state.timeControl, variant: state.variant, dateTimestamp: state.timeCreated, viewWhitePerspective, allowEditCoords: false, additional: { moves: state.moves, gameConclusion: state.gameConclusion, clockValues: state.clockValues } })`.
- Set up online-game state for a participant (reuse `onlinegame.initOnlineGame` with `gameInfo`-equivalent + `youAreColor` (from `gamePageData`) + `participantState` (from the `gamestate` overlay), or a new minimal equivalent — implementer's call).

This loader is shared with T10 (dead) and T11 (spectator); design its signature with that in mind, but only the live-player path is wired here.

### 3. Client schema wiring — `src/client/scripts/esm/websocket/socketschemas.ts`

Add the incoming `gamestate` action carrying `SubscribedGameStateSchema` (from T2/T6) to the client `GameSchema`. Wire the `subscribe` outgoing send. Leave the old `joingame` action/schema in place for now (dormant; retired later). **Note (T8.5):** `SubscribedGameStateSchema` no longer has `youAreColor` — only an optional `participantState`. If T8.5 has already retargeted this schema, this chunk just confirms the wiring agrees.

### 4. Live deltas

Reuse the existing `onlinegamerouter` handlers for `move`/`clock`/`gameupdate`/`gameratingchange` (they operate on the loaded `gameslot.getGamefile()` and are agnostic to how it was loaded). Route the new `gamestate` action to the new loader. Reuse or thinly wrap `onlinegamerouter`'s routing — implementer's call; don't rewrite the delta handlers.

### 5. Collapse `subscribeClientToGame` into attach-only (gated cleanup)

`subscribeClientToGame` currently has two responsibilities, gated by its `sendGameInfo` flag: attach the socket, and (optionally) send the old `joingame` payload via `sendGameInfoToPlayer`. The `sendGameInfo: true` branch has exactly two callers — `onJoinGame` (dormant) and `createGame` (in-place game start). Both disappear: the old `joingame` server path is removed in the post-T9–T11 cleanup, and `createGame` stops sending in-place in **T12** (sends `gamestart {id}`; clients navigate + `subscribe`). The remaining callers (`resyncToGame`, `onSubscribeToGame`) already pass `sendGameInfo: false`.

**Once both `true`-callers are gone** (gate — do not do this earlier; the flag must stay while either remains):
- Reduce `subscribeClientToGame` → `attachClientToGame(servergame, ws, color)`: pure socket attach (current steps 1–2), no `sendGameInfo` flag, no DB, can't throw.
- Delete `sendGameInfoToPlayer` (dead old `joingame` sender; superseded by `sendParticipantGameState`).
- `resyncToGame` / `onSubscribeToGame` drop the now-empty `{ sendGameInfo: false }` options object.

## Commit plan

T9 is safe to land as a sequence of small commits: it adds a **parallel** page and touches nothing on the existing game path (no `main.ts`, no `startOnlineGame`), so the old page keeps working and the new page stays inert until the entry (E) wires it up. Each chunk below is self-contained — it passes `type-check` + `lint` on its own. The only hard rule: **add an import in the same commit that first uses it** (lint flags unused imports), which is why the entry lands last.

**The user commits each chunk personally and reviews before the next begins.** After finishing a chunk, run `type-check` + `lint`, report what changed, and **stop** — do not start the next chunk until the user has reviewed and committed.

Dependency graph: B, C, D are independent leaves; E (capstone) depends on B–D.

- [ ] **B — schema wiring** (§3): add the incoming `gamestate` action (`SubscribedGameStateSchema`) + outgoing `subscribe` to `socketschemas.ts`. Leave `joingame` dormant.
- [ ] **D — side-bar render handlers** (§"T8 side-bar structure"): new DOM population against T8 markup. Independent of the socket/loader plumbing; **may be split further** into per-handler commits — clocks, move-table (+`.game-result`), material bars, username-embed script, coord readout.
- [ ] **C — loader** `gameStateLoader.ts` (§2): `loadGameFromState(...)` consuming `FullGameState` and forwarding its typed fields into `gameslot.loadGamefile`. Standalone module; type-checks before anything imports it.
- [ ] **E — entry + delta wiring** (§1 + §4): real `views/game/game.ts` — reuse the rendering bootstrap, read `gamePageData`, open socket, send `subscribe`, route `gamestate` → loader (C), wire the reused `onlinegamerouter` deltas, call the render handlers (D). Capstone; lands last.

Suggested order: **B → D(×N) → C → E** (B/C/D can be done in any order). To consolidate: `{B+C}` loader stack, `{D}` side-bar render, `{E}` entry — a clean 3-commit split.

**Not part of T9:** the §5 `subscribeClientToGame` collapse is gated on T12 — do **not** fold it into any chunk above.

## Out of scope / deferred

- Dead/review load (T10), spectator read-only view (T11), gamestart navigation + sound (T12).
- Slimming the import graph / decoupling editor & engines — **separate later refactor with the user**.
- Removing the dormant old `main.ts`/`joingame` path — folds into a later cleanup once T9–T11 land.

## Constraints

- Do not use or modify `main.ts`. Do not route the new state through the old `startOnlineGame`.
- Reuse primitives (`gameslot.loadGamefile`, rendering bootstrap, delta handlers); build the new entry + loader fresh.
- Follow `CLAUDE.md`: reference source types; reuse, don't duplicate; tight jsdoc; tabs.

## Acceptance

- `npm run type-check --silent` passes.
- `npm run lint --silent` passes (fix any pre-existing warning touched).
- The client build succeeds with the new `views/game/game.ts` entry. Loading `/game/<live id>` as a participant subscribes, receives `gamestate`, and the new loader renders the board + clocks from the typed `FullGameState`; subsequent `move`/`clock`/`gameupdate` deltas update the board. (Runtime depends on T6 being deployed.)

When finished, also delete the "NOTE FOR T9 (client wiring):..." comment block from game.njk, including all other comments in there that mention T9, and in game.css.