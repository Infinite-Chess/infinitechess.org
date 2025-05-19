
/**
 * This script contains our checkmate algorithm.
 */


// @ts-ignore
import type { gamefile } from './gamefile.js';


import typeutil from '../util/typeutil.js';
import gamefileutility from '../util/gamefileutility.js';
import boardutil from '../util/boardutil.js';
import moveutil from '../util/moveutil.js';
import { players, rawTypes } from '../util/typeutil.js';
import legalmoves from './legalmoves.js';


/**
 * Calculates if the provided gamefile is over by checkmate or stalemate
 * @param gamefile - The gamefile to detect if it's in checkmate
 * @returns The color of the player who won by checkmate. '1 checkmate', '2 checkmate', or '0 stalemate'. Or *false* if the game isn't over.
 */
function detectCheckmateOrStalemate(gamefile: gamefile): string | false {

	// The game will be over when the player has zero legal moves remaining, lose or draw.
	// Iterate through every piece, calculating its legal moves. The first legal move we find, we
	// know the game is not over yet...

	for (const rType of Object.values(rawTypes)) {
		const thisType = typeutil.buildType(rType, gamefile.whosTurn);
		const thesePieces = gamefile.pieces.typeRanges.get(thisType);
		if (!thesePieces) continue; // The game doesn't have this type of piece
		for (let idx = thesePieces.start; idx < thesePieces.end; idx++) {
			const thisPiece = boardutil.getPieceFromIdx(gamefile.pieces, idx);
			if (!thisPiece) continue; // Piece undefined. We leave in deleted pieces so others retain their index!
			const moves = legalmoves.calculate(gamefile, thisPiece);
			if (legalmoves.hasAtleast1Move(moves)) return false; // Not checkmate
		}
	}

	// We made it through every single piece without finding a single move.
	// So is this draw or checkmate? Depends on whether the current state is check!
	// Also make sure that checkmate can't happen if the winCondition is NOT checkmate!
	const usingCheckmate = gamefileutility.isOpponentUsingWinCondition(gamefile, gamefile.whosTurn, 'checkmate');
	if (gamefileutility.isCurrentViewedPositionInCheck(gamefile) && usingCheckmate) {
		const colorThatWon = moveutil.getColorThatPlayedMoveIndex(gamefile, gamefile.moves.length - 1);
		return `${colorThatWon} checkmate`;
	} else return `${players.NEUTRAL} stalemate`; // Victor of player NEUTRAL means it was a draw.
}


export {
	detectCheckmateOrStalemate,
};