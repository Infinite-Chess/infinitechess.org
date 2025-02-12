

// Import Start
import insufficientmaterial from './insufficientmaterial.js';
import gamefileutility from '../util/gamefileutility.js';
import checkmate from './checkmate.js';
import organizedlines from './organizedlines.js';
import moveutil from '../util/moveutil.js';
import colorutil from '../util/colorutil.js';
import typeutil from '../util/typeutil.js';
import boardchanges from './boardchanges.js';
// Import End

// Type Definitions...

/** @typedef {import('./gamefile.js').gamefile} gamefile */
/** @typedef {import('../variants/gamerules.js'.GameRules) GameRules*/

"use strict";

/**
 * This script contains the methods for calculating if the
 * game is over by the win condition used, for all win
 * conditions except for checkmate, stalemate, and repetition.
 */

// The squares in KOTH where if you get your king to you WIN
const kothCenterSquares = [[4,4],[5,4],[4,5],[5,5]];

/**
 * Tests if the game is over by the win condition used, and if so,
 * returns the `gameConclusion` property of the gamefile.
 * For example, "white checkmate", or "draw stalemate".
 * @param {gamefile} gamefile - The gamefile
 * @returns {string | false} The conclusion string, if the game is over. For example, "white checkmate", or "draw stalemate". If the game isn't over, this returns *false*.
 */
function getGameConclusion(gamefile) {
	if (!moveutil.areWeViewingLatestMove(gamefile)) throw new Error("Cannot perform game over checks when we're not on the last move.");
	
	return detectAllpiecescaptured(gamefile)
        || detectRoyalCapture(gamefile)
        || detectAllroyalscaptured(gamefile)
        || detectKoth(gamefile)
        || detectRepetitionDraw(gamefile)
        || detectCheckmateOrStalemate(gamefile)
        // This needs to be last so that a draw isn't enforced in a true win
        || detectMoveRule(gamefile) // 50-move-rule
        || insufficientmaterial.detectInsufficientMaterial(gamefile) // checks for insufficient material
        || false; // No win condition passed. No game conclusion!
}

function detectRoyalCapture(gamefile) {
	if (!gamefileutility.isOpponentUsingWinCondition(gamefile, gamefile.whosTurn, 'royalcapture')) return false; // Not using this gamerule

	// Was the last move capturing a royal piece?
	if (wasLastMoveARoyalCapture(gamefile)) {
		const colorThatWon = moveutil.getColorThatPlayedMoveIndex(gamefile, gamefile.moves.length - 1);
		return `${colorThatWon} royalcapture`;
	}

	return false;
}

function detectAllroyalscaptured(gamefile) {
	if (!gamefileutility.isOpponentUsingWinCondition(gamefile, gamefile.whosTurn, 'allroyalscaptured')) return false; // Not using this gamerule
	if (!wasLastMoveARoyalCapture(gamefile)) return false; // Last move wasn't a royal capture.

	// Are there any royal pieces remaining?
	// Remember that whosTurn has already been flipped since the last move.
	const royalCount = gamefileutility.getCountOfTypesFromPiecesByType(gamefile.ourPieces, typeutil.royals, gamefile.whosTurn);

	if (royalCount === 0) {
		const colorThatWon = moveutil.getColorThatPlayedMoveIndex(gamefile, gamefile.moves.length - 1);
		return `${colorThatWon} allroyalscaptured`;
	}

	return false;
}

function detectAllpiecescaptured(gamefile) {
	if (!gamefileutility.isOpponentUsingWinCondition(gamefile, gamefile.whosTurn, 'allpiecescaptured')) return false; // Not using this gamerule

	// If the player who's turn it is now has zero pieces left, win!
	const count = gamefileutility.getPieceCountOfColor(gamefile, gamefile.whosTurn);

	if (count === 0) {
		const colorThatWon = moveutil.getColorThatPlayedMoveIndex(gamefile, gamefile.moves.length - 1);
		return `${colorThatWon} allpiecescaptured`;
	}

	return false;
}

function detectKoth(gamefile) {
	if (!gamefileutility.isOpponentUsingWinCondition(gamefile, gamefile.whosTurn, 'koth')) return false; // Not using this gamerule

	// Was the last move a king move?
	const lastMove = moveutil.getLastMove(gamefile.moves);
	if (!lastMove) return false;
	if (!lastMove.type.startsWith('kings')) return false;

	let kingInCenter = false;
	for (let i = 0; i < kothCenterSquares.length; i++) {
		const thisCenterSquare = kothCenterSquares[i];

		const typeAtSquare = gamefileutility.getPieceTypeAtCoords(gamefile, thisCenterSquare);
		if (!typeAtSquare) continue;
		if (typeAtSquare.startsWith('kings')) {
			kingInCenter = true;
			break;
		}
	}

	if (kingInCenter) {
		const colorThatWon = moveutil.getColorThatPlayedMoveIndex(gamefile, gamefile.moves.length - 1);
		return `${colorThatWon} koth`;
	}

	return false;
}

/**
 * Detects if the game is over by, for example, the 50-move rule.
 * @param {gamefile} gamefile - The gamefile
 * @returns {string | false} 'draw moverule', if the game is over by the move-rule, otherwise *false*.
 */
function detectMoveRule(gamefile) {
	if (!gamefile.gameRules.moveRule) return false; // No move-rule being used
	if (gamefile.moveRuleState === gamefile.gameRules.moveRule) return 'draw moverule';
	return false;
}

// Returns true if the very last move captured a royal piece.
function wasLastMoveARoyalCapture(gamefile) {
	const lastMove = moveutil.getLastMove(gamefile.moves);
	if (!lastMove) return false;

	const capturedTypes = new Set();

	boardchanges.getCapturedPieces(lastMove).forEach((piece) => {
		capturedTypes.add(colorutil.trimColorExtensionFromType(piece.type));
	});

	if (!capturedTypes.size) return false; // Last move not a capture

	// Does the piece type captured equal any royal piece?
	// Idk why vscode does not have set methods
	return !capturedTypes.isDisjointFrom(new Set(typeutil.royals)); // disjoint if they share nothing in common
}

/**
 * If the game is multiplayer, or if anyone gets multiple turns in a row, then that allows capturing
 * of the kings no matter the win conditions, by way of one person opening a discovered on turn 1, and
 * another person capturing the king on turn 2 => CHECKMATE NOT COMPATIBLE!
 * 
 * Checkmate is also not compatible with games with colinear lines present, because the logic surrounding
 * making opening discovered attacks illegal is a nightmare.
 * @param {gamefile} gamefile
 * @returns {boolean} true if the gamefile is checkmate compatible
 */
function isCheckmateCompatibleWithGame(gamefile) {
	if (gamefile.startSnapshot.pieceCount >= gamefileutility.pieceCountToDisableCheckmate) return false; // Too many pieces (checkmate algorithm takes too long)
	if (organizedlines.areColinearSlidesPresentInGame(gamefile)) return false; // Logic surrounding making opening discovered attacks illegal is a nightmare.
	if (gamefile.startSnapshot.playerCount > 2) return false; // 3+ Players allows for 1 player to open a discovered and a 2nd to capture a king. CHECKMATE NOT COMPATIBLE
	if (moveutil.doesAnyPlayerGet2TurnsInARow(gamefile)) return false; // This also allows the capture of the king.
	return true; // Checkmate compatible!
}

export default {
	getGameConclusion,
	isCheckmateCompatibleWithGame,
};