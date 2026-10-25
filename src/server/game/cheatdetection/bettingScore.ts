// src/server/game/cheatdetection/bettingScore.ts

/**
 * Scores a player's moves as a running bet that they use an engine. Each move multiplies the
 * score by how much likelier its outcome is for a player using an engine on some fraction of
 * their moves than for an honest player as strong as their skill ceiling: the strongest an honest
 * player of their rating plausibly is. Several fractions are bet on at once, and the score is
 * their average.
 *
 * For any honest player no stronger than their ceiling, each move's expected ratio is at most 1.
 * The best run scored here still has no 1/X bound, since each game adds a starting point: its
 * false-case rate is measured instead (the system doc's case line).
 */

import type { Difficulty, MoveEvidence } from './moveEvidence.js';

import timeutil from '../../../shared/util/timeutil.js';

// Types -----------------------------------------------------------------------

/** Everything the bet is placed with. Weights are logistic, over {@link features}. */
export interface BetModel {
	/**
	 * The strongest an honest player of a rating plausibly is, as a logit added to the honest model:
	 * `base + perRating × (rating − 1500) / 300 + margin`, the rating taken at the top of its
	 * plausible range. Honest players outperform their rating's prediction by up to `margin`.
	 */
	skillCeiling: { base: number; perRating: number; margin: number };
	/** Fractions of moves an engine user might take from the engine. */
	cheatFractions: number[];
	/** Honest P(finding a good move). */
	honestGoodWeights: number[];
	/** Honest P(the detector's first line | a good move), by good-move count from 1 up to MultiPV. */
	honestTopRates: number[];
	/** Added to {@link honestTopRates}, for honest players stronger than these rates reflect. */
	honestTopMargin: number;
	/** Engine user P(a good move, as the detector judges it). */
	engineGoodWeights: number[];
	/** Engine user P(the detector's first line | a good move). */
	engineTopWeights: number[];
}

// Constants -------------------------------------------------------------------

/** The natural log of the score that opens a case: measured on prod, about 99.9% of its cases are real. */
const CASE_LOG_SCORE = Math.log(1500);
/** Games older than this no longer count as evidence. */
const MAX_EVIDENCE_AGE_MS = timeutil.toMillis(6, 'months');

/**
 * The model detection runs on: the honest model fitted on prod's rated games (snapshot of
 * 2026-10-20), the engine model on how this detector judges another Apeiron search's picks.
 */
const MODEL: BetModel = {
	skillCeiling: { base: 0.03, perRating: 0.22, margin: 0.49 },
	cheatFractions: [0.1, 0.25, 0.5, 1],
	honestGoodWeights: [
		0.507, -1.359, -0.933, -0.854, -0.603, -0.42, 0.849, 0.718, 1.475, -1.279, 0.262,
	],
	honestTopRates: [1, 0.598, 0.435, 0.329, 0.152],
	honestTopMargin: 0.05,
	engineGoodWeights: [
		3.152, -1.586, -1.254, -0.84, -0.737, -1.059, 0.433, 0.49, 1.093, -0.142, 0.932,
	],
	engineTopWeights: [
		0.311, 4.412, 1.254, 0.91, 0.207, -1.459, 0.471, 0.008, 0.158, -0.183, 0.283,
	],
};

// Model -----------------------------------------------------------------------

/** The difficulty of a position as model inputs: a bias, then one per factor. */
function features(d: Difficulty): number[] {
	return [
		1,
		d.goodMoves === 1 ? 1 : 0,
		d.goodMoves === 2 ? 1 : 0,
		d.goodMoves === 3 || d.goodMoves === 4 ? 1 : 0,
		d.shallowFinds ? 0 : 1,
		d.deepFind ? 1 : 0,
		d.bestCaptures ? 1 : 0,
		d.forcingGoodMove ? 1 : 0,
		d.inCheck ? 1 : 0,
		Math.sqrt(d.opponentBlunder),
		d.imbalance,
	];
}

/** P(1) under logistic `weights` for inputs `x`, shifted by `offset` logits. */
function logistic(weights: number[], x: number[], offset = 0): number {
	let z = offset;
	for (let i = 0; i < weights.length; i++) z += weights[i]! * x[i]!;
	return 1 / (1 + Math.exp(-z));
}

/**
 * A player's skill ceiling, from their rating at the top of its plausible range: a rating is
 * trusted up to two deviations high, so a provisional one allows for a much stronger player.
 */
function skillCeiling(model: BetModel, rating: number, ratingDeviation: number): number {
	const { base, perRating, margin } = model.skillCeiling;
	return base + (perRating * (rating + 2 * ratingDeviation - 1500)) / 300 + margin;
}

// Scoring ---------------------------------------------------------------------

/** One move's log likelihood ratio, per fraction in the model's `cheatFractions`. */
function moveLogRatios(evidence: MoveEvidence, model: BetModel, ceiling: number): number[] {
	const x = features(evidence.difficulty);
	const honestGood = logistic(model.honestGoodWeights, x, ceiling);
	const engineGood = logistic(model.engineGoodWeights, x);
	// Where the ceiling player finds good moves as often as an engine user, a miss would count as
	// engine evidence against weaker honest players: such moves are no evidence either way.
	if (engineGood <= honestGood) return model.cheatFractions.map(() => 0);

	const honestTop = Math.min(1, model.honestTopRates[evidence.difficulty.goodMoves - 1]! + model.honestTopMargin); // prettier-ignore
	const engineTop = engineGood * logistic(model.engineTopWeights, x);
	// Telling the first line apart from other good moves only helps where the engine favours it
	// more than honest players do. Otherwise judging good against miss alone keeps the bet valid.
	const split = engineTop / engineGood > honestTop;
	const { outcome } = evidence;
	return model.cheatFractions.map((f) => {
		if (outcome === 'miss') return Math.log(((1 - f) * (1 - honestGood) + f * (1 - engineGood)) / (1 - honestGood)); // prettier-ignore
		if (!split) return Math.log(((1 - f) * honestGood + f * engineGood) / honestGood);
		if (outcome === 'top') return Math.log(((1 - f) * honestGood * honestTop + f * engineTop) / (honestGood * honestTop)); // prettier-ignore
		return Math.log(((1 - f) * honestGood * (1 - honestTop) + f * (engineGood - engineTop)) / (honestGood * (1 - honestTop))); // prettier-ignore
	});
}

/** A game's log likelihood ratios, per fraction: the sums over its moves, against a {@link skillCeiling}. */
function gameLogRatios(evidence: MoveEvidence[], model: BetModel, ceiling: number): number[] {
	const sums = model.cheatFractions.map(() => 0);
	for (const move of evidence) moveLogRatios(move, model, ceiling).forEach((r, i) => (sums[i]! += r)); // prettier-ignore
	return sums;
}

/**
 * A player's score now: the best over every run of their recent games that ends with the latest,
 * so honest games before an engine user switched on can't drag it down (change detection, as in
 * CUSUM). Takes each game's {@link gameLogRatios}, oldest first, and returns the score's natural log.
 */
function bestRunLogScore(games: number[][]): number {
	let best = 0;
	const sums = games[0]?.map(() => 0) ?? [];
	for (let start = games.length - 1; start >= 0; start--) {
		games[start]!.forEach((r, i) => (sums[i]! += r));
		best = Math.max(best, averageLogRatio(sums));
	}
	return best;
}

/** The natural log of the bets' average ratio, given each bet's log ratio. */
function averageLogRatio(logRatios: number[]): number {
	const max = Math.max(...logRatios);
	return max + Math.log(logRatios.reduce((total, r) => total + Math.exp(r - max), 0) / logRatios.length); // prettier-ignore
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	CASE_LOG_SCORE,
	MAX_EVIDENCE_AGE_MS,
	MODEL,
	// Model
	features,
	logistic,
	skillCeiling,
	// Scoring
	gameLogRatios,
	bestRunLogScore,
	averageLogRatio,
};
