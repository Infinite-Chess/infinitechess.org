// src/server/game/cheatdetection/bettingScore.unit.test.ts

/**
 * Guards the betting score's validity against retuning: for every kind of position, an honest
 * player no stronger than the skill ceiling must expect each move to shrink the score, never grow it.
 */

import type { BetModel } from './bettingScore.js';
import type { Difficulty, MoveOutcome } from './moveEvidence.js';

import { describe, it, expect } from 'vitest';

import bettingScore from './bettingScore.js';

/** Every combination of difficulty factors, up to the most good moves `model` has rates for. */
function allDifficulties(model: BetModel): Difficulty[] {
	const out: Difficulty[] = [];
	for (let goodMoves = 1; goodMoves <= model.honestTopRates.length; goodMoves++)
		for (const shallowFinds of [false, true])
			for (const deepFind of [false, true])
				for (const bestCaptures of [false, true])
					for (const inCheck of [false, true])
						out.push({ goodMoves, shallowFinds, deepFind, bestCaptures, inCheck });
	return out;
}

/**
 * An honest player's expected per-move ratio, per cheat fraction: `skill` is their logit offset
 * from the population, `topLean` how much likelier than average they are to pick the first line.
 */
function expectedRatios(
	model: BetModel,
	ceiling: number,
	difficulty: Difficulty,
	skill: number,
	topLean: number,
): number[] {
	const x = bettingScore.features(difficulty);
	const good = bettingScore.logistic(model.honestGoodWeights, x, skill);
	const top = Math.min(1, model.honestTopRates[difficulty.goodMoves - 1]! + topLean);
	const outcomes: [MoveOutcome, number][] = [['top', good * top], ['good', good * (1 - top)], ['miss', 1 - good]]; // prettier-ignore
	return model.cheatFractions.map(
		(_, i) =>
		outcomes.reduce((sum, [outcome, p]) => sum + p * Math.exp(bettingScore.gameLogRatios([{ ply: 0, outcome, difficulty }], model, ceiling)[i]!), 0), // prettier-ignore
	);
}

describe('bettingScore', () => {
	it('never grows in expectation for an honest player up to the skill ceiling', () => {
		const model = bettingScore.MODEL;
		for (const [rating, ratingDeviation] of [
			[1000, 50],
			[1500, 350],
			[2400, 60],
		] as const) {
			const ceiling = bettingScore.skillCeiling(model, rating, ratingDeviation);
			for (const difficulty of allDifficulties(model)) {
				for (let skill = -3; skill <= ceiling; skill += 0.25) {
					for (const topLean of [0, model.honestTopMargin]) {
						for (const ratio of expectedRatios(model, ceiling, difficulty, skill, topLean)) expect(ratio).toBeLessThanOrEqual(1 + 1e-9); // prettier-ignore
					}
				}
			}
		}
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
