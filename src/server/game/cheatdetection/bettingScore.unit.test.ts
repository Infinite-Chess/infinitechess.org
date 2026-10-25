// src/server/game/cheatdetection/bettingScore.unit.test.ts

/**
 * Guards the betting score's validity against retuning: for every kind of position, an honest
 * player no stronger than the skill ceiling must expect each move to shrink the score, never grow it.
 */

import type { BetModel } from './bettingScore.js';
import type { Difficulty, MoveOutcome } from './moveEvidence.js';

import { describe, it, expect } from 'vitest';

import bettingScore from './bettingScore.js';

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
		expect(bettingScore.bestRunLogScore([[Math.log(4), 0]])).toBeCloseTo(Math.log(2.5));
	});

	it('scores the best run ending with the latest game, so earlier honest games cost nothing', () => {
		const honest = [-3, -3];
		const engine = [Math.log(10), Math.log(10)];
		expect(bettingScore.bestRunLogScore([honest, honest, engine, engine])).toBeCloseTo(
			Math.log(100),
		);
		expect(bettingScore.bestRunLogScore([engine, honest])).toBe(0);
	});
});
