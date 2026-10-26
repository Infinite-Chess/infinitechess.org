// src/server/game/cheatdetection/bettingScore.ts

/**
 * Scores a player's games as a running bet that they use an engine. Each move multiplies the
 * score by how much likelier its outcome is for a player using an engine on some fraction of
 * their moves than for an honest player as strong as their skill ceiling: the strongest an honest
 * player of their rating plausibly is. Several fractions are bet on at once, averaged. Each game's
 * analysis matches multiply in beside its moves, only ever raising the score: by the player's
 * account or browser, weighted by ply; by their network alone, by how densely they recur across
 * the run. Away times aren't scored yet.
 *
 * For any honest player no stronger than their ceiling, each move's expected ratio is at most 1.
 * The best run scored here still has no 1/X bound, since each game adds a starting point: its
 * false-case rate is measured instead (the system doc's case line).
 */

import type { Interaction } from './cheatDetectionTypes.js';
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

/** One game as the score reads it. */
export interface GameScore {
	/** Its moves' log likelihood ratios, per cheat fraction ({@link gameLogRatios}). */
	moves: number[];
	/** The log weight of its strongest analysis match by the player's account or browser, else 0. */
	matchLogWeight: number;
	/**
	 * Whether it has a network-only match, not shared with the opponent, that would open a case by
	 * its weight alone.
	 */
	networkMatched: boolean;
}

// Constants -------------------------------------------------------------------

/** The natural log of the score that opens a case: measured on prod, about 99.95% of its cases are real. */
const CASE_LOG_SCORE = Math.log(1000);
/** Games older than this no longer count as evidence. */
const MAX_EVIDENCE_AGE_MS = timeutil.toMillis(6, 'months');

/**
 * An analysis match's weight at ply p: e^(decay × p), the inverse of a line over how often a
 * player's own earlier games pass through their position at that ply (prod's games, 2026-10-20),
 * from 100% at the start, which proves nothing, up to the rarest repeat that sample can back (none
 * in ~59,000 late positions).
 */
const MATCH_WEIGHT = { decay: 0.37, cap: 20_000 };
/**
 * The assumed share of games with a network-only match, for a cheater analysing on another device
 * and for an honest player whose household analyses their game. Guesses, the honest one deliberately
 * high: refit both from the collected matches.
 */
const NETWORK_MATCH_RATES = { cheater: 0.5, honest: 0.1 };

/** No interaction data: what research scores games collected before it with. */
const EMPTY_INTERACTION: Interaction = { away: [], matches: [] };

/**
 * The model detection runs on: the honest model fitted on prod's rated games (snapshot of
 * 2026-10-20, less rating abusers' games), the engine model on how this detector judges another
 * Apeiron search's picks.
 */
const MODEL: BetModel = {
	skillCeiling: { base: 0.01, perRating: 0.22, margin: 0.51 },
	cheatFractions: [0.1, 0.25, 0.5, 1],
	honestGoodWeights: [
		0.356, -1.256, -0.82, -0.714, -0.617, -0.418, 0.859, 0.731, 1.463, -1.198, 0.335,
	],
	honestTopRates: [1, 0.602, 0.411, 0.34, 0.163],
	honestTopMargin: 0.05,
	engineGoodWeights: [
		2.949, -1.46, -1.127, -0.935, -0.801, -1.04, 0.351, 0.561, 1.128, 0.165, 1.044,
	],
	engineTopWeights: [
		0.287, 4.393, 1.139, 0.609, -0.027, -1.451, 0.405, 0.048, 0.236, 0.361, 0.377,
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

/** A game's {@link GameScore}, from its moves' {@link gameLogRatios} and its interaction data. */
function gameScore(moves: number[], interaction: Interaction): GameScore {
	let matchLogWeight = 0;
	let networkMatched = false;
	for (const match of interaction.matches) {
		const logWeight = Math.log(matchWeight(match.ply));
		if (match.link !== 'network') matchLogWeight = Math.max(matchLogWeight, logWeight);
		else if (!match.sharedWithOpponent && logWeight >= CASE_LOG_SCORE) networkMatched = true;
	}
	return { moves, matchLogWeight, networkMatched };
}

/** How many times likelier an analysis match on a position at `ply` is for a cheater. Never below 1. */
function matchWeight(ply: number): number {
	const { decay, cap } = MATCH_WEIGHT;
	return Math.min(cap, Math.exp(decay * ply));
}

/**
 * A player's score now: the best over every run of their recent games that ends with the latest,
 * so honest games before an engine user switched on can't drag it down (change detection, as in
 * CUSUM). Takes each game's {@link GameScore}, oldest first, and returns the score's natural log.
 */
function bestRunLogScore(games: GameScore[]): number {
	let best = 0;
	const sums = games[0]?.moves.map(() => 0) ?? [];
	let matchLogWeights = 0;
	let networkMatched = 0;
	for (let start = games.length - 1; start >= 0; start--) {
		const game = games[start]!;
		game.moves.forEach((r, i) => (sums[i]! += r));
		matchLogWeights += game.matchLogWeight;
		if (game.networkMatched) networkMatched++;
		const network = networkLogRatio(networkMatched, games.length - start);
		best = Math.max(best, averageLogRatio(sums) + matchLogWeights + network);
	}
	return best;
}

/**
 * The log ratio of `matched` network-matched games among a run of `games`: the binomial odds of
 * that density for a cheater over an honest household, floored at 0 so it never lowers a score.
 */
function networkLogRatio(matched: number, games: number): number {
	const { cheater, honest } = NETWORK_MATCH_RATES;
	const logRatio = matched * Math.log(cheater / honest) + (games - matched) * Math.log((1 - cheater) / (1 - honest)); // prettier-ignore
	return Math.max(0, logRatio);
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
	EMPTY_INTERACTION,
	// Model
	features,
	logistic,
	skillCeiling,
	// Scoring
	gameLogRatios,
	gameScore,
	matchWeight,
	bestRunLogScore,
	averageLogRatio,
};
