// src/shared/chess/logic/insuffmat/insufficientmaterial.unit.test.ts

import { describe, it, expect } from 'vitest';

import icnconverter from '../icn/icnconverter.js';
import organizedpieces from '../organizedpieces.js';
import insufficientmaterial from './insufficientmaterial.js';

/** Whether the site declares the ICN's position drawn by insufficient material. */
function isDraw(icn: string): boolean {
	const { position, gameRules } = icnconverter.ShortToLong_Format(icn);
	const { pieces } = organizedpieces.processInitialPosition(
		position!,
		gameRules.turnOrder,
		false,
		gameRules.promotion,
	);
	return insufficientmaterial.detect({ gameRules, moves: [], pieces })?.condition === 'insuffmat';
}

const BORDER = '-1000,1000,-1000,1000';

describe('insufficientmaterial', () => {
	describe('unbounded boards', () => {
		it('declares draws the table proves', () => {
			expect(isDraw('w K0,0|R5,0|k20,20')).toBe(true);
			expect(isDraw('w K0,0|Q5,0|k20,20|r25,20')).toBe(true);
			expect(isDraw('w K0,0|R5,0|k20,20|ha25,20')).toBe(true);
			expect(isDraw('w K0,0|Q3,0|k20,20|b25,20|n30,20')).toBe(true);
			expect(isDraw('w HU0,0|HU3,0|HU6,0|HU9,0|k20,20')).toBe(true);
		});

		it('never declares sets that can mate', () => {
			expect(isDraw('w K0,0|R5,0|R7,0|k20,20')).toBe(false);
			expect(isDraw('w K0,0|R5,0|B6,1|k20,20|n25,20')).toBe(false);
			expect(isDraw('w K0,0|R5,0|N6,0|k20,20|n25,20')).toBe(false);
			expect(isDraw('w RC0,0|RC5,0|k20,20')).toBe(false);
			expect(isDraw('w RC0,0|k20,20|k25,20')).toBe(false);
		});

		it('never declares a set where white is the side mated', () => {
			expect(isDraw('w K0,0|k20,20|k25,20|k30,20|rc35,20')).toBe(false);
		});

		it('never declares sets that mate one of several defending royals', () => {
			expect(isDraw('w N0,0|k20,20|rq30,25')).toBe(false);
		});

		it('tells bishop square colors apart', () => {
			expect(isDraw('w Q0,0|B2,0|B5,0|k20,20')).toBe(false);
			expect(isDraw('w Q0,0|B2,0|B4,0|k20,20')).toBe(true);
		});

		it('never declares a draw above the cap, outside the proven draw', () => {
			expect(isDraw('w K0,0|N3,0|N6,0|N9,0|N12,0|k20,20')).toBe(false);
			expect(isDraw('w K0,0|K5,0|K10,0|k20,20|k25,20|k30,20')).toBe(false);
		});

		it('declares the proven draw above the cap', () => {
			expect(isDraw('w K0,0|N1,0|B2,0|B4,0|B6,0|B8,0|B10,0|B12,0|k20,20')).toBe(true);
		});

		it('requires every promotion outcome to be a draw', () => {
			expect(isDraw('w (8|1) K0,0|k20,20|p40,5')).toBe(true);
			expect(isDraw('w (8|1) K0,0|k20,20|p40,5|p42,5')).toBe(false);
		});

		it('never declares a draw with voids on the board', () => {
			expect(isDraw('w K0,0|R5,0|k20,20|vo30,30')).toBe(false);
		});
	});

	describe('bounded boards', () => {
		it('declares draws the bounded table proves', () => {
			expect(isDraw(`w ${BORDER} K0,0|N5,0|k20,20`)).toBe(true);
			expect(isDraw('w 1,8,1,8 AM1,1|Q2,1|rq5,5')).toBe(true);
		});

		it('never declares sets that can mate against a border', () => {
			expect(isDraw(`w ${BORDER} K0,0|R5,0|k20,20`)).toBe(false);
			expect(isDraw(`w ${BORDER} K0,0|k20,20|rc25,20`)).toBe(false);
		});

		it('never declares sets that can only mate on 8x8, on any bounded board', () => {
			expect(isDraw(`w ${BORDER} AM0,0|AM3,0|rq20,20`)).toBe(false);
		});

		it('treats a border past the bound as unbounded, unless a sliding royal can reach it', () => {
			const far = '-5000000000000000000000,5000000000000000000000,-5000000000000000000000,5000000000000000000000'; // prettier-ignore
			expect(isDraw(`w ${far} K0,0|R5,0|k20,20`)).toBe(true);
			expect(isDraw(`w ${far} rq0,0|R5,7|Q9,3|r-6,2`)).toBe(false);
		});

		it('never declares a draw on boards narrower than 8', () => {
			expect(isDraw('w 1,7,1,8 K1,1|N3,1|k6,8')).toBe(false);
		});
	});
});
