// scripts/cheatdetection/feature-ablation.ts

/**
 * Which inputs the honest model needs: the held-out log likelihood per move of P(good), folded by
 * player, with each of the model's inputs dropped in turn, and with each candidate input it doesn't
 * use added in turn. A negative change means the model predicts worse without (or with) it.
 *
 * Usage: npx tsx scripts/cheatdetection/feature-ablation.ts --snapshot=<path>
 */

import type { AnalysedPosition } from '../../src/server/game/cheatdetection/cheatDetectionTypes.js';

import bettingScore from '../../src/server/game/cheatdetection/bettingScore.js';
import moveEvidence from '../../src/server/game/cheatdetection/moveEvidence.js';

import corpus from './lib/corpus.js';
import models from './lib/models.js';
import logistic from './lib/logistic.js';
import snapshot from './lib/snapshot.js';

// Types -----------------------------------------------------------------------

/** One scored honest move. */
interface Row {
	userId: number;
	good: 0 | 1;
	/** The model's inputs, as {@link bettingScore.features} gives them. */
	inputs: number[];
	/** Each candidate's value, by {@link CANDIDATES} order. */
	candidates: number[];
}

// Constants -------------------------------------------------------------------

/** The model's inputs after the bias, in {@link bettingScore.features} order. */
const INPUTS = ['good moves = 1', 'good moves = 2', 'good moves = 3–4', 'no shallow find', 'deep find', 'best move captures', 'forcing good move', 'in check', 'opponent blunder', 'imbalance']; // prettier-ignore
const CANDIDATES = ['rating', 'time control', 'top-two gap', 'few legal moves (≤ 8)', 'recapture available']; // prettier-ignore

// Rows ------------------------------------------------------------------------

/** The candidate inputs of a move from `position`, after the opponent's `previousMove`. */
function candidatesOf(
	position: AnalysedPosition,
	previousMove: string | undefined,
	elo: number,
	clockSeconds: number,
): number[] {
	const [best, second] = position.lines.map((line) => moveEvidence.winProbability(line.score));
	const landing = previousMove && destination(previousMove);
	return [
		(elo - 1500) / 300,
		Math.log(Math.max(clockSeconds, 1) / 600),
		second === undefined ? 0 : best! - second,
		position.legal <= 8 ? 1 : 0,
		position.lines.some((line) => destination(line.move) === landing) ? 1 : 0,
	];
}

/** The square a compact move token lands on. */
function destination(token: string): string {
	return token.split('>')[1]!.split('=')[0]!;
}

// Likelihood ------------------------------------------------------------------

/** Held-out log likelihood per move of a model over `columns` of each row's inputs and candidates. */
function heldOut(rows: Row[], columns: (row: Row) => number[]): number {
	let total = 0;
	for (let fold = 0; fold < models.FOLDS; fold++) {
		const train = rows.filter((r) => models.foldOf(r.userId) !== fold);
		const weights = logistic.fit(
			train.map((r) => columns(r)),
			train.map((r) => r.good),
		);
		for (const row of rows.filter((r) => models.foldOf(r.userId) === fold)) {
			const p = bettingScore.logistic(weights, columns(row));
			total += Math.log(row.good ? p : 1 - p);
		}
	}
	return total / rows.length;
}

// Main ------------------------------------------------------------------------

const rows: Row[] = corpus.loadCorpus().flatMap((game) => {
	const row = snapshot.game(game.gameId);
	const clockSeconds = (row.base_time_seconds ?? 0) + 40 * (row.increment_seconds ?? 0);
	return game.players.flatMap((player) => moveEvidence.gather(game.positions, game.moves, player.parity).map((evidence) => {
		const position = game.positions[evidence.ply]!;
		if (position.refused) throw Error('Scored moves always come from searched positions.');
		return {
			userId: player.userId,
			good: evidence.outcome === 'miss' ? 0 : 1,
			inputs: bettingScore.features(evidence.difficulty),
			candidates: candidatesOf(position, game.moves[evidence.ply - 1], player.elo, clockSeconds),
		} satisfies Row;
	}));
}); // prettier-ignore

const baseline = heldOut(rows, (r) => r.inputs);
console.log(
	`${rows.length} honest rated moves; held-out log likelihood per move ${baseline.toFixed(4)}`,
);
INPUTS.forEach((name, i) => {
	const change =
		heldOut(rows, (r) => r.inputs.filter((_, column) => column !== i + 1)) - baseline;
	console.log(`  drop ${name.padEnd(24)} ${change.toFixed(4)}`);
});
CANDIDATES.forEach((name, i) => {
	const change = heldOut(rows, (r) => [...r.inputs, r.candidates[i]!]) - baseline;
	console.log(`  add  ${name.padEnd(24)} ${change >= 0 ? '+' : ''}${change.toFixed(4)}`);
});
