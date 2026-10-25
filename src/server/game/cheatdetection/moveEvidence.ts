// src/server/game/cheatdetection/moveEvidence.ts

/**
 * Turns a game's position analyses into one piece of evidence per move a player made: how
 * hard the position was, and whether they found a good move and the engine's own choice.
 * Moves that say nothing about engine use (opening, forced, already decided, repeated) are
 * left out.
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
	/** Whether a good move captures or checks. */
	forcingGoodMove: boolean;
	inCheck: boolean;
	/** Win probability the opponent's move into the position threw away, 0 when unknown. */
	opponentBlunder: number;
	/** How far the best line is from even, 0 (even) to 1 (won or lost). */
	imbalance: number;
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

/** Each game's first plies are left out: players repeat memorized openings, the engine's included. */
const OPENING_PLIES = 4;
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
		const outcome = judge(
			ply,
			positions[ply - 1],
			positions[ply]!,
			positions[ply + 1]!,
			moves[ply]!,
		);
		if (outcome) evidence.push({ ply, ...outcome });
	}
	return evidence;
}

/**
 * Judges the move played at `ply` from `before` to `after`, or undefined when it says nothing.
 * @param previous - The position before the opponent's move into `before`, if any.
 */
function judge(
	ply: number,
	previous: PositionAnalysis | undefined,
	before: PositionAnalysis,
	after: PositionAnalysis,
	move: string,
): Judgement | undefined {
	if (ply < OPENING_PLIES) return undefined;
	if (before.refused || before.legal <= 1 || before.repeated || before.lines.length === 0) return undefined; // prettier-ignore
	const lineValues = before.lines.map((line) => winProbability(line.score));
	const best = lineValues[0]!;
	if (best > DECIDED_WIN_PROBABILITY || best < 1 - DECIDED_WIN_PROBABILITY) return undefined;

	const rank = before.lines.findIndex((line) => line.move === move);
	const value = rank >= 0 ? lineValues[rank]! : valueOutsideLines(after, lineValues);
	if (value === undefined) return undefined;

	const outcome: MoveOutcome = best - value > GOOD_LOSS ? 'miss' : rank === 0 ? 'top' : 'good';
	return { outcome, difficulty: difficultyOf(previous, before, lineValues) };
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

/**
 * How hard a searched position was, given each line's win probability.
 * @param previous - The position before the opponent's move into this one, if any.
 */
function difficultyOf(
	previous: PositionAnalysis | undefined,
	position: AnalysedPosition,
	lineValues: number[],
): Difficulty {
	const best = position.lines[0]!.move;
	const goodLines = position.lines.filter((_, rank) => lineValues[0]! - lineValues[rank]! <= GOOD_LOSS); // prettier-ignore
	const shallowTop = position.topByDepth[Math.min(SHALLOW_DEPTH, position.topByDepth.length) - 1];
	const lastWrongDepth = position.topByDepth.findLastIndex((move) => move !== best) + 1;
	return {
		goodMoves: goodLines.length,
		shallowFinds: goodLines.some((line) => line.move === shallowTop),
		deepFind: lastWrongDepth + 1 >= DEEP_FIND_DEPTH,
		bestCaptures: position.lines[0]!.captures,
		forcingGoodMove: goodLines.some((line) => line.captures || line.checks),
		inCheck: position.inCheck,
		opponentBlunder: opponentBlunder(previous, lineValues[0]!),
		imbalance: Math.abs(2 * lineValues[0]! - 1),
	};
}

/**
 * {@link Difficulty.opponentBlunder}: the opponent's best line before their move, less what
 * `best` leaves them.
 */
function opponentBlunder(previous: PositionAnalysis | undefined, best: number): number {
	if (!previous || previous.refused || previous.lines.length === 0) return 0;
	return Math.max(0, winProbability(previous.lines[0]!.score) - (1 - best));
}

/** A score as a win probability for its side, a forced mate as the strongest win. */
function winProbability(score: EngineScore): number {
	const cp = 'mate' in score ? (score.mate > 0 ? 1 : -1) * winchance.MATE_CP : score.cp;
	return winchance.cpToWinProbability(cp);
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	OPENING_PLIES,
	// Evidence
	gather,
	judge,
	winProbability,
};
