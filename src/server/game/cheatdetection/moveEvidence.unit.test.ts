// src/server/game/cheatdetection/moveEvidence.unit.test.ts

/**
 * Pins how a move is judged against the engine's lines, and which moves are left out.
 */

import type { AnalysedPosition, EngineLine, PositionAnalysis } from './cheatDetectionTypes.js';

import { describe, it, expect } from 'vitest';

import moveEvidence from './moveEvidence.js';

/** A line scored in centipawns for the side to move. */
function line(move: string, cp: number): EngineLine {
	return { move, score: { cp }, captures: false };
}

/** A searched position with the given lines, whose best move settled at depth 1. */
function position(
	lines: EngineLine[],
	overrides: Partial<AnalysedPosition> = {},
): PositionAnalysis {
	return { legal: 30, inCheck: false, repeated: false, lines, topByDepth: Array(12).fill(lines[0]?.move), ...overrides }; // prettier-ignore
}

const LINES = [line('1,1>1,2', 50), line('1,1>1,3', 45), line('1,1>1,4', -100), line('1,1>1,5', -150), line('1,1>1,6', -200)]; // prettier-ignore

/** The evidence of a single white move from `before`, with `after` the position it led to. */
function judge(
	before: PositionAnalysis,
	move: string,
	after: PositionAnalysis = position([line('9,9>9,8', 0)]),
): ReturnType<typeof moveEvidence.gather> {
	return moveEvidence.gather([before, after], [move], 0);
}

describe('moveEvidence.gather', () => {
	it("judges the engine's first line as top, a near-equal line as good, and a worse one as a miss", () => {
		expect(judge(position(LINES), '1,1>1,2')[0]!.outcome).toBe('top');
		expect(judge(position(LINES), '1,1>1,3')[0]!.outcome).toBe('good');
		expect(judge(position(LINES), '1,1>1,4')[0]!.outcome).toBe('miss');
	});

	it('values a move outside the lines from the position after it, capped below the last line', () => {
		// The reply's best line is the mover's −50: the move is worse than every line.
		expect(judge(position(LINES), '2,2>2,3', position([line('3,3>3,4', 50)]))[0]!.outcome).toBe('miss'); // prettier-ignore
		// Even an outstanding value is capped at the last line's, which is no good here.
		expect(judge(position(LINES), '2,2>2,3', position([line('3,3>3,4', -900)]))[0]!.outcome).toBe('miss'); // prettier-ignore
		const close = [line('1,1>1,2', 50), line('1,1>1,3', 48), line('1,1>1,4', 46), line('1,1>1,5', 44), line('1,1>1,6', 42)]; // prettier-ignore
		expect(judge(position(close), '2,2>2,3', position([line('3,3>3,4', -45)]))[0]!.outcome).toBe('good'); // prettier-ignore
	});

	it('leaves out a move outside the lines whose position after it has no lines to value it by', () => {
		const mate: PositionAnalysis = {
			legal: 0,
			inCheck: true,
			repeated: false,
			lines: [],
			topByDepth: [],
		};
		expect(judge(position(LINES), '2,2>2,3', mate)).toEqual([]);
		expect(judge(position(LINES), '2,2>2,3', { refused: true })).toEqual([]);
	});

	it('leaves out forced, repeated, decided and refused positions', () => {
		expect(judge(position(LINES, { legal: 1 }), '1,1>1,2')).toEqual([]);
		expect(judge(position(LINES, { repeated: true }), '1,1>1,2')).toEqual([]);
		expect(judge(position([line('1,1>1,2', 5000), line('1,1>1,3', 4000)]), '1,1>1,2')).toEqual(
			[],
		);
		expect(judge({ refused: true }, '1,1>1,2')).toEqual([]);
	});

	it("reads a position's difficulty from its lines and how the search settled", () => {
		// A miss on top until the last depth, so it reads as a late, unshallow find at any plausible depth settings.
		const settledLate = position(LINES, { topByDepth: [...Array(11).fill('1,1>1,5'), '1,1>1,2'], inCheck: true }); // prettier-ignore
		expect(judge(settledLate, '1,1>1,2')[0]!.difficulty).toEqual({ goodMoves: 2, shallowFinds: false, deepFind: true, bestCaptures: false, inCheck: true }); // prettier-ignore
		expect(judge(position(LINES), '1,1>1,2')[0]!.difficulty).toEqual({ goodMoves: 2, shallowFinds: true, deepFind: false, bestCaptures: false, inCheck: false }); // prettier-ignore
	});

	it("judges only the requested player's moves", () => {
		const positions = [position(LINES), position(LINES), position(LINES)];
		expect(moveEvidence.gather(positions, ['1,1>1,2', '1,1>1,4'], 1).map((e) => e.ply)).toEqual(
			[1],
		);
	});
});
