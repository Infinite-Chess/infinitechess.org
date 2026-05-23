// src/shared/chess/logic/wincondition.ts

/**
 * This script contains the methods for calculating if the
 * game is over by the win condition used, for all win
 * conditions except for checkmate, stalemate, and repetition.
 */

import type { Board } from './boardinit.js';
import type { Coords } from '../util/coordutil.js';
import type { GameFile } from './fullgame.js';
import type { GameConclusion } from '../util/winconutil.js';

import moveutil from '../util/moveutil.js';
import boardutil from '../util/boardutil.js';
import winconutil from '../util/winconutil.js';
import boardchanges from './boardchanges.js';
import gamefileutility from '../util/gamefileutility.js';
import typeutil, { RawType } from '../util/typeutil.js';
import { detectRepetitionDraw } from './repetition.js';
import { rawTypes as r, Player } from '../util/typeutil.js';
import { detectInsufficientMaterial } from './insufficientmaterial.js';
import { detectCheckmateOrStalemate } from './checkmate.js';

// The squares in KOTH where if you get your king to you WIN
// prettier-ignore
const kothCenterSquares: Coords[] = [[4n, 4n], [5n, 4n], [4n, 5n], [5n, 5n]];

/**
 * Tests if the game is over by the used win condition, and if so,
 * sets the `gameConclusion` property according to how the game was terminated,
 * and adds the respective mate flag on the last move played.
 */
function doGameOverChecks(gamefile: GameFile): void {
	const conclusion = getGameConclusion(gamefile);
	gamefileutility.setConclusion(gamefile, conclusion);
	if (conclusion !== undefined && winconutil.isConclusionMoveTriggered(conclusion.condition))
		moveutil.flagLastMoveAsMate(gamefile);
}

/**
 * Tests if the game is over by the win condition used, and if so,
 * returns the `gameConclusion` property of the boardsim.
 * For example, `{ victor: 1, condition: 'checkmate' }`, or `{ victor: 0, condition: 'stalemate' }`.
 * @param boardsim - The boardsim
 * @returns The conclusion object, if the game is over. For example, `{ victor: 1, condition: 'checkmate' }`, or `{ victor: 0, condition: 'stalemate' }`. If the game isn't over, this returns *undefined*.
 */
function getGameConclusion(boardsim: Board): GameConclusion | undefined {
	if (!moveutil.areWeViewingLatestMove(boardsim))
		throw new Error("Cannot perform game over checks when we're not on the last move.");

	return (
		detectAllpiecescaptured(boardsim) ||
		detectRoyalCapture(boardsim) ||
		detectAllroyalscaptured(boardsim) ||
		detectKoth(boardsim) ||
		detectRepetitionDraw(boardsim) ||
		detectCheckmateOrStalemate(boardsim) ||
		// This needs to be last so that a draw isn't enforced in a true win
		detectMoveRule(boardsim) || // 50-move-rule
		detectInsufficientMaterial(boardsim) ||
		undefined
	); // No win condition passed. No game conclusion!
}

function detectRoyalCapture(boardsim: Board): GameConclusion | undefined {
	if (!gamefileutility.isOpponentUsingWinCondition(boardsim, boardsim.whosTurn, 'royalcapture'))
		return undefined; // Not using this gamerule

	// Was the last move capturing a royal piece?
	if (wasLastMoveARoyalCapture(boardsim)) {
		const colorThatWon: Player = moveutil.getColorThatPlayedMoveIndex(
			boardsim,
			boardsim.moves.length - 1,
		);
		return { victor: colorThatWon, condition: 'royalcapture' };
	}

	return undefined;
}

function detectAllroyalscaptured(boardsim: Board): GameConclusion | undefined {
	if (
		!gamefileutility.isOpponentUsingWinCondition(
			boardsim,
			boardsim.whosTurn,
			'allroyalscaptured',
		)
	)
		return undefined; // Not using this gamerule
	if (!wasLastMoveARoyalCapture(boardsim)) return undefined; // Last move wasn't a royal capture.

	// Are there any royal pieces remaining?
	// Remember that whosTurn has already been flipped since the last move.
	const royalCount: Coords[] = boardutil.getRoyalCoordsOfColor(
		boardsim.pieces,
		boardsim.whosTurn,
	);

	if (royalCount.length === 0) {
		const colorThatWon: Player = moveutil.getColorThatPlayedMoveIndex(
			boardsim,
			boardsim.moves.length - 1,
		);
		return { victor: colorThatWon, condition: 'allroyalscaptured' };
	}

	return undefined;
}

function detectAllpiecescaptured(boardsim: Board): GameConclusion | undefined {
	if (
		!gamefileutility.isOpponentUsingWinCondition(
			boardsim,
			boardsim.whosTurn,
			'allpiecescaptured',
		)
	)
		return undefined; // Not using this gamerule

	// If the player who's turn it is now has zero pieces left, win!
	const count: number = boardutil.getPieceCountOfColor(boardsim.pieces, boardsim.whosTurn);

	if (count === 0) {
		const colorThatWon: Player = moveutil.getColorThatPlayedMoveIndex(
			boardsim,
			boardsim.moves.length - 1,
		);
		return { victor: colorThatWon, condition: 'allpiecescaptured' };
	}

	return undefined;
}

function detectKoth(boardsim: Board): GameConclusion | undefined {
	if (!gamefileutility.isOpponentUsingWinCondition(boardsim, boardsim.whosTurn, 'koth'))
		return undefined; // Not using this gamerule

	// Was the last move a king move?
	const lastMove = moveutil.getLastMove(boardsim.moves);
	if (!lastMove) return undefined;
	if (typeutil.getRawType(lastMove.type) !== r.KING) return undefined;

	let kingInCenter = false;
	for (const thisCenterSquare of kothCenterSquares) {
		const typeAtSquare: number | undefined = boardutil.getTypeFromCoords(
			boardsim.pieces,
			thisCenterSquare,
		);
		if (typeAtSquare === undefined) continue;
		if (typeutil.getRawType(typeAtSquare) === r.KING) {
			kingInCenter = true;
			break;
		}
	}

	if (kingInCenter) {
		const colorThatWon: Player = moveutil.getColorThatPlayedMoveIndex(
			boardsim,
			boardsim.moves.length - 1,
		);
		return { victor: colorThatWon, condition: 'koth' };
	}

	return undefined;
}

/**
 * Detects if the game is over by, for example, the 50-move rule.
 * @param boardsim - The boardsim
 * @returns `{ victor: 0, condition: 'moverule' }`, if the game is over by the move-rule, otherwise *undefined*.
 */
function detectMoveRule(boardsim: Board): GameConclusion | undefined {
	if (boardsim.gameRules.moveRule === undefined) return undefined; // No move-rule being used
	if (boardsim.state.global.moveRuleState === boardsim.gameRules.moveRule) {
		return { victor: null, condition: 'moverule' };
	}
	return undefined;
}

// Returns true if the very last move captured a royal piece.
function wasLastMoveARoyalCapture(boardsim: Board): boolean | undefined {
	const lastMove = moveutil.getLastMove(boardsim.moves);
	if (!lastMove) return undefined;

	const capturedTypes = new Set<RawType>();

	boardchanges.getCapturedPieceTypes(lastMove).forEach((type: number) => {
		capturedTypes.add(typeutil.getRawType(type));
	});

	if (capturedTypes.size === 0) return undefined; // Last move not a capture

	// Vscode or the Node.js environment does NOT have set methods!
	// return !capturedTypes.isDisjointFrom(new Set(typeutil.royals)); // disjoint if they share nothing in common
	// Check if any captured type is a royal piece.
	const royalSet = new Set<RawType>(typeutil.royals);
	for (const capturedType of capturedTypes) {
		if (royalSet.has(capturedType)) return true;
	}

	return false;
}

export default {
	getGameConclusion,
	doGameOverChecks,
};
