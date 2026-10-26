// src/server/game/cheatdetection/bettingScore.unit.test.ts

/**
 * Guards the betting score's validity against retuning: for every kind of position, an honest
 * player no stronger than the skill ceiling must expect each move to shrink the score, and
 * interaction data may only ever raise it. Pins how runs combine games and weigh analysis matches.
 */

import type { Interaction } from './cheatDetectionTypes.js';
import type { BetModel, GameScore } from './bettingScore.js';
import type { Difficulty, MoveOutcome } from './moveEvidence.js';

import { describe, it, expect } from 'vitest';

import bettingScore from './bettingScore.js';

/** A ply whose analysis match weighs enough to open a case alone. */
const LATE_PLY = 40;
/** A game whose moves score ×10 in every bet. */
const ENGINE = game([Math.log(10), Math.log(10)]);
/** A game whose moves leave the score as it was. */
const PLAIN = game([0, 0]);
/** A plain game with a late network-only match. */
const NETWORK_MATCHED = game([0, 0], { away: [], matches: [{ ply: LATE_PLY, link: 'network', sharedWithOpponent: false }] }); // prettier-ignore

/**
 * Every combination of difficulty factors, up to the most good moves `model` has rates for: each
 * flag both ways, and each continuous factor at its ends and middle.
 */
function allDifficulties(model: BetModel): Difficulty[] {
	const flags = [false, true];
	const spans = [0, 0.5, 1];
	const plain: Difficulty = { goodMoves: 1, shallowFinds: false, deepFind: false, bestCaptures: false, forcingGoodMove: false, inCheck: false, opponentBlunder: 0, imbalance: 0 }; // prettier-ignore
	let out = Array.from({ length: model.honestTopRates.length }, (_, i) => ({ ...plain, goodMoves: i + 1 })); // prettier-ignore
	const vary = <K extends keyof Difficulty>(key: K, values: Difficulty[K][]): void => {
		out = out.flatMap((d) => values.map((value) => ({ ...d, [key]: value })));
	};
	for (const key of ['shallowFinds', 'deepFind', 'bestCaptures', 'forcingGoodMove', 'inCheck'] as const) vary(key, flags); // prettier-ignore
	for (const key of ['opponentBlunder', 'imbalance'] as const) vary(key, spans);
	return out;
}

/**
 * The highest expected per-move ratio, over every cheat fraction, of an honest player in a position
 * at any skill (a logit offset from the population) up to the ceiling, picking the first line at the
 * population's rate or up to the model's top margin more often.
 */
function worstExpectedRatio(model: BetModel, ceiling: number, difficulty: Difficulty): number {
	const x = bettingScore.features(difficulty);
	const outcomes: MoveOutcome[] = ['top', 'good', 'miss'];
	const ratios = outcomes.map((outcome) => bettingScore.gameLogRatios([{ ply: 0, outcome, difficulty }], model, ceiling).map((r) => Math.exp(r))); // prettier-ignore
	let worst = 0;
	for (let skill = -3; skill <= ceiling; skill += 0.25) {
		const good = bettingScore.logistic(model.honestGoodWeights, x, skill);
		for (const topLean of [0, model.honestTopMargin]) {
			const top = Math.min(1, model.honestTopRates[difficulty.goodMoves - 1]! + topLean);
			const chances = [good * top, good * (1 - top), 1 - good];
			worst = Math.max(worst, ...model.cheatFractions.map((_, i) => chances.reduce((sum, chance, o) => sum + chance * ratios[o]![i]!, 0))); // prettier-ignore
		}
	}
	return worst;
}

describe('bettingScore', () => {
	it('never grows in expectation for an honest player up to the skill ceiling', () => {
		const model = bettingScore.MODEL;
		let worst = 0;
		for (const [rating, ratingDeviation] of [
			[1000, 50],
			[1500, 350],
			[2400, 60],
		] as const) {
			const ceiling = bettingScore.skillCeiling(model, rating, ratingDeviation);
			for (const difficulty of allDifficulties(model)) worst = Math.max(worst, worstExpectedRatio(model, ceiling, difficulty)); // prettier-ignore
		}
		expect(worst).toBeLessThanOrEqual(1 + 1e-9);
	});

	it('averages the per-fraction bets', () => {
		expect(bettingScore.bestRunLogScore([game([Math.log(4), 0])])).toBeCloseTo(Math.log(2.5));
	});

	it('scores the best run ending with the latest game, so earlier honest games cost nothing', () => {
		const honest = game([-3, -3]);
		expect(bettingScore.bestRunLogScore([honest, honest, ENGINE, ENGINE])).toBeCloseTo(
			Math.log(100),
		);
		expect(bettingScore.bestRunLogScore([ENGINE, honest])).toBe(0);
	});

	it('weighs an analysis match up with its ply, never below 1, and capped', () => {
		const weights = [0, 10, 20, 500, 1000].map((ply) => bettingScore.matchWeight(ply));
		expect(weights[0]).toBeGreaterThanOrEqual(1);
		for (let i = 1; i < weights.length; i++) expect(weights[i]).toBeGreaterThanOrEqual(weights[i - 1]!); // prettier-ignore
		expect(weights[3]).toBe(weights[4]);
	});

	it("opens a case on one late account or browser match, even through a game's honest-looking moves", () => {
		const late = game([-2, -2], { away: [], matches: [{ ply: LATE_PLY, link: 'browser' }] });
		expect(bettingScore.bestRunLogScore([late])).toBeGreaterThanOrEqual(
			bettingScore.CASE_LOG_SCORE,
		);
	});

	it("counts late network-only matches by their density across the run, and never one shared with the opponent's network", () => {
		const shared = game([0, 0], { away: [], matches: [{ ply: LATE_PLY, link: 'network', sharedWithOpponent: true }] }); // prettier-ignore
		const denseRun = 8;
		// A dense run opens a case, one game alone doesn't, and sparse matches add nothing.
		expect(bettingScore.bestRunLogScore(Array(denseRun).fill(NETWORK_MATCHED))).toBeGreaterThanOrEqual(bettingScore.CASE_LOG_SCORE); // prettier-ignore
		expect(bettingScore.bestRunLogScore([NETWORK_MATCHED])).toBeLessThan(bettingScore.CASE_LOG_SCORE); // prettier-ignore
		expect(bettingScore.bestRunLogScore([NETWORK_MATCHED, ...Array(20).fill(PLAIN)])).toBe(0);
		expect(bettingScore.bestRunLogScore(Array(denseRun).fill(shared))).toBe(0);
	});

	it('never lowers a score for interaction data, so faking a clean record gains nothing', () => {
		const base = bettingScore.bestRunLogScore([ENGINE, PLAIN, PLAIN]);
		expect(bettingScore.bestRunLogScore([ENGINE, NETWORK_MATCHED, PLAIN])).toBeGreaterThanOrEqual(base); // prettier-ignore
	});
});

/** A game of the given per-fraction move log ratios, with no interaction data unless given. */
function game(
	moves: number[],
	interaction: Interaction = bettingScore.EMPTY_INTERACTION,
): GameScore {
	return bettingScore.gameScore(moves, interaction);
}
