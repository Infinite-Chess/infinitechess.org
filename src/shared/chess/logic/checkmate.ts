// src/shared/chess/logic/checkmate.ts

/**
 * This script contains our checkmate algorithm.
 */

import type { Board } from './boardinit.js';
import type { GameConclusion } from '../util/winconutil.js';

import typeutil from '../util/typeutil.js';
import moveutil from '../util/moveutil.js';
import boardutil from '../util/boardutil.js';
import legalmoves from './legalmoves.js';
import { rawTypes } from '../util/typeutil.js';
import gamefileutility from '../util/gamefileutility.js';

/**
 * Calculates if the provided boardsim is over by checkmate or stalemate
 * @returns The color of the player who won by checkmate.
 * `{ victor: 1, condition: 'checkmate' }`, `{ victor: 2, condition: 'checkmate' }`,
 * or `{ victor: 0, condition: 'stalemate' }`. Or *undefined* if the game isn't over.
 */
function detectCheckmateOrStalemate(boardsim: Board): GameConclusion | undefined {
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

export { detectCheckmateOrStalemate };
