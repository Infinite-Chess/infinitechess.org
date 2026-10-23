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
if they are an honest player as strong as their rating plausibly allows. When that score reaches
**1,000**, a case opens. Measured on prod's honest players, about 99% of cases should be real.

## Constraints

The owner's standing requirements; any change must keep them.

- **Complexity:** Lichess's level. A new detection method needs evidence of incremental value: that
  it moderately raises catch rates or cuts false cases beyond the existing methods. One that catches
  the cheaters others already catch adds nothing.
- **Precision:** at least 95% of cases real, 99% preferred unless it costs considerably more missed
  cheaters. Prevalence is assumed 1%; revise it from real cases.
- **Compute:** one thread, the WASM build (a native binary measured only ~1.2× faster), within 400
  rated games a day (real volume is dozens). Argue for more only if it would catch moderately more
  cheaters.

## The pipeline

```
gameLifecycle.finalize ─▶ cheatDetection.onFinalized ─▶ queue (one game at a time)
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
| `bettingScore.ts`                      | Evidence → likelihood ratios → a player's score; holds the fitted model, the case line and the evidence age. Pure. |
| `cheatDetectionTypes.ts`               | Shared shapes: position analyses, worker messages, search settings.                                                |

Database: `cheatAssessmentsManager.ts` (`cheat_assessments`) and `cheatCasesManager.ts`
(`cheat_cases`). `shared/chess/util/winchance.ts` holds the cp → win-probability curve shared with
the client's eval gauge and Game Review. `shared/chess/logic/repetition.ts`'s `isRepeated` is the
threefold-repetition walk with a limit of one.

## How a game is analysed

- **Which games:** rated, finalized, logged, and not aborted (`onFinalized`). Each is queued as a
  `queued` row per player, so the queue survives restarts: startup re-queues those rows in the order
  their games finished, and a game cut off mid-analysis is redone. Games from before detection
  shipped never queue. A game whose assessment throws is marked `failed` and not retried, unless the
  engine can't load at all: then assessment pauses and every game stays queued for the next start.
- **The search:** every position, MultiPV 5, 300,000 nodes, single thread, transposition table kept
  warm across the game and reset between games. About 1.3 s per position, ~1–2 minutes per game.
  Re-scoring a player afterwards runs on the main thread, linear in their recent games (500 games ≈
  6 ms).
- **Board facts** are read beside each search by playing the game forward on the shared move code,
  at the front of the game where they are defined: whether the side to move is in check
  (`state.local.inCheck`), whether the position occurred before with the same side to move
  (`repetition.isRepeated`), and whether each line's first move lands on a piece.
- **Refusals:** a position whose pieces are too spread out for the engine is marked `refused`; a
  variant, piece or rule the engine can't play makes the whole game `unsupported`; a crash, or a
  search past 30 s per position, records `failed` (logged to errLog). None of these produce
  evidence.

## Evidence per move (`moveEvidence.ts`)

A move is judged against the lines searched in the position **before** it:

- **Outcome:** `top` if it is the first line; `good` if it is within **2% win probability** of the
  best line; else `miss`. Win probability uses the same curve as Game Review (`winchance.ts`, mate =
  1800 cp). A move outside the five lines is valued from the search of the position **after** it,
  capped below the last line (the search ranked it below all of them).
- **Difficulty**, the inputs to both models:
    - `goodMoves`: how many of the five lines are good (1, 2, 3–4, 5).
    - `shallowFinds`: whether the depth-3 search's top move was already good.
    - `deepFind`: whether the final best move only settled at depth 7 or deeper.
    - `bestCaptures`: whether the best move lands on a piece.
    - `inCheck`: whether the side to move is in check.
- **Left out:** forced moves (one legal move), repeated positions, positions already decided (best
  line above 97% for either side), refused positions, and moves whose position-after can't be read.

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
game**: `0.03 + 0.22 × (rating + 2·RD − 1500) / 300 + 0.55`, in logits added to the honest model.
Rating + 2·RD is the top of the rating's plausible range, so a provisional account gets the benefit
of the doubt and an established one is held to its rating. The margin (0.55) covers the largest
amount any honest regular out-played their rating's prediction (see Calibration).

**The score now** is the best over every run of the player's games that ends with their latest,
assessed in the last **6 months**, in the order they were assessed (`bestRunLogScore`). Earlier
honest games can't drag it down (a player who switches to an engine is scored from when they
switched), and slow evidence keeps building over long runs. A case opens when it reaches **1,000**
(`CASE_LOG_SCORE`), unless one is already open. It has no guaranteed false-case bound; the rate is
measured (see the case line).

## Storage

- **`cheat_assessments`** `(game_id, user_id)`: `outcome` (`queued`, `analysed`, `unsupported`,
  `failed`), `updated_at` (when queued, then when assessed) and, when analysed, that player's
  evidence as JSON. Game ids are random, so everything orders by `updated_at`, whose indexes keep a
  player's window and the startup queue to range reads. Scores are never stored: they are derived
  from these rows whenever a player is reviewed, so retuning the model or the line re-scores
  everyone.
- **`cheat_cases`** `(user_id)`: one row per player with an open case, and when it opened. While it
  is open the player isn't re-scored, but their games are still analysed and stored, so the evidence
  keeps accumulating; a future review page should derive its view from those rows.

Only the last 6 months of assessments ever count, but older rows are not pruned yet: the review
page's session should decide how long a dismissed or closed case's evidence is kept.

Every input is server-side: the server's own record of validated moves and clocks. Nothing comes
from the player's client, so there is no trust boundary to validate.

## When a case opens

Nothing notifies anyone, and no review page or dismissal exists yet: a case is its `cheat_cases`
row. Its evidence is the player's `analysed` rows in `cheat_assessments` from the last 6 months,
oldest first by `updated_at`. Each row's `evidence` lists their scored moves by `ply`, with the
`outcome` and the position's `difficulty`; the tells are hard positions (one or two good moves, none
found by a shallow search) answered `top` or `good`. The game's page is `/game/` + its id in base62
(`gameurl.ts`). Deleting the `cheat_cases` row does not dismiss the case: the player's next analysed
game re-scores the same evidence, which almost surely reopens it.

## Calibration

All measured on a prod snapshot of 2026-10-20 (718 rated games; 519 timed, unaborted and 16+ plies,
of which 517 the engine supports) with the scripts in `scripts/cheatdetection/` (see Reproducing).

### The honest baseline

- Prod served an older engine while these games were played. It was not yet stronger than the very
  best humans, but stronger than nearly all, so the baseline may hold a few real cheaters. That can
  only make the detector more conservative, never cause false cases. The top honest scorers were
  inspected by hand; all looked like strong honest players (high good-move rates, but no hard-move
  or engine-choice signature).
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
- Ratings stay honest; a real cheater's would climb, weakening their later games slightly.
- Think times are the players' real ones.
- Only these styles, this engine and these settings were simulated. A cheater using the engine in a
  pattern none of them resemble, or a much stronger engine setup, may score differently.

### The detector's node budget

Lichess's detection searches 300,000 nodes per position (`autoHunter` in lila's fishnet). On 592
positions, each move judged at 300k, 1M and 2.5M nodes, the information separating a cheater
engine's picks from honest moves (KL divergence of their top/good/miss outcomes: how fast a
cheater's score grows) was 0.35, 0.42 and 0.38 nats per move. Both gains are within noise (+0.06,
90% interval −0.01 to +0.13; +0.03, −0.04 to +0.10), and the deepest budget isn't the best. Caveat:
measured against an 800k-node cheater engine; re-test if real cheaters prove to use much stronger
setups.

### Lines searched

One line instead of five raised every score, honest ones too (highest honest 270). At equal
false-case rates five lines catch more of every style but rescue: full engine by 3 games 72% vs 56%,
or 41% vs 32% at the shipped rate. Four or six lines are untested.

### The good-move line

`GOOD_LOSS` is compared by refitting the skill ceiling, then holding both false-case measures
(`false-case-rate.ts`) no higher than the shipped line's. 1.5% thins the honest players' tail, but
at the worst case's line (1,000) it catches fewer: full engine by 3 games 31% vs 41%. 2.5% needs a
line of 1,500 for its worst case, and catches 37%.

### What the honest model uses

Change in held-out log likelihood per move (5 folds by player), dropping each input in turn, or
adding each candidate:

| Input                                                                  | Change                               |
| ---------------------------------------------------------------------- | ------------------------------------ |
| good-move count                                                        | −0.029 (1), −0.013 (2), −0.011 (3–4) |
| in check                                                               | −0.021                               |
| best move captures                                                     | −0.021                               |
| shallow search finds a good move                                       | −0.010                               |
| deep find (depth 7+)                                                   | −0.003                               |
| added: rating                                                          | +0.003: not used                     |
| added: recapture available, top-two gap, few legal moves, time control | ≤ +0.001 each: not used              |

Of all 16 ways to group the good-move count, 1 | 2 | 3–4 | 5 scores best: 1 and 5 must each stand
alone (merging either costs ≥ 0.003), while any grouping of 2–4 scores within 0.0001.

The difficulty ideas come from the puzzle generator's rating (`puzzle_gen.rs`: `depth_to_find`,
`shallow_rank`, only-move margin, captures being easy finds). Its heavier board features (fork
strength, calculation load, piece exoticness) were not ported: the simple ones carry the signal.

Two rules exist because honest players scored high without them. A king shuffling under checks
scored 68 in one game (each repetition a fresh hard find) until repeated positions were left out and
"in check" added. A weak honest player scored 720 until the betting score's first validity rule: in
easy positions their misses counted as engine evidence, since the detector judges ~20% of real
engine moves as misses too.

### The engine model, and why catching takes several games

A cheater's engine is not the detector's engine. The simulated cheater searches 800,000 nodes,
MultiPV 3; the detector 300,000 nodes, MultiPV 5. Of the cheater's moves the detector rates ~80%
good but only ~50% its own first line. Infinite chess often has several near-equal moves whose order
reshuffles with depth, so "plays the engine's top move" rarely looks unmistakable. Most of a game is
easy (a strong human finds good moves too) or decided; the tells are the few hard positions per
game. A full-engine game multiplies the score by about 10× (geometric mean over 1,038 games).

### Four bets, not one

Measured at line 500. One bet on full engine use alone catches fastest (full engine by 3 games 61%
vs 48%), but honest scores swing with it: the tail of players with 10+ games falls only as
score^-0.91, for ~80% estimated precision against the four bets' 98%. At the line matching their
precision (~8,500) it catches less (37% by 3 games; every other game, 50% by 20 vs 64%). Bets on
{0.5, 1} reach 87%; twenty evenly spaced fractions, close to a continuous mixture, catch the same as
four at 95%.

### The skill ceiling

- A flat ceiling must cover the strongest honest player: the strongest regular was 0.75 ± 0.09 logit
  above the population. With a flat 0.5, an honest regular reached 1,174 (the tail of players with
  10+ games fell only as score^-0.40); with a flat 0.9, one reached 53, for ~87% estimated precision
  at line 500.
- Rating does carry skill (+0.22 logit per 300 rating, measured against the ratings regulars played
  at), with honest players scattering ±0.29 around that line; the most any regular out-played it was
  +0.44 ± 0.11. Following it is both safer than a flat ceiling (highest honest score 13.6) and
  faster on weaker cheaters: one full-engine game multiplies the score ×30 below 1300, ×23 at
  1300–1500, ×9 at 1500–1700, ×7 at 1700–1900 and ×6 above (1,038 games).
- It follows the rating **going into each game**, not the player's current or oldest rating: an
  improving honest player is judged against their improvement, and a cheated game played before the
  rating inflated keeps its full weight.
- The 0.05 top-rate margin covers the most any regular favoured the first line (+0.051 ± 0.029; the
  spread matches noise). 0.08 slowed catches by 2–7 points for no real precision gain.

### Scoring over a window

A fixed window summing the last 40 games let an honest history drag the score: a full-engine cheater
after one was caught within 10 cheated games only 23% of the time. A 10-game window caught 100% but
let no slow evidence build. The best run did both (100%; partial 40% within 20 games, 23% vs 15%),
with honest peaks unchanged (measured at an earlier line of 2,500 on 4–19 players per scenario: the
direction is the result). Shipped, a full-engine cheater after an honest first half is caught within
3 / 10 cheated games 56% / 100% of the time (16 players).

Capping how far back a run may start (40 or 100 games) changes nothing: honest false cases come from
short lucky streaks (median 5 games), not long runs. The 6-month cap follows Lichess.

### The case line

Honest players' highest scores fall off as score^-1.33 (the same for players with 10+ games); the
highest honest score was 13.6.

| Line      | Estimated precision | Full engine caught by 1 / 3 / 5 / 10 games |
| --------- | ------------------- | ------------------------------------------ |
| 100       | 86.3%               | 9% / 68% / 93% / 100%                      |
| 300       | 96.5%               | 5% / 51% / 85% / 100%                      |
| 500       | 98.2%               | 4% / 48% / 83% / 100%                      |
| 750       | 98.9%               | 4% / 47% / 83% / 100%                      |
| **1,000** | **99.3%**           | **3% / 41% / 83% / 100%**                  |
| 2,500     | 99.8%               | 3% / 36% / 78% / 100%                      |
| 10,000    | 99.97%              | 1% / 28% / 58% / 100%                      |

Precision assumes 1% of players cheat and counts cheaters the detector eventually catches. It
extrapolates the tail of players with 10+ games past the highest honest score (the fitted
0.04%-per-player line is ~46 over all players, 90% interval 7–243, ~290 for players with 10+ games),
and rests on 21 such players. 1,000 is the lowest round line at ~99% estimated precision; it is one
constant to raise if dismissed cases show it too low.

There is no guaranteed bound beneath it. A score counted from one fixed game would reach 1,000 with
chance at most 1/1,000 for an honest player at their ceiling, but the best run adds a starting point
each game: at the ceiling it reaches 1,000 for 0.2% of players over 40 games and 0.7% over 100, and
grows with games played. Real honest players sit below their ceiling, but the snapshot has none with
more than ~40 rated games, so heavy players are where the estimate is least certain. Weighting each
start by 1/(j(j+1)) would restore the bound, but was rejected: a full-engine cheater after an honest
history would be caught within 3 / 10 cheated games 13% / 93% of the time, not 56% / 100%.

### Catch rates (line 1,000)

Simulated on the real players' rated games, share caught within N games (players simulated):

| Style                                                      | 1        | 3        | 5        | 10        | 20        |
| ---------------------------------------------------------- | -------- | -------- | -------- | --------- | --------- |
| Full engine                                                | 3% (275) | 41% (75) | 83% (40) | 100% (21) | 100% (14) |
| Full engine every other game, honest in between            | 3%       | 12%      | 30%      | 48%       | 64%       |
| Full engine one game in four, honest in between            | 3%       | 4%       | 15%      | 29%       | 21%       |
| Rescue (engine only where about to blunder, half the time) | 0%       | 0%       | 0%       | 0%        | 21%       |
| Level-6 bot every move                                     | 0%       | 0%       | 0%       | 10%       | 21%       |
| Two critical moves per game                                | 0%       | 0%       | 0%       | 0%        | 7%        |
| Partial 20–40% / 2nd–3rd choice                            | 0%       | 0%       | 0%       | 0%        | 0%        |

These count from a player's first rated games, played at the default rating with a wide deviation,
so they understate how fast an established low-rated cheater is caught (see the skill ceiling's
per-rating multipliers). Honest games between cheated ones slow a case (10 cheated games among 20:
64%, against 100% for 10 in a row), since a run must span both. Partial engine use is largely
invisible to move analysis alone: a 20–40% engine user looks like a stronger honest player. Catching
them is the job of interaction data (below).

The site's limited bot levels (1–7; 8 is full strength) are built to play like humans of their
level, so copying one looks the same; they aren't modelled, since their tuning changes. Level 6
plays its best move only about half the time, else one of 10 candidates at a mean loss of ~2.4% win
probability (past the 2% good-move line), and favours moves a shallow search already likes
(Apeiron's `search/skill.rs`, as tuned when measured).

### Rejected or deferred

- **Lichess's rule-based flags:** its accuracy flag (ACPL under 15–25) fires on 11.5% of honest
  games here (decided positions make every move look accurate); "no fast moves" holds for 94%. Not
  used.
- **Think times:** honest games trip Lichess's flat-time flag ~1% of the time, never twice for one
  player; but under an assumed cheater timing only steady full-engine users trip it (81–100% at a
  spread of ≤ 0.25, ~0% for partial users), and their moves already catch them fastest. Revisit with
  real cases. A fast move is no proof of honesty: a cheater can play the engine's predicted reply
  instantly.
- **Time control:** adds nothing measurable to the honest model, but two-thirds of rated games are
  10+6, so this is untested for very fast or slow games.

## Known holes and assumptions

- **Partial engine use** (under ~40% of moves) mostly goes uncaught by move analysis alone.
- **Very active players:** an honest player's chance of a false case grows with games played, and
  the snapshot has none past ~40 rated games (see the case line). Watch dismissed cases for them.
- **New accounts** get a generous ceiling (rating + 2·RD at 1500 ± 350 ≈ 2200), so a new account
  cheating from its first game is caught more slowly. This is honest uncertainty, not an artifact.
- **The honest model's validity rests on prod's 2026 players.** If honest play shifts (players
  improving with engine-assisted analysis), refit; ratings rising with skill partly absorb it.
- **Engine upgrades:** the engine model describes how this engine's picks look to this engine's
  analysis. Re-run the passes and refit after a meaningful strength change; any change to `SEARCH`
  invalidates the whole calibration. It ran on a local build of upstream `b928c46`.
- **Client-side data** (future interaction signals) may only ever raise suspicion: a cheater
  controls their client, so normal-looking or absent data never clears anyone.

## Future work

- **Interaction data,** to catch partial cheaters and strengthen cases. Collection ships with the
  redesign update, unscored; a few weeks later each signal enters the same score as extra likelihood
  ratios. Their honest side must be measured from that data, never guessed (too low a guess flags
  honest players); their cheater side may be an educated guess, which only sets catch speed.
  Cheaters among the measured games only make it more cautious. Lichess never flags on accuracy
  alone: its rule-based assessment always needs blurs or flat times too.
    - The page hidden or blurred during the player's turn (Lichess flags games where over 90% of
      moves, or 11 of any 12, were blurred), and how well they play on those moves against the rest.
    - The analysis page's live-position matches (below).
    - Submitted data that looks tampered.
    - Hold time (piece held before moving) was rejected: a bot tell, not an engine-assistance one.
- **Live-position matches:** the player's live position (side to move and pieces, translated so a
  shifted copy still matches) analysed elsewhere: on the analysis page (client-reported, so it waits
  with the interaction data) or in an engine game (server-side, ready with the redesign update). A
  match adds no suspicion by itself: it makes the player's next move count as engine-consulted, so a
  miss after it lowers their score. How innocent a match is depends on:
    - **Ply:** the chance one unrelated analysis session coincides is about the share of games
      passing through the position. For rated positions on the most common line, that is 9.6% at ply
      2, 1.5% at 4, 0.1% at 6, 0.03% at 8, and under 0.002% from 12 (692 rated games against the
      42,046 games of their variants), times the few sessions open at once: coincidence is
      negligible from about ply 6.
    - **Who:** the same login, else the same IP (households and schools share one), else nobody
      related. An unrelated match is capped low, so one honest spectator never opens a case; several
      across a run still add up.
    - **Spectators:** with none subscribed, only the two players know the position.
    - **Whose turn:** a match during the opponent's turn also counts toward the player's next move,
      with less weight (pondering: the engine shows their best reply in advance), most when the
      opponent played the move the engine expected.
- **A case review page:** derive the evidence live from `cheat_assessments` (the run of games, the
  most telling moves, the score at opening beside the score now, think times from the stored clock
  stamps), with close and dismiss actions. Dismissing should stop that evidence counting toward
  future cases.
- **Measure real precision** from your verdicts and retune the case line from them.

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

The Calibration section's other figures: `feature-ablation.ts` (inputs), `node-budget.ts` (~1 h with
`--shards=11`), `think-times.ts`, and `inspect-player.ts <userId>` to vet an outlier.
`worker-parity.ts` must print `identical` before offline-pass values are trusted. Every pass resumes
from its saved output. Experiments vary `--ceiling=base,perRating,margin`, `--fractions=…`,
`--top-margin=…`, `--case-line=…` and `--multipv=…` (fresh detector and offline passes, in their own
`--data`) without editing code. After changing any constant in `bettingScore.ts`, run
`bettingScore.unit.test.ts`: it fails if any move could be expected to raise an honest player's
score.
