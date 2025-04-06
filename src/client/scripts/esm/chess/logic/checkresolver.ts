
/**
 * This script contains methods that reduce the legal moves of a piece
 * to only the ones that don't leave the player in check.
 * 
 * This could be not dodging/blocking/capturing an existing check,
 * or pinned pieces opening a discovered.
 */

/* eslint-disable max-depth */


import type { Piece } from "../util/boardutil.js";
import type { CoordsSpecial, MoveDraft, path } from "./movepiece.js";
import type { Coords } from "./movesets.js";
import type { BoundingBox, Vec2Key } from "../../util/math.js";
import type { Player } from "../util/typeutil.js";
// @ts-ignore
import type { LegalMoves } from './legalmoves.js';
// @ts-ignore
import type { gamefile } from "../logic/gamefile.js";

import gamefileutility from "../util/gamefileutility.js";
import boardutil from "../util/boardutil.js";
import math from "../../util/math.js";
import boardchanges from "./boardchanges.js";
import coordutil from "../util/coordutil.js";
import movepiece from "./movepiece.js";
import jsutil from "../../util/jsutil.js";
import moveutil from "../util/moveutil.js";

import { players } from "../util/typeutil.js";
// @ts-ignore
import typeutil from "../util/typeutil.js";
// @ts-ignore
import checkdetection from "./checkdetection.js";
// @ts-ignore
import specialdetect from "./specialdetect.js";
// @ts-ignore
import legalmoves from "./legalmoves.js";

// Functions ------------------------------------------------------------------------------


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
function removeCheckInvalidMoves(gamefile: gamefile, moves: LegalMoves, pieceSelected: Piece, color: Player): void { // moves: { individual: [], horizontal: [], ... }
	if (color === players.NEUTRAL) return; // Neutral pieces can't be in check
	if (!gamefileutility.isOpponentUsingWinCondition(gamefile, color, 'checkmate')) return;

	// There's a couple type of moves that put you in check:

	// 1. Sliding moves. Possible they can open a discovered check, or fail to address an existing check.
	// Check these FIRST because in situations where we are in existing check, additional individual moves may be added, which are then simulated below to see if they're legal.
	removeCheckInvalidMoves_Sliding(gamefile, moves, pieceSelected, color);

	// 2. Individual moves. We can iterate through these and use detectCheck() to test them.
	removeCheckInvalidMoves_Individual(gamefile, moves.individual, pieceSelected, color);

	// console.log("Legal moves after removing check invalid:");
	// console.log(moves);
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
function removeCheckInvalidMoves_Individual(gamefile: gamefile, individualMoves: CoordsSpecial[], piece: Piece, color: Player): void { // [ [x,y], [x,y] ]
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
function removeCheckInvalidMoves_Sliding(gamefile: gamefile, moves: LegalMoves, piece: Piece, color: Player): void {
	if (!moves.sliding) return; // No sliding moves to remove

	/** List of coordinates of all our royal jumping pieces */
	const royalCoords: Coords[] = boardutil.getJumpingRoyalCoordsOfColor(gamefile.ourPieces, color);
	if (royalCoords.length === 0) return; // No royals, no open discoveries, don't remove any sliding moves

	// There are 3 ways a sliding move can put you in check...

	// 1. The piece making the sliding move IS A ROYAL itself (royalqueen) and it moves into check.
	const trimmedType = typeutil.getRawType(piece.type);
	// @ts-ignore
	if (typeutil.slidingRoyals.includes(trimmedType)) {
		moves.brute = true; // Flag the sliding moves to brute force check each move to see if it results in check, disallowing it if so.
		return; // That's all we need. EVERY move is simulated, even if other pieces are in check.
	}

	// 1. By not blocking, or capturing an already-existing check.
	const royalsInCheck = gamefileutility.getCheckCoordsOfCurrentViewedPosition(gamefile);
	if (addressExistingChecks(gamefile, moves, royalsInCheck, piece.coords, color)) return;
	/**
	 * 2. By opening a discovered attack on one of our royals.
	 * We only need to do this if there wasn't an existing check we had to resolve,
	 * as the few finitely many moves that resolve that check will have already been added.
	 */
	else removeSlidingMovesThatOpenDiscovered(gamefile, moves, piece, color);
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
function addressExistingChecks(gamefile: gamefile, legalMoves: LegalMoves, royalCoords: Coords[], selectedPieceCoords: Coords, color: Player): boolean {
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

	let capturingMove: Coords | undefined; // We will ONLY add this move if all sliding moves are deleted, otherwise it may be a duplicate.
	const capturingImpossible = attackerCount > 1 && !gamefile.colinearsPresent; // With a double check, it's impossible to capture both pieces at once, forced to dodge with the king.
	// Check if the piece has the ability to capture
	if (!capturingImpossible && legalmoves.checkIfMoveLegal(gamefile, legalMoves, selectedPieceCoords, attacker.coords, color, { ignoreIndividualMoves: true })) {
		capturingMove = attacker.coords;
	}

	// 2. Block the check

	/**
	 * If it's a jumping check,
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
		if (capturingMove) legalMoves.individual.push(capturingMove); // Add this, now that we know all sliding moves were deleted.
		return true;
	}

	/**
	 * By this point we know it's either a:
	 * 1. Sliding check
	 * 2. Individual check, with 3+ path length
	 */
	
	if (attacker.slidingCheck) appendBlockingMoves(gamefile, royalCoords[0]!, attacker.coords, legalMoves, selectedPieceCoords, color); // Has a chance to delete all sliding moves except one, adding the `brute` flag.
	else appendPathBlockingMoves(gamefile, attacker.path!, legalMoves, selectedPieceCoords, color);

	if (!legalMoves.brute) {
		delete legalMoves.sliding; // Erase all sliding moves IF appendBlockingMoves() didn't flag any slide direction to brute force! It will have deleted all other sliding moves for us.
		if (capturingMove) legalMoves.individual.push(capturingMove); // Add this, now that we know all sliding moves were deleted.
	}
	
	return true;
}

/**
 * Deletes any sliding moves from the provided running legal moves that
 * open up a discovered attack on any of our royals.
 * 
 * MUST NOT CALL IF the player of the provided color has an existing check!!!
 * Otherwise it will break this, as after it deletes the selected piece,
 * it tests for check again and assumes all checks result from the pin!
 * @param gamefile 
 * @param moves - The running legal moves of the selected piece
 * @param pieceSelected - The piece with the provided running legal moves
 * @param color - The color of the player the piece belongs to.
 */
function removeSlidingMovesThatOpenDiscovered(gamefile: gamefile, moves: LegalMoves, pieceSelected: Piece, color: Player): void {
	if (checkdetection.isPlayerInCheck(gamefile, color)) throw Error('We should not be in check when calling removeSlidingMovesThatOpenDiscovered!'); // Safety net
	if (!moves.sliding) return; // No sliding moves to remove

	/**
	 * By this point, we know that there wasn't a previous check we had to resolve,
	 * because our sliding moves would have been deleted in exchange for a finite
	 * number of individual moves that resolve the check.
	 * 
	 * WHICH MEANS, any new check that surfaces from this piece suddenly vanishing
	 * we know is a check that results from breaking the pin!
	 */
	
	// To find out if our piece is pinned, we delete it, then test for check.
	const deleteChange = boardchanges.queueDeletePiece([], true, pieceSelected);
	boardchanges.runChanges(gamefile, deleteChange, boardchanges.changeFuncs, true);

	const checkResults = checkdetection.detectCheck(gamefile, color, true); // { check: boolean, royalsInCheck: Coords[], attackers: Attacker[] }

	outer: if (checkResults.check) {

		/**
		 * Iterate through all attackers.
		 * Check if it is a sliding check (non-sliding checks with a `path` may be present, if the Rose was pinning this piece).
		 * If so, delete all sliding moves but the one in the direction of the line between the attacker and our royal.
		 */

		for (const checkedRoyalCoords of checkResults.royalsInCheck) {
			for (const attacker of checkResults.attackers!) {

				if (!attacker.slidingCheck) { // This attacker is giving a check via a special individual move with a `path` (such as the Rose piece).
					// Delete all sliding moves and append legal blocking moves
					appendPathBlockingMoves(gamefile, attacker.path!, moves, pieceSelected.coords, color);
					// Also append the capturing move if it's legal
					if (legalmoves.checkIfMoveLegal(gamefile, moves, pieceSelected.coords, attacker.coords, color, { ignoreIndividualMoves: true })) {
						moves.individual.push(attacker.coords);
					}
					delete moves.sliding; // Erase all sliding moves
					// We don't have to keep iterating through royals and attackers, since
					// if none of these newly added path-blocking moves are legal, nothing else will be.
					// They are all simulated to see if they resolve the check. There are only finitely many.
					break outer;
				}

				const attackerCoords = attacker.coords;
				// If our piece is not directly on the line connecting the attacker and the royal,
				// this same attacker must be pinning our piece against a different royal in check.
				// The piece is on the line connecting the attacker and the royal if the line
				// connecting our piece and the royal are the same.
				const line1GeneralForm = math.getLineGeneralFormFrom2Coords(checkedRoyalCoords, attackerCoords);
				const line2GeneralForm = math.getLineGeneralFormFrom2Coords(checkedRoyalCoords, pieceSelected.coords);
				if (!math.areLinesInGeneralFormEqual(line1GeneralForm, line2GeneralForm)) continue; // Not on the same line, it's pinning us against a different royal
				// SAME line! This attacker must be pinning us against this royal!
				// Delete all sliding moves but the one in the direction of the line between the attacker and the royal.
				for (const slideDir of Object.keys(moves.sliding)) { // 'dx,dy'
					const slideDirVec = math.getVec2FromKey(slideDir as Vec2Key); // [dx,dy]
					// Does the line created from sliding this direction equal the line between the attacker and the royal?
					const slideLineGeneralForm = math.getLineGeneralFormFromCoordsAndVec(pieceSelected.coords, slideDirVec);
					if (!math.areLinesInGeneralFormEqual(line1GeneralForm, slideLineGeneralForm)) delete moves.sliding[slideDir]; // Not the same line, delete it.
				}
			}
		}

		if (Object.keys(moves.sliding).length === 0) delete moves.sliding; // No sliding moves left
		// For any slides left, if colinears exist in the game, flag the legal moves to brute force check each square for check
		else if (gamefile.colinearsPresent) moves.brute = true;
	}

	boardchanges.runChanges(gamefile, deleteChange, boardchanges.changeFuncs, false); // Add the piece back

	// console.log("Legal moves after removing sliding moves that open discovered:");
	// console.log(moves);
}

/**
 * Appends legal blocking moves to the provided moves object if the piece
 * is able to get between squares 1 & 2.
 * 
 * If colinears are present and the piece is on the same line as the line between
 * the attacker and the royal, sliding moves may be deleted.
 * @param gamefile
 * @param square1 - `[x,y]`
 * @param square2 - `[x,y]`
 * @param moves - The legal moves object of the piece selected, to see if it is able to block between squares 1 & 2
 * @param coords - The coordinates of the piece with the provided legal moves: `[x,y]`
 * @param color - The color of friendlies
 */
function appendBlockingMoves(gamefile: gamefile, square1: Coords, square2: Coords, moves: LegalMoves, coords: Coords, color: Player): void { // coords is of the selected piece
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

		// If the lines are equal and colinears are present, retain ONLY this slide direction, and brute force check each square for legality.
		if (blockPoint === undefined && gamefile.colinearsPresent && math.areLinesInGeneralFormEqual(line1GeneralForm, line2GeneralForm)) {
			// The piece lies on the same line from the attacker to the royal!
			// Flag this slide direction to brute force check each move for legality.
			moves.brute = true;
			// Delete all other sliding moves that aren't also colinear with this one.
			for (const slideDir in moves.sliding) { // 'dx,dy'
				if (slideDir === lineKey) continue; // Same line, don't delete this one.
				// Different line... but is it colinear? If so we also want to keep it.
				const thisSlideDir = coordutil.getCoordsFromKey(slideDir as Vec2Key); // [dx,dy]
				const thisLineGeneralForm = math.getLineGeneralFormFromCoordsAndVec(coords, thisSlideDir);
				if (!math.areLinesInGeneralFormEqual(line1GeneralForm, thisLineGeneralForm)) delete moves.sliding[slideDir]; // Not colinear, delete it.
			}
			break; // All other slides were deleted, no point in continuing to iterate.
		}

		if (blockPoint === undefined) continue; // None (or infinite) intersection points!
		if (!math.boxContainsSquare(box, blockPoint)) continue; // Intersection point not between our 2 points, but outside of them.
		if (!coordutil.areCoordsIntegers(blockPoint)) continue; // It doesn't intersect at a whole number, impossible for our piece to move here!
		if (coordutil.areCoordsEqual(blockPoint, square1)) continue; // Can't move onto our piece that's in check..
		if (coordutil.areCoordsEqual(blockPoint, square2)) continue; // nor to the piece that is checking us (those are added prior to this if it's legal)!
		// Don't add the move if it's already in the list. This can happen with colinear lines, since different slide direction can have the same exact vector, and thus blocking point.
		if (gamefile.colinearsPresent && moves.individual.some((move: CoordsSpecial) => move[0] === blockPoint[0] && move[1] === blockPoint[1])) continue;

		// Can our piece legally move there?
		if (legalmoves.checkIfMoveLegal(gamefile, moves, coords, blockPoint, color, { ignoreIndividualMoves: true })) moves.individual.push(blockPoint); // Can block!
	}
}

/**
 * Takes a `path` special flag of a checking attacker piece, and appends any legal individual
 * blocking moves our selected piece can land on.
 * @param gamefile
 * @param path - Individual move's `path` special move flag, with guaranteed atleast 3 waypoints within it.
 * @param legalMoves - The precalculated legal moves of the selected piece
 * @param selectedPieceCoords 
 * @param color - The color of friendlies
 */
function appendPathBlockingMoves(gamefile: gamefile, path: path, legalMoves: LegalMoves, selectedPieceCoords: Coords, color: Player): void {

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
		if (legalmoves.checkIfMoveLegal(gamefile, legalMoves, selectedPieceCoords, blockPoint, color, { ignoreIndividualMoves: true })) legalMoves.individual.push(coordutil.copyCoords(blockPoint)); // Can block!
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
function isMoveCheckInvalid(gamefile: gamefile, piece: Piece, destCoords: CoordsSpecial, color: Player) { // pieceSelected: { type, index, coords }
	const moveDraft: MoveDraft = { startCoords: jsutil.deepCopyObject(piece.coords), endCoords: moveutil.stripSpecialMoveTagsFromCoords(destCoords) };
	specialdetect.transferSpecialFlags_FromCoordsToMove(destCoords, moveDraft);
	return getSimulatedCheck(gamefile, moveDraft, color).check;
}

/**
 * Simulates a move to get the check
 * @returns false if the move does not result in check, otherwise a list of the coords of all the royals in check.
 */
function getSimulatedCheck(gamefile: gamefile, moveDraft: MoveDraft, colorToTestInCheck: Player): ReturnType<typeof checkdetection.detectCheck> {
	return movepiece.simulateMoveWrapper(
		gamefile,
		moveDraft,
		() => checkdetection.detectCheck(gamefile, colorToTestInCheck),
	);	
}


// Exports --------------------------------------------------------------------------------


export default {
	removeCheckInvalidMoves,
	isMoveCheckInvalid,
	getSimulatedCheck,
};