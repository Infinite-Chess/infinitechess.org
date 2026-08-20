# Infinite Chess Notation (ICN)

How to read and write ICN: the string format that stores a whole infinite chess game — metadata,
gamerules, starting position, and move list — in one dense, still human-readable line. It is
modelled on [PGN](https://www.saremba.de/chessgml/standards/pgn/pgn-complete.htm), and borrows
PGN's metadata tags, move comments and embedded command sequences.

ICN is the project's universal game interchange format. It is what the `games.icn` DB column
stores, what copy/paste of a game or position produces and consumes, what a custom-position seek
carries, what the board editor saves, what the WASM engine is fed, and what every variant's
starting position is written as in source.

## A whole game in one string

```
[Event "Casual online Classical infinite chess game"] [Site "https://www.infinitechess.org/"] [Variant "Classical"] [UTCDate "2025.08.19"] [UTCTime "17:02:11"] [TimeControl "600+5"] [Result "0-1"] w 0/100 1 (8|1) P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|R1,1+|R8,1+|r1,8+|r8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+ 4,2>4,4|4,7>4,5|5,1>5,2
```

Three sections, always in this order, separated by whitespace:

| #   | Section              | Contents                                    | Optional?                                  |
| --- | -------------------- | ------------------------------------------- | ------------------------------------------ |
| 1   | **Metadata**         | PGN-style `[Key "Value"]` tags              | Yes                                        |
| 2   | **Rules + position** | Space-separated fields, then the piece list | Every field is; each has a default         |
| 3   | **Moves**            | The move list                               | Yes (absent = starting position, no moves) |

Fields are always written one space apart. Line breaks, when asked for, go only between sections
(`\n\n`), between metadata tags, and between numbered move cycles. The parser accepts any run of
whitespace between fields.

**Order is strict.** The parser walks the string left to right with sticky regexes, trying each
field in the fixed order below at the current index. A field written out of order simply won't
match, and parsing ends with `Unexpected characters remaining in the ICN after parsing!`.

## Section 1 — Metadata

`[Key "Value"]`, space- or newline-separated. Key is `[a-zA-Z]+`; value is 1–200 characters and
may not contain `"`. The 200 cap is deliberate to prevent a forgotten closing quote letting the
regex swallow the whole ICN.

Recognized keys, and the exact order the writer emits them in (`metadata_ordering`): `Event`,
`Site`, `GameId`, `Variant`, `Round`, `UTCDate`, `UTCTime`, `TimeControl`, `White`, `Black`,
`WhiteID`, `BlackID`, `WhiteElo`, `BlackElo`, `WhiteRatingDiff`, `BlackRatingDiff`, `Result`,
`Termination`. Field meanings live on the `MetaData` interface in [domain.ts](/src/shared/domain.ts).

**`Variant`, `UTCDate` and `UTCTime` are load-bearing** — the _source-variant
tags_. When an ICN omits the position section, they are the only way to reconstruct it: the
variant code names the position, the date/time picks which historical revision of it applies. All
three are **required** when writing with `skipPosition: true`, `LongToShort_Format` otherwise throws
without them.

Writing an ICN with a metadata key absent from `metadata_ordering` throws. Parsing one on the way in
keeps it.

## Section 2 — Rules and position

Space-separated fields in this exact order. Every one is optional; omitting it means "the default".

| Order | Field             | Example                 | Written when                                        | Default when absent     |
| ----- | ----------------- | ----------------------- | --------------------------------------------------- | ----------------------- |
| 1     | Turn order        | `w`, `w:b`              | always                                              | `w:b`                   |
| 2     | En passant square | `4,6`                   | an en passant capture is available                  | none                    |
| 3     | Move rule         | `0/100`                 | the game has a move rule                            | no move rule            |
| 4     | Full move counter | `1`                     | always                                              | `1`                     |
| 5     | Promotion         | `(8\|1;q,r,b,n,am)`     | the game allows promotion                           | no promotion            |
| 6     | World border      | `1,8,1,8`               | the game has a world border                         | infinite board          |
| 7     | Win conditions    | `royalcapture`          | any player differs from `checkmate`                 | `checkmate` for all     |
| 8     | Preset squares    | `Squares:-42,76\|16,86` | preset annotations override the variant's           | variant's own           |
| 9     | Preset rays       | `Rays:23,94>-1,0`       | as above                                            | variant's own           |
| 10    | Position          | `P1,2+\|k5,8+`          | `skipPosition: false` and the position is non-empty | resolved from `Variant` |

### Turn order

Colon-joined player codes, one full turn cycle: `w:b`. **`w` is shorthand for `w:b` and `b` for
`b:w`** — both directions of that substitution happen automatically.

| Player | 1 White | 2 Black | 3 Red | 4 Blue | 5 Yellow | 6 Green |
| ------ | ------- | ------- | ----- | ------ | -------- | ------- |
| Code   | `w`     | `b`     | `r`   | `bu`   | `y`      | `g`     |

The turn order is what defines _which players are in the game_, so it also drives how many entries
the promotion and win-condition fields must carry. Players may move more than once in a row (`w:w:b:b`).

The first player listed is the one to move — from the position this ICN carries, _before_ its
move list, not after. Flattening a game into a position rotates the order one step per ply, so a
mid-game snapshot opens with whoever moves next.

### En passant square

The square a pawn may capture _onto_, e.g. `4,6`. The double-pushed pawn's own square is derived on
parse from the last player in the turn order — the one who just moved (white ⇒ the pawn is one
square above; black ⇒ one below).

**Lossy case:** the writer emits this field only when the square and the pawn are exactly 1 rank
apart. In 4D variants they can be further, and the field is skipped with a console warning — the
en passant right is lost on round trip.

### Move rule

`state/limit`, e.g. `0/100` — plies since the last capture or pawn push, over the ply limit (the
"50-move rule", counted in plies). `state > limit` is a parse error. Writing one half without the
other throws.

### Full move counter

The move number the _first_ move in the move list belongs to. `1` for a fresh game; higher when
the ICN starts mid-game.

### Promotion

`(ranks|ranks|...;pieces)` — one `|`-separated rank list per unique player, in ascending player
order, followed by an optional shared `;`-list of raw piece codes.

```
(8|1)                      White promotes on rank 8, black on rank 1, to the default pieces
(8,16,24|1,-7;q,r,b,n,am)  Multiple ranks each, custom promotion pieces
(8|)                       Black cannot promote at all
```

The piece list is written **only when it differs from the default** `q,r,b,n`. Its codes are the
colorless [raw piece codes](#piece-abbreviations-used-by-the-position-promotion-and-move-fields) (lowercase).

> **Legacy format.** Older ICNs repeated the piece list per player — `(8;q,r,b,n|1;q,r,b,n)`. The
> parser still accepts it by taking the last list it sees. Current output writes the shared list
> once, after the final player's ranks.

The number of `|`-separated entries **must** equal the number of unique players in the turn order,
or parsing throws.

### World border

`left,right,bottom,top`, the inclusive box of playable squares. `_` stands for infinity on that
side: `-7,16,-7,_` is bounded on three sides and open upward.

### Win conditions

Comma-joined conditions per player. If every player has the same set, it is written once with no
parentheses; otherwise `|`-separated in parentheses, ascending player order:

```
royalcapture                             all players
checkmate,koth                           all players, two conditions each
(checkmate|checkmate,allpiecescaptured)  white differs from black
```

Valid values (`GAMERULE_WIN_CONDITIONS` in [winconutil.ts](/src/shared/chess/util/winconutil.ts)):
`checkmate`, `royalcapture`, `allroyalscaptured`, `allpiecescaptured`, `koth`. Every other
condition in that file is an outcome, not a rule, and surfaces in the `Termination` metadata
instead.

`checkmate` for everyone is the default and is **omitted entirely**.

### Preset annotations

Permanent, un-erasable highlights baked into a position — used to emphasize lines and squares in
showcases. They override the variant's own presets when present.

- `Squares:x,y|x,y`
- `Rays:x,y>dx,dy|x,y>dx,dy` — a start square and a direction vector.

### Position

`|`-separated piece entries: `<abbr><x>,<y>[+]`.

```
P1,2+|P2,2+|R1,1+|N2,1|Q4,1|K5,1+|k5,8+|3RQ-4000,900001
```

Coordinates are arbitrary-precision integers (`BigInt` end to end, no bounds), formatted with no
leading zeros and no `-0`.

The trailing **`+` means the piece still holds its special right** — an unmoved pawn's double push,
or a king's/rook's castling right. This is the `specialRights` set. Castling _triggers_ are all
jumping royals (king, royal centaur), _partners_ are all other non-pawn types with their special
right, not just rooks (see [castlingutil.ts](/src/shared/chess/logic/castlingutil.ts)).

An ICN with no position section falls back to the variant's own, via
`icnimport.getPositionAndSpecialRightsFromLongFormat` — which takes the variant code its caller
already resolved from the `Variant` tag, not the tag itself. An ICN with neither yields an empty
board.

## Piece abbreviations (used by the position, promotion and move fields)

**Uppercase = white, lowercase = black or neutral.** Any other player is written as their player
number prefixed to the lowercase raw code: `3k` is a red king, `4rq` a blue royal queen.

| Piece         | W / B          |
| ------------- | -------------- |
| King          | `K` `k`        |
| Pawn          | `P` `p`        |
| Knight        | `N` `n`        |
| Bishop        | `B` `b`        |
| Rook          | `R` `r`        |
| Queen         | `Q` `q`        |
| Amazon        | `AM` `am`      |
| Hawk          | `HA` `ha`      |
| Chancellor    | `CH` `ch`      |
| Archbishop    | `AR` `ar`      |
| Guard         | `GU` `gu`      |
| Camel         | `CA` `ca`      |
| Giraffe       | `GI` `gi`      |
| Zebra         | `ZE` `ze`      |
| Centaur       | `CE` `ce`      |
| Royal Queen   | `RQ` `rq`      |
| Royal Centaur | `RC` `rc`      |
| Knightrider   | `NR` `nr`      |
| Huygen        | `HU` `hu`      |
| Rose          | `RO` `ro`      |
| Obstacle      | `ob` (neutral) |
| Void          | `vo` (neutral) |

The **raw** (colorless) codes used by the promotion field are the lowercase forms of the same table.

Convert with `getAbbrFromType(type)` / `getTypeFromAbbr(abbr)`.

## Section 3 — Moves

A move ranges from bare-minimum to fully dressed. Everything past the coordinates is decoration
that the parser reads and discards:

```
1,7>2,8=Q                          compact (canonical)
P1,7x2,8=Q+                        with abbreviation, capture, check
P1,7 x 2,8 =Q + !! {Promotion!!!}  spaces, annotation glyph, comment
```

The compact form is a move's **token** — what `MoveFull.token`, `MovePacket.token` and the
live-games moves column all hold.

| Part               | Form                    | Required | Notes                                                             |
| ------------------ | ----------------------- | -------- | ----------------------------------------------------------------- |
| Piece abbreviation | `P`                     | no       | Cosmetic. **Never validated against the position, and discarded** |
| Start coords       | `1,7`                   | **yes**  |                                                                   |
| Separator          | `>` or `x`              | **yes**  | `x` = capture. Cosmetic; both parse identically                   |
| End coords         | `2,8`                   | **yes**  |                                                                   |
| Promotion          | `=Q`                    | no       | **The `=` is mandatory** — see below                              |
| Check / mate       | `+` or `#`              | no       | Cosmetic, discarded                                               |
| Annotation glyph   | `!`, `?`, `!!`, `?!`, … | no       | 1–2 chars of `[!?]`. Cosmetic, discarded                          |
| Comment            | `{...}`                 | no       | May not contain `}`                                               |

A single optional space is permitted between all parts except the piece abbreviation and
the start coords.

**Why `=` is required:** promotion to a colored piece is written `=3Q`. Without the `=`, `2,8=3Q`
and an end coordinate of `2,83` would be indistinguishable.

**Special moves get no notation.** A move is its coords and nothing more: castling is the king's
long move, en passant the pawn's diagonal one. Which special move it was is re-derived on load.

### Delimiters and move numbers

Moves are separated by `|` (or `|` with spaces). When move numbers are enabled, each turn cycle
instead opens with `N. ` and the moves within it stay `|`-separated — and with line breaks on,
each cycle is its own line:

```
1. P4,2 > 4,4 | p4,7 > 4,6
2. P4,4 > 4,5 | p3,7 > 3,5
3. P4,5 x 3,6 {White captures en passant} | b6,8 > 3,11
```

The numbering counts turn _cycles_, not plies, so it works for multiplayer turn orders too; `N`
starts at the full move counter. The parser accepts either delimiter anywhere.

### Comments and embedded commands

A `{...}` comment holds free human-readable text plus any number of PGN-style **embedded command
sequences**, `[%command value]`, in any position within it — handled by
[icncommentutils.ts](/src/shared/chess/logic/icn/icncommentutils.ts).

```
{[%clk 0:09:56.7] White captures en passant}
```

**`clk` is the only command we recognize.** Every `[%...]` sequence is stripped from the comment;
unknown ones are then silently dropped — external engines/tools may write their own commands, an
ICN carrying them is still valid. What is left is trimmed, with its runs of whitespace collapsed.

`clk`'s value is `H:MM:SS.D` — the time the mover had left _after_ moving, truncated down to the
nearest 100 ms so a replay shows exactly the digits the player saw. Any other shape throws.

## Writing an ICN

`LongToShort_Format(longformat, options)` — see [icnconverter.ts](/src/shared/chess/logic/icn/icnconverter.ts).

| Option           | Effect                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `skipPosition`   | Omit the position; requires `Variant`/`UTCDate`/`UTCTime` metadata                           |
| `compact`        | `false` adds piece abbreviations, `x`, `+`/`#` — **requires each move's `type` and `flags`** |
| `spaces`         | Space between the parts of a move                                                            |
| `comments`       | Emit `{...}` comments and `[%clk]` stamps                                                    |
| `move_numbers`   | Prefix each turn cycle with `N. `                                                            |
| `make_new_lines` | `\n\n` between sections, `\n` between metadata tags and numbered cycles                      |

**`icnconverter.COMPACT_FORMAT_OPTIONS` is the canonical form** — single line, no decoration, no
comments. Use it unless you have a reason not to. Two output paths deviate on purpose: the game
logger sets `comments: true` (to bake clock stamps into `games.icn`) with `skipPosition` on for
preset variants, and live-game persistence writes moves alone with clock comments.

Feeding it a gamefile takes one step first —
`gamecompressor.compressGamefile(gamefile, copySinglePosition?, presetAnnotes?)`
([gamecompressor.ts](/src/client/scripts/esm/game/chess/gamecompressor.ts)) snapshots a gamefile
into the `LongFormatIn` shape the converter wants.

## Reading an ICN

`ShortToLong_Format(icn)` → `LongFormatOut`, or **throws** on anything malformed. From there:

| Goal                                              | Call                                                    |
| ------------------------------------------------- | ------------------------------------------------------- |
| Parsed ICN → playable gamefile                    | `gameformulator.formulateGame()` / `tryFormulateGame()` |
| Parsed ICN → `VariantOptions`                     | `icnimport.variantOptionsFromLongFormat()`              |
| Resolve the position (explicit, or the variant's) | `icnimport.getPositionAndSpecialRightsFromLongFormat()` |
| Parsed moves → wire `MovePacket`s                 | `icnimport.movePacketsFromParsed()`                     |

Both formulators are async. `formulateGame` throws — an `IllegalMoveError` when built with
`validateMoves`, or a construction error for a move that can't be applied; `tryFormulateGame`
returns `'moves_invalid'` instead.

Piecewise helpers, for when you hold one segment rather than a whole ICN:

| Segment            | Write                          | Read                                         |
| ------------------ | ------------------------------ | -------------------------------------------- |
| One compact move   | `getCompactMoveFromDraft()`    | `parseTokenMove()`                           |
| One dressed move   | `getShortFormMoveFromMove()`   | — (only via the whole list)                  |
| A move list        | `getShortFormMovesFromMoves()` | `parseShortFormMoves()`                      |
| A position         | `getShortFormPosition()`       | `generatePositionFromShortForm()`            |
| Preset annotations | —                              | `parsePresetSquares()` / `parsePresetRays()` |

`generateSpecialRights(position, pawnDoublePush, castleWith?)` derives the `+` marks from a bare
position. Only generator-based variants need it, since they build their position in code —
string-based ones carry their `+` marks in the position string itself.

## Round-trip losses

ICN is not a lossless mirror of a gamefile. What does not survive:

- **`slideLimit`** — a gamerule, but it has no ICN field at all. It travels separately (the
  `mod_slide_limit` column, and the `Additional` construction options).
- **En passant more than one rank away** (4D variants) — skipped by the writer.
- **Move comments** — they write out fine and parse back into `MoveParsed.comment`, but nothing
  transfers them onto the gamefile's moves (`gameformulator` has the FUTURE note), so the next
  export drops them.

## Gotchas

- **`ShortToLong_Format` validates structure, not meaning.** It proves the string is well-formed
  ICN; it does not prove the position is legal, the moves playable, or the variant real. Every
  trust-boundary caller layers its own checks on top — see `validateIcnSeekContent` in
  [createseek.ts](/src/server/game/seeksmanager/createseek.ts) for the full pattern (length cap
  first, then parse, then metadata/position/playability).
- **`parseShortFormMoves` skips what it can't match** rather than throwing — it scans a string with
  a global regex. Only safe on text an ICN parse already accepted, or on trusted storage.
- **Moves are tested before the position, then again after.** A move opens exactly like a piece
  entry — `P1,7x2,8` starts with `P1,7` — so testing the position first would swallow that much of a
  moves-only ICN and then throw on the `x`. Consequently a position must always precede its moves.
- **The position is parsed piece-by-piece, not in one regex match.** Positions run to megabytes;
  one giant match would blow the regex engine. It is intentionally not a single pattern.
- **The move regex is possessive throughout** (via the `possessive()` lookahead/backreference
  trick). ICN is parsed from untrusted input on the server, and its stack of optional move parts is
  where catastrophic backtracking would bite. Keep new move patterns possessive.
- **All coordinates are `BigInt`.** No coordinate is ever bounded or cast to `number`.
- **A dev page validates ICNs in bulk** — `/icnvalidator`
  ([icnvalidator.worker.ts](/src/client/scripts/esm/views/icnvalidator/icnvalidator.worker.ts))
  re-parses and re-formulates every logged game, reporting parse, construction, illegal-move and
  termination-mismatch failures per variant. Pointed at the mass output of an engine SPRT run to
  catch disagreements in legal-move or game-conclusion logic.

## File map

| Concern                                            | File                                                                                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| The format itself — regexes, writer, parser        | [icnconverter.ts](/src/shared/chess/logic/icn/icnconverter.ts)                                                                          |
| Comment embedded command sequences (`[%clk ...]`)  | [icncommentutils.ts](/src/shared/chess/logic/icn/icncommentutils.ts)                                                                    |
| Parsed ICN → position / `VariantOptions` / packets | [icnimport.ts](/src/shared/chess/logic/icn/icnimport.ts)                                                                                |
| Parsed ICN → constructed gamefile                  | [gameformulator.ts](/src/shared/chess/logic/gameformulator.ts)                                                                          |
| Gamefile → the converter's input shape             | [gamecompressor.ts](/src/client/scripts/esm/game/chess/gamecompressor.ts)                                                               |
| Gamerule + win-condition vocabularies              | [gamerules.ts](/src/shared/chess/util/gamerules.ts), [winconutil.ts](/src/shared/chess/util/winconutil.ts)                              |
| Piece types and player numbers                     | [typeutil.ts](/src/shared/chess/util/typeutil.ts)                                                                                       |
| Metadata tag definitions                           | [domain.ts](/src/shared/domain.ts)                                                                                                      |
| Variant starting positions (raw position strings)  | `src/shared/chess/variants/variant_scripts/variants/`                                                                                   |
| Logged-game ICN writer                             | [gamelogger.ts](/src/server/game/gamemanager/gamelogger.ts)                                                                             |
| Live-game moves column                             | [liveGameValues.ts](/src/server/game/gamemanager/liveGameValues.ts), [LIVE_GAME_PERSISTENCE.md](/docs/systems/LIVE_GAME_PERSISTENCE.md) |
| Custom-position seek validation                    | [createseek.ts](/src/server/game/seeksmanager/createseek.ts)                                                                            |
| Bulk validation dev page                           | [icnvalidator.worker.ts](/src/client/scripts/esm/views/icnvalidator/icnvalidator.worker.ts)                                             |
