


/**
 * This script is used to test if given gamefiles are in check,
 * also for simulating which moves would lead to check and removed from the list of legal moves.
 * We also detect checkmate, stalemate, and repetition here.
 */


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


import type { gamefile } from './gamefile.js';
import type { MoveDraft } from './movepiece.js';
import type { LegalMoves } from './legalmoves.js';
import type { Piece } from './boardchanges.js';
import type { BoundingBox } from '../../util/math.js';
import type { Coords, CoordsKey } from '../util/coordutil.js';
import type { CoordsSpecial } from './movepiece.js';
import type { path } from './movepiece.js';


/** A single piece attacking/checking a royal */
interface Attacker {
	/** The coordinates of the attacker */
	coords: Coords,
	/** Whether the check is from a sliding movement (not individual, NOR special with a `path` attribute) */
	slidingCheck: boolean,
	/** Optionally, if it's an individual (non-slidingCheck), the path this piece takes to check the royal (e.g. Rose piece) */
	path?: path
}



/**
 * Tests if the provided player color is in check in the current position of the gamefile.
 * @param gamefile - The gamefile
 * @param color - The player color to test if any of their royals are in check in the current position.
 * @param trackAttackers - If true, the results object will contain a list of attackers checking the player's royals. This is useful for calculating blocking moves that may resolve the check. Should should be true if we're using checkmate, and left out if we're using royal capture, to save compute.
 * @returns An object containing information such as whether the given color is in check in the current position, which royals are in check, and if applicable, where the attacking/checking pieces are.
 */
function detectCheck(gamefile: gamefile, color: 'white' | 'black', trackAttackers?: true): { check: boolean, royalsInCheck: Coords[], attackers?: Attacker[] } {
	// Coordinates of ALL royals of this color!
	const royalCoords: Coords[] = gamefileutility.getRoyalCoordsOfColor(gamefile, color);
	// Array of coordinates of royal pieces that are in check
	const royalsInCheck: Coords[] = [];
	const attackers: Attacker[] | undefined = trackAttackers ? [] : undefined;

	royalCoords.forEach(thisRoyalCoord => {
		if (isSquareBeingAttacked(gamefile, thisRoyalCoord, color, attackers)) royalsInCheck.push(thisRoyalCoord);
	});

	return {
		check: royalsInCheck.length > 0,
		royalsInCheck,
		attackers
	};
}

/**
 * Checks if an opponent player color is attacking a specific square.
 * @param {gamefile} gamefile
 * @param {coord} coord - The square of which to check if an opponent player color is attacking.
 * @param colorOfFriendly - The color of the friendly player. All other player colors will be tested to see if they attack the square.
 * @param [attackers] If provided, any opponent attacking the square will be appended to this array. If it is not provided, we may exit early as soon as one attacker is discovered.
 */
function isSquareBeingAttacked(gamefile: gamefile, coord: Coords, colorOfFriendly: 'white' | 'black', attackers?: Attacker[]): boolean {
	let atleast1Attacker = false;

	// How do we find out if this square is attacked?

	// 1. We check every square within a 3 block radius to see if there's any attacking pieces.

	if (doesVicinityAttackSquare(gamefile, coord, colorOfFriendly, attackers)) {
		if (attackers) atleast1Attacker = true; // ARE keeping track of attackers, continue checking if there are more attacking the same square...
		else return true; // Not keeping track of attackers, exit early
	}
	// What about specials (e.g. pawns, roses...)? Could they capture us?
	if (doesSpecialAttackSquare(gamefile, coord, colorOfFriendly, attackers)) {
		if (attackers) atleast1Attacker = true; // ARE keeping track of attackers, continue checking if there are more attacking the same square...
		else return true; // Not keeping track of attackers, exit early
	}

	// 2. We check every orthogonal and diagonal to see if there's any attacking pieces.
	if (doesSlideAttackSquare(gamefile, coord, colorOfFriendly, attackers)) {
		if (attackers) atleast1Attacker = true; // ARE keeping track of attackers, continue checking if there are more attacking the same square...
		else return true; // Not keeping track of attackers, exit early
	}

	return atleast1Attacker; // Being attacked if true
}

//  piece within a 3-block radius can capture. Ignores sliding movesets.
// If there is, appends to "attackers".
// DOES NOT account for pawns. For that use  doesPawnAttackSquare()

/**
 * Checks to see if any opponent jumper within the immediate vicinity of the coordinates can attack them with an individual move (discounting special movers).
 * @param gamefile 
 * @param square - The square to check if any opponent jumpers are attacking.
 * @param friendlyColor - The friendly player color
 * @param [attackers] If provided, any opponent jumper attacking the square will be appended to this array. If it is not provided, we may exit early as soon as one jumper attacker is discovered.
 * @returns true if the square is being attacked by atleast one opponent jumper with an individual move (discounting special movers).
 */
function doesVicinityAttackSquare(gamefile: gamefile, square: Coords, friendlyColor: 'white' | 'black', attackers?: Attacker[]): boolean {
	for (const [coordsKey, thisVicinity] of Object.entries(gamefile.vicinity)) {
		const thisSquare = coordutil.getCoordsFromKey(coordsKey as CoordsKey); // [1,2], [2,1], ...
		// Subtract the offset of our square
		const actualSquare: Coords = [square[0] - thisSquare[0], square[1] - thisSquare[1]];

		// Fetch the piece type currently on that square
		const typeOnSquare = gamefileutility.getPieceTypeAtCoords(gamefile, actualSquare);
		if (!typeOnSquare) continue; // Nothing there to capture us
		// Is it the same color?
		const typeOnSquareColor = colorutil.getPieceColorFromType(typeOnSquare);
		if (friendlyColor === typeOnSquareColor) continue; // A friendly can't capture us

		const trimmedTypeOnSquare = colorutil.trimColorExtensionFromType(typeOnSquare);

		// Is that a match with any piece type on this vicinity square?
		if (thisVicinity.includes(trimmedTypeOnSquare)) { // This square can be captured
			if (attackers) appendAttackerToList(attackers, { coords: actualSquare, slidingCheck: false });
			return true; // There'll never be more than 1 short-range/jumping checks! UNLESS it's multiplayer, but multiplayer won't use checkmate anyway so attackers won't be specified
		};
	}

	return false; // No jumper attacks the square
}

/**
 * Checks to see if any piece within the immediate vicinity of the coordinates can attack them with via a special individual move (e.g. pawns, roses...)
 * @param {gamefile} gamefile 
 * @param square - The square to check if any opponent jumpers are attacking.
 * @param friendlyColor - The friendly player color
 * @param [attackers] If provided, any opponent jumper attacking the square will be appended to this array. If it is not provided, we may exit early as soon as one jumper attacker is discovered.
 * @returns true if the square is being attacked by atleast one piece via a special individual move.
 */
function doesSpecialAttackSquare(gamefile: gamefile, square: CoordsSpecial, friendlyColor: 'white' | 'black', attackers?: Attacker[]): boolean {
	for (const [coordsKey, thisVicinity] of Object.entries(gamefile.specialVicinity)) {
		const thisSquare = coordutil.getCoordsFromKey(coordsKey as CoordsKey); // [1,2], [2,1], ...
		// Subtract the offset of our square
		const actualSquare: Coords = [square[0] - thisSquare[0], square[1] - thisSquare[1]];

		// Fetch the piece type currently on that square
		const typeOnSquare = gamefileutility.getPieceTypeAtCoords(gamefile, actualSquare);
		if (!typeOnSquare) continue; // Nothing there to capture us
		// Is it the same color?
		const typeOnSquareColor = colorutil.getPieceColorFromType(typeOnSquare);
		if (friendlyColor === typeOnSquareColor) continue; // A friendly can't capture us

		const trimmedTypeOnSquare = colorutil.trimColorExtensionFromType(typeOnSquare);

		// Is that a match with any piece type on this vicinity square?
		if (thisVicinity.includes(trimmedTypeOnSquare)) { // This square can POTENTIALLY be captured via special move...
			// Calculate that special piece's legal moves to see if it ACTUALLY can capture on that square
			const pieceOnSquare = gamefileutility.getPieceFromTypeAndCoords(gamefile, typeOnSquare, actualSquare);
			const specialPiecesLegalMoves = legalmoves.calculate(gamefile, pieceOnSquare, { onlyCalcSpecials: true, ignoreCheck: true });
			// console.log("Calculated special pieces legal moves:");
			// console.log(jsutil.deepCopyObject(specialPiecesLegalMoves));

			if (!legalmoves.checkIfMoveLegal(specialPiecesLegalMoves, actualSquare, square)) continue; // This special piece can't make the capture THIS time... oof

			// console.log("SPECIAL PIECE CAN MAKE THE CAPTURE!!!!");

			if (attackers) {
				const attacker: Attacker = { coords: actualSquare, slidingCheck: false };
				/**
				 * If the `path` special flag is present (which it would be for Roses),
				 * attach that to the attacker, so that checkresolver can test if any
				 * legal moves can block the path to stop this check.
				 */
				if (square.path !== undefined) attacker.path = square.path;
				appendAttackerToList(attackers, attacker);
			}
			return true; // There'll never be more than 1 short-range/jumping checks! UNLESS it's multiplayer, but multiplayer won't use checkmate anyway so attackers won't be specified
		}; 
	}

	return false; // No special mover attacks the square
}

/**
 * Calculates if any sliding piece can attack the specified square.
 * @param gamefile 
 * @param square - The square to check if any opponent sliders are attacking.
 * @param friendlyColor - The friendly player color
 * @param [attackers] If provided, any opponent slider attacking the square will be appended to this array. If it is not provided, we may exit early as soon as one slider attacker is discovered.
 * @returns true if the square is being attacked by atleast one opponent slider.
 */
function doesSlideAttackSquare(gamefile: gamefile, square: Coords, friendlyColor: 'white' | 'black', attackers?: Attacker[]): boolean {

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
function doesLineAttackSquare(gamefile: gamefile, line: Piece[], direction: Coords, coords: Coords, color: 'white' | 'black', attackers?: Attacker[]): boolean {
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
function appendAttackerToList(attackers: Attacker[], attacker: Attacker): void {
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

export type {
	Attacker
};