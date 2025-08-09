
/**
 * This script is used to detect check,
 * or detect if a specific square is being attacked by any
 * other piece, be it individual, special, or sliding move.
 */


import boardutil from '../util/boardutil.js';
import gamefileutility from '../util/gamefileutility.js';
import organizedpieces from './organizedpieces.js';
import math from '../../util/math.js';
import typeutil from '../util/typeutil.js';
import coordutil from '../util/coordutil.js';

import { players } from '../util/typeutil.js';
import legalmoves from './legalmoves.js';

import type { Vec2 } from '../../util/math.js';
import type { Coords, CoordsKey } from '../util/coordutil.js';
import type { CoordsSpecial } from './movepiece.js';
import type { Player } from '../util/typeutil.js';
import type { Attacker } from './state.js';
import type { Board, FullGame } from './gamefile.js';


// Types -------------------------------------------------------------------



// Functions ----------------------------------------------------------------


/**
 * Tests if the provided player color is in check in the current position of the gamefile.
 * @param gamefile - The gamefile
 * @param color - The player color to test if any of their royals are in check in the current position.
 * @param trackAttackers - If true, the results object will contain a list of attackers checking the player's royals. This is useful for calculating blocking moves that may resolve the check. Should should be true if we're using checkmate, and left out if we're using royal capture, to save compute.
 * @returns An object containing information such as whether the given color is in check in the current position, which royals are in check, and if applicable, where the attacking/checking pieces are.
 */
function detectCheck(gamefile: FullGame, color: Player, trackAttackers?: boolean): { check: boolean, royalsInCheck: Coords[], attackers?: Attacker[] } {
	// Coordinates of ALL royals of this color!
	const royalCoords: Coords[] = boardutil.getRoyalCoordsOfColor(gamefile.boardsim.pieces, color);
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
 * @param gamefile
 * @param coord - The square of which to check if an opponent player color is attacking.
 * @param colorOfFriendly - The color of the friendly player. All other player colors will be tested to see if they attack the square.
 * @param [attackers] If provided, any opponent attacking the square will be appended to this array. If it is not provided, we may exit early as soon as one attacker is discovered.
 */
function isSquareBeingAttacked(gamefile: FullGame, coord: Coords, colorOfFriendly: Player, attackers?: Attacker[]): boolean {
	let atleast1Attacker = false;

	// How do we find out if this square is attacked?

	// 1. We check every square within a 3 block radius to see if there's any attacking pieces.

	if (doesVicinityAttackSquare(gamefile.boardsim, coord, colorOfFriendly, attackers)) {
		if (attackers) atleast1Attacker = true; // ARE keeping track of attackers, continue checking if there are more attacking the same square...
		else return true; // Not keeping track of attackers, exit early
	}
	// What about specials (e.g. pawns, roses...)? Could they capture us?
	if (doesSpecialAttackSquare(gamefile, coord, colorOfFriendly, attackers)) {
		if (attackers) atleast1Attacker = true; // ARE keeping track of attackers, continue checking if there are more attacking the same square...
		else return true; // Not keeping track of attackers, exit early
	}

	// 2. We check every orthogonal and diagonal to see if there's any attacking pieces.
	if (doesSlideAttackSquare(gamefile.boardsim, coord, colorOfFriendly, attackers)) {
		if (attackers) atleast1Attacker = true; // ARE keeping track of attackers, continue checking if there are more attacking the same square...
		else return true; // Not keeping track of attackers, exit early
	}

	return atleast1Attacker; // Being attacked if true
}

/**
 * Checks to see if any opponent jumper within the immediate vicinity of the coordinates can attack them with an individual move (discounting special movers).
 * @param boardsim 
 * @param square - The square to check if any opponent jumpers are attacking.
 * @param friendlyColor - The friendly player color
 * @param [attackers] If provided, any opponent jumper attacking the square will be appended to this array. If it is not provided, we may exit early as soon as one jumper attacker is discovered.
 * @returns true if the square is being attacked by atleast one opponent jumper with an individual move (discounting special movers).
 */
function doesVicinityAttackSquare(boardsim: Board, square: Coords, friendlyColor: Player, attackers?: Attacker[]): boolean {
	for (const [coordsKey, thisVicinity] of Object.entries(boardsim.vicinity)) {
		const thisSquare = coordutil.getCoordsFromKey(coordsKey as CoordsKey); // [1,2], [2,1], ...
		// Subtract the offset of our square
		const actualSquare: Coords = [square[0] - thisSquare[0], square[1] - thisSquare[1]];

		// Fetch the piece type currently on that square
		const typeOnSquare = boardutil.getTypeFromCoords(boardsim.pieces, actualSquare);
		if (typeOnSquare === undefined) continue; // Nothing there to capture us
		// Is it the same color?
		const [trimmedTypeOnSquare, typeOnSquareColor] = typeutil.splitType(typeOnSquare);
		if (friendlyColor === typeOnSquareColor) continue; // A friendly can't capture us
		if (typeOnSquareColor === players.NEUTRAL) continue; // Neutrals can't capture us either (GARGOYLE ALERT)

		// Is that a match with any piece type on this vicinity square?
		if ((thisVicinity as number[]).includes(trimmedTypeOnSquare)) { // This square can be captured
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
function doesSpecialAttackSquare(gamefile: FullGame, square: CoordsSpecial, friendlyColor: Player, attackers?: Attacker[]): boolean {
	const { boardsim } = gamefile;
	for (const [coordsKey, thisVicinity] of Object.entries(boardsim.specialVicinity)) {
		const thisSquare = coordutil.getCoordsFromKey(coordsKey as CoordsKey); // [1,2], [2,1], ...
		// Subtract the offset of our square
		const actualSquare: Coords = [square[0] - thisSquare[0], square[1] - thisSquare[1]];

		// Fetch the piece type currently on that square
		const typeOnSquare = boardutil.getTypeFromCoords(boardsim.pieces, actualSquare);
		if (typeOnSquare === undefined) continue; // Nothing there to capture us
		// Is it the same color?
		const [trimmedTypeOnSquare, typeOnSquareColor] = typeutil.splitType(typeOnSquare);
		if (friendlyColor === typeOnSquareColor) continue; // A friendly can't capture us
		if (typeOnSquareColor === players.NEUTRAL) continue; // Neutrals can't capture us either (GARGOYLE ALERT)

		// Is that a match with any piece type on this vicinity square?
		if ((thisVicinity as number[]).includes(trimmedTypeOnSquare)) { // This square can POTENTIALLY be captured via special move...
			// Calculate that special piece's legal moves to see if it ACTUALLY can capture on that square
			const pieceOnSquare = boardutil.getPieceFromCoords(boardsim.pieces, actualSquare)!;

			const moveset = legalmoves.getPieceMoveset(boardsim, pieceOnSquare.type);
			const specialPiecesLegalMoves = legalmoves.getEmptyLegalMoves(moveset);
			legalmoves.appendSpecialMoves(gamefile, pieceOnSquare, moveset, specialPiecesLegalMoves, false);
			// console.log("Calculated special pieces legal moves:");
			// console.log(jsutil.deepCopyObject(specialPiecesLegalMoves));

			if (!legalmoves.checkIfMoveLegal(gamefile, specialPiecesLegalMoves, actualSquare, square, friendlyColor)) continue; // This special piece can't make the capture THIS time... oof

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
 * @param boardsim 
 * @param square - The square to check if any opponent sliders are attacking.
 * @param friendlyColor - The friendly player color
 * @param [attackers] If provided, any opponent slider attacking the square will be appended to this array. If it is not provided, we may exit early as soon as one slider attacker is discovered.
 * @returns true if the square is being attacked by atleast one opponent slider.
 */
function doesSlideAttackSquare(boardsim: Board, square: Coords, friendlyColor: Player, attackers?: Attacker[]): boolean {

	let atleast1Attacker = false;

	for (const [directionkey, lineSet] of boardsim.pieces.lines) { // [dx,dy]
		const direction = coordutil.getCoordsFromKey(directionkey);
		const key = organizedpieces.getKeyFromLine(direction, square);
		if (doesLineAttackSquare(boardsim, lineSet.get(key), direction, square, friendlyColor, attackers)) {
			if (!attackers) return true; // Not keeping track of attackers, exit early
			atleast1Attacker = true;
		}
	}

	return atleast1Attacker;
}

/**
 * Tests if a piece on the specified organized line can capture on the specified square via a sliding move.
 * REQUIRES the square be on the line!!!
 * @param boardsim
 * @param line - The organized line of pieces
 * @param direction - The step of the line: [dx,dy]
 * @param coords - The coordinates of the square to test if any piece on the line can slide to. MUST be on the line!!!
 * @param color - The player color of friendlies. Friendlies can't capture us.
 * @param [attackers] - If provided, any opponent slider attacking the square will be appended to this array. If it is not provided, we may exit early as soon as one slider attacker is discovered.
 * @returns true if the square is under threat
 */
function doesLineAttackSquare(boardsim: Board, line: number[] | undefined, direction: Vec2, coords: Coords, color: Player, attackers?: Attacker[]): boolean {
	if (!line) return false; // This line doesn't exist, then obviously no pieces can attack our square

	const directionKey = math.getKeyFromVec2(direction); // 'dx,dy'
	let atleast1Attacker = false;

	// Iterate through every piece on the line, and test if they can attack our square
	for (const thisPieceIdx of line) { // { coords, type }
		const thisPiece = boardutil.getPieceFromIdx(boardsim.pieces, thisPieceIdx)!;
		const thisPieceColor = typeutil.getColorFromType(thisPiece.type);
		if (color === thisPieceColor) continue; // Same team, can't capture us, CONTINUE to next piece!
		if (thisPieceColor === players.NEUTRAL) continue; // Neutrals can't move, that means they can't make captures, right?

		const thisPieceMoveset = legalmoves.getPieceMoveset(boardsim, thisPiece.type);

		if (!thisPieceMoveset.sliding) continue; // Piece has no sliding movesets.
		const moveset = thisPieceMoveset.sliding[directionKey];
		if (!moveset) continue; // Piece can't slide in the direction our line is going
		const blockingFunc = legalmoves.getBlockingFuncFromPieceMoveset(thisPieceMoveset);
		const thisPieceLegalSlide = legalmoves.slide_CalcLegalLimit(blockingFunc, boardsim.pieces, line, direction, moveset, thisPiece.coords, thisPieceColor);
		if (!thisPieceLegalSlide) continue; // This piece can't move in the direction of this line, NEXT piece!

		const ignoreFunc = legalmoves.getIgnoreFuncFromPieceMoveset(thisPieceMoveset);
		if (!legalmoves.doesSlidingMovesetContainSquare(thisPieceLegalSlide, direction, thisPiece.coords, coords, ignoreFunc)) continue; // This piece can't slide so far as to reach us, NEXT piece!

		// This piece is attacking this square!

		if (!attackers) return true; // Attackers array isn't being tracked, just insta-return to save compute not finding other attackers!
		else appendAttackerToList(attackers, { coords: thisPiece.coords, slidingCheck: true });
		atleast1Attacker = true;
	}

	return atleast1Attacker;
}

/**
 * Only appends the attacker giving us check if they aren't already in our list.
 * This can happen if the same piece is checking multiple royals.
 * However, we do want to upgrade them to `slidingCheck` if they are in the list.
 * @param attackers - The running attackers list of pieces that are checking us.
 * @param attacker - The new attacker we want to append
 */
function appendAttackerToList(attackers: Attacker[], attacker: Attacker): void {
	for (let i = 0; i < attackers.length; i++) {
		const thisAttacker: Attacker = attackers[i]!; // { coords, slidingCheck }
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
 */
function isPlayerInCheck(boardsim: Board, color: Player): boolean {
	const royals = boardutil.getRoyalCoordsOfColor(boardsim.pieces, color).map(coordutil.getKeyFromCoords); // ['x,y','x,y']
	const royalsInCheck = gamefileutility.getCheckCoordsOfCurrentViewedPosition(boardsim);
	if (royalsInCheck.length === 0) return false;

	const checkedRoyals = royalsInCheck.map(coordutil.getKeyFromCoords); // ['x,y','x,y']
	// If the set is the same length as our royals + checkedRoyals, in means none of them has matching coordinates.
	return new Set([...royals, ...checkedRoyals]).size !== (royals.length + checkedRoyals.length);
}


// Exports ----------------------------------------------------------------


export default {
	detectCheck,
	doesLineAttackSquare,
	isPlayerInCheck,
	isSquareBeingAttacked
};

export type {

};