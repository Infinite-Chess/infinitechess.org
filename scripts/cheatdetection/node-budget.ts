// scripts/cheatdetection/node-budget.ts

/**
 * Whether a bigger detector budget would separate cheaters from honest players better. Re-searches
 * sampled scored positions of the rated corpus at several node budgets, each cold, and judges two
 * moves there with production's moveEvidence: the honest player's real move and the cheater
 * engine's pick. Per budget, the information is the KL divergence of the cheater's top/good/miss
 * outcomes from the honest player's, in nats per move: how fast a cheater's score grows. Bootstrapped
 * over positions for each budget's difference from the first. About 40 s per position per core;
 * resumable.
 *
 * Usage: npx tsx scripts/cheatdetection/node-budget.ts --snapshot=<path> [positions, default 600] [--shards=N]
 */

import type { GameAtStart } from '../../src/server/game/cheatdetection/gameReplay.js';
import type { MoveOutcome } from '../../src/server/game/cheatdetection/moveEvidence.js';
import type { PositionAnalysis } from '../../src/server/game/cheatdetection/cheatDetectionTypes.js';

import icnmoves from '../../src/shared/chess/logic/icn/icnmoves.js';

import gameReplay from '../../src/server/game/cheatdetection/gameReplay.js';
import moveEvidence from '../../src/server/game/cheatdetection/moveEvidence.js';

import corpus from './lib/corpus.js';
import models from './lib/models.js';
import shards from './lib/shards.js';
import settings from './lib/settings.js';
import snapshot from './lib/snapshot.js';
import simulate from './lib/simulate.js';
import researchengine from './lib/researchengine.js';

// Types -----------------------------------------------------------------------

/** One sampled position: where it is, and the two moves judged in it. */
interface Sample {
	gameId: number;
	ply: number;
	honest: string;
	cheater: string;
}

/** The two moves' outcomes at one budget, where the position was still scored. */
interface Judged {
	honest: MoveOutcome;
	cheater: MoveOutcome;
}

/** One sample's result, by its index among the seeded samples: per budget, null where unscored. */
interface BudgetRecord {
	index: number;
	judged: (Judged | null)[];
}

// Constants -------------------------------------------------------------------

const BUDGETS = [settings.SEARCH.positionNodes, 1_000_000, 2_500_000];
const OUTCOMES: MoveOutcome[] = ['top', 'good', 'miss'];
const BOOTSTRAP_RUNS = 2000;

// Judging ---------------------------------------------------------------------

/** Searches the position after `moves` from cold, as the detector's PositionAnalysis. */
function analyse(game: GameAtStart, moves: string[], nodes: number): PositionAnalysis {
	const session = new researchengine.Session();
	const icn = gameReplay.engineIcn(
		game,
		moves.map((token) => icnmoves.parseTokenMove(token)),
	);
	const searched = session.search(icn, settings.SEARCH.multiPv, nodes);
	session.free();
	if (!searched) return { refused: true };
	return { ...searched, repeated: false, lines: searched.lines.map((line) => ({ ...line, captures: false })), topByDepth: [] }; // prettier-ignore
}

/** A move's outcome judged at `nodes`, the position after it searched only when production would. */
function judge(
	game: GameAtStart,
	played: string[],
	before: PositionAnalysis,
	move: string,
	nodes: number,
): MoveOutcome | undefined {
	const inLines = !before.refused && before.lines.some((line) => moveEvidence.sameMove(line.move, move)); // prettier-ignore
	const after = inLines ? before : analyse(game, [...played, move], nodes);
	return moveEvidence.gather([before, after], [move], 0)[0]?.outcome;
}

/** Both moves' outcomes in a sampled position at each budget. */
async function judgeSample(sample: Sample): Promise<(Judged | null)[]> {
	const game = await gameReplay.loadAtStart(snapshot.game(sample.gameId).icn);
	const played = (game.longformat.moves ?? []).slice(0, sample.ply).map((move) => move.token);
	return BUDGETS.map((nodes) => {
		const before = analyse(game, played, nodes);
		const honest = judge(game, played, before, sample.honest, nodes);
		const cheater = judge(game, played, before, sample.cheater, nodes);
		return honest && cheater ? { honest, cheater } : null;
	});
}

// Information -----------------------------------------------------------------

/** KL(cheater ‖ honest) over the outcomes, in nats, add-half smoothed so empty outcomes stay finite. */
function information(judged: Judged[]): number {
	return OUTCOMES.reduce((sum, outcome) => {
		const cheater = (judged.filter((j) => j.cheater === outcome).length + 0.5) / (judged.length + 1.5); // prettier-ignore
		const honest = (judged.filter((j) => j.honest === outcome).length + 0.5) / (judged.length + 1.5); // prettier-ignore
		return sum + cheater * Math.log(cheater / honest);
	}, 0);
}

/** The `p` quantile of `xs`. */
function quantile(xs: number[], p: number): number {
	return [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))]!;
}

/** Prints each budget's information, and its difference from the first, over positions every budget scored. */
function report(records: BudgetRecord[], count: number): void {
	const scored = records.map((r) => r.judged).filter((j): j is Judged[] => j.every((x) => x !== null)); // prettier-ignore
	const informationAt = (rows: Judged[][], b: number): number =>
		information(rows.map((r) => r[b]!));
	const random = simulate.rng(54321);
	console.log(`${scored.length} of ${count} positions scored at every budget`);
	BUDGETS.forEach((nodes, b) => {
		const boot = Array.from({ length: BOOTSTRAP_RUNS }, () => {
			const rows = scored.map(() => scored[Math.floor(random() * scored.length)]!);
			return informationAt(rows, b) - informationAt(rows, 0);
		});
		const difference = b === 0 ? '' : `, ${(informationAt(scored, b) - informationAt(scored, 0)).toFixed(3)} vs ${BUDGETS[0]} (90% interval ${quantile(boot, 0.05).toFixed(3)} to ${quantile(boot, 0.95).toFixed(3)})`; // prettier-ignore
		console.log(`  ${String(nodes).padStart(9)} nodes: ${informationAt(scored, b).toFixed(3)} nats per move${difference}`); // prettier-ignore
	});
}

// Main ------------------------------------------------------------------------

const count = Number(settings.positional()[0] ?? 600);
const { playerGames } = models.fitCorpus();
const pool: Sample[] = playerGames.flatMap((pg) => pg.evidence.flatMap((e) => {
	const cheater = pg.game.cheat?.[e.ply]?.lines[0]?.move;
	return cheater ? [{ gameId: pg.game.gameId, ply: e.ply, honest: pg.game.moves[e.ply]!, cheater }] : [];
})); // prettier-ignore
const sampling = simulate.rng(12345);
const samples = Array.from({ length: count }, () => pool[Math.floor(sampling() * pool.length)]!);

const processes = shards.requested();
if (processes > 1) await shards.run('node-budget', processes);
else {
	const [shard, of] = shards.current();
	const done = new Set(corpus.readRecords<BudgetRecord>('node-budget-').map((r) => r.index));
	await researchengine.load(settings.SEARCH.hashMb);
	for (let index = shard; index < count; index += of) {
		if (done.has(index)) continue;
		const judged = await judgeSample(samples[index]!);
		corpus.append(`node-budget-${shard}.jsonl`, { index, judged } satisfies BudgetRecord);
		console.log(`position ${index} judged`);
	}
}
if (!shards.isChild()) report(corpus.readRecords<BudgetRecord>('node-budget-').filter((r) => r.index < count), count); // prettier-ignore
