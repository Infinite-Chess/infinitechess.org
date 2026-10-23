// src/server/game/cheatdetection/moveEvidence.ts

/**
 * Turns a game's position analyses into one piece of evidence per move a player made: how
 * hard the position was, and whether they found a good move and the engine's own choice.
 * Moves that say nothing about engine use (forced, already decided, repeated) are left out.
 */

import type { AnalysedPosition, EngineScore, PositionAnalysis } from './cheatDetectionTypes.js';

import winchance from '../../../shared/chess/util/winchance.js';

// Types -----------------------------------------------------------------------

/** What a move was, judged against the engine's lines. */
export type MoveOutcome = 'top' | 'good' | 'miss';

/** How hard a position was to find a good move in. */
export interface Difficulty {
	/** Moves within {@link GOOD_LOSS} of the best, among the engine's lines: 1 up to its MultiPV. */
	goodMoves: number;
	/** Whether a shallow search (depth 3) already found a good move. */
	shallowFinds: boolean;
	/** Whether the best move only settled at depth {@link DEEP_FIND_DEPTH} or deeper. */
	deepFind: boolean;
	bestCaptures: boolean;
	inCheck: boolean;
}

/** A move's outcome, and how hard its position was. */
interface Judgement {
	outcome: MoveOutcome;
	difficulty: Difficulty;
}

/**
 * One scored move. Stored as JSON in cheat_assessments: changes to it or the types inside it
 * must keep old rows readable.
 */
export interface MoveEvidence extends Judgement {
	ply: number;
}

// Constants -------------------------------------------------------------------

/** Win-probability loss within which a move counts as good. */
const GOOD_LOSS = 0.02;
/** Positions this one-sided are left out: nearly every move keeps them so. */
const DECIDED_WIN_PROBABILITY = 0.97;
/** The search depth a "shallow" look at the position stops at. */
const SHALLOW_DEPTH = 3;
/** A best move that only settles this deep is a deep find. */
const DEEP_FIND_DEPTH = 7;

// Evidence --------------------------------------------------------------------

/**
 * Evidence for every scored move the player moving at even (`parity` 0) or odd (1) plies made.
 * @param positions - The analysis of every position, the start's first and the final one last.
 * @param moves - The game's moves, as compact tokens.
 */
function gather(positions: PositionAnalysis[], moves: string[], parity: 0 | 1): MoveEvidence[] {
	const evidence: MoveEvidence[] = [];
	for (let ply = parity; ply < moves.length; ply += 2) {
		const outcome = judge(positions[ply]!, positions[ply + 1]!, moves[ply]!);
		if (outcome) evidence.push({ ply, ...outcome });
	}
	return evidence;
}

/** Judges the move played from `before` to `after`, or undefined when it says nothing. */
function judge(
	before: PositionAnalysis,
	after: PositionAnalysis,
	move: string,
): Judgement | undefined {
	if (before.refused || before.legal <= 1 || before.repeated || before.lines.length === 0) return undefined; // prettier-ignore
	const lineValues = before.lines.map((line) => winProbability(line.score));
	const best = lineValues[0]!;
	if (best > DECIDED_WIN_PROBABILITY || best < 1 - DECIDED_WIN_PROBABILITY) return undefined;

	const rank = before.lines.findIndex((line) => sameMove(line.move, move));
	const value = rank >= 0 ? lineValues[rank]! : valueOutsideLines(after, lineValues);
	if (value === undefined) return undefined;

	const outcome: MoveOutcome = best - value > GOOD_LOSS ? 'miss' : rank === 0 ? 'top' : 'good';
	return { outcome, difficulty: difficultyOf(before, lineValues) };
}

/**
 * A move the engine's lines left out, valued from the position it led to: no better than the
 * last line, since the search ranked it below all of them. Undefined when that position can't
 * say, including after a move that ended the game.
 */
function valueOutsideLines(after: PositionAnalysis, lineValues: number[]): number | undefined {
	if (after.refused || after.lines.length === 0) return undefined;
	return Math.min(1 - winProbability(after.lines[0]!.score), lineValues.at(-1)!);
}

/** How hard a searched position was, given each line's win probability. */
function difficultyOf(position: AnalysedPosition, lineValues: number[]): Difficulty {
	const best = position.lines[0]!.move;
	const isGood = (move: string): boolean => {
		const rank = position.lines.findIndex((line) => line.move === move);
		return rank >= 0 && lineValues[0]! - lineValues[rank]! <= GOOD_LOSS;
	};
	const shallowTop = position.topByDepth[Math.min(SHALLOW_DEPTH, position.topByDepth.length) - 1];
	const lastWrongDepth = position.topByDepth.findLastIndex((move) => move !== best) + 1;
	return {
		goodMoves: lineValues.filter((value) => lineValues[0]! - value <= GOOD_LOSS).length,
		shallowFinds: shallowTop !== undefined && isGood(shallowTop),
		deepFind: lastWrongDepth + 1 >= DEEP_FIND_DEPTH,
		bestCaptures: position.lines[0]!.captures,
		inCheck: position.inCheck,
	};
}

/** A score as a win probability for its side, a forced mate as the strongest win. */
function winProbability(score: EngineScore): number {
	const cp = 'mate' in score ? (score.mate > 0 ? 1 : -1) * winchance.MATE_CP : score.cp;
	return winchance.cpToWinProbability(cp);
}

/** Whether two compact tokens are the same move, ignoring which piece a promotion makes. */
function sameMove(a: string, b: string): boolean {
	return a.split('=')[0] === b.split('=')[0];
}

// Exports ---------------------------------------------------------------------

export default {
	gather,
	winProbability,
	sameMove,
};
