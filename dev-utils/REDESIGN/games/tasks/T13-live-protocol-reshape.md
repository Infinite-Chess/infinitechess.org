# T13 — Live socket-protocol reshape (cleanup) — STUB

Part of the game-page redesign (see `../requirements.md`). **Stub — not yet fleshed out.** The
deferred cleanup that retires the old live game-join protocol and de-dups it against the new
state shapes, once the new game page is the *only* live path.

This is the home for the "later task that reshapes the live socket protocol" referenced in the
`GameStateBase` jsdoc ([types.ts](../../../../src/shared/types.ts) `GameStateBaseSchema`) and the requirements' MetaData de-dup note.

## Preconditions (gates — do not start until all hold)

1. **T9–T12 landed and the new page is canonical.** The old `main.ts` / `joingame` live path is
   dormant and no longer the route any real game uses.
2. **Custom-variant `variant` union settled** (separate decision) — determines what the client
   still needs typed on the wire.
3. **Audit** that no client logic consumes the now-SSR'd `rated` / `players` beyond display
   (suspects: `onlinegame.ts`, `onlinegamerouter.ts`, `guipromotion.ts`).

## Scope (to flesh out)

- **Retire the old `joingame` path.** Remove the dormant `joingame` action + `JoinGameMessage` +
  `ServerGameInfo` schemas (`socketschemas.ts`), the server sender + router entry (`joingame.ts`,
  `gamerouter.ts`, `gameutility.ts`). Continues / absorbs **T9 §5** (the `subscribeClientToGame` →
  `attachClientToGame` collapse + `sendGameInfoToPlayer` deletion), which is gated on T12.
- **Retire the old `'logged-game-info'` socket path** (the dead-game sibling) — superseded by
  T10's HTTP `GET /api/game/:id`. Remove its action/schema (`socketschemas.ts`,
  `onlinegamerouter.ts`) + server side (`resync.ts`). T10 deliberately left it "retired later" with
  no owner; this is its home.
- **De-dup against `GameStateBase`.** `ServerGameInfo` (`id` + `rated` + per-player ratings)
  overlaps `GameStateBase`; fold the client live types onto the shared shapes rather than keeping
  a parallel set.
- **Slim the wire data** (low priority): drop the SSR'd `rated` / `players` from
  `FullGameState` / `SubscribedGameState` once the §3 audit clears. Payoff is small (a few hundred
  bytes vs. the large `moves` array) — do it only because it removes a redundant source, not for
  bandwidth.

## Notes

- Low priority overall; this is housekeeping, not a feature. Safe to defer indefinitely, but it's
  tracked here so the breadcrumbs in the jsdoc / T8.5 don't get lost.
- Write the full task doc when the preconditions are near.
