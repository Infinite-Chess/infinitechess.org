
/**
 * This script contains our checkmate algorithm.
 */


// @ts-ignore
import type { gamefile } from './gamefile.js';


// @ts-ignore
import legalmoves from './legalmoves.js';
// @ts-ignore
import typeutil from '../util/typeutil.js';
import gamefileutility from '../util/gamefileutility.js';
import moveutil from '../util/moveutil.js';



/**
 * Calculates if the provided gamefile is over by checkmate or stalemate
 * @param gamefile - The gamefile to detect if it's in checkmate
 * @returns The color of the player who won by checkmate. 'white checkmate', 'black checkmate', or 'draw stalemate'. Or *false* if the game isn't over.
 */
function detectCheckmateOrStalemate(gamefile: gamefile): string | false {

	// The game will be over when the player has zero legal moves remaining, lose or draw.
	// Iterate through every piece, calculating its legal moves. The first legal move we find, we
	// know the game is not over yet...

	const teamTypes = typeutil.colorsTypes[gamefile.whosTurn]; // All types of our one specific color
	for (const thisType of teamTypes) {
		const thesePieces = gamefile.ourPieces[thisType];
		if (!thesePieces) continue; // The game doesn't have this type of piece
		for (const coords of thesePieces) {
			if (!coords) continue; // Piece undefined. We leave in deleted pieces so others retain their index!
			const thisPiece = gamefileutility.getPieceFromTypeAndCoords(gamefile, thisType, coords);
			const moves = legalmoves.calculate(gamefile, thisPiece);
			if (legalmoves.hasAtleast1Move(moves)) return false; // Not checkmate
		}
	}

	// We made it through every single piece without finding a single move.
	// So is this draw or checkmate? Depends on whether the current state is check!
	// Also make sure that checkmate can't happen if the winCondition is NOT checkmate!
	const usingCheckmate = gamefileutility.isOpponentUsingWinCondition(gamefile, gamefile.whosTurn as 'white' | 'black', 'checkmate');
	if (gamefileutility.isCurrentViewedPositionInCheck(gamefile) && usingCheckmate) {
		const colorThatWon = moveutil.getColorThatPlayedMoveIndex(gamefile, gamefile.moves.length - 1);
		return `${colorThatWon} checkmate`;
	} else return 'draw stalemate';
}


export {
	detectCheckmateOrStalemate,
};