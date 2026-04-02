// src/shared/chess/logic/checkresolver.ts

/**
 * This script contains methods that reduce the legal moves of a piece
 * to only the ones that don't leave the player in check.
 *
 * This could be not dodging/blocking/capturing an existing check,
 * or pinned pieces opening a discovered.
 */

import type { Piece } from '../util/boardutil.js';
import type { Coords } from '../util/coordutil.js';
import type { Player } from '../util/typeutil.js';
import type { FullGame } from './gamefile.js';
import type { CheckInfo } from './state.js';
import type { LegalMoves } from './legalmoves.js';
import type { Vec2, Vec2Key } from '../../util/math/vectors.js';
import type { CoordsTagged, MoveTagged, MoveSpecialTags } from './movepiece.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import jsutil from '../../util/jsutil.js';
import bimath from '../../util/math/bimath.js';
import vectors from '../../util/math/vectors.js';
import typeutil from '../util/typeutil.js';
import moveutil from '../util/moveutil.js';
import geometry from '../../util/math/geometry.js';
import bdcoords from '../util/bdcoords.js';
import boardutil from '../util/boardutil.js';
import coordutil from '../util/coordutil.js';
import movepiece from './movepiece.js';
import legalmoves from './legalmoves.js';
import boardchanges from './boardchanges.js';
import specialdetect from './specialdetect.js';
import checkdetection from './checkdetection.js';
import gamefileutility from '../util/gamefileutility.js';
import { players as p } from '../util/typeutil.js';
import bounds, { BoundingBox } from '../../util/math/bounds.js';

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
function removeCheckInvalidMoves(
	gamefile: FullGame,
	pieceSelected: Piece,
	moves: LegalMoves,
): void {
	const color = typeutil.getColorFromType(pieceSelected.type);
	if (color === p.NEUTRAL) return; // Neutral pieces can't be in check
	if (!gamefileutility.isOpponentUsingWinCondition(gamefile.basegame, color, 'checkmate')) return;

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
function removeCheckInvalidMoves_Individual(
	gamefile: FullGame,
	individualMoves: CoordsTagged[],
	piece: Piece,
	color: Player,
): void {
	// [ [x,y], [x,y] ]
	// Simulate the move, then check the game state for check
	for (let i = individualMoves.length - 1; i >= 0; i--) {
		// Iterate backwards so we don't run into issues as we delete indices while iterating
		const thisMove: CoordsTagged = individualMoves[i]!; // [x,y]
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
function removeCheckInvalidMoves_Sliding(
	gamefile: FullGame,
	moves: LegalMoves,
	piece: Piece,
	color: Player,
): void {
	if (Object.keys(moves.sliding).length === 0) return; // No sliding moves to being with.

	/** List of coordinates of all our royal pieces. */
	const royalCoords: Coords[] = boardutil.getRoyalCoordsOfColor(gamefile.boardsim.pieces, color);
	if (royalCoords.length === 0) return; // No royals -> zero checks possible, ever.

	const rawType = typeutil.getRawType(piece.type);
	const isRoyal = typeutil.royals.includes(rawType);

	// There are 3 ways a sliding move can put you in check...

	// 1. The piece making the sliding move IS A ROYAL itself (royalqueen) and it moves into check.
	if (isRoyal) moves.brute = true; // Flag the sliding moves to brute force check each move to see if it results in check, disallowing it if so.

	// 2. By not blocking, dodging, or capturing the attacker of an already-existing check.
	addressChecks(gamefile, moves, piece.coords, isRoyal);

	// 3. By opening a new discovered attack on one of our royals.
	addressPins(gamefile, moves, piece, color, isRoyal);
}

/**
 * Collapses all sliding moves that don't have a chance at addressing
 * the checks, replacing them with individual moves to be simulated later.
 * @param gamefile - The gamefile
 * @param moves - The legal moves object of which to delete moves that don't address check.
 * @param selectedPieceCoords - The coordinates of the piece we're calculating the legal moves for.
 * @param color - The color of friendlies
 * @param isRoyal - Whether the provided legal moves are for a royal piece.
 */
function addressChecks(
	gamefile: FullGame,
	moves: LegalMoves,
	selectedPieceCoords: Coords,
	isRoyal: boolean,
): void {
	const { boardsim } = gamefile;
	const checks = boardsim.state.local.checks;
	if (checks.length === 0) return; // Nothing in check
	if (Object.keys(moves.sliding).length === 0) return; // No sliding moves to collapse into more individuals that address the existing checks.

	// Does this piece have a sliding moveset that will either...

	// 1. Capture the checking piece

	const uniqueAttackers: Coords[] = [];
	for (const c of checks) {
		if (!uniqueAttackers.some((a) => coordutil.areCoordsEqual(a, c.attacker)))
			uniqueAttackers.push(c.attacker);
	}
	// Add each unique attacker as a potential capture move (simulated later to confirm it resolves all checks).
	for (const attacker of uniqueAttackers) {
		if (legalmoves.doSlideRangesContainSquare(moves, selectedPieceCoords, attacker)) {
			appendMoveToIndividualsAvoidDuplicates(moves.individual, attacker);
		}
	}

	// 2. Dodge the check(s) - only if we're the one in check (royal queen)

	/**
	 * Sort checks by `path` first (guaranteed non-arbitrary interpose squares),
	 * then non-colinear sliding checks (to avoid adding the `brute` flag whenever possible).
	 */
	const sortedChecks = [...checks].sort((a, b) => {
		const rank = (c: (typeof checks)[number]): number => {
			if (!c.slidingCheck) return 0; // path check
			if (!c.colinear) return 1; // non-colinear sliding check
			return 2; // colinear sliding check
		};
		return rank(a) - rank(b);
	});

	for (const check of sortedChecks) {
		// Early exit if all slides have already been collapsed by a previous check.
		if (Object.keys(moves.sliding).length === 0) break;
		if (
			!check.slidingCheck ||
			check.colinear ||
			!isRoyal || // Can't be the piece in check if you're not a royal to begin with
			!coordutil.areCoordsEqual(check.royal, selectedPieceCoords) // Must be the piece in check
		)
			continue;
		// We ARE the piece in check. Delete all slides that don't dodge the check.
		const checkLineGeneralForm = vectors.getLineGeneralFormFrom2Coords(
			check.royal,
			check.attacker,
		);
		for (const slideDir of Object.keys(moves.sliding)) {
			const slideDirVec = vectors.getVec2FromKey(slideDir as Vec2Key);
			const slideLineGeneralForm = vectors.getLineGeneralFormFromCoordsAndVec(
				selectedPieceCoords,
				slideDirVec,
			);
			if (!vectors.areLinesInGeneralFormEqual(checkLineGeneralForm, slideLineGeneralForm))
				continue; // Non-coincident slides are legitimate dodges, the brute flag handles their verification.
			// This slide can only ever remain in line of sight of the attacker.
			delete moves.sliding[slideDir as Vec2Key]; // Collapse the slide.
			// For as long as sliding royals can't move colinearly, there
			// can only be one slide direction of the same vector to delete.
			if (!moves.colinear) break;
		}
	}

	// 3. Block the check(s)

	for (const check of sortedChecks) {
		// Early exit if all slides have been deleted/collapsed by a previous check.
		if (Object.keys(moves.sliding).length === 0) break;
		if (coordutil.areCoordsEqual(check.royal, selectedPieceCoords)) continue; // Must NOT be the piece in check (you can't block your own check)

		const dist = vectors.chebyshevDistance(check.royal, check.attacker);
		if (
			isRoyal || // Royals can't block checks, PERIOD, without also putting themselves in check.
			(check.slidingCheck && dist === 1n) || // Can't get between royal & attacker (1 square apart)
			(!check.slidingCheck && (check.path?.length ?? 2) < 3) // Can't block jumping check (or path check with only 2 points)
		) {
			moves.sliding = {}; // Collapse all slides, none can block this check.
			break; // No more slides left to collapse to resolve other checks.
		}

		if (check.slidingCheck) {
			// prettier-ignore
			// Has a chance to delete all sliding moves except one, adding the `brute` flag.
			appendBlockingMoves(check.royal, check.attacker, moves, selectedPieceCoords, check.colinear);
		} else {
			// Guaranteed non-arbitrary interpose squares.
			appendPathBlockingMoves(check.path!, moves, selectedPieceCoords);
		}
	}
}

/**
 * Deletes any sliding moves from the provided running legal moves that
 * open up a discovered attack on any of our royals.
 * Reads the current checks from the gamefile and ignores any that are already present —
 * only newly-exposed checks (from deleting the piece) are treated as pins.
 * @param gamefile
 * @param moves - The running legal moves of the selected piece
 * @param pieceSelected - The piece with the provided running legal moves
 * @param color - The color of the player the piece belongs to.
 * @param isRoyal - Whether the provided legal moves are for a royal piece.
 */
function addressPins(
	gamefile: FullGame,
	moves: LegalMoves,
	pieceSelected: Piece,
	color: Player,
	isRoyal: boolean,
): void {
	if (Object.keys(moves.sliding).length === 0) return; // No sliding moves to remove (may have already all been removed in addressChecks())
	// Does not reflect checks for `color` if it's not currently their turn to move.
	// This is fine because only for whoever's turn it is, moves are check-respected.
	const preExistingChecks = gamefile.boardsim.state.local.checks;

	/**
	 * To find out if our piece is pinned (or opens a discovered), we delete it, then test for check.
	 * Any check that surfaces and is NOT in preExistingChecks resulted from breaking the pin.
	 */

	// To find out if our piece is pinned, we delete it, then test for check.
	const deleteChange = boardchanges.queueDeletePiece([], true, pieceSelected);
	boardchanges.runChanges(gamefile, deleteChange, boardchanges.changeFuncs, true);

	const checkResults = checkdetection.detectCheck(gamefile, color, true); // { check: boolean, royalsInCheck: Coords[], checks?: CheckInfo[] }

	// Filter to only the newly-exposed checks (ignore the pre-existing ones).
	const newChecks: CheckInfo[] = checkResults.checks!.filter((c) => {
		return !preExistingChecks.some(
			(p) =>
				coordutil.areCoordsEqual(p.royal, c.royal) &&
				coordutil.areCoordsEqual(p.attacker, c.attacker),
		);
	});
	// console.log('New checks:', newChecks);

	/**
	 * Iterate through all newly-exposed check pairs.
	 * Delete all sliding moves but the one in the direction of the line between the attacker and our royal.
	 * If it was a `path` check (rose), then collapse all slides into only individuals that block the path.
	 */

	outer: for (const check of newChecks) {
		// Early exit if all slides have been deleted/collapsed by a previous new check.
		if (Object.keys(moves.sliding).length === 0) break;

		const { royal, attacker } = check;

		// If the piece can capture the attacker, append it as an individual move
		// to be simulated later (removes the pin) BEFORE collapsing the slides.
		if (legalmoves.doSlideRangesContainSquare(moves, pieceSelected.coords, attacker)) {
			appendMoveToIndividualsAvoidDuplicates(moves.individual, attacker);
		}

		// If this piece is a royal, retaining the pin also keeps itself in check. So just collapse all slides.
		if (isRoyal) {
			moves.sliding = {};
			break outer; // No more slides left to collapse to resolve other pins
		}

		if (!check.slidingCheck) {
			// A jumping-check via a `path` was exposed (Rose).
			if (!check.path)
				throw Error(
					`Attacker giving non-sliding check has no path! It's impossible for a sliding move to expose a pathless jumping check. Either the position is illegal, or this check was pre-existing and was not correctly filtered out. Color: ${typeutil.strcolors[color]}`,
				);
			// Append any legal blocking squares on the path, then collapse all slides.
			appendPathBlockingMoves(check.path, moves, pieceSelected.coords);
			// We don't have to keep iterating through check pairs, since
			// if none of these newly added path-blocking/capture moves are legal, nothing else will be.
			// They are all simulated to see if they resolve the check. There are only finitely many.
			break outer;
		}

		// It's a sliding check. That means this piece is on the same line between the attacker and royal.

		const checkLineGeneralForm = vectors.getLineGeneralFormFrom2Coords(royal, attacker);
		// Delete all sliding moves but the one in the direction of the line between the attacker and the royal.
		for (const slideDir of Object.keys(moves.sliding)) {
			// 'dx,dy'
			const slideDirVec = vectors.getVec2FromKey(slideDir as Vec2Key); // [dx,dy]
			// Delete the slide if it is NOT along the pin line.
			const slideLineGeneralForm = vectors.getLineGeneralFormFromCoordsAndVec(
				pieceSelected.coords,
				slideDirVec,
			);
			if (!vectors.areLinesInGeneralFormEqual(checkLineGeneralForm, slideLineGeneralForm)) {
				delete moves.sliding[slideDir as Vec2Key]; // Not the same line, delete it.
				continue;
			}

			// Slide is along the pin line.
			// Restrict to the zone strictly between the royal and the attacker (both exclusive, capturing move is added separately above).
			// prettier-ignore
			restrictSlideBetweenSquares(moves, slideDir as Vec2Key, slideDirVec, pieceSelected.coords, royal, attacker, check.colinear);
		}
	}

	boardchanges.runChanges(gamefile, deleteChange, boardchanges.changeFuncs, false); // Add the piece back

	// console.log("Legal moves after removing sliding moves that open discovered:");
	// console.log(moves);
}

/**
 * Restricts the slide `slideDir` in `moves.sliding` to the zone strictly between `royal` and `attacker`,
 * intersected with the slide's current physical limits. Deletes the slide if no overlap remains.
 * Both the royal and attacker squares are excluded; captures are appended as individual moves by the caller.
 * @param direction - How much the piece moves in each step of the slide.
 * @param colinear - If true, sets `moves.brute` so every surviving square is verified by simulation.
 */
function restrictSlideBetweenSquares(
	moves: LegalMoves,
	slideDir: Vec2Key,
	direction: Vec2,
	pieceCoords: Coords,
	royal: Coords,
	attacker: Coords,
	colinear: boolean,
): void {
	const sliding = moves.sliding!;
	const axis: 0 | 1 = direction[0] === 0n ? 1 : 0;
	const stepsToRoyal: BigDecimal = bd.divide(
		bd.fromBigInt(royal[axis] - pieceCoords[axis]),
		bd.fromBigInt(direction[axis]),
	);
	const stepsToAttacker: BigDecimal = bd.divide(
		bd.fromBigInt(attacker[axis] - pieceCoords[axis]),
		bd.fromBigInt(direction[axis]),
	);
	// Both endpoints are excluded; captures are handled as individual moves.
	// `floor(min) + 1` and `ceil(max) - 1` give correct integer bounds even when step counts are fractional (e.g. direction [2,0]).
	const zoneMin = bd.toBigInt(bd.floor(bd.min(stepsToRoyal, stepsToAttacker))) + 1n;
	const zoneMax = bd.toBigInt(bd.ceil(bd.max(stepsToRoyal, stepsToAttacker))) - 1n;
	if (zoneMin > zoneMax) {
		delete sliding[slideDir]; // Zone is empty.
		// console.log('Deleting slide: No squares between the royal and the attacker.');
		return;
	}
	const currentLimits = sliding[slideDir]!;
	// console.log(
	// 	`For slide ${slideDir}, intersecting current limits [${currentLimits[0]}, ${currentLimits[1]}] with blocking zone between royal ${royal} and attacker ${attacker} at steps [${zoneMin}, ${zoneMax}]`,
	// );
	const newMin = currentLimits[0] === null ? zoneMin : bimath.max(currentLimits[0], zoneMin);
	const newMax = currentLimits[1] === null ? zoneMax : bimath.min(currentLimits[1], zoneMax);
	if (newMin > newMax) {
		delete sliding[slideDir]; // Slide can't reach the zone.
		// console.log("Deleting slide because it can't reach the blocking zone.");
		return;
	}
	sliding[slideDir] = [newMin, newMax];
	// console.log(
	// 	`Narrowing slide to steps [${newMin}, ${newMax}] to only include the blocking zone.`,
	// );
	if (colinear) moves.brute = true;
}

/**
 * Appends legal blocking moves to the provided moves object if the piece
 * is able to get between squares 1 & 2.
 * Should NOT be called if the piece with the legal moves is a royal piece.
 *
 * If colinears are present and the piece is on the same line as the line between
 * the attacker and the royal, sliding moves may be deleted.
 * @param gamefile
 * @param square1 - `[x,y]`
 * @param square2 - `[x,y]`
 * @param moves - The legal moves object of the piece selected, to see if it is able to block between squares 1 & 2
 * @param coords - The coordinates of the piece with the provided legal moves: `[x,y]`
 * @param attackerColinear - Whether the attacker piece giving check is a more complicated colinear mover (huygen).
 */
function appendBlockingMoves(
	square1: Coords,
	square2: Coords,
	moves: LegalMoves,
	coords: Coords,
	attackerColinear: boolean,
): void {
	/** The minimum bounding box that contains our 2 squares, at opposite corners. */
	const box: BoundingBox = {
		left: bimath.min(square1[0], square2[0]),
		right: bimath.max(square1[0], square2[0]),
		top: bimath.max(square1[1], square2[1]),
		bottom: bimath.min(square1[1], square2[1]),
	};

	for (const lineKey in moves.sliding) {
		// 'dx,dy'
		const line = coordutil.getCoordsFromKey(lineKey as Vec2Key); // [dx,dy]
		const line1GeneralForm = vectors.getLineGeneralFormFromCoordsAndVec(coords, line);
		const line2GeneralForm = vectors.getLineGeneralFormFrom2Coords(square1, square2);
		const blockPoint = geometry.calcIntersectionPointOfLines(
			...line1GeneralForm,
			...line2GeneralForm,
		); // The intersection point of the 2 lines.

		const coincident = vectors.areLinesInGeneralFormEqual(line1GeneralForm, line2GeneralForm);

		if (blockPoint === undefined && !coincident) {
			// Case 1: Parallel, but not coincident -> no intersection point.
			delete moves.sliding[lineKey as Vec2Key]; // Collapse the slide.
		} else if (blockPoint) {
			// Case 2: Not parallel, and has a single intersection point.
			if (!bdcoords.areCoordsIntegers(blockPoint)) {
				// It doesn't intersect at a whole number, impossible for our piece to move here!
				delete moves.sliding[lineKey as Vec2Key]; // Collapse the slide.
				continue;
			}
			const blockPointInt = bdcoords.coordsToBigInt(blockPoint); // Zero precision loss since we're already confident they are integers.
			if (
				!bounds.boxContainsSquare(box, blockPointInt) || // Intersection point not between our 2 points, but outside of them.
				coordutil.areCoordsEqual(blockPointInt, square1) || // Can't move onto our piece that's in check,
				coordutil.areCoordsEqual(blockPointInt, square2) || // nor to the piece that is checking us (those are considered outside this method)
				// Does our piece's slide range include that block point? The slide must be intact to test this correctly, so we can't collapse it before this.
				!legalmoves.doSlideRangesContainSquare(moves, coords, blockPointInt)
			) {
				delete moves.sliding[lineKey as Vec2Key]; // Collapse the slide.
				continue;
			}
			// Can block!
			delete moves.sliding[lineKey as Vec2Key]; // Collapse the slide (can do this now because doSlideRangesContainSquare() was already called, which needed the slide to be intact).
			// Add as an individual move to be simulated later.
			appendMoveToIndividualsAvoidDuplicates(moves.individual, blockPointInt);
		} else {
			// Case 3: Coincident (Our piece is on the same line as the check)
			// -> Restrict the slide to the blocking zone (strictly between the royal and checker),
			// and add the `brute` flag if the check is colinear.
			// DON'T collapse the slide.
			// console.log('Entered coincident blocking case.');
			// prettier-ignore
			restrictSlideBetweenSquares(moves, lineKey as Vec2Key, line, coords, square1, square2, attackerColinear);
		}
	}
}

/**
 * Takes a `path` special flag of a checking attacker piece, and appends any legal individual
 * blocking moves our selected piece can land on.
 * Should NOT be called if the piece with the legal moves is a royal piece.
 * @param gamefile
 * @param path - Individual move's `path` special move flag, with guaranteed at least 3 waypoints within it.
 * @param legalMoves - The precalculated legal moves of the selected piece
 * @param selectedPieceCoords
 */
function appendPathBlockingMoves(
	path: MoveSpecialTags['path'],
	legalMoves: LegalMoves,
	selectedPieceCoords: Coords,
): void {
	/**
	 * How do we tell if our selected piece can block an individual move with a path (Rose piece)?
	 *
	 * Whether it can move to any of the waypoints in the path (exluding start and end waypoints).
	 * The reason we exclude the start waypoint is because we already check earlier
	 * if it's legal to capure the attacker.
	 */

	for (let i = 1; i < path.length - 1; i++) {
		// Iterate through all path points, EXCLUDING start and end.
		const blockPoint = path[i]!;
		// Can our selected piece move to this square?
		if (legalmoves.doSlideRangesContainSquare(legalMoves, selectedPieceCoords, blockPoint))
			appendMoveToIndividualsAvoidDuplicates(legalMoves.individual, blockPoint); // Can block!
	}

	legalMoves.sliding = {}; // Collapse all sliding moves
}

/** Appends the provided move to the list of legal individual moves if it's not already present. */
function appendMoveToIndividualsAvoidDuplicates(individuals: CoordsTagged[], move: Coords): void {
	if (!individuals.some((im: CoordsTagged) => coordutil.areCoordsEqual(im, move))) {
		individuals.push(move);
	}
}

/**
 * Simulates moving the piece to the destination coords,
 * then tests if it results in the player who owns the piece being in check.
 * @param gamefile
 * @param piece - The piece moving to the destination coords
 * @param destCoords - The coords to move the piece to, with any attached special tags to execute with the move.
 * @param color - The color of the player the piece belongs to.
 * @returns Whether the move would result in the player owning the piece being in check.
 */
function isMoveCheckInvalid(
	gamefile: FullGame,
	piece: Piece,
	destCoords: CoordsTagged,
	color: Player,
): boolean {
	// pieceSelected: { type, index, coords }
	const moveTagged: MoveTagged = {
		startCoords: jsutil.deepCopyObject(piece.coords),
		endCoords: moveutil.stripSpecialMoveTagsFromCoords(destCoords),
	};
	specialdetect.transferSpecialTags_FromCoordsToMove(destCoords, moveTagged);
	return getSimulatedCheck(gamefile, moveTagged, color).check;
}

/**
 * Simulates a move to get the check
 * @returns false if the move does not result in check, otherwise a list of the coords of all the royals in check.
 */
function getSimulatedCheck(
	gamefile: FullGame,
	moveTagged: MoveTagged,
	colorToTestInCheck: Player,
): ReturnType<typeof checkdetection.detectCheck> {
	return movepiece.simulateMoveWrapper(gamefile, moveTagged, () =>
		checkdetection.detectCheck(gamefile, colorToTestInCheck),
	);
}

// Exports --------------------------------------------------------------------------------

export default {
	removeCheckInvalidMoves,
	isMoveCheckInvalid,
	getSimulatedCheck,
};
