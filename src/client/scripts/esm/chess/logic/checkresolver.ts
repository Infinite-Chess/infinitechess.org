
/**
 * This script contains methods that reduce the legal moves of a piece
 * to only the ones that don't leave the player in check.
 * 
 * This could be pinned pieces opening a discovered,
 * or not dodging/blocking/capturing an existing check.
 */


import type { Piece } from "./boardchanges.js";
import type { CoordsSpecial, MoveDraft, path } from "./movepiece.js";
import type { Coords } from "./movesets.js";
import type { BoundingBox, Vec2, Vec2Key } from "../../util/math.js";
// @ts-ignore
import type { LegalMoves } from './legalmoves.js';
// @ts-ignore
import type { gamefile } from "../logic/gamefile.js";


import gamefileutility from "../util/gamefileutility.js";
import math from "../../util/math.js";
import organizedlines from "./organizedlines.js";
import boardchanges from "./boardchanges.js";
import coordutil from "../util/coordutil.js";
import movepiece from "./movepiece.js";
import jsutil from "../../util/jsutil.js";
import moveutil from "../util/moveutil.js";
// @ts-ignore
import checkdetection from "./checkdetection.js";
// @ts-ignore
import specialdetect from "./specialdetect.js";
// @ts-ignore
import legalmoves from "./legalmoves.js";



/**
 * Deletes individual and sliding moves from the provided LegalMoves object that,
 * if they were to be played, would result in that player being in check.
 * These moves are illegal if your opponent has the 'checkmate' win condition.
 * 
 * This could be pinned pieces opening a discovered,
 * or not dodging/blocking/capturing an existing check.
 * 
 * If only a finite number of squares of a slide are legal, the whole slide is
 * still deleted, and those finite number of squares added as new individual moves.
 * @param gamefile 
 * @param moves - The LegalMoves object
 * @param pieceSelected - The piece of which the legalMoves were calculated for
 * @param color - The color of the player owning the piece
 */
function removeCheckInvalidMoves(gamefile: gamefile, moves: LegalMoves, pieceSelected: Piece, color: 'white' | 'black' | 'neutral'): void { // moves: { individual: [], horizontal: [], ... }
	if (color === 'neutral') return; // Neutral pieces can't be in check
	if (!gamefileutility.isOpponentUsingWinCondition(gamefile, color, 'checkmate')) return;

	// There's a couple type of moves that put you in check:

	// 1. Sliding moves. Possible they can open a discovered check, or fail to address an existing check.
	// Check these FIRST because in situations where we are in existing check, additional individual moves may be added, which are then simulated below to see if they're legal.
	removeCheckInvalidMoves_Sliding(gamefile, moves, pieceSelected, color);

	// 2. Individual moves. We can iterate through these and use detectCheck() to test them.
	removeCheckInvalidMoves_Individual(gamefile, moves.individual, pieceSelected, color);
}

/**
 * Deletes moves from the provided legal individual moves list that,
 * if they were to be played, would result in that player being in check.
 * 
 * This could be pinned pieces opening a discovered,
 * or not dodging/blocking/capturing an existing check.
 * @param gamefile 
 * @param individualMoves - The precalculated legal individual (jumping) moves for a piece.
 * @param piece - The piece of which the legal individual moves are for.
 * @param color - The color of the player the piece belongs to.
 */
function removeCheckInvalidMoves_Individual(gamefile: gamefile, individualMoves: CoordsSpecial[], piece: Piece, color: 'white' | 'black'): void { // [ [x,y], [x,y] ]
	// Simulate the move, then check the game state for check
	for (let i = individualMoves.length - 1; i >= 0; i--) { // Iterate backwards so we don't run into issues as we delete indices while iterating
		const thisMove: CoordsSpecial = individualMoves[i]!; // [x,y]
		if (isMoveCheckInvalid(gamefile, piece, thisMove, color)) individualMoves.splice(i, 1); // Remove the move
	}
}


/**
 * Deletes sliding moves from the provided legal moves object that are illegal (i.e. they result in check).
 * This can happen if they don't address an existing check, OR they open a discovered attack on your king.
 * 
 * If finitely many moves of a slide protect against check, the slide is still deleted, and each
 * one is added to the legal individual moves.
 * @param gamefile 
 * @param moves - The precalculated legalMoves object for a piece.
 * @param piece - The piece of which the running legal moves are for.
 * @param color - The color of the player the piece belongs to.
 */
function removeCheckInvalidMoves_Sliding(gamefile: gamefile, moves: LegalMoves, piece: Piece, color: 'white' | 'black'): void {
	if (!moves.sliding) return; // No sliding moves to remove

	/** List of coordinates of all our royal jumping pieces */
	const royalCoords: Coords[] = gamefileutility.getJumpingRoyalCoordsOfColor(gamefile, color);
	if (royalCoords.length === 0) return; // No royals, no open discoveries, don't remove any sliding moves

	// There are 2 ways a sliding move can put you in check...

	// 1. By not blocking, or capturing an already-existing check.
	const royalsInCheck = gamefileutility.getCheckCoordsOfCurrentViewedPosition(gamefile);
	if (addressExistingChecks(gamefile, moves, royalsInCheck, piece.coords, color)) return;

	// 2. By opening a discovered on your king.
	royalCoords.forEach(thisRoyalCoords => { // Don't let the piece open a discovered on ANY of our royals! Not just one.
		removeSlidingMovesThatOpenDiscovered(gamefile, moves, thisRoyalCoords, piece, color);
	});
}

/**
 * If there's an existing check: Returns true and removes all sliding moves that don't have a chance at addressing the check.
 * All moves that have a chance to address the check (because they land on a blocking square) are added as individual moves
 * and simulated afterward to verify whether they resolve it or not.
 * @param gamefile - The gamefile
 * @param legalMoves - The legal moves object of which to delete moves that don't address check.
 * @param royalCoords - A list of our friendly jumping royal pieces
 * @param selectedPieceCoords - The coordinates of the piece we're calculating the legal moves for.
 * @param color - The color of friendlies
 * @returns true if we are in check. If so, all sliding moves are deleted, and finite individual blocking/capturing individual moves are appended.
 */
function addressExistingChecks(gamefile: gamefile, legalMoves: LegalMoves, royalCoords: Coords[], selectedPieceCoords: Coords, color: 'white' | 'black'): boolean {
	if (royalCoords.length === 0) return false; // Exit if nothing in check
	if (!checkdetection.isPlayerInCheck(gamefile, color)) return false; // Our OPPONENT is in check, not us! Them being in check doesn't restrict our movement!

	const attackerCount = gamefile.attackers.length;
	if (attackerCount === 0) throw new Error("We are in check, but there is no specified attacker!");

	// To know how to address the check, we have to know where the check is coming from.
	// For now, add legal blocks for the first attacker, not the others. Since legal blocks
	// are added as extra individual moves, they will be simulated afterward. And if
	// the inCheck property comes back as false, then it will block ALL attackers!
	const attacker = gamefile.attackers[0]; // { coords, slidingCheck }

	// Does this piece have a sliding moveset that will either...

	// 1. Capture the checking piece

	const capturingNotPossible = attackerCount > 1; // With a double check, it's impossible to capture both pieces at once, forced to dodge with the king.

	// Check if the piece has the ability to capture
	if (!capturingNotPossible && legalmoves.checkIfMoveLegal(legalMoves, selectedPieceCoords, attacker.coords, { ignoreIndividualMoves: true })) {
		legalMoves.individual.push(attacker.coords); // Can capture!
	}

	// 2. Block the check

	/**
	 * If it's a jumping move (not sliding),
	 * AND it doesn't have the `path` special flag with atleast 3 waypoints (blockable),
	 * 
	 * or its a sliding move,
	 * AND one square away from the checked piece,
	 * 
	 * then it's impossible to block.
	 */
	const dist = math.chebyshevDistance(royalCoords[0]!, attacker.coords);
	if (!attacker.slidingCheck && (attacker.path?.length ?? 2) < 3
		|| attacker.slidingCheck && dist === 1) {
		// Impossible to block
		delete legalMoves.sliding; // Erase all sliding moves
		return true;
	}

	/**
	 * By this point we know it's either a:
	 * 1. Sliding check
	 * 2. Individual check, with 3+ path length
	 */
	
	if (attacker.slidingCheck) appendBlockingMoves(gamefile, royalCoords[0]!, attacker.coords, legalMoves, selectedPieceCoords);
	else appendPathBlockingMoves(attacker.path!, legalMoves, selectedPieceCoords);

	delete legalMoves.sliding; // Erase all sliding moves
	
	return true;
}

/**
 * Deletes any sliding moves from the provided running legal moves that
 * open up a discovered attack on the specified coordinates
 * 
 * TODO: THIS DOES NOT MAKE IT ILLEGAL TO MOVE A SLIDING PIECE THAT OPENS A DISCOVERED AGAINST A ROSE PIECE!!!!!!
 * We must instead, delete the piece, then SIMULATE for check, THEN delete moves it has if it was check!
 * @param gamefile 
 * @param moves - The running legal moves of the selected piece
 * @param kingCoords - The coordinates to see what sliding moves open up a discovered on
 * @param pieceSelected - The piece with the provided running legal moves
 * @param color - The color of friendlies
 */
function removeSlidingMovesThatOpenDiscovered(gamefile: gamefile, moves: LegalMoves, kingCoords: Coords, pieceSelected: Piece, color: string): void {
	const selectedPieceCoords = pieceSelected.coords;
	/** A list of line directions that we're sharing with the king! */
	const sameLines: Vec2[] = []; // [ [dx,dy], [dx,dy] ]
	// Only check current possible slides
	for (const line of gamefile.startSnapshot.slidingPossible) { // [dx,dy]
		const lineKey1 = organizedlines.getKeyFromLine(line, kingCoords);
		const lineKey2 = organizedlines.getKeyFromLine(line, selectedPieceCoords);
		if (lineKey1 !== lineKey2) continue; // Not same line
		sameLines.push(line); // The piece is sharing this line with the king
	};
	// If not sharing any common line, there's no way we can open a discovered
	if (sameLines.length === 0) return;

	// Delete the piece, and add it back when we're done!
	const deleteChange = boardchanges.queueDeletePiece([], pieceSelected, true);
	boardchanges.runChanges(gamefile, deleteChange, boardchanges.changeFuncs, true);
    
	// let checklines = []; // For Idon's code below
	// For every line direction we share with the king...
	for (const direction1 of sameLines) { // [dx,dy]
		const strline = coordutil.getKeyFromCoords(direction1); // 'dx,dy'
		const key = organizedlines.getKeyFromLine(direction1,kingCoords); // 'C|X'
		const line = gamefile.piecesOrganizedByLines[strline][key];
		const opensDiscovered = legalmoves.doesLineAttackSquare(gamefile, line, direction1, kingCoords, color);
		if (!opensDiscovered) continue;
		// The piece opens a discovered if it were to be gone!
		// checklines.push(line); // For Idon's code below
		// Delete all lines except this one (because if we move off of it we would be in check!)
		for (const direction2 of Object.keys(moves.sliding)) { // 'dx,dy'
			const direction2NumbArray = coordutil.getCoordsFromKey(direction2 as Vec2Key); // [dx,dy]
			if (coordutil.areCoordsEqual(direction1, direction2NumbArray)) continue; // Same line, it's okay to keep because it wouldn't open a discovered
			delete moves.sliding[direction2]; // Not same line, delete it because it would open a discovered.
		}
	}

	// Idon us's code that handles the situation where moving off a line could expose multiple checks
	// ON THE same line!! It's so tricky to know what squares would keep the discovered closed.
	// See the discussion on discord: https://discord.com/channels/1114425729569017918/1260357580845224138/1263583566563119165
	// const tempslides = {}
	// r : {
	//     if (checklines.length > 1) {
	//         if (math.areLinesCollinear(checklines)) {
	//             // FIXME: this is a problem as (2,0) (1,0) if (1,0) is added it can slide into (2,0) gaps opening check
	//             // Another case (3,0) (2,0) correct blocks are along (6,0) but thats not an organized line

	//             // Please can someone optimize this

	//             let fline = checklines[0];
	//             let fGcd = math.GCD(fline[0],fline[1]);

	//             const baseLine = [fline[0]/fGcd, fline[1]/fGcd];

	//             let mult = [];
	//             checklines.forEach((line) => {mult.push(math.GCD(line[0],line[1]))});
	//             const lcm = math.LCM(Object.values(mult));

	//             const steps = [0,0]
	//             for (const strline in moves.sliding) {
	//                 const line = coordutil.getCoordsFromKey(strline);
	//                 if (!math.areLinesCollinear([line, baseLine])) continue;
	//                 const gcd = math.GCD(line[0], line[1]);
	//                 let rslides = [Math.floor(moves.sliding[strline][0]/lcm*gcd),Math.floor(moves.sliding[strline][1]/lcm*gcd)];
	//                 if (rslides[0]<steps[0]) steps[0] = rslides[0];
	//                 if (rslides[1]>steps[1]) steps[1] = rslides[1];
	//             }

	//             const line = [baseLine[0]*lcm,baseLine[1]*lcm]

	//             if (!gamefile.startSnapshot.slidingPossible.includes(line)) {
	//                 const strline = coordutil.getKeyFromCoords(line) 
	//                 tempslides[strline] = steps
	//             } else {
	//                 for (i=steps[0]; i<=steps[1]; i++) {
	//                     if (i==0) continue;
	//                     moves.individual.push([line[0]*i,line[1]*i])
	//                 }
	//             }

	//             } else {
	//             // Cannot slide to block all attack lines so blank the sliding
	//             // Could probably blank regular attacks too
	//         }
	//     } else if (checklines.length === 1) {
	//         const strline = coordutil.getKeyFromCoords(checklines[0])
	//         if (!moves.sliding[strline]) break r;
	//         tempslides[strline] = moves.sliding[strline] 
	//     }
	// }

	// Add the piece back with the EXACT SAME index it had before!!
	boardchanges.runChanges(gamefile, deleteChange, boardchanges.changeFuncs, false);
}

/**
 * Appends legal blocking moves to the provided moves object if the piece
 * is able to get between squares 1 & 2.
 * @param gamefile
 * @param square1 - `[x,y]`
 * @param square2 - `[x,y]`
 * @param moves - The legal moves object of the piece selected, to see if it is able to block between squares 1 & 2
 * @param coords - The coordinates of the piece with the provided legal moves: `[x,y]`
 */
function appendBlockingMoves(gamefile: gamefile, square1: Coords, square2: Coords, moves: LegalMoves, coords: Coords): void { // coords is of the selected piece
	/** The minimum bounding box that contains our 2 squares, at opposite corners. */
	const box: BoundingBox = {
		left: Math.min(square1[0],square2[0]),
		right: Math.max(square1[0],square2[0]),
		top: Math.max(square1[1],square2[1]),
		bottom: Math.min(square1[1],square2[1])
	};


	for (const lineKey in moves.sliding) { // 'dx,dy'
		const line = coordutil.getCoordsFromKey(lineKey as Vec2Key); // [dx,dy]
		const line1GeneralForm = math.getLineGeneralFormFromCoordsAndVec(coords, line);
		const line2GeneralForm = math.getLineGeneralFormFrom2Coords(square1, square2);
		const blockPoint = math.calcIntersectionPointOfLines(...line1GeneralForm, ...line2GeneralForm); // The intersection point of the 2 lines.

		if (blockPoint === undefined) continue; // None (or infinite) intersection points!
		if (!math.boxContainsSquare(box, blockPoint)) continue; // Intersection point not between our 2 points, but outside of them.
		if (!coordutil.areCoordsIntegers(blockPoint)) continue; // It doesn't intersect at a whole number, impossible for our piece to move here!
		if (coordutil.areCoordsEqual(blockPoint, square1)) continue; // Can't move onto our piece that's in check..
		if (coordutil.areCoordsEqual(blockPoint, square2)) continue; // nor to the piece that is checking us (those are added prior to this if it's legal)!
		// Don't add the move if it's already in the list. This can happen with colinear lines, since different slide direction can have the same exact vector, and thus blocking point.
		if (gamefile.startSnapshot.colinearsPresent && moves.individual.some((move: CoordsSpecial) => move[0] === blockPoint[0] && move[1] === blockPoint[1])) continue;

		// Can our piece legally move there?
		if (legalmoves.checkIfMoveLegal(moves, coords, blockPoint, { ignoreIndividualMoves: true })) moves.individual.push(blockPoint); // Can block!
	}
}

/**
 * Takes a `path` special flag of a checking attacker piece, and appends any legal individual
 * blocking moves our selected piece can land on.
 * @param path - Individual move's `path` special move flag, with guaranteed atleast 3 waypoints within it.
 * @param legalMoves - The precalculated legal moves of the selected piece
 * @param selectedPieceCoords 
 */
function appendPathBlockingMoves(path: path, legalMoves: LegalMoves, selectedPieceCoords: Coords): void {

	/**
	 * How do we tell if our selected piece can block an individual move with a path (Rose piece)?
	 * 
	 * Whether it can move to any of the waypoints in the path (exluding start and end waypoints).
	 * The reason we exclude the start waypoint is because we already check earlier
	 * if it's legal to capure the attacker.
	 */

	for (let i = 1; i < path.length - 1; i++) { // Iterate through all path points, EXCLUDING start and end.
		const blockPoint = path[i]!;
		// Can our selected piece move to this square?
		if (legalmoves.checkIfMoveLegal(legalMoves, selectedPieceCoords, blockPoint, { ignoreIndividualMoves: true })) legalMoves.individual.push(coordutil.copyCoords(blockPoint)); // Can block!
	}
}

/**
 * Simulates moving the piece to the destination coords,
 * then tests if it results in the player who owns the piece being in check.
 * @param gamefile 
 * @param piece - The piece moving to the destination coords
 * @param destCoords - The coords to move the piece to, with any attached special flags to execute with the move.
 * @param color - The color of the player the piece belongs to.
 * @returns Whether the move would result in the player owning the piece being in check.
 */
function isMoveCheckInvalid(gamefile: gamefile, piece: Piece, destCoords: CoordsSpecial, color: 'white' | 'black') { // pieceSelected: { type, index, coords }
	const moveDraft: MoveDraft = { startCoords: jsutil.deepCopyObject(piece.coords), endCoords: moveutil.stripSpecialMoveTagsFromCoords(destCoords) };
	specialdetect.transferSpecialFlags_FromCoordsToMove(destCoords, moveDraft);
	return movepiece.getSimulatedCheck(gamefile, moveDraft, color).check;
}



export default {
	removeCheckInvalidMoves,
	isMoveCheckInvalid,
};