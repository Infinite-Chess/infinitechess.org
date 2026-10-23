// scripts/cheatdetection/honest-margins.ts

/**
 * Calibrates how far an honest player may exceed the honest model, each against a model held out
 * from them. The skill ceiling: each regular's skill (a logit offset) against the rating they played
 * at, its line giving base and perRating and its largest outperformance the margin. The top margin:
 * how much more often each regular's good moves were the first line than the model predicts.
 *
 * Usage: npx tsx scripts/cheatdetection/honest-margins.ts [minimum scored moves, default 150]
 */

import type { MoveEvidence } from '../../src/server/game/cheatdetection/moveEvidence.js';

import bettingScore from '../../src/server/game/cheatdetection/bettingScore.js';

import models from './lib/models.js';
import settings from './lib/settings.js';

// Types -----------------------------------------------------------------------

interface Regular {
	userId: number;
	offset: number;
	/** The offset's standard error. */
	error: number;
	moves: number;
	/** The average rating they played at. */
	rating: number;
}

// Constants -------------------------------------------------------------------

/** Good moves, among several good options, a player needs before their lean toward the first line counts. */
const MIN_TOP_LEAN_MOVES = 100;

// Fitting ---------------------------------------------------------------------

/** A player's logit offset from the honest model, by Newton's method, and its standard error. */
function offsetOf(moves: { evidence: MoveEvidence; weights: number[] }[]): {
	offset: number;
	error: number;
} {
	let offset = 0;
	let information = 0;
	for (let it = 0; it < 30; it++) {
		let gradient = 0;
		information = 0;
		for (const { evidence, weights } of moves) {
			const p = bettingScore.logistic(
				weights,
				bettingScore.features(evidence.difficulty),
				offset,
			);
			gradient += (evidence.outcome === 'miss' ? 0 : 1) - p;
			information += p * (1 - p);
		}
		offset += gradient / information;
	}
	return { offset, error: 1 / Math.sqrt(information) };
}

/**
 * How much more often a player's good moves were the first line than each move's `topRates`
 * predicts, and its standard error. Only positions with several good moves count: with one, it is
 * always the first.
 */
function topLeanOf(moves: { evidence: MoveEvidence; topRates: number[] }[]): {
	lean: number;
	error: number;
	moves: number;
} {
	const good = moves.filter(({ evidence: e }) => e.outcome !== 'miss' && e.difficulty.goodMoves > 1); // prettier-ignore
	const expected = good.map(({ evidence, topRates }) => topRates[evidence.difficulty.goodMoves - 1]!); // prettier-ignore
	const top = good.filter(({ evidence }) => evidence.outcome === 'top').length;
	const lean = (top - expected.reduce((sum, p) => sum + p, 0)) / good.length;
	const error = Math.sqrt(expected.reduce((sum, p) => sum + p * (1 - p), 0)) / good.length;
	return { lean, error, moves: good.length };
}

// Main ------------------------------------------------------------------------

const minMoves = Number(settings.positional()[0] ?? 150);
const { byPlayer, modelFor } = models.fitCorpus({ base: 0, perRating: 0, margin: 0 });

const regulars: Regular[] = [...byPlayer].flatMap(([userId, games]) => {
	const moves = games.flatMap((pg) => pg.evidence.map((evidence) => ({ evidence, weights: modelFor(pg).honestGoodWeights }))); // prettier-ignore
	if (moves.length < minMoves) return [];
	const rating = games.reduce((sum, pg) => sum + pg.game.players.find((p) => p.userId === userId)!.elo, 0) / games.length; // prettier-ignore
	return [{ userId, ...offsetOf(moves), moves: moves.length, rating }];
});

// Least squares of offset on (rating − 1500) / 300.
const xs = regulars.map((r) => (r.rating - 1500) / 300);
const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
const meanY = regulars.reduce((a, r) => a + r.offset, 0) / regulars.length;
const perRating = regulars.reduce((a, r, i) => a + (xs[i]! - meanX) * (r.offset - meanY), 0) / xs.reduce((a, x) => a + (x - meanX) ** 2, 0); // prettier-ignore
const base = meanY - perRating * meanX;
const residuals = regulars.map((r, i) => ({ ...r, above: r.offset - (base + perRating * xs[i]!) })).sort((a, b) => b.above - a.above); // prettier-ignore

console.log(`${regulars.length} players with ${minMoves}+ scored moves; skill ≈ ${base.toFixed(2)} + ${perRating.toFixed(2)} per 300 rating above 1500, residual sd ${Math.sqrt(residuals.reduce((a, r) => a + r.above ** 2, 0) / residuals.length).toFixed(2)}`); // prettier-ignore
for (const r of residuals.slice(0, 5)) console.log(`  user ${r.userId}: ${r.above.toFixed(2)} ± ${r.error.toFixed(2)} above prediction (rating ${r.rating.toFixed(0)}, ${r.moves} moves)`); // prettier-ignore
console.log(
	`margin covering the largest plus its error: ${(residuals[0]!.above + residuals[0]!.error).toFixed(2)}`,
);

const leans = [...byPlayer].flatMap(([userId, games]) => {
	const moves = games.flatMap((pg) => pg.evidence.map((evidence) => ({ evidence, topRates: modelFor(pg).honestTopRates }))); // prettier-ignore
	const lean = topLeanOf(moves);
	return lean.moves >= MIN_TOP_LEAN_MOVES ? [{ userId, ...lean }] : [];
});
leans.sort((a, b) => b.lean - a.lean);
const leanSd = Math.sqrt(leans.reduce((a, l) => a + l.lean ** 2, 0) / leans.length);
const typicalError = leans.reduce((a, l) => a + l.error, 0) / leans.length;

console.log(`${leans.length} players with ${MIN_TOP_LEAN_MOVES}+ good moves among several; leans spread ${leanSd.toFixed(3)}, typically ±${typicalError.toFixed(3)} (equal means noise)`); // prettier-ignore
for (const l of leans.slice(0, 3)) console.log(`  user ${l.userId}: picks the first line ${l.lean.toFixed(3)} ± ${l.error.toFixed(3)} more often than predicted (${l.moves} moves)`); // prettier-ignore
console.log(`top margin covering the largest plus its error: ${(leans[0]!.lean + leans[0]!.error).toFixed(3)} (shipped ${settings.TOP_MARGIN})`); // prettier-ignore
