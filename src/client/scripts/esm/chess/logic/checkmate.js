
// Import Start
import gamefileutility from '../util/gamefileutility.js';
import moveutil from '../../game/gui/moveutil.js';
import legalmoves from './legalmoves.js';
import typeutil from '../util/typeutil.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('./gamefile.js').gamefile} gamefile
 * @typedef {import('../../game/gui/moveutil.js').Move} Move
*/

"use strict";

/**
 * This script contains our checkmate algorithm,
 * and 3-fold repetition algorithm.
 */

/**
 * Calculates if the provided gamefile is over by checkmate or a repetition draw
 * @param {gamefile} gamefile - The gamefile to detect if it's in checkmate
 * @returns {string | false} The color of the player who won by checkmate. 'white checkmate', 'black checkmate', or 'draw repetition', 'draw stalemate'. Or *false* if the game isn't over.
 */
function detectCheckmateOrDraw(gamefile) {

	// Is there a draw by repetition?
	if (detectRepetitionDraw(gamefile)) return 'draw repetition';

	// The game also will be over when the player has zero legal moves remaining, lose or draw.
	// Iterate through every piece, calculating its legal moves. The first legal move we find, we
	// know the game is not over yet...

	const whosTurn = gamefile.whosTurn;
	const teamTypes = typeutil.colorsTypes[whosTurn];
	for (const thisType of teamTypes) {
		const thesePieces = gamefile.ourPieces[thisType];
		for (let a = 0; a < thesePieces.length; a++) {
			const coords = thesePieces[a];
			if (!coords) continue; // Piece undefined. We leave in deleted pieces so others retain their index!
			const index = gamefileutility.getPieceIndexByTypeAndCoords(gamefile, thisType, coords);
			const thisPiece = { type: thisType, coords, index }; // { index, coords }
			const moves = legalmoves.calculate(gamefile, thisPiece);
			if (!legalmoves.hasAtleast1Move(moves)) continue;
			return false;
		}
	}

	// We made it through every single piece without finding a single move.
	// So is this draw or checkmate? Depends on whether the current state is check!
	// Also make sure that checkmate can't happen if the winCondition is NOT checkmate!
	const usingCheckmate = gamefileutility.isOpponentUsingWinCondition(gamefile, 'checkmate');
	if (gamefile.inCheck && usingCheckmate) {
		const colorThatWon = moveutil.getColorThatPlayedMoveIndex(gamefile, gamefile.moves.length - 1);
		return `${colorThatWon} checkmate`;
	} else return 'draw stalemate';
}

// /** THE OLD CHECKMATE ALGORITHM, THAT IS ASYNCHRONIOUS. NO LONGER USED. ASYNC STUFF IS TOO MUCH OF A KNIGHTMARE.
//  * USE ROYALCAPTURE TO REMOVE FREEZES. JUST DON'T DO STALEMATE DETECTION IF THERE'S TOO MANY PIECES.
//  *
//  * Calculates if the provided gamefile is over by checkmate or a repetition draw
//  * @param {gamefile} gamefile - The gamefile to detect if it's in checkmate
//  * @returns {string} The color of the player who won by checkmate. 'white checkmate', 'black checkmate', or 'draw repetition', or 'draw stalemate'
//  */
// // Returns false when game is not over, 'white' if white has won, 'black', or 'draw'
// async function detectCheckmateOrDraw(gamefile) {

//     // Is there a draw by repetition?

//     if (detectRepetitionDraw(gamefile)) return 'draw repetition'

//     // No repetition

//     // The game also will be over when the player has zero legal moves remaining, lose or draw.

//     const whosTurn = gamefile.whosTurn;

//     // Iterate through every piece, calculating its legal moves. The first legal move we find, we
//     // know the game is not over yet.

//     // How much time can we spend on this potentially long task?
//     const ourPieceCount = gamefileutility.getPieceCountOfColorFromPiecesByType(gamefile.ourPieces, whosTurn);
//     let pieceLimitToRecalcTime = 50;
//     let piecesSinceLastCheck = 0;
//     let piecesComplete = 0;
//     let startTime = performance.now();
//     let timeToStop = startTime + loadbalancer.getLongTaskTime();

//     gamefile.legalMoveSearch.isRunning = true;
//     gamefile.mesh.locked++;

//     // console.log('Begin checking for checkmate!')
//     // main.startTimer()

//     const whiteOrBlack = whosTurn === 'white' ? typeutil.colorsTypes.white : typeutil.colorsTypes.black;
//     for (let i = 0; i < whiteOrBlack.length; i++) {
//         const thisType = whiteOrBlack[i];
//         const thesePieces = gamefile.ourPieces[thisType]
//         for (let a = 0; a < thesePieces.length; a++) {
//             const coords = thesePieces[a];
//             if (!coords) continue; // Piece undefined. We leave in deleted pieces so others retain their index!
//             const index = gamefileutility.getPieceIndexByTypeAndCoords(gamefile, thisType, coords)
//             const thisPiece = { type: thisType, coords, index }; // { index, coords }
//             const moves = legalmoves.calculate(gamefile, thisPiece)
//             if (legalmoves.hasAtleast1Move(moves)) {
//                 // main.stopTimer((time) => console.log(`Checkmate alg finished! ${time} milliseconds! ${thisType} ${coords}`))
//                 stats.hideMoveLooking();
//                 gamefile.legalMoveSearch.isRunning = false;
//                 gamefile.mesh.locked--;
//                 return false;
//             }

//             // If we've spent too much time, sleep!
//             piecesSinceLastCheck++;
//             piecesComplete++;
//             if (piecesSinceLastCheck >= pieceLimitToRecalcTime) {
//                 piecesSinceLastCheck = 0;
//                 await sleepIfUsedTooMuchTime();
//                 if (gamefile.legalMoveSearch.terminate) {
//                     console.log("Legal move search terminated.");
//                     gamefile.legalMoveSearch.terminate = false;
//                     gamefile.legalMoveSearch.isRunning = false;
//                     gamefile.mesh.locked--;
//                     stats.hideMoveLooking();
//                     return;
//                 }
//                 if (loadbalancer.getForceCalc()) {
//                     pieceLimitToRecalcTime = Infinity;
//                     loadbalancer.setForceCalc(false);
//                 }
//             }
//         }
//     }

//     async function sleepIfUsedTooMuchTime() {

//         if (!usedTooMuchTime()) return; // Keep processing...

//         // console.log(`Too much! Sleeping.. Used ${performance.now() - startTime} of our allocated ${maxTimeToSpend}`)
//         const percentComplete = piecesComplete / ourPieceCount;
//         stats.updateMoveLooking(percentComplete);
//         await thread.sleep(0);
//         startTime = performance.now();
//         timeToStop = startTime + loadbalancer.getLongTaskTime();
//     }

//     function usedTooMuchTime() {
//         return performance.now() >= timeToStop;
//     }

//     stats.hideMoveLooking();
//     gamefile.legalMoveSearch.isRunning = false;
//     gamefile.mesh.locked--;

//     // main.stopTimer((time) => console.log(`Checkmate alg finished! ${time} milliseconds!`))

//     // We made it through every single piece without finding a single move.
//     // So is this draw or checkmate? Depends on whether the current state is check!
//     // Also make sure that checkmate can't happen if the winCondition is NOT checkmate!
//     const usingCheckmate = gamefileutility.isOpponentUsingWinCondition(gamefile, 'checkmate')
//     if (gamefile.inCheck && usingCheckmate) {

//         if (whosTurn === 'white') return 'black checkmate' // Black wins
//         else                      return 'white checkmate' // White wins

//     } else return 'draw stalemate';
// }

/**
 * Tests if the provided gamefile has had a repetition draw.
 * 
 * Complexity O(m) where m is the move count since the last pawn push or capture!
 * @param {gamefile} gamefile - The gamefile
 * @returns {boolean} *true* if there has been a repetition draw
 */
function detectRepetitionDraw(gamefile) {
	const moveList = gamefile.moves;

	const deficit = { }; // `x,y,type`
	const surplus = { }; // `x,y,type`

	// TODO: Make sure that all special rights, and gamefile's en passant values,
	// match, in order for positions to be counted as equal!!!!!

	let equalPositionsFound = 0;

	let index = moveList.length - 1;
	let indexOfLastEqualPositionFound = index + 1; // We need +1 because the first move we observe is the move that brought us to this move index.
	while (index >= 0) {

		// Moves are in the format: { type, startCoords, endCoords, captured: 'type'}
		/** @type {Move} */
		const thisMove = moveList[index];

		// If the move was a pawn push or capture, no further equal positions, terminate the loop.
		if (thisMove.captured || thisMove.type.startsWith('pawns')) break;

		// If this move was undo'd, there would be a DEFICIT on its endCoords
		const endCoords = thisMove.endCoords;
		let key = `${endCoords[0]},${endCoords[1]},${thisMove.type}`;
		// If there is a SURPLUS with this exact same key, delete that instead! It's been canceled-out.
		if (surplus[key]) delete surplus[key];
		else deficit[key] = true;

		// There would also be a SURPLUS on its startCoords
		const startCoords = thisMove.startCoords;
		key = `${startCoords[0]},${startCoords[1]},${thisMove.type}`;
		// If there is a DEFICIT with this exact same key, delete that instead! It's been canceled-out.
		if (deficit[key]) delete deficit[key];
		else surplus[key] = true;

		checkEqualPosition: {
			// Has a full turn cycle ocurred since the last increment of equalPositionsFound?
			// If so, we can't count this as an equal position, because it will break it in multiplayer games,
			// or if we have multiple turns in a row.
			const indexDiff = indexOfLastEqualPositionFound - index;
			if (indexDiff < gamefile.gameRules.turnOrder.length) break checkEqualPosition; // Hasn't been a full turn cycle yet, don't increment the counter

			// If both the deficit and surplus objects are EMPTY, this position is equal to our current position!
			const deficitKeys = Object.keys(deficit);
			const surplusKeys = Object.keys(surplus);
			if (deficitKeys.length === 0 && surplusKeys.length === 0) {
				equalPositionsFound++;
				indexOfLastEqualPositionFound = index;
				if (equalPositionsFound === 2) break; // Enough to confirm a repetition draw!
			}
		}

		// Prep for next iteration, decrement index.
		// WILL BE -1 if we've reached the beginning of the game!
		index--;
	}

	// Loop is finished. How many equal positions did we find?
	return equalPositionsFound === 2; // TRUE if there's a repetition draw!
}

export default {
	detectCheckmateOrDraw,
};