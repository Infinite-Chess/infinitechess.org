
// Import Start
import legalmoves from './legalmoves.js';
import movepiece from './movepiece.js';
import gamefileutility from '../util/gamefileutility.js';
import specialdetect from './specialdetect.js';
import organizedlines from './organizedlines.js';
import math from '../../util/math.js';
import colorutil from '../util/colorutil.js';
import jsutil from '../../util/jsutil.js';
import coordutil from '../util/coordutil.js';
import boardchanges from './boardchanges.js';
import moveutil from '../util/moveutil.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('./gamefile.js').gamefile} gamefile
 * @typedef {import('./movepiece.js').MoveDraft} MoveDraft
 * @typedef {import('./legalmoves.js').LegalMoves} LegalMoves
 * @typedef {import('./boardchanges.js').Piece} Piece
 * @typedef {import('../../util/math.js').BoundingBox} BoundingBox
 * @typedef {import('../util/coordutil.js').Coords} Coords
 * @typedef {import('./movepiece.js').CoordsSpecial} CoordsSpecial
 * @typedef {import('./movepiece.js').path} path
 * @typedef {import('./gamefile.js').gamefile} gamefile
 */

"use strict";

/**
 * This script is used to test if given gamefiles are in check,
 * also for simulating which moves would lead to check and removed from the list of legal moves.
 * We also detect checkmate, stalemate, and repetition here.
 */

/**
 * Tests if the provided gamefile is currently in check.
 * Appends any attackers to the `attackers` list.
 * @param {gamefile} gamefile - The gamefile
 * @param {string} color - The side to test if their king is in check. "white" or "black"
 * @param {[]} [attackers] - An empty array [], or undefined if we don't care about who is checking us, just whether we are in check or not, this can save compute.
 * @returns {false | Coords[]} true if in check
 */
function detectCheck(gamefile, color, attackers) {
	// Input validation
	if (!gamefile) throw new Error("Cannot detect check of an undefined game!");
	if (color !== 'white' && color !== 'black') throw new Error(`Cannot detect check of the team of color ${color}!`);
	if (attackers !== undefined && attackers.length !== 0) throw new Error(`Attackers parameter must be an empty array []! Received: ${JSON.stringify(attackers)}`);

	// Coordinates of ALL royals of this color!
	const royalCoords = gamefileutility.getRoyalCoordsOfColor(gamefile, color); // [ coords1, coords2 ]
	// Array of coordinates of royal pieces that are in check
	const royalsInCheck = [];

	for (let i = 0; i < royalCoords.length; i++) {
		const thisRoyalCoord = royalCoords[i]; // [x,y]

		if (isSquareBeingAttacked(gamefile, thisRoyalCoord, color, attackers)) royalsInCheck.push(thisRoyalCoord);
	}

	if (royalsInCheck.length > 0) return royalsInCheck; // Return if atleast 1 royal is in check!

	return false; // Not in check
}

// Checks if opponent is attacking specified square. If so, returns true.
// If an attackers empty array [] is specified, it will fill it in the format: [ {coords, slidingCheck, path? }, ... ]
function isSquareBeingAttacked(gamefile, coord, colorOfFriendly, attackers) {
	// Input validation
	if (!gamefile) throw new Error("Cannot detect if a square of an undefined game is being attacked!");
	if (!coord) return false;
	if (colorOfFriendly !== 'white' && colorOfFriendly !== 'black') throw new Error(`Cannot detect if an opponent is attacking the square of the team of color ${colorOfFriendly}!`);

	let atleast1Attacker = false;

	// How do we find out if this square is attacked?

	// 1. We check every square within a 3 block radius to see if there's any attacking pieces.

	if (doesVicinityAttackSquare(gamefile, coord, colorOfFriendly, attackers)) atleast1Attacker = true;
	// What about pawns? Could they capture us?
	if (doesSpecialAttackSquare(gamefile, coord, colorOfFriendly, attackers)) atleast1Attacker = true;

	// 2. We check every orthogonal and diagonal to see if there's any attacking pieces.
	if (doesSlideAttackSquare(gamefile, coord, colorOfFriendly, attackers)) atleast1Attacker = true;

	return atleast1Attacker; // Being attacked if true
}

// Checks to see if any piece within a 3-block radius can capture. Ignores sliding movesets.
// If there is, appends to "attackers".
// DOES NOT account for pawns. For that use  doesPawnAttackSquare()
function doesVicinityAttackSquare(gamefile, coords, color, attackers) {

	const vicinity = gamefile.vicinity;
	for (const key in vicinity) {
		const thisVicinity = vicinity[key];
		const thisSquare = coordutil.getCoordsFromKey(key); // Part of the moveset ( [1,2], [2,1] ... )
		const actualSquare = [coords[0] - thisSquare[0], coords[1] - thisSquare[1]];

		// Fetch the square from our pieces organized by key
		const key2 = coordutil.getKeyFromCoords(actualSquare);
		const typeOnSquare = gamefile.piecesOrganizedByKey[key2];
		if (!typeOnSquare) continue; // Nothing there to capture us
		// Is it the same color?
		const typeOnSquareColor = colorutil.getPieceColorFromType(typeOnSquare);
		if (color === typeOnSquareColor) continue; // A friendly can't capture us

		const typeOnSquareConcat = colorutil.trimColorExtensionFromType(typeOnSquare);

		// Is that a match with any piece type on this vicinity square?
		if (thisVicinity.includes(typeOnSquareConcat)) { // This square can be captured
			if (attackers) appendAttackerToList(attackers, { coords: actualSquare, slidingCheck: false });
			return true; // There'll never be more than 1 short-range/jumping checks!
		}; 
	}

	return false;
}

/**
 * TODO: Clean up.
 * @param {gamefile} gamefile 
 * @param {*} coords 
 * @param {*} color 
 * @param {*} attackers 
 * @returns 
 */
function doesSpecialAttackSquare(gamefile, coords, color, attackers) {
	const specialVicinity = gamefile.specialVicinity;
	for (const [coordsKey, thisVicinity] of Object.entries(specialVicinity)) {

		const thisSquare = coordutil.getCoordsFromKey(coordsKey);
		const actualSquare = [coords[0] - thisSquare[0], coords[1] - thisSquare[1]];

		// Fetch the square from our pieces organized by key
		const actualSquareKey = coordutil.getKeyFromCoords(actualSquare);
		const typeOnSquare = gamefile.piecesOrganizedByKey[actualSquareKey];
		if (!typeOnSquare) continue; // Nothing there to capture us
		// Is it the same color?
		const typeOnSquareColor = colorutil.getPieceColorFromType(typeOnSquare);
		if (color === typeOnSquareColor) continue; // A friendly can't capture us

		const trimmedTypeOnSquare = colorutil.trimColorExtensionFromType(typeOnSquare);

		// Is that a match with any piece type on this vicinity square?
		if (thisVicinity.includes(trimmedTypeOnSquare)) { // This square can POTENTIALLY be captured...
			// Calculate that special piece's legal moves to see if it ACTUALLY can capture on that square
			const pieceOnSquare = gamefileutility.getPieceFromTypeAndCoords(gamefile, typeOnSquare, actualSquare);
			const specialPiecesLegalMoves = legalmoves.calculate(gamefile, pieceOnSquare, { onlyCalcSpecials: true, ignoreCheck: true });
			// console.log("Calculated special pieces legal moves:");
			// console.log(jsutil.deepCopyObject(specialPiecesLegalMoves));

			if (!legalmoves.checkIfMoveLegal(specialPiecesLegalMoves, actualSquare, coords)) continue; // This special piece can't make the capture THIS time... oof

			// console.log("SPECIAL PIECE CAN MAKE THE CAPTURE!!!!");

			const attacker = { coords: actualSquare, slidingCheck: false };
			/**
			 * If the `path` special flag is present (which it would be for Roses),
			 * attach that to the attacker, so that checkdetection can test if any
			 * legal moves can block the path to stop a check.
			 */
			if (coords.path !== undefined) attacker.path = coords.path;
			if (attackers) appendAttackerToList(attackers, attacker);
			return true; // There'll never be more than 1 short-range/jumping checks!
		}; 
	}

	return false;

}

/**
 * Calculates if any sliding piece can attack the specified square.
 * Appends attackers to the provided `attackers` array.
 * @param {gamefile} gamefile 
 * @param {Coords} coords - The square to test if it can be attacked
 * @param {string} color - The color of friendly pieces
 * @param {Object[]} attackers - A running list of attackers on this square. Any new found attackers will be appended to this this.
 * @returns {boolean} true if this square is under attack
 */
function doesSlideAttackSquare(gamefile, coords, color, attackers) {

	let atleast1Attacker = false;

	for (const direction of gamefile.startSnapshot.slidingPossible) { // [dx,dy]
		const directionKey = coordutil.getKeyFromCoords(direction);
		const key = organizedlines.getKeyFromLine(direction, coords);
		if (doesLineAttackSquare(gamefile, gamefile.piecesOrganizedByLines[directionKey][key], direction, coords, color, attackers)) atleast1Attacker = true;
	}

	return atleast1Attacker;
}

/**
 * Returns true if a piece on the specified line can capture on that square.
 * THIS REQUIRES `coords` be already on the line!!!
 * Appends any attackeres to the provided `attackers` array.
 * @param {gamefile} gamefile 
 * @param {Piece[]} line - The line of pieces
 * @param {Coords} direction - Step of the line: [dx,dy]
 * @param {number} coords - The coordinates of the square to test if any piece on the line can move to.
 * @param {string} color - The color of friendlies. We will exclude pieces of the same color, because they cannot capture friendlies.
 * @param {Object[]} [attackers] - The running list of attackers threatening these coordinates. Any attackers found will be appended to this list. LEAVE BLANK to save compute not adding them to this list!
 * @returns {boolean} true if the square is under threat
 */
function doesLineAttackSquare(gamefile, line, direction, coords, color, attackers) {
	if (!line) return false; // This line doesn't exist, then obviously no pieces can attack our square

	const directionKey = coordutil.getKeyFromCoords(direction); // 'dx,dy'
	let foundCheckersCount = 0;

	// Iterate through every piece on the line, and test if they can attack our square
	for (const thisPiece of line) { // { coords, type }

		const thisPieceColor = colorutil.getPieceColorFromType(thisPiece.type);
		if (color === thisPieceColor) continue; // Same team, can't capture us, CONTINUE to next piece!
		if (thisPieceColor === colorutil.colorOfNeutrals) continue; // Neutrals can't move, that means they can't make captures, right?

		const thisPieceMoveset = legalmoves.getPieceMoveset(gamefile, thisPiece.type);

		if (!thisPieceMoveset.sliding) continue; // Piece has no sliding movesets.
		const moveset = thisPieceMoveset.sliding[directionKey];
		if (!moveset) continue; // Piece can't slide in the direction our line is going
		const blockingFunc = legalmoves.getBlockingFuncFromPieceMoveset(thisPieceMoveset);
		const thisPieceLegalSlide = legalmoves.slide_CalcLegalLimit(blockingFunc, line, direction, moveset, thisPiece.coords, thisPieceColor);
		if (!thisPieceLegalSlide) continue; // This piece can't move in the direction of this line, NEXT piece!

		const ignoreFunc = legalmoves.getIgnoreFuncFromPieceMoveset(thisPieceMoveset);
		if (!legalmoves.doesSlidingMovesetContainSquare(thisPieceLegalSlide, direction, thisPiece.coords, coords, ignoreFunc)) continue; // This piece can't slide so far as to reach us, NEXT piece!

		// This piece is attacking this square!

		if (!attackers) return true; // Attackers array isn't being tracked, just insta-return to save compute not finding other attackers!
		foundCheckersCount++;
		appendAttackerToList(attackers, { coords: thisPiece.coords, slidingCheck: true });
	}

	return foundCheckersCount > 0;
}

/**
 * Only appends the attacker giving us check if they aren't already in our list.
 * This can happen if the same piece is checking multiple royals.
 * However, we do want to upgrade them to `slidingCheck` if this one is.
 * @param {Object[]} attackers - The current attackers list, of pieces that are checking us.
 * @param {Object} attacker - The current attacker we want to append, with the properties `coords` and `slidingCheck`.
 */
function appendAttackerToList(attackers, attacker) {
	for (let i = 0; i < attackers.length; i++) {
		const thisAttacker = attackers[i]; // { coords, slidingCheck }
		if (!coordutil.areCoordsEqual(thisAttacker.coords, attacker.coords)) continue; // Not the same piece
		// The same piece...
		// Upgrade the slidingCheck to true, if applicable.
		if (attacker.slidingCheck) thisAttacker.slidingCheck = true;
		return;
	}
	// The piece was not found in the list, add it...
	attackers.push(attacker);
}

/**
 * Detects if a player of a provided color has one of the registered checks in gamefile this turn.
 * @param {gamefile} gamefile 
 * @param {string} color 
 * @returns {boolean} true if atleast one of our royals is included in the gamefile's list of royals in check this turn
 */
function isColorInCheck(gamefile: gamefile, color: 'white' | 'black'): boolean {
	const royals = gamefileutility.getRoyalCoordsOfColor(gamefile, color).map(coordutil.getKeyFromCoords); // ['x,y','x,y']
	const royalsInCheck = gamefileutility.getCheckCoordsOfCurrentViewedPosition(gamefile);
	if (royalsInCheck.length === 0) return false;

	const checkedRoyals = royalsInCheck.map(coordutil.getKeyFromCoords); // ['x,y','x,y']
	// If the set is the same length as our royals + checkedRoyals, in means none of them has matching coordinates.
	return new Set([...royals, ...checkedRoyals]).size !== (royals.length + checkedRoyals.length);
}



export default {
	detectCheck,
	isColorInCheck,
};