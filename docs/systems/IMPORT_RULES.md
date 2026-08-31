# Import Rules

How `src/` is organized so that dependency direction and bundle weight are **enforced, not
remembered**: three roots, each with a ladder imports may only point down, plus rules over
which client pages may ship which code. Enforced by
[import-rules.ts](/scripts/imports/import-rules.ts) — `npm run import-rules`, a pass inside
`npm run check`. Read this before adding or moving any file in `src/`, and before editing the
rules themselves.

## The model

- Three roots, each with a ladder: `src/client/scripts/esm/`, `src/server/`, `src/shared/`.
- Imports only ever point **DOWN** a ladder. Units on ONE line share a rank and may import
  each other sideways — bands are deliberate, not exceptions to suppress.
- Cross-root: tsconfig project references stop shared → client/server and client ↔ server
  (see [BUILD.md](/docs/systems/BUILD.md) for that machinery). What the checker adds on top:
  direction _within_ each root, and which client pages may ship which shared rungs.
- Placement philosophy differs by root, because bundle weight differs:
    - **Client ships one bundle per page** — a directory decides which pages download it, so a
      file's home is its **widest consumer**, not its subject matter.
    - **Server ships unbundled; shared has no entry points** — placement costs no bytes, so
      **subject** wins: every rung names a kind of thing. A file does NOT slide down a rung
      just because its lowest consumer allows it. A file that fits no rung's subject is
      carrying two responsibilities — split it rather than picking the least bad rung.
- All paths inside the checker are "short form": `src/client/scripts/esm/` or `src/` chopped
  off the front (`views/game/gui/x.ts`, `shared/chess/util/typeutil.ts`).

## The three ladders

Anything unlisted sits at rank 0, the floor. The right-hand words say what each rung is for —
its **audience** on the client, its **subject** on the server and shared. An audience is not a
rank: client `chess/` may not import client `components/`, though both ship everywhere.

### src/client

```
 8  views/<page>/                               that one page alone
 7  game/                                       pages with an interactive board
 6  board/variantselector/                      the widget that drives the renderer
 5  board/rendering/                            everything bound to the one canvas
 4  board/                                      pages that render a board, home page included
 3  components/, socket/                        ┐
 2  audio/, chess/, handoffs/, savedpositions/  ├─ any page
 1  util/, webgl/                               ┘
```

- `views/` is per-page islands: sideways imports between two pages are forbidden even though
  both sit on one rung.

### src/server

```
12  app.ts, server.ts, setupDev.ts  the process entry points
11  routes/                         the URL table
10  middleware/                     what wraps a request before it reaches the above
 9  api/                            JSON endpoints
 8  controllers/                    request handlers that render or answer
 7  game/, socket/                  live game state and the connections carrying it
 6  auth/                           identity, and the login-session lifecycle
 5  cookies/                        cookie ownership: schema, lifetime, read/write/clear
 4  database/                       persistence: the connection, the schema, a manager per table
 3  utility/                        infrastructure below the domain: logging, email, IP,
                                    tokens, metering, request context
 2  config/                         loaded or configured once at boot
 1  types.ts                        the FILE, not a directory — everything reads it
```

- Exact files rank individually: `types.ts` at the very bottom, the entry points at the top.

### src/shared — every rank strict

```
 7  components/, transport/   SSR-shared UI pieces, and the transport contract —
                             domain.ts and the two websocket directions. Nothing under
                             chess/ may import from here; a schema the chess layer also
                             needs is owned down the ladder, beside the vocabulary it
                             describes.
 6  chess/game/              Decides WHICH variant and loads it (async) before building
                             or judging a game.
 5  chess/variants/          The variant definitions and the registry/cache that load
                             them, plus the policy keyed off which variant a game is.
 4  chess/engines/           What an engine can handle. Needs a whole GameFile.
 3  chess/logic/             The data model and the rules engine: OrganizedPieces,
                             Board, Move, movesets, legal moves, check, notation (ICN),
                             the VariantModule contract. Works on a variant handed to it.
 2  chess/util/              Chess vocabulary that knows nothing of a board: piece types
                             and players, gamerules, win conditions, clock format,
                             metadata tags, variant codes, piece themes, game modifiers,
                             the engine roster, the game page URLs. Nothing here may
                             name the Board or Move types.
 1  types/, util/            Vocabulary owing nothing to chess: coords, math, time,
                             color, JSON, jsutil. A file here must make sense to a reader
                             who has never heard of this game.
```

- The rung that keeps catching us out is `chess/logic` vs `chess/game`: **"is a variant
  handed to me, or do I have to go find it?"**
- **A zod schema is a placement constraint of its own** — zod is ~60 KB minified.
  `chess/util/typeschemas.ts` exists ONLY to keep zod out of the lower modules whose types it
  describes; its own header names them and the routes it blocks. Measure with `pkg-cost.ts`
  before moving a schema.

## The four checks

| Check        | Question it answers                      | Truth it reads                   |
| ------------ | ---------------------------------------- | -------------------------------- |
| Ladders      | Which direction may an import go?        | Source scan                      |
| Cycles       | Is a root still ring-free? (server only) | The same source scan             |
| Reachability | Which pages may ship a target?           | esbuild metafile per page bundle |
| Gates        | Which module may even NAME a target?     | Source scan                      |

- The source scan counts `import type` edges and dynamic imports. esbuild erases type edges
  from bundles — a large slice of the real coupling in every root — which is exactly why the
  ladders must never be re-pointed at the metafile. Reachability wants the bundle: the SAME
  resolution as the real build. Neither subsumes the other.
- Only the server's **file** graph must stay acyclic (`ACYCLIC_ROOTS`). The ladders rank
  directories and never look inside one, so a ring living entirely within one directory would
  otherwise be ladder-legal. `src/client` and `src/shared` carry file cycles deliberately —
  the checker says nothing about them, do not recommend resolving them.
- The scan resolves RELATIVE specifiers only — safe while `tsconfig.json` declares no
  `paths`. Add path aliases and the scan must learn to resolve them.

## The rules

Two rule tables live in [import-rules.ts](/scripts/imports/import-rules.ts). Their
`audience` sentences and the ladders' wording are the single source of the report's phrasing.

**`RULES`** — "which pages may reach this target", matched against page bundles. The page sets
are built from two constants: `INTERACTIVE_BOARD_PAGES` (`views/game/`, `views/analysis/`,
plus the dormant `views/editor/` and `views/checkmatepractice/`) and `SOCKET_PAGES`
(`views/index/`, `views/game/`). Reachability only sees pages listed in `ESMEntryPoints`, so a
dormant page is never tested and its listing here stays inert until that entry lands.

| Target                  | Allowed pages                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| client `game/`          | INTERACTIVE_BOARD_PAGES                                                                               |
| client `board/`         | INTERACTIVE_BOARD_PAGES, `views/index/`                                                               |
| `shared/components/`    | INTERACTIVE_BOARD_PAGES, `views/index/`, `components/header/`                                         |
| `shared/chess/util/`    | INTERACTIVE_BOARD_PAGES, `views/index/`, `components/header/`, engine workers (`game/chess/engines/`) |
| `shared/chess/logic/`   | INTERACTIVE_BOARD_PAGES, `views/index/`, engine workers                                               |
| `shared/chess/engines/` | `views/index/` (engine card), `views/analysis/`                                                       |
| `shared/chess/game/`    | INTERACTIVE_BOARD_PAGES, `views/index/`                                                               |
| `shared/transport/`     | SOCKET_PAGES                                                                                          |

Only rungs get reachability rules — the "any page" ranks fix direction only, so they need none.
The rules come in two scopes: the client's own island rungs, and `src/shared`'s rungs — which
of those a page may ship is governed by nothing else. The server ships unbundled and has no
audience question, so it deliberately gets none.

**`GATES`** — "which module may even name this target", checked against the source scan, so a
static `import type` from the wrong module fails just as loudly. An importer INSIDE the
target is exempt — it cannot avoid naming its own neighbors. The resident gate:
`shared/chess/variants/variant_scripts/` may only be imported by `variantregistry.ts`. Each
variant's module loads through the registry's dynamic `import()`.

## Placing or moving a module

1. Answer with the tools, not grep:
   `importers.ts <root> consumers <substr>` — every importer, **type-only edges included**,
   across all three roots: the widest-consumer lookup. `page-reach.ts <substr> --why` — which
   pages would ship it, and the chain that drags it in. `pkg-cost.ts` — what a heavy npm
   package costs the pages that bundle it.
2. Pick the rung by root: widest consumer on the client, subject on the server and shared.
3. `scripts/move-module.ts` `git mv`s modules and rewrites every relative specifier from each
   file's NEW home. Pass every move in ONE run so they resolve against each other.
