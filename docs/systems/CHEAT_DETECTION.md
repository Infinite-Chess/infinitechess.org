# Engine-Assistance Detection

How the server spots players using an engine in rated games, and the evidence behind every choice.
Its output is a **case** opened on a player for the owner to judge; the detector never acts on a
player itself. Read the Calibration section before changing any constant: most obvious alternatives
were tried and measured, and the numbers are here so they needn't be measured again.

## In one paragraph

After every rated game, one background worker thread runs the Apeiron WASM engine over every
position of the game. Each move a player made becomes a piece of **evidence**: how hard the position
was, and whether they found a good move and the engine's own choice. Each player's evidence feeds a
running **betting score**: how many times likelier their recent moves are if they use an engine than
if they are an honest player as strong as their rating plausibly allows, multiplied by their
**analysis matches**: the analysis page displaying their live position, tied to their login, browser
or network. When that score reaches **1,000**, a case opens. Matches open most cases in fewer games;
move analysis catches the cheater who leaves none, and measured on prod's honest players, about
99.95% of its cases should be real.

## Constraints

The owner's standing requirements; any change must keep them.

- **Complexity:** Lichess's level. A new detection method needs evidence of incremental value: that
  it moderately raises catch rates or cuts false cases beyond the existing methods. One that catches
  the cheaters others already catch adds nothing.
- **Precision:** at least 95% of cases real, 99% preferred unless it costs considerably more missed
  cheaters. Prevalence is assumed 1%; revise it from real cases.
- **Compute:** one thread, the WASM build (a native binary measured only ~1.2× faster), within 400
  rated games a day (real volume is dozens), at a cost per game that doesn't grow with the player's
  game count. Argue for more only if it would catch moderately more cheaters.
- **Interaction data only ever raises a score**, never lowers it: a cheater controls their client,
  so normal-looking or absent data clears nobody. A method counts toward cases only once its honest
  rate is measured, except where honest players by definition never do it (analysing their own live
  position), and network-only matches, on a deliberately high guess; the rest is collected until the
  refit. Interaction methods must never retune the move analysis, which is calibrated for the
  cheater who leaves no interaction data.

## The pipeline

```
during the game:  moveSubmission (each move's away time)  ┐
                  analysisMatcher (analysis-page reports) ┴▶ PlayerData.interaction
                                                             (live_player_games.interaction)
gameLifecycle.finalize ─▶ cheatDetection.onFinalized ─▶ cheat_interactions + queue (one game at a time)
                                                          │
                     engineAnalysis.analyse ◀─────────────┘
                         │  worker thread: engineAnalysisWorker.ts
                         │  per position: MultiPV 5, 300,000 nodes, plus board facts (gameReplay.ts)
                         ▼
             moveEvidence.gather ─▶ cheat_assessments (one row per player per game)
                         │
                         ▼
   bettingScore.bestRunLogScore over the player's last 6 months ─▶ ≥ ln(1000)? ─▶ cheat_cases
```

| File (src/server/game/cheatdetection/) | Role                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `cheatDetection.ts`                    | Entry point and queue: takes finalized rated games, stores evidence, re-scores both players, opens cases.          |
| `engineAnalysis.ts`                    | Hosts the single engine worker thread; owns the search settings (`SEARCH`).                                        |
| `engineAnalysisWorker.ts`              | The worker: loads the WASM build from `dist/`, analyses every position of a game.                                  |
| `gameReplay.ts`                        | Builds a stored game's board at its start for board facts per position, and each position's engine ICN.            |
| `moveEvidence.ts`                      | Positions → one piece of evidence per scored move. Pure.                                                           |
| `analysisMatcher.ts`                   | Records each live rated game's positions; turns analysis-page reports into matches.                                |
| `bettingScore.ts`                      | Evidence → likelihood ratios → a player's score; holds the fitted model, the case line and the evidence age. Pure. |
| `cheatDetectionTypes.ts`               | Shared shapes: position analyses, worker messages, search settings, interaction data.                              |

Database: `cheatAssessmentsManager.ts` (`cheat_assessments`), `cheatInteractionsManager.ts`
(`cheat_interactions`) and `cheatCasesManager.ts` (`cheat_cases`). Interaction data is reported by
the client's `views/game/awaytime.ts` (sent with each move, `serverbound.ts`) and
`views/analysis/analysisreporter.ts` (`POST /api/analysis-report`, `api/analysisReportAPI.ts`); both
sides key positions with `shared/chess/logic/positionkey.ts`. `shared/chess/util/winchance.ts` holds
the cp → win-probability curve shared with the client's eval gauge and Game Review.
`shared/chess/logic/repetition.ts`'s `isRepeated` is the threefold-repetition walk with a limit of
one.

## How a game is analysed

- **Which games:** rated, finalized, logged, and not aborted (`onFinalized`), whatever their length.
  Each is queued as a `queued` row per player, so the queue survives restarts: startup re-queues
  those rows in the order their games finished, and a game cut off mid-analysis is redone. Games
  from before detection shipped never queue. A game whose assessment throws is marked `failed` and
  not retried, unless the engine can't load at all: then assessment pauses and every game stays
  queued for the next start.
- **The search:** every position, MultiPV 5, 300,000 nodes, single thread, transposition table kept
  warm across the game and reset between games. About 1.3 s per position, ~1–2 minutes per game.
  Re-scoring a player afterwards runs on the main thread, linear in their recent games (500 games ≈
  6 ms).
- **Board facts** are read beside each search by playing the game forward on the shared move code,
  at the front of the game where they are defined: whether the side to move is in check
  (`state.local.inCheck`), whether the position occurred before with the same side to move
  (`repetition.isRepeated`), and whether each line's first move lands on a piece or gives check.
- **Refusals:** a position whose pieces are too spread out for the engine is marked `refused`; a
  variant, piece or rule the engine can't play makes the whole game `unsupported`; a crash, or a
  search past 30 s per position, records `failed` (logged to errLog). None of these produce
  evidence.

## Evidence per move (`moveEvidence.ts`)

A move is judged against the lines searched in the position **before** it:

- **Outcome** (moves compared exactly, promotion piece included): `top` if it is the first line;
  `good` if it is within **2% win probability** of the best line; else `miss`. Win probability uses
  the same curve as Game Review (`winchance.ts`, mate = 1800 cp). A move outside the five lines is
  valued from the search of the position **after** it, capped below the last line (the search ranked
  it below all of them).
- **Difficulty**, the inputs to both models:
    - `goodMoves`: how many of the five lines are good (1, 2, 3–4, 5).
    - `shallowFinds`: whether the depth-3 search's top move was already good.
    - `deepFind`: whether the final best move only settled at depth 7 or deeper.
    - `bestCaptures`: whether the best move lands on a piece.
    - `forcingGoodMove`: whether any good move captures or gives check.
    - `inCheck`: whether the side to move is in check.
    - `opponentBlunder`: the win probability the opponent's last move threw away, by the searches
      either side of it (its square root is the model input).
    - `imbalance`: how far the best line is from even, 0 to 1.
- **Left out:** each game's first 4 plies (`OPENING_PLIES`: memorized openings, see Calibration),
  forced moves (one legal move), repeated positions, positions already decided (best line above 97%
  for either side), refused positions, and moves whose position-after can't be read.

## Interaction evidence

Collected in rated games only, the only ones judged. Every player is a signed-in member.

### Analysis matches

- **Reported:** the analysis page reports each **display episode**: an unbroken stretch of its
  engine panel's lines showing for one position (freshly computed, cached, or seeded by Game
  Review), ended by viewing another position, the lines clearing, the engine switching off, or the
  page being hidden or going away. A position is named by its **key**: a 64-bit hash of the side to
  move and each piece's type and square, nothing else (no special rights, move history or
  gamerules), so an editor-built copy matches. An episode is sent as it starts, still open, and
  again once it ends, in batches at most every 2 s, each as how long ago it began and ended (client
  clocks are never trusted, only differences). Positions too large to be any rated game aren't
  keyed.
- **Matched:** every live rated game records each position's key and when it was reached. An episode
  matches if it was on screen at any moment the game stood at that position, on either player's
  turn, however early it began: a position set up a move ahead counts once the game gets there. One
  over before the game arrived, or begun after it left, counts for nothing.
- **Tied to a player** by the analysing request: their **account** (logged in), else their
  **browser** (browser-id), else their **network**: any of their sessions' last IPs (IPv4 exact,
  IPv6 /64). A network match is **shared** if the opponent's sessions are on that network too: then
  it may have been them. Reports tied to neither player are ignored: both players know every
  position, and strangers analyse popular games.
- **Scored:** an account or browser match multiplies its game by its ply's weight, the inverse of
  how often a player's own earlier games pass through their position at that ply (×1 at ply 0, ×40
  at 10, ×1,130 at 19, capped at ×20,000 from 27; see Analysis-match weights). Only a game's
  strongest counts. A late one opens a case by itself, even through a game played like a human.
  Network-only matches count only on a position that would open a case by weight, and only by their
  **density** across the scoring run: ×5 per matched game, ×0.56 per unmatched one, floored at ×1
  per run. About five in a row open a case; sparse ones count nothing. Shared ones are stored, not
  counted.

### Away time

Every move carries how long the game page was unfocused or hidden since the player's previous move,
during the opponent's turn and then their own, and how long before the move they last came back
(none if they moved while away, by premove). The tells to test: own-turn time away, an engine found
the move; returning just before moving; opponent-turn time away, pondering the expected position.
Stored raw by ply, and **not yet scored**: honest players look away too, especially while waiting,
so its weight waits for the refit.

## The betting score (`bettingScore.ts`)

Per scored move, the likelihood ratio of its outcome under two hypotheses:

- **Engine user:** takes the engine's move on a fraction _f_ of moves, playing like the honest
  ceiling player otherwise. How often an engine move looks `good` or `top` to the detector comes
  from the **engine model** (two logistic regressions over the difficulty inputs), fitted on how
  this detector judges a _different_ Apeiron search's picks (see Calibration).
- **Honest at the ceiling:** the **honest model** (a logistic regression of P(good) over the same
  inputs, fitted on prod's rated games) shifted up by the player's **skill ceiling**, plus honest
  P(top | good) by good-move count with a 0.05 margin.

Each outcome's ratio is P(engine) / P(honest). Four bets run at once, _f_ = 10%, 25%, 50% and 100%;
the score is their average. Two rules keep the bet valid (each move's expected ratio ≤ 1 for any
honest player at or below the ceiling; `bettingScore.unit.test.ts` checks every kind of position):

1. A move only counts where an engine user finds a good move **more often** than the ceiling player.
   Elsewhere a miss would count as engine evidence against weaker honest players.
2. `top` is told apart from other good moves only where the engine favours the first line more than
   honest players do; otherwise just good vs miss is judged.

**The skill ceiling** is per game, from the rating and deviation the player held **going into that
game**: `0.01 + 0.22 × (rating + 2·RD − 1500) / 300 + 0.51`, in logits added to the honest model.
Rating + 2·RD is the top of the rating's plausible range, so a provisional account gets the benefit
of the doubt and an established one is held to its rating. The margin (0.51) covers the largest
amount any honest regular out-played their rating's prediction (see Calibration).

**The score now** is the best over every run of the player's games that ends with their latest,
assessed in the last **6 months**, in the order they were assessed (`bestRunLogScore`). Earlier
honest games can't drag it down (a player who switches to an engine is scored from when they
switched), and slow evidence keeps building over long runs. A case opens when it reaches **1,000**
(`CASE_LOG_SCORE`), unless one is already open. It has no guaranteed false-case bound; the rate is
measured (see the case line).

**Interaction terms** add to a game's log score beside its moves, outside the four bets: an account
or browser match's log weight, and over the run, the network matches' density term. Both are at
least 0, so interaction data never lowers a score. A game the engine couldn't analyse still counts
its interaction data.

## Storage

- **`cheat_assessments`** `(game_id, user_id)`: `outcome` (`queued`, `analysed`, `unsupported`,
  `failed`), `updated_at` (when queued, then when assessed) and, when analysed, that player's
  evidence as JSON. Game ids are random, so everything orders by `updated_at`, whose indexes keep a
  player's window and the startup queue to range reads. Scores are never stored: they are derived
  from these rows whenever a player is reviewed, so retuning the model or the line re-scores
  everyone.
- **`cheat_interactions`** `(game_id, user_id)`: the player's interaction data from the game, raw
  (`Interaction`: away times by ply, every analysis match with its ply and link), written with its
  assessment row in one transaction. Kept **permanently**: it can't be re-derived, and the refit
  needs every season of it. At most about two-thirds the size of the game's ICN, for a player away
  on every move.
- **`live_player_games.interaction`**: the same while the game is live, so a restart keeps it.
- **`cheat_cases`** `(user_id)`: one row per player with an open case, and when it opened. While it
  is open the player isn't re-scored, but their games are still analysed and stored, so the evidence
  keeps accumulating; a future review page should derive its view from those rows.

Only the last 6 months ever count, but nothing is pruned yet: the review page's session prunes move
evidence past that, keeping a case's rows while it's open. The game's ICN re-derives it with the
same engine build.

Move evidence is server-side: the server's own record of validated moves and clocks. Interaction
data crosses the trust boundary (validated in `serverbound.ts` and `analysisReportAPI.ts`) and is
stored as reported; scoring derives everything from it.

## When a case opens

Nothing notifies anyone, and no review page or dismissal exists yet: a case is its `cheat_cases`
row. Its evidence is the player's assessed rows in `cheat_assessments` from the last 6 months,
oldest first by `updated_at`. Each row's `evidence` lists their scored moves by `ply`, with the
`outcome` and the position's `difficulty`; the tells are hard positions (one or two good moves, none
forcing or found by a shallow search) and refutations of the opponent's blunders, answered `top` or
`good`. Its `cheat_interactions` rows show any analysis matches by ply: a case may stand on those
alone, its moves looking human. The game's page is `/game/` + its id in base62 (`gameurl.ts`).
Deleting the `cheat_cases` row does not dismiss the case: the player's next assessed game re-scores
the same evidence, which almost surely reopens it.

## Calibration

All measured on a prod snapshot of 2026-10-20 with the scripts in `scripts/cheatdetection/` (see
Reproducing): its 692 unaborted rated games of any length, the kind production scores (all
engine-supported), less rating abusers' (575).

### The honest baseline

- Prod served an older engine while these games were played. It was not yet stronger than the very
  best humans, but stronger than nearly all, so the baseline may hold a few real cheaters. That can
  only make the detector more conservative, never cause false cases. The top honest scorers were
  inspected by hand; all looked like strong honest players (high good-move rates, but no hard-move
  or engine-choice signature).
- **Rating abusers' games are dropped:** every game of an account deleted for rating abuse. A farmed
  rating corrupts the skill ceiling, whose margin covers a single player: a feeder's pushed-down
  rating makes their real games look far stronger than it predicts. The whole account goes, clean
  history included, so no case needs judgement; a long clean history can be recovered by hand.
- **Unrated games are excluded.** Unrated play was 0.18 logit weaker than rated (0.07 for the 29
  players with both, within noise), so mixing it in could make honest rated play look strong and
  inflate false cases. The detector only judges rated games.
- **Rating deviation** isn't stored by prod. `reconstruct-rd.ts` replays every rated game through
  the site's Glicko-1 code; it reproduces all 1,384 stored rating changes within 0.001.

### Simulation, and what it can't show

Cheaters are simulated from real games: on chosen moves of one player, the cheater engine's choice
replaces theirs **in the same position**, judged by production's `moveEvidence`. A choice outside
the detector's lines is valued from an off-line search of the position after it, the rule production
applies. Consequences:

- Positions after a swap are still the real game's, so no simulated game is one legal whole game.
- Game lengths are the real ones: a player who resigned early leaves a short cheated game.
- Ratings stay honest; a real cheater's would climb, weakening their later games slightly.
- Think times are the players' real ones.
- Only these styles, this engine and these settings were simulated. A cheater using the engine in a
  pattern none of them resemble, or a much stronger engine setup, may score differently.

### The detector's node budget

Lichess's detection searches 300,000 nodes per position (`autoHunter` in lila's fishnet). On 590
positions, each move judged at 300k, 1M and 2.5M nodes, the information separating a cheater
engine's picks from honest moves (KL divergence of their top/good/miss outcomes: how fast a
cheater's score grows) is 0.33, 0.41 and 0.45 nats per move: gains of +0.08 (90% interval +0.02 to
+0.15) and +0.12 (+0.05 to +0.19). Samples of ~600 positions vary: another put the 2.5M gain at
+0.03. A bigger budget is untested end to end (fresh passes and a refit); 1M takes ~3× the time per
position. Caveat: measured against an 800k-node cheater engine; re-test if real cheaters prove to
use much stronger setups.

### Lines searched

One line instead of five raised every score, honest ones too (highest honest 270). At equal
false-case rates five lines catch more of every style but rescue: full engine by 3 games 72% vs 56%.
Four and six lines lose too: at the lines matching five lines' worst case (~1,000 and ~1,700), full
engine by 5 games 70% and under 73% vs 83%, though the good-move grouping was designed at five
lines: four folds "all good" into 3–4, six merges 5 with 6.

### The opening

Each game's first 4 plies are left out. The engine analyses an opening position the same way every
game, and players repeat their openings, the engine's choices included, so those moves aren't the
independent draws the bet assumes: a memorized engine-approved opening gains the same evidence every
game. Early moves also inflated the skill ceiling's margin (0.64 vs 0.51), so leaving them out is
both safer and faster (full engine by 3 games 36% vs 29%). Four plies covers where repeats are (a
player's moves in a position they reached before: 34% at plies 0–1, 7% at 2–3, 2% at 4–5); 2, 6, 8
and 10 each leave a heavier honest tail. Rejected: a minimum game length (misses games decided
early), and leaving out only positions a player reached before (misses a repeated plan).

### The other constants

Each was compared by refitting the skill ceiling, then holding both false-case measures
(`false-case-rate.ts`) no higher than the shipped line's.

- `GOOD_LOSS` 1.5% or 2.5%: a full-engine game scores 0.3 nats lower, for no clear gain in safety.
- `SHALLOW_DEPTH` 2 / 4, `DEEP_FIND_DEPTH` 5, 6, 8, 9, `DECIDED_WIN_PROBABILITY` 95% / 99%, and
  forced mates not counted as decided: none catches more at equal safety. `SHALLOW_DEPTH` 2 and
  `DEEP_FIND_DEPTH` 8–9 score a full-engine game higher but thicken the honest tail more.

### The difficulty inputs

An input earns its place by speeding catches at equal safety, not by predicting honest play:
`imbalance` barely helps predict honest moves, yet separates. Each candidate was measured with
`game-scores.ts`, with the skill ceiling refitted for it: the change in each game's log score,
paired game by game, against a full-engine game's 1.65 nats (about ×5) without the three.

| Added              | Full-engine game                | Honest game |
| ------------------ | ------------------------------- | ----------- |
| `forcingGoodMove`  | +0.40                           | −0.01       |
| √`opponentBlunder` | +0.07                           | 0.00        |
| `imbalance`        | +0.16                           | −0.01       |
| **all three**      | **+0.52 (95%: +0.43 to +0.59)** | −0.02       |

The gain holds in every random half of the players (+0.42 to +0.60) and every variant family
(Classical +0.38, CoaIP +0.59, the rest +0.78), and vanishes when the inputs are shuffled across
positions. From the fitted weights: a forcing good move helps honest players more than the engine;
after the opponent's blunder honest players often miss the refutation, the engine doesn't; the
engine converts lopsided positions more reliably. With all inputs in, `deepFind` carries the most
(without it, −0.19), though honest likelihood rates it least. Without `shallowFinds` or
`bestCaptures` a full-engine game scores +0.04 higher, but the honest tail thickens more: at equal
precision both catch slower.

By honest held-out likelihood (`feature-ablation.ts`), rating, top-two gap, recapture available, few
legal moves and time control each add ≤ +0.003: not used. Of all 16 ways to group the good-move
count, 1 | 2 | 3–4 | 5 predicts honest play best: 1 and 5 must each stand alone, while any grouping
of 2–4 scores within 0.0001.

`goodMoves`, `shallowFinds`, `deepFind`, `bestCaptures` and `forcingGoodMove` come from the puzzle
generator's rating (`puzzle_gen.rs`: only-move margin, `shallow_rank`, `depth_to_find`, captures and
checks being easy finds). Tried and not used, by per-game score:

- **The rest of `puzzle_gen`'s per-move difficulty** (find difficulty, visibility cost, travel,
  recaptures, sacrifices, exotic pieces): no gain beside `forcingGoodMove`; several widen the
  ceiling's margin and slow catches. Its whole-line features (fork strength, action span) need a
  solution line the detector doesn't search.
- **Grading misses by size:** looks strong until avoiding blunders gets its own honest ceiling (it
  tracks skill), then ~+0.1 for a second model.
- **Honest P(top | good) over every input:** slower, and honest players' lean spreads.
- **Depth instability** (how often or how late the top move changes) and the best move's settling
  depth: ≤ +0.05, measuring what `deepFind` and `shallowFinds` do. `shallow_rank` itself isn't
  exposed by the engine's WASM API.
- **Top-two gap, legal-move count, nearness to the enemy royal**, interactions with the only-move
  case: not worth an input.

Two rules guard against honest players scoring high. Without leaving out repeated positions and the
"in check" input, a king shuffling under checks makes each repetition a fresh hard find: estimated
precision falls to 99.02%. The betting score's first validity rule fires on only 0.2% of honest
moves, but without it some positions let an honest player at their ceiling expect ×1.87 per move: in
easy positions their misses would count as engine evidence, since the detector judges ~17% of real
engine moves as misses too.

### The engine model, and why catching takes several games

A cheater's engine is not the detector's engine. The simulated cheater searches 800,000 nodes,
MultiPV 3; the detector 300,000 nodes, MultiPV 5. Of the cheater's moves the detector rates ~83%
good but only ~54% its own first line. Infinite chess often has several near-equal moves whose order
reshuffles with depth, so "plays the engine's top move" rarely looks unmistakable. Most of a game is
easy (a strong human finds good moves too) or decided; the tells are the few hard positions per
game. A full-engine game multiplies the score by about 9× (geometric mean over 1,150 games).

### Four bets, not one

Measured at line 1,000. One bet on full engine use alone catches fastest (full engine by 3 games 43%
vs 36%), but honest scores swing with it: the tail of players with 10+ games falls only as
score^-1.01, for 91.5% estimated precision against the four bets' 99.95%. Even at 30,000 it reaches
only 99.70%, and catches 26%. Bets on {0.5, 1} reach 98.1%; twenty evenly spaced fractions, close to
a continuous mixture, reach 99.90% and catch 32%.

### The skill ceiling

- A flat ceiling must cover the strongest honest player: the strongest regular is 0.70 ± 0.10 logit
  above the population. With a flat 0.5, an honest regular reaches 105 (the tail of players with 10+
  games falls only as score^-0.54); with a flat 0.9, one reaches 8.1, for 98.1% estimated precision.
- Rating does carry skill (+0.22 logit per 300 rating, measured against the ratings regulars played
  at), with honest players scattering ±0.26 around that line; the most any regular out-plays it is
  +0.38 ± 0.12. Following it is safer than a flat ceiling (highest honest score 5.8) and catches
  established accounts at ordinary ratings faster (1700 ± 60: 57% vs 49% within 3 games), though a
  new account's generous ceiling makes it slower there (39% vs 49%).
- It follows the rating **going into each game**, not the player's current or oldest rating: an
  improving honest player is judged against their improvement, and a cheated game played before the
  rating inflated keeps its full weight.
- The 0.05 top-rate margin covers the most any regular favours the first line (+0.040 ± 0.031; the
  spread matches noise). 0.08 is safer still (99.99%) but slows catches (full engine by 3 games
  34%).
- Past the ceiling, false cases climb fast. Simulated honest players rated 1500 ± 100, playing above
  their ceiling by 0 / 0.1 / 0.2 logit, reach the line within 40 games 0.27% / 1.6% / 8.5% of the
  time, within 100 games 0.76% / 6.1% / 38%. The regular closest to their ceiling sits 0.39 logit
  below it (about 530 rating points of skill), and Glicko moves an established rating only ~5 points
  a game.

### Scoring over a window

A fixed window summing the last 40 games let an honest history drag the score: a full-engine cheater
after one was caught within 10 cheated games only 23% of the time. A 10-game window caught 100% but
let no slow evidence build. The best run did both (100%; partial 40% within 20 games, 23% vs 15%),
with honest peaks unchanged (measured at an earlier line of 2,500 on 4–19 players per scenario: the
direction is the result). At line 1,000, a full-engine cheater after an honest first half is caught
within 3 / 5 / 10 cheated games 56% / 88% / 100% of the time (16 players).

Capping how far back a run may start (40 or 100 games) changes nothing: honest false cases come from
short lucky streaks (median 5 games), not long runs. The 6-month cap follows Lichess.

### The case line

Honest players' highest scores fall off as score^-1.94 (score^-1.82 for the 22 players with 10+
games); the highest honest score is 5.8. Two measures of false cases:

- **Estimated precision**, assuming 1% of players cheat and counting cheaters the detector
  eventually catches. It extrapolates the tail of players with 10+ games past the highest honest
  score (the fitted 0.04%-per-player line is ~19 over all players, 90% interval 9–40), and that tail
  rests on few players: one at its threshold moves the rate ~4×.
- **The worst case:** simulated honest players rated 1500 ± 100 playing exactly at their ceiling,
  reaching the line within 40 / 100 games.

| Line      | Estimated precision | Worst case        | Full engine by 1 / 3 / 5 / 10 games | Every other game by 5 / 20 |
| --------- | ------------------- | ----------------- | ----------------------------------- | -------------------------- |
| 500       | 99.82%              | 0.57% / 1.57%     | 4% / 39% / 69% / 100%               | 26% / 79%                  |
| 750       | 99.92%              | 0.38% / 1.03%     | 3% / 38% / 69% / 100%               | 21% / 79%                  |
| **1,000** | **99.95%**          | **0.27% / 0.76%** | **3% / 36% / 69% / 100%**           | **21% / 79%**              |
| 1,250     | 99.97%              | 0.22% / 0.59%     | 3% / 32% / 69% / 100%               | 19% / 71%                  |
| 1,500     | 99.98%              | 0.21% / 0.50%     | 3% / 32% / 69% / 100%               | 19% / 64%                  |
| 2,000     | 99.99%              | 0.16% / 0.39%     | 2% / 31% / 69% / 100%               | 17% / 50%                  |
| 2,500     | 99.99%              | 0.13% / 0.31%     | 2% / 26% / 69% / 95%                | 17% / 50%                  |

1,000 keeps estimated precision about twenty times inside the 99% target, a margin its thin tail
needs. The worst case is a stress test, not a target: no regular plays at their ceiling. It is one
constant to move if dismissed cases show it wrong.

There is no guaranteed bound beneath it. A score counted from one fixed game would reach 1,000 with
chance at most 1/1,000 for an honest player at their ceiling, but the best run adds a starting point
each game, so the worst case grows with games played. Real honest players sit below their ceiling,
but the snapshot has few with more than ~40 rated games (the most, 79), so heavy players are where
the estimate is least certain. Weighting each start by 1/(j(j+1)) would restore the bound, but was
rejected: it cuts how often a full-engine cheater after an honest history is caught within 3 cheated
games by about three-quarters.

### Catch rates (line 1,000)

Simulated on the real players' rated games, share caught within N games (players simulated):

| Style                                                      | 1        | 3        | 5        | 10        | 20        |
| ---------------------------------------------------------- | -------- | -------- | -------- | --------- | --------- |
| Full engine                                                | 3% (315) | 36% (77) | 69% (42) | 100% (22) | 100% (14) |
| Full engine every other game, honest in between            | 3%       | 10%      | 21%      | 41%       | 79%       |
| Rescue (engine only where about to blunder, half the time) | 0%       | 0%       | 0%       | 14%       | 36%       |
| Level-6 bot every move                                     | 0%       | 0%       | 0%       | 9%        | 29%       |
| Partial 40%                                                | 0%       | 0%       | 0%       | 0%        | 7%        |
| Two critical moves per game / partial 20% / 2nd–3rd choice | 0%       | 0%       | 0%       | 0%        | 0%        |

These count from a player's first rated games, played at the default rating with a wide deviation.
By account, a full-engine cheater winning every game against opponents of their own rating (RD 80),
their rating evolved by the site's Glicko code (`account-odds.ts`, 4,000 cheaters each):

| Account               | 3   | 5   | 7   | 10   | 15   | 20   |
| --------------------- | --- | --- | --- | ---- | ---- | ---- |
| New (1500 ± 350)      | 39% | 71% | 87% | 97%  | 100% | 100% |
| Established 1700 ± 60 | 57% | 87% | 96% | 100% | 100% | 100% |
| Established 2200 ± 60 | 32% | 64% | 84% | 96%  | 100% | 100% |
| Established 2500 ± 60 | 18% | 43% | 67% | 87%  | 98%  | 100% |
| Established 2800 ± 60 | 8%  | 24% | 44% | 69%  | 92%  | 98%  |
| Established 3100 ± 60 | 3%  | 10% | 22% | 44%  | 74%  | 90%  |

A higher rating's ceiling leaves less room above it; above ~2000 these rows are extrapolated (see
Known holes). Prod's highest rating is 2406; winning every game against 2000-rated opponents takes
28 games to reach 2500 and 645 to reach 2800. Honest games between cheated ones slow a case (10
cheated games among 20: 79%, against 100% for 10 in a row), since a run must span both. Partial
engine use is largely invisible to move analysis alone: a 20–40% engine user looks like a stronger
honest player. Catching them is the job of interaction data.

The site's limited bot levels (1–7; 8 is full strength) are built to play like humans of their
level, so copying one looks the same; they aren't modelled, since their tuning changes. Level 6
plays its best move only about half the time, else one of 10 candidates at a mean loss of ~2.4% win
probability (past the 2% good-move line), and favours moves a shallow search already likes
(Apeiron's `search/skill.rs`, as tuned when measured).

### Analysis-match weights

A match's weight bounds how often an honest player's analysis coincides with their live position:
reviewing an old game, or exploring, while their game passes through the same position. Replaying
the 2026-10-20 snapshot (the 6,752 games of rated players, and all 60,895 games on the site), the
share of rated positions already reached in the player's own earlier games:

| Plies | 0–1 | 2–3 | 4–5 | 6–7 | 8–9  | 10–11 | 12–15 | 16–19 | 20+             |
| ----- | --- | --- | --- | --- | ---- | ----- | ----- | ----- | --------------- |
| Share | 62% | 22% | 6%  | 3%  | 1.9% | 0.7%  | 0.42% | 0.12% | none of ~59,000 |

Own history dominates: players repeat their lines and review their own games, so a late position
seen in 1–3 other games on the site is usually theirs. The weight is the inverse of e^(−0.37·ply), a
line over these bins from 100% at the start position, where the analysis page opens, so a match
there proves nothing; capped at the most the sample backs (3 in ~59,000, the rule of three). It
assumes the honest player is always reviewing an old game at that moment, so it's pessimistic. 71%
of rated games are still live past ply 19, 64% past 27. The 64-bit key collided nowhere in 2.53
million positions of every site game; its 32-bit half collided at a random hash's rate.

The network rates (a cheater's games 50%, an honest household's 10%) are guesses, the honest one
deliberately high: too rare an event at our traffic to measure soon.

### Rejected or deferred

- **Lichess's rule-based flags:** its accuracy flag (ACPL under 15–25) fires on 11.5% of honest
  games here (decided positions make every move look accurate); "no fast moves" holds for 94%. Not
  used.
- **Think times (deferred):** honest games trip Lichess's flat-time flag ~1% of the time, never
  twice for one player. Its cheater side is unmeasured, so whether it adds catches waits for
  confirmed cheaters: a refit step. Nothing new to collect: clocks are stored. A fast move is no
  proof of honesty: a cheater can play the engine's predicted reply instantly. As an honest-model
  input, think time slows catches.
- **Time control:** adds nothing measurable to the honest model, but three-fifths of rated games are
  10+6, so this is untested for very fast or slow games.
- **Other interaction signals:** whether anyone else on the network watched the game (anyone in the
  house can see the screen; density already judges a household); matches in engine games (a live
  player can't start a second game as themselves); near-copies of a position (exact keys can't beat
  a deliberate dodge; move analysis covers it); hold time (a bot tell); mouse movement (can't tell
  thinking from looking at another device); disabling the engine during games, or delaying the
  spectator feed (client-side or bypassable).

## Compared with Lichess

Lichess runs server-side Stockfish move analysis (accuracy flags, plus its Irwin and Kaladin
models), one blur bit per move, move-time flags, and a same-browser check: the game tab reports an
analysis tab showing its live position after ply 14 (`cevalSub.ts`). Ours replaces the flags and
models with one betting score, matches analysis server-side across browsers and devices by login or
network, weighted by ply, and records how long the page was away and when the player came back, not
one bit.

## Known holes and assumptions

- **Partial engine use** (under ~40% of moves) mostly goes uncaught by move analysis alone.
- **Very active players:** an honest player's chance of a false case grows with games played, and
  the snapshot has few past ~40 rated games (see the case line). Watch dismissed cases for them.
- **New accounts** get a generous ceiling (rating + 2·RD at 1500 ± 350 ≈ 2200), so a new account
  cheating from its first game is caught more slowly. This is honest uncertainty, not an artifact.
- **High ratings:** the ceiling follows the rating-to-skill line with no cap, extrapolated past the
  regulars it was fitted on (up to ~2000). A cheater who inflates their rating gains room (catch
  rates by account), and if top players' skill grows faster per rating point than the line, their
  ceiling is tighter than it looks.
- **Fast improvers** play above their ceiling until Glicko catches up, where false cases climb fast
  (the skill ceiling). A case on a well-known player soon after a jump in results deserves that
  suspicion.
- **The honest model's validity rests on prod's 2026 players.** If honest play shifts (players
  improving with engine-assisted analysis), refit; ratings rising with skill partly absorb it.
- **Engine upgrades:** the engine model describes how this engine's picks look to this engine's
  analysis. Re-run the passes and refit after a meaningful strength change; any change to `SEARCH`
  invalidates the whole calibration. It ran on a local build of upstream `b928c46`.
- **What interaction data can't see:** an engine on another device off the player's network, an
  external engine, a modified client, or an analysis-page copy with an irrelevant change. Move
  analysis alone catches those.
- **Late reports:** a report arriving after the game left memory (both players left) is lost, and
  one after it finalized is kept only in memory, so a position set up a move ahead and left on
  screen, untouched, until then is missed. A restart forgets the positions before it, so analysis
  shown while the server was down matches nothing.

## Future work

- **A case review page:** derive the evidence live from `cheat_assessments` and `cheat_interactions`
  (the run of games, the most telling moves and matches, the score at opening beside the score now,
  think times from the stored clock stamps), with close and dismiss actions. Dismissing should stop
  that evidence counting toward future cases.
- **Measure real precision** from your verdicts and retune the case line from them.

## Refitting the interaction weights

Collection ships with the redesign update. Once a few months of it are in, refit everything
collected, in this order. Interaction data is permanent, so nothing forces the date, but move
evidence is pruned past 6 months once the case-review page lands: replaying older games then needs
theirs re-derived by the research passes.

1. **Measure each method's honest side from the data, never guess it:** away time (how often honest
   players are away, for how long, and how fast they move after returning, plus Lichess's test: how
   well each player plays on away moves against their own focused ones, which needs no rating), the
   network-match rate (replacing `NETWORK_MATCH_RATES.honest`), the match curve's repeat rates with
   more games (its cap rises with the sample), and think times against confirmed cheaters. A cheater
   side may be an educated guess: it only sets how fast cases open.
2. **No weight stronger than the honest sample backs:** a rare behaviour needs many games before
   honest players can be said to almost never do it (zero in N bounds the rate at about 3/N).
3. **One-sided terms only:** every interaction term ≥ ×1, so clean or absent data never lowers a
   score. Leave the move analysis's constants alone.
4. **Refit in rounds, never assuming everyone without a case is honest:** cheaters hiding in the
   honest sample make the most damning methods look honest. Fit, then re-score everyone by replaying
   each player's history from the start of collection game by game, as production would have, which
   opens the cases it would have opened. The owner judges them; confirmed cheaters leave the honest
   sample; refit. Repeat until a round confirms none.
5. **Keep false cases under 1% of cases,** measured as the Calibration section does.

There may be no confirmed cheaters by then; the honest side alone keeps honest players safe.

## Reproducing and retuning

Research tools live in `scripts/cheatdetection/` (runtime code never imports them). They read a copy
of prod's database passed as `--snapshot=<path>` (never committed) and write to a gitignored data
directory (`--data`, default `sandbox/cheatdetection`). In order:

```
npx tsx scripts/cheatdetection/reconstruct-rd.ts --snapshot=<db>
npx tsx scripts/cheatdetection/engine-pass.ts detector --snapshot=<db> --shards=11         # production worker, ~3 h
npx tsx scripts/cheatdetection/engine-pass.ts cheater --snapshot=<db> --shards=11          # ~6 h
npx tsx scripts/cheatdetection/engine-pass.ts level6 --snapshot=<db> --shards=1            # time-limited: keep the machine quiet
npx tsx scripts/cheatdetection/build-corpus.ts --snapshot=<db> --all-lines
npx tsx scripts/cheatdetection/engine-pass.ts offline --snapshot=<db> --shards=11          # then re-run build-corpus until 0 pending
npx tsx scripts/cheatdetection/evaluate.ts                                                 # honest peaks and catch rates
npx tsx scripts/cheatdetection/false-case-rate.ts                                          # honest players' tail, and the worst case
npx tsx scripts/cheatdetection/honest-margins.ts                                           # skill ceiling and top margin
npx tsx scripts/cheatdetection/fit-model.ts                                                # prints MODEL for bettingScore.ts
```

The Calibration section's other figures: `feature-ablation.ts` (honest likelihood per input),
`account-odds.ts` (catch rates by account), `false-case-rate.ts --above=0.1` (honest players past
their ceiling), `node-budget.ts` (~1 h with `--shards=11`), `think-times.ts`, and
`inspect-player.ts <userId>` to vet an outlier. Judge a change to the inputs or scoring with
`game-scores.ts`: save each version's per-game scores (refit the ceiling for each first), then
compare them; catch-rate tables move in whole players and hide smaller gains. `worker-parity.ts`
must print `identical` before offline-pass values are trusted. Every pass resumes from its saved
output. Experiments vary `--ceiling=base,perRating,margin`, `--fractions=…`, `--top-margin=…`,
`--case-line=…` and `--multipv=…` (fresh detector and offline passes, in their own `--data`) without
editing code. After changing any constant in `bettingScore.ts`, run `bettingScore.unit.test.ts`: it
fails if any move could be expected to raise an honest player's score, or interaction data could
lower one.
