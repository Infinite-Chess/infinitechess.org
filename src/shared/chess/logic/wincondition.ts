// src/shared/chess/logic/wincondition.ts

/**
 * This script contains the methods for calculating if the
 * game is over by the win condition used, for all win
 * conditions except for checkmate, stalemate, and repetition.
 */

import type { Board } from './boardinit.js';
import type { Coords } from '../../util/coordutil.js';
import type { GameFile } from './gamefile.js';
import type { GameConclusion } from '../util/typeschemas.js';

import moveutil from './moveutil.js';
import boardutil from './boardutil.js';
import checkmate from './checkmate.js';
import repetition from './repetition.js';
import boardchanges from './boardchanges.js';
import gamefileutility from './gamefileutility.js';
import insufficientmaterial from './insufficientmaterial.js';
import typeutil, { RawType } from '../util/typeutil.js';
import { rawTypes as r, Player } from '../util/typeutil.js';

// Constants -------------------------------------------------------------------

/** The squares in KOTH where if you get your king to you WIN. */
const KOTH_CENTER_SQUARES: Coords[] = [[4n, 4n], [5n, 4n], [4n, 5n], [5n, 5n]]; // prettier-ignore

// Game Conclusion -------------------------------------------------------------

/**
 * Tests if the game is over by the used win condition, and if so,
 * sets the `gameConclusion` property according to how the game was terminated,
 * and adds the respective mate flag on the last move played.
 */
function doGameOverChecks(gamefile: GameFile): void {
	const gameConclusion = getGameConclusion(gamefile);
	setGameConclusion(gamefile, gameConclusion);
}

/** The conclusion the position has reached, or undefined if the game isn't over. */
function getGameConclusion(boardsim: Board): GameConclusion | undefined {
	if (!moveutil.areWeViewingLatestMove(boardsim))
		throw new Error("Cannot perform game over checks when we're not on the last move.");

	return (
		detectAllpiecescaptured(boardsim) ||
		detectRoyalCapture(boardsim) ||
		detectAllroyalscaptured(boardsim) ||
		detectKoth(boardsim) ||
		repetition.detect(boardsim) ||
		checkmate.detect(boardsim) ||
		// This needs to be last so that a draw isn't enforced in a true win
		detectMoveRule(boardsim) || // 50-move-rule
		insufficientmaterial.detect(boardsim) ||
		undefined
	); // No win condition passed. No game conclusion!
}

/** Sets the game's conclusion, adding the mate flag to the last move played if it was checkmate. */
function setGameConclusion(gamefile: GameFile, conclusion: GameConclusion | undefined): void {
	gamefile.gameConclusion = conclusion;
	if (conclusion?.condition === 'checkmate') moveutil.flagLastMoveAsMate(gamefile);
}

// Win Condition Detection -----------------------------------------------------

/** Win by capturing any one royal piece. */
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

/** Win by capturing the opponent's last remaining royal. */
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

/** Win by leaving the opponent with no pieces at all. */
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

/** Win by landing a king on one of the {@link KOTH_CENTER_SQUARES}. */
function detectKoth(boardsim: Board): GameConclusion | undefined {
	if (!gamefileutility.isOpponentUsingWinCondition(boardsim, boardsim.whosTurn, 'koth'))
		return undefined; // Not using this gamerule

	// With a last move, KOTH can only be newly reached by a king move — early exit otherwise.
	// With no last move (a flattened position), evaluate the current position directly.
	const lastMove = moveutil.getLastMove(boardsim.moves);
	if (lastMove && typeutil.getRawType(lastMove.type) !== r.KING) return undefined;

	// The color that moved last (the last player in the turn order when flattened) wins if
	// one of its kings sits on a center square.
	const colorThatMovedLast: Player = moveutil.getColorThatPlayedMoveIndex(
		boardsim,
		boardsim.moves.length - 1,
	);

	const kingInCenter = KOTH_CENTER_SQUARES.some((square) => {
		const typeAtSquare = boardutil.getTypeFromCoords(boardsim.pieces, square);
		if (typeAtSquare === undefined) return false;
		const [rawType, color] = typeutil.splitType(typeAtSquare);
		return color === colorThatMovedLast && rawType === r.KING;
	});

	if (kingInCenter) return { victor: colorThatMovedLast, condition: 'koth' };
	else return undefined;
}

/** Draw by the move rule (e.g. the 50-move rule), once its ply count is reached. */
function detectMoveRule(boardsim: Board): GameConclusion | undefined {
	if (boardsim.gameRules.moveRule === undefined) return undefined; // No move-rule being used
	if (boardsim.state.global.moveRuleState === boardsim.gameRules.moveRule) {
		return { victor: null, condition: 'moverule' };
	}
	return undefined;
}

// Helpers ---------------------------------------------------------------------

/** Whether the very last move captured a royal piece. Undefined if there was no capture. */
function wasLastMoveARoyalCapture(boardsim: Board): boolean | undefined {
	const lastMove = moveutil.getLastMove(boardsim.moves);
	if (!lastMove) return undefined;

	const capturedTypes = new Set<RawType>();

	boardchanges.getCapturedPieceTypes(lastMove).forEach((type: number) => {
		capturedTypes.add(typeutil.getRawType(type));
	});

	if (capturedTypes.size === 0) return undefined; // Last move not a capture

	// Checked by hand rather than with Set.isDisjointFrom — our Node/VSCode target lacks it.
	const royalSet = new Set<RawType>(typeutil.royals);
	for (const capturedType of capturedTypes) {
		if (royalSet.has(capturedType)) return true;
	}

	return false;
}

// Exports ---------------------------------------------------------------------

export default {
	// Game Conclusion
	doGameOverChecks,
	getGameConclusion,
	setGameConclusion,
};
