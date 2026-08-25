// src/shared/chess/logic/checkmate.ts

/**
 * This script contains our checkmate algorithm,
 * and the rules deciding when a game may afford to use it.
 */

import type { Board } from './boardinit.js';
import type { GameConclusion } from '../util/winconutil.js';

import typeutil from '../../util/typeutil.js';
import moveutil from './moveutil.js';
import boardutil from './boardutil.js';
import legalmoves from './legalmoves.js';
import { rawTypes } from '../../util/typeutil.js';
import gamefileutility from './gamefileutility.js';

// Constants -------------------------------------------------------------------

/** The most pieces in-game that still affords the checkmate algorithm. Above this uses "royalcapture". */
const MAX_PIECES = 50_000;

/** The most royals in-game that still affords the checkmate algorithm. Above this uses "royalcapture". */
const MAX_ROYALS = 6;

// Functions -------------------------------------------------------------------

/**
 * If the game is multiplayer, or if anyone gets multiple turns in a row, then that allows capturing
 * of the kings no matter the win conditions, by way of one person opening a discovered on turn 1, and
 * another person capturing the king on turn 2 => CHECKMATE NOT COMPATIBLE!
 *
 * Checkmate is also not compatible with games with colinear lines present, because the logic surrounding
 * making opening discovered attacks illegal is a nightmare.
 * @returns true if the gamefile is checkmate compatible
 */
function isCompatible(boardsim: Board): boolean {
	if (boardsim.editor) return false; // This prevents legal move calculation respecting check in the editor.
	if (boardutil.getPieceCountOfGame(boardsim.pieces) > MAX_PIECES) return false; // Too many pieces (checkmate algorithm takes too long)
	if (boardsim.pieces.slides.length > 16) return false; // If the game has more lines than this, then checkmate creates lag spikes.
	if (gamefileutility.getPlayerCount(boardsim) > 2) return false; // 3+ Players allows for 1 player to open a discovered and a 2nd to capture a king. CHECKMATE NOT COMPATIBLE
	if (moveutil.doesAnyPlayerGet2TurnsInARow(boardsim.gameRules)) return false; // This also allows the capture of the king.
	if (boardutil.getRoyalCountOfGame(boardsim.pieces) > MAX_ROYALS) return false; // Too many royals (check & checkmate algorithm takes too long)
	return true; // Checkmate compatible!
}

/**
 * Calculates if the provided boardsim is over by checkmate or stalemate
 * @returns The color of the player who won by checkmate.
 * `{ victor: 1, condition: 'checkmate' }`, `{ victor: 2, condition: 'checkmate' }`,
 * or `{ victor: 0, condition: 'stalemate' }`. Or *undefined* if the game isn't over.
 */
function detect(boardsim: Board): GameConclusion | undefined {
	// The game will be over when the player has zero legal moves remaining, lose or draw.
	// Iterate through every piece, calculating its legal moves. The first legal move we find, we
	// know the game is not over yet...

	for (const rType of Object.values(rawTypes)) {
		const thisType = typeutil.buildType(rType, boardsim.whosTurn);
		const thesePieces = boardsim.pieces.typeRanges.get(thisType);
		if (!thesePieces) continue; // The game doesn't have this type of piece
		for (let idx = thesePieces.start; idx < thesePieces.end; idx++) {
			const thisPiece = boardutil.getPieceFromIdx(boardsim.pieces, idx);
			if (!thisPiece) continue; // Piece undefined. We leave in deleted pieces so others retain their index!
			const moves = legalmoves.calculateAll(boardsim, thisPiece);
			if (legalmoves.hasAtleast1Move(moves, boardsim, thisPiece)) return undefined; // Not checkmate
		}
	}

	// We made it through every single piece without finding a single move.
	// So is this draw or checkmate? Depends on whether the current state is check!
	// Also make sure that checkmate can't happen if the winCondition is NOT checkmate!
	const usingCheckmate = gamefileutility.isOpponentUsingWinCondition(
		boardsim,
		boardsim.whosTurn,
		'checkmate',
	);
	if (gamefileutility.isCurrentViewedPositionInCheck(boardsim) && usingCheckmate) {
		const colorThatWon = moveutil.getColorThatPlayedMoveIndex(
			boardsim,
			boardsim.moves.length - 1,
		);
		return { victor: colorThatWon, condition: 'checkmate' };
	} else return { victor: null, condition: 'stalemate' };
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	MAX_ROYALS,
	// Functions
	isCompatible,
	detect,
};
