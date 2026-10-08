# Insufficient-material tables

`src/shared/chess/logic/insuffmat/matingsets.ts` lists every **smallest piece set that can be
arranged into a legally reachable checkmate**, helpmates included, per board kind, up to a piece
cap. A set is "smallest" when removing any one piece makes mate impossible.
`insufficientmaterial.ts` declares a position drawn when its pieces fit within the cap and contain
none of the listed sets. Above the cap it never declares a draw, except for the hand-proven draws in
its `PROVEN_DRAWS`, each with its proof. Apart from the two assumptions under Known holes, any error
in this table can only cost a draw going undeclared, never a false draw.

## Regenerating

```
npx tsx scripts/insuffmat/generate.ts unbounded 5 <out>     # ~1 day on 12 cores (level 5 dominates)
npx tsx scripts/insuffmat/generate.ts bounded 4 <out>       # ~1 day; reuses <out>/unbounded
npx tsx scripts/insuffmat/verify.ts <out>/*/mates-*.tsv     # every mate, through the site's own code
npx tsx scripts/insuffmat/writetable.ts <out>               # writes matingsets.ts
```

`generate.ts` takes an optional thread count, and resumes a stopped level from its `progress-N.tsv`.
Each table's cap is the highest level generated. The table must be regenerated whenever a piece's
movement, check or checkmate rules change.

Output: `draws-N.txt` and `mates-N.tsv` per level. Labels list comma-separated piece codes, white
then black (`K,R,CH,AR vs k,n`); `B0`/`B1` are bishop square colors. A set and its mirror images
(colors swapped, bishop colors swapped) appear once. `mates-N.tsv` columns: label (bounded ones end
in the board layout, `@minX,maxX,minY,maxY` with `_` for no wall), the mate with the defender to
move, the position before the last move, and the last move.

## Terms

- **Search window:** pieces are placed within 6 squares of the mated royal on unbounded boards, 7 on
  bounded ones (all of 8x8 fits, so a royal queen's lines end at walls the search sees), plus
  faraway huygen squares. Every distance far from the window falls into one of 101 patterns of which
  window squares lie at a prime distance, so one square per pattern stands for all. A lone mated
  king needs only the 4 patterns that hit 1 or 2 of its 3x3 squares and nothing else.
- **Checkmate:** as on the site. Some royal is in check, and no move leaves every royal safe. Any
  number of royals (king, royal centaur, royal queen) per side.
- **Reachability:** some attacker move could have produced the mate from a position where no
  defender royal was in check. A capture may only restore a piece the set's defender still has
  unused, since insufficient material is judged on the material before that capture.
- **Pawns** stay pawns. The site handles promotion by checking every outcome. No double step or en
  passant (they cannot create a mate), and pawn files are ignored.
- **Obstacles** are ignored, as on the site. **Voids** mean insufficient material is never declared.
- **Bounded boards:** a set counts as mating if it mates with the mated royal near one edge or a
  corner of a large board (each wall 0-6 squares away, the other directions open) or on any square
  of an 8x8 board. Such mates count for every bounded board. Layouts that are mirror images under
  the set's symmetries are searched once. Boards narrower than 8 in either direction never declare
  insufficient material: tiny boards would need their own tables. The site uses the bounded table
  when a border lies within 1,000,000 squares, or at any distance if a royal queen is on the board
  or a pawn could promote to one, since it reaches any wall in one move.
- **8x8-only mates:** 195 sets mate on 8x8 but against no large board's edge or corner, all with a
  royal queen, whose escape lines a small board cuts short. The first was two amazons vs a royal
  queen (`b 1,8,1,8 rq1,3|AM3,3|AM3,8`). List them with
  `grep -E ' @-?[0-9]+,[0-9]+,-?[0-9]+,[0-9]+[[:space:]]' <out>/bounded/mates-*.tsv`.
- **Skipped, proven by hand:** `generate.ts` never searches a set where one side is a lone huygen
  and every piece of the other slides orthogonally (royal queen, queen, rook, amazon, chancellor);
  with several royal queens the search runs for hours. Such a set is a draw: only the huygen can
  give check, along a line, and the defending piece nearest it on that line can capture it, leaving
  no attacker. 56 unbounded and 21 bounded sets of up to the caps fall under this.
- **Caps:** 5 pieces unbounded, 4 bounded, counting both sides and the royals.

## Evidence

- **Every listed mate is a real position checked by the site's own code** (`verify.ts`): checkmate
  with the defender to move, legal with the attacker to move, and reached by a legal last move from
  a position with the defender out of check. All 15,870 unbounded mates (up to 5 pieces) and 3,805
  bounded mates pass.
- **Every level is complete:** each level's draws and mates match exactly the sets the level below
  calls for, and every mate's position holds exactly its label's pieces.
- **The window is large enough:** rerunning 2,567 reference cases with a 17x17 window changed no
  verdict. Matthew Bolan's finder with a 21x21 area agreed with ours at 13x13 on every set of up to
  3 white pieces against a lone king (1,936 sets).
- **An independent finder agrees:** Matthew Bolan's `get_mates_faster`
  ([InfiniteChessEndgameScripts](https://github.com/mjtb49/InfiniteChessEndgameScripts)), compared
  with our reachability rule switched off, since his tests positions only. 0 differences across all
  1,936 sets of up to 3 white pieces, and the 7,558 of 9,688 sets of 4 his slower search finished.
  It covers neither huygens, roses, royal centaurs or royal queens, nor black pieces. For those, the
  site's verification of every mate is the independent check.
- **Bigger bounded boards add no mates:** every bounded draw (16,801 sets, the lone-huygen ones
  aside) was searched on 9x9 and 10x10 with the window covering the whole board and the mated royal
  on every square: no mate. Two sets the 10x10 run didn't finish, P vs rq,rq,rq and RQ vs rq,rq,rq,
  can't mate on any board: every royal queen either side checks can capture the checker straight
  back, or attacks it, making the position illegal.
- **Every large-board mate has the mated royal touching a wall** (3,426 of 3,426, up to 4 pieces);
  only 3 needed the second wall off the corner. Layouts with no wall touching are still searched:
  skipping them would make bounded runs ~1.7x faster, but this is evidence, not proof.
- **All 33 practice checkmates** are found as mates, and losing any one piece in each still declares
  the draw wherever it is one.

## Known holes

Assumptions that, if wrong, could declare a false draw:

- The search window is supported by the evidence above, not formally proven. The argument: every
  leaper's reach is at most 4, and a slider's coverage of the king's area does not depend on
  distance.
- Bounded boards larger than 8x8 are assumed no easier to mate on than 8x8 or a large board's edge:
  tested on 9x9 and 10x10 only.

These can only leave a real draw undeclared:

- Reachability is checked one move back only.
- Pawn files are ignored, so two pawns too far apart to cooperate still count as able to mate.
- Every unbounded mate counts as a bounded mate, though one spread over the window (or using a
  faraway huygen) may not fit on a small board.
- Positions above the caps are never declared drawn, apart from `PROVEN_DRAWS`.
