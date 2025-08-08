
// src/client/scripts/esm/chess/logic/positionnormalizer/positioncompressor.ts

/**
 * This script contains an algorithm that can take an infinite chess position,
 * which may have pieces at arbitrarily large coordinates, and compress it
 * so that all pieces are within the bounds of standard javascript doubles.
 */


import bimath from "../../../util/bigdecimal/bimath.js";
import vectors, { Vec2, Vec2Key } from "../../../util/math/vectors.js";
import coordutil, { Coords, CoordsKey } from "../../util/coordutil.js";



// ============================== Type Definitions ==============================



/**
 * A compressed position, along with the transformation info to be able to
 * expand the chosen move back to the original position.
 */
interface CompressionInfo {
	position: Map<CoordsKey, number>;
	axisOrders: AxisOrders;
	/**
	 * Contains information on each group, the group's
	 * original position, and each piece in the group.
	 */
	pieceTransformations: PieceTransform[]
}

/**
 * Contains the information of where a piece started
 * before compressing the position, and where they ended up.
 */
type PieceTransform = {
	type: number;
	coords: Coords;
	/** Both coords will be fully defined after transformation is complete. */
	transformedCoords: [bigint | undefined, bigint | undefined];
	/** What groups it belongs to on each axis. */
	axisGroups: Record<Vec2Key, number>;
};


/**
 * Contains information of what pieces are connected/linked/merged on what axis,
 * and how they have been transformed into the compressed position.
 */
type AxisOrders = Record<Vec2Key, AxisOrder>;

/**
 * An ordering of the pieces on one axis (X/Y/pos-diag/neg-diag),
 * also storing what pieces are linked together (their axis values are close together).
 */
type AxisOrder = AxisGroup[];

/**
 * A group of pieces all linked on one axis (X/Y/pos-diag/neg-diag) 
 * due to being close together.
 */
type AxisGroup = {
	range: [bigint, bigint];
	transformedRange?: [bigint, bigint];
	pieces: PieceTransform[];
}



// ================================== Constants ==================================


/**
 * Piece groups further than this many squares away from the origin
 * will be compressed closer to the origin.
 * 
 * IN THE FUTURE: Determine whether a position needs to be compressed or not
 * BASED ON WHETHER intersections of groups, or intersections of intersections
 * lie beyond Number.MAX_SAFE_INTEGER!
 * 
 * Actually it actually might be smarter to always normalize positions so engines
 * have more floating point precision to work with.
 */
const UNSAFE_BOUND_BIGINT = BigInt(Math.trunc(Number.MAX_SAFE_INTEGER * 0.1));
// const UNSAFE_BOUND_BIGINT = 1000n;


/**
 * How close pieces or groups have to be on on axis or diagonal to
 * link them together, so that that axis or diagonal will not be
 * broken when compressing the position.
 * 
 * This is also considered the minimum distance for a distance
 * to be considered arbitrary. After all, almost never do we move a
 * short range piece over 20 squares in a game, so the difference
 * between 20 and 1 million squares is very little.
 * 
 * Of course if we are taking into account connections between sub groups
 * and sub sub groups, the distance naturally becomes larger in order to
 * retain forks and forks of forks.
 * 
 * REQUIREMENTS:
 * 
 * * Must be OVER 2x larger than than the longest jumping jumper piece.
 * This is so that they will remain connected to the same group when expanding the move back out.
 * Jumping moves don't need extra attention other than making sure this is big enough.
 * Code works automatically, even for hippogonal jumps!
 * 
 * * Must be divisible by 2, as this is divided by two in the code.
 */
// const MIN_ARBITRARY_DISTANCE = 40n;
const MIN_ARBITRARY_DISTANCE = 5n;



// ================================== HELPERS ==================================



/**
 * What is an Axis value?
 * 
 * It's a number unique to each location a piece can be on a given axis.
 * 
 * For example, on the X axis, the axis value is the x coordinate of the piece.
 * On the Y axis, the axis value is the y coordinate of the piece.
 * On the positive diagonal, the axis value is y - x.
 * On the negative diagonal, the axis value is y + x.
 */

/**
 * Takes a pair of coordinates and returns a single
 * value that is unique to the axis line that piece is on.
 */
// eslint-disable-next-line no-unused-vars
type AxisDeterminer = (coords: Coords) => bigint;

/** Given a coordinate, returns the bigint value that represent the X-axis value for that piece. */
const XAxisDeterminer: AxisDeterminer = (compressedEndCoords: Coords): bigint => compressedEndCoords[0];
/** Given a coordinate, returns the bigint value that represent the Y-axis value for that piece. */
const YAxisDeterminer: AxisDeterminer = (compressedEndCoords: Coords): bigint => compressedEndCoords[1];
/** Given a coordinate, returns the bigint value that represent the positive diagonal axis value for that piece. */
const posDiagAxisDeterminer: AxisDeterminer = (coords: Coords): bigint => coords[1] - coords[0];
/** Given a coordinate, returns the bigint value that represent the negative diagonal axis value for that piece. */
const negDiagAxisDeterminer: AxisDeterminer = (coords: Coords): bigint => coords[1] + coords[0];



// ================================ Implementation ================================



/**
 * Compresses/normalizes a position. Reduces all arbitrary large distances
 * to some small distance constant.
 * Returns transformation info so that the chosen move from the compressed position
 * can be expanded back to the original position.
 * @param position - The position to compress, as a Map of coords to piece types.
 * @param mode - The compression mode, either 'orthogonals' or 'diagonals'.
 *     - 'orthogonals' require all pieces to remain in the same quadrant relative to other pieces.
 *     - 'diagonals' require all pieces to remain in the same octant relative to other pieces.
 *     - FUTURE: 'hipppogonal' require all pieces to remain in the same hexadecant relative to other pieces.
 */
function compressPosition(position: Map<CoordsKey, number>, mode: 'orthogonals' | 'diagonals'): CompressionInfo {

	// 1. List all pieces with their bigint arbitrary coordinates.

	const pieces: PieceTransform[] = [];

	position.forEach((type, coordsKey) => {
		const coords = coordutil.getCoordsFromKey(coordsKey);
		pieces.push({
			type,
			coords,
			transformedCoords: [undefined, undefined], // Initially undefined
			axisGroups: {}
		});
	});

	// 2. Determine whether any piece lies beyond UNSAFE_BOUND_BIGINT.
	// If not, we don't need to compress the position.

	// const needsCompression = pieces.some(piece =>
	// 	bimath.abs(piece.coords[0]) > UNSAFE_BOUND_BIGINT || bimath.abs(piece.coords[1]) > UNSAFE_BOUND_BIGINT
	// );

	// if (!needsCompression) {
	// 	console.log("No compression needed.");
	// 	for (const piece of pieces) piece.transformedCoords = piece.coords;
	// 	return { position, pieceTransformations: pieces };
	// }

	// The position needs COMPRESSION.


	// ==================================== Construct Axis Orders & Groups ====================================

	
	/**
	 * Orderings of the pieces on every axis of movement,
	 * and how they are all grouped/connected together.
	 */
	const AllAxisOrders: AxisOrders = {};

	// Init the axis orders as empty
	AllAxisOrders['1,0'] = []; // X axis
	AllAxisOrders['0,1'] = []; // Y axis
	if (mode === 'diagonals') {
		AllAxisOrders['1,1'] = []; // Positive diagonal axis
		AllAxisOrders['-1,1'] = []; // Negative diagonal axis
	}

	// Order/group/connect the pieces

	for (const piece of pieces) {
		// console.log(`\nAnalyzing piece at ${String(piece.coords)}...`);
		registerPieceInAxisOrder('1,0', piece, XAxisDeterminer(piece.coords));
		registerPieceInAxisOrder('0,1', piece, YAxisDeterminer(piece.coords));
		if (mode === 'diagonals') {
			registerPieceInAxisOrder('1,1', piece, posDiagAxisDeterminer(piece.coords));
			registerPieceInAxisOrder('-1,1', piece, negDiagAxisDeterminer(piece.coords));
		}
	}

	// Helper for registering a piece in any axis order.
	function registerPieceInAxisOrder(axis: Vec2Key, piece: PieceTransform, pieceAxisValue: bigint) {
		// console.log(`Axis value ${pieceAxisValue}`);

		const axisOrder = AllAxisOrders[axis];

		const { found: foundExistingGroup, index: groupIndex } = binarySearchRange(axisOrder, (axisGroup) => axisGroup.range, MIN_ARBITRARY_DISTANCE, pieceAxisValue);
		if (foundExistingGroup) {
			// Push piece to the existing group
			const thisGroup = axisOrder[groupIndex]!;
			const sideExtended: -1 | 0 | 1 = pushPieceToAxisGroup(thisGroup, piece, pieceAxisValue);
			if (sideExtended !== 0) checkIfNeedToMergeWithAdjacentGroup(axisOrder, thisGroup, groupIndex, sideExtended);
		} else { // Not close enough to any existing group to be merged, or locked into it.
			// Create a new group for this piece
			const newGroup: AxisGroup = {
				range: [pieceAxisValue, pieceAxisValue],
				pieces: [piece],
			};
			axisOrder.splice(groupIndex, 0, newGroup);
			
			// console.log(`Created new group for piece with axis value ${pieceAxisValue}.`);
		}
	}

	/**
	 * Helper for connecting/merging a piece to an axis group.
	 * If the piece extends the size of the group,
	 * then we will return 1 or -1, depending on the side
	 * that was extended. Otherwise, we return 0.
	 */
	function pushPieceToAxisGroup(axisGroup: AxisGroup, piece: PieceTransform, pieceAxisValue: bigint): -1 | 0 | 1 {
		// Push the piece to the axis group
		axisGroup.pieces.push(piece);

		// console.log(`Pushing piece to group with range ${axisGroup.range}...`);

		let sideExtended: -1 | 0 | 1 = 0; // -1 = left side extended, 0 = no extension, 1 = right extended

		// Update the axis group's start and end coordinates
		if (pieceAxisValue < axisGroup.range[0]) {
			axisGroup.range[0] = pieceAxisValue;
			sideExtended = -1; // Piece extended the group on the negative side
		} else if (pieceAxisValue > axisGroup.range[1]) {
			axisGroup.range[1] = pieceAxisValue;
			sideExtended = 1; // Piece extended the group on the positive side
		}

		// console.log(`New range: ${axisGroup.range}.`);

		return sideExtended;
	}

	/**
	 * Checks if a just-expanded axis group should be merged with the immediate adjacent
	 * axis group, as their ranges may be overlapping now (given not enough padding).
	 */
	function checkIfNeedToMergeWithAdjacentGroup(axisOrder: AxisOrder, extendedGroup: AxisGroup, extendedGroupIndex: number, sideExtended: -1 | 1) {
		const adjacentGroupIndex = extendedGroupIndex + sideExtended;
		const adjacentGroup = axisOrder[adjacentGroupIndex];

		const firstGroup = sideExtended === -1 ? adjacentGroup : extendedGroup;
		const secondGroup = sideExtended === -1 ? extendedGroup : adjacentGroup;

		// PURELY for logging purposes
		if (!firstGroup || !secondGroup) {
			// console.log(`No adjacent group to merge with, skipping...`);
			return;
		}

		// console.log("Group 1:", firstGroup.range, "count: ", firstGroup?.pieces.length);
		// console.log("Group 2:", secondGroup.range, "count: ", secondGroup?.pieces.length);

		if (firstGroup.range[1] + MIN_ARBITRARY_DISTANCE >= secondGroup.range[0]) { // Group ranges are touching or overlapping
			// Merge second group into first group

			// console.log(`Merging groups into one...`);

			firstGroup.pieces.push(...secondGroup.pieces);
			firstGroup.range[1] = secondGroup.range[1];
			const secondGroupIndex = sideExtended === -1 ? extendedGroupIndex : adjacentGroupIndex;
			axisOrder.splice(secondGroupIndex, 1);

			// console.log("Merged group:", firstGroup.range, "count: ", firstGroup.pieces.length);
		}

		// else console.log(`No merging needed, groups are not close enough.`);
	}


	// Declare what axis groups each piece belongs to.

	declareAxisOrderPieceGroups('1,0');
	declareAxisOrderPieceGroups('0,1');
	if (mode === 'diagonals') {
		declareAxisOrderPieceGroups('1,1');
		declareAxisOrderPieceGroups('-1,1');
	}
	function declareAxisOrderPieceGroups(axis: Vec2Key) {
		const axisOrder = AllAxisOrders[axis]!;
		for (let groupIndex = 0; groupIndex < axisOrder.length; groupIndex++) {
			const group = axisOrder[groupIndex]!;
			for (const piece of group.pieces) piece.axisGroups[axis] = groupIndex;
		}
	}


	// ONLY FOR LOGGING ---------------------------------------------
	// console.log("\nAll axis orders after registering pieces:");
	// for (const vec2Key in AllAxisOrders) {
	// 	const axisOrder = AllAxisOrders[vec2Key] as AxisOrder;
	// 	console.log(`Axis order ${vec2Key}:`);
	// 	for (const axisGroup of axisOrder) {
	// 		console.log(`  Range: ${axisGroup.range}, Pieces: ${axisGroup.pieces.length}`);
	// 	}
	// }
	// --------------------------------------------------------------
	

	// All pieces are now in order!


	// ================================ ORTHOGONAL SOLUTION ================================


	/**
	 * First solve the group's positions relative to each other orthogonally.
	 * This is also the draft for the diagonal solution.
	 * Later we will stretch the position.
	 */

	// console.log("\nSolving for orthogonal solution...");

	transformGroupsToDraftCoords(AllAxisOrders['1,0'], 0); // X axis
	transformGroupsToDraftCoords(AllAxisOrders['0,1'], 1); // Y axis

	function transformGroupsToDraftCoords(axisOrder: AxisOrder, axis: 0 | 1) {
		let current: bigint = 0n;

		for (const group of axisOrder) {
			// Update the group's transformed range
			const groupSize = group.range[1] - group.range[0];
			// Set the group's first draft transformed range.
			group.transformedRange = [current, current + groupSize];

			// Update each piece's transformed coordinates
			for (const piece of group.pieces) {
				// Add the piece's offset from the start of the group
				const offset = piece.coords[axis] - group.range[0];
				piece.transformedCoords[axis] = group.transformedRange![0] + offset;
			}

			// Increment so that the next group has what's considered an arbitrary spacing between them
			current += MIN_ARBITRARY_DISTANCE + groupSize;
		}
	}


	// ================================= ITERATIVE DIAGONAL SOLVER =================================



	// Order the pieces by ascending positive diagonal axis value
	// OF THEIR CURRENT TRANSFORMED COORDS.
	// const piecesOrderedByPosDiag: PieceTransform[] = pieces.slice().sort((a, b) => {
	// 	const aPosDiag = posDiagAxisDeterminer(a.transformedCoords as Coords);
	// 	const bPosDiag = posDiagAxisDeterminer(b.transformedCoords as Coords);
	// 	return aPosDiag < bPosDiag ? -1 : aPosDiag > bPosDiag ? 1 : 0;
	// });

	// console.log("\nPieces ordered by positive diagonal axis value:");
	// console.log(piecesOrderedByPosDiag.map(piece => `${String(piece.transformedCoords)}`));



	// ================================= ITERATIVE DIAGONAL SOLVER =================================

	if (mode === 'diagonals') {
		console.log("\nSolving for diagonal solution...");

		let iteration = 0;
		let pushCount = 0;
		let changeMade = true;
		const MAX_ITERATIONS = 100; // Increased for diagonal complexity

		// FOR DEBUGGING
		// const MAX_PUSHES = 1;
		const MAX_PUSHES = 500;

		loop: while (changeMade) {
			iteration++;
			if (iteration > MAX_ITERATIONS) {
				// DEBUGGING-------
				console.error(`Diagonal solver exceeded ${MAX_ITERATIONS} iterations.`);
				break;
				// -----------------
				// throw Error(`Diagonal solver exceeded ${MAX_ITERATIONS} iterations.`);
			}
			changeMade = false;
			console.log(`\nIteration ${iteration}...`);

			// --- U-AXIS RELATIONSHIP CHECK ---
			// Iterate through every unique pair of pieces (A, B)
			for (let i = 0; i < pieces.length; i++) {
				for (let j = i + 1; j < pieces.length; j++) {
					const pieceA = pieces[i];
					const pieceB = pieces[j];


					// --- V-AXIS RELATIONSHIP CHECK ---
					// { // Use a block to keep variable names from colliding
					// 	// Determine original U-axis ordering from their original coordinates
					// 	const u_first = posDiagAxisDeterminer(pieceA.coords);
					// 	const u_second = posDiagAxisDeterminer(pieceB.coords);

					// 	console.log(`Checking pieces ${String(pieceA.coords)} (u=${u_first}) and ${String(pieceB.coords)} (u=${u_second})...`);

					// 	// Determine which piece should come first on the U-axis
					// 	let firstPiece = pieceA;
					// 	let secondPiece = pieceB;
					// 	if (u_second < u_first) {
					// 		firstPiece = pieceB;
					// 		secondPiece = pieceA;
					// 	}

					// 	// Required spacing: If they are within MIN_ARBITRARY_DISTANCE, then the spacing remains the same,
					// 	// otherwise its equal to or greater than MIN_ARBITRARY_DISTANCE.
					// 	const original_u_distance = bimath.abs(u_second - u_first);
					// 	const requiredSpacing = bimath.min(original_u_distance, MIN_ARBITRARY_DISTANCE);
						
					// 	// Get the actual transformed U-values from their current coordinates
					// 	const tu_first = posDiagAxisDeterminer(firstPiece.transformedCoords as Coords);
					// 	const tu_second = posDiagAxisDeterminer(secondPiece.transformedCoords as Coords);

					// 	console.log(`Transformed:   ${String(firstPiece.transformedCoords)} (tu=${tu_first}) and ${String(secondPiece.transformedCoords)} (tu=${tu_second}). Required spacing: ${requiredSpacing}. Current spacing: ${tu_second - tu_first}.`);

					// 	// Check for a violation
					// 	if (tu_second < tu_first + requiredSpacing) {
					// 		// VIOLATION FOUND! We need to push one of the pieces
					// 		const pushAmount = (tu_first + requiredSpacing) - tu_second;
					// 		console.log(`U-Violation: ${String(secondPiece.coords)} (tu=${tu_second}) must be pushed by ${pushAmount} because of ${String(firstPiece.coords)} (tu=${tu_first})`);

					// 		const is_Y_push_safe = (secondPiece.axisGroups['0,1'] > firstPiece.axisGroups['0,1']);

					// 		// If the 2nd piece's Y value is lower than 1st piece's Y value,
					// 		// then we can't push it up, as it would cause a paradoxical ripple.
					// 		// Instead, we achieve the same goal by pushing the 1st piece's X value right.
					// 		if (is_Y_push_safe) { // It's safe to push the second piece up.
					// 			console.log(`Pushing second piece's Y groups up by ${pushAmount}...`);
					// 			const y_group_index_to_push = secondPiece.axisGroups['0,1'];
					// 			ripplePush('0,1', y_group_index_to_push, pushAmount);
					// 		} else {  // Push the first piece right instead.
					// 			console.log(`Pushing first piece's X groups right by ${pushAmount}...`);
					// 			const x_group_index_to_push = firstPiece.axisGroups['1,0'];
					// 			ripplePush('1,0', x_group_index_to_push, pushAmount);
					// 		}
							
					// 		changeMade = true;
					// 	} else console.log(`No U-violation found for pieces ${String(firstPiece.coords)} and ${String(secondPiece.coords)}.`);
					// }



					// --- V-AXIS RELATIONSHIP CHECK ---
					{ // Use a block to keep variable names from colliding
						const axisDeterminer = negDiagAxisDeterminer;

						// Determine original V-axis ordering from their original coordinates
						const firstPiece_v_Original = negDiagAxisDeterminer(pieceA.coords);
						const secondPiece_v_Original = negDiagAxisDeterminer(pieceB.coords);

						console.log(`\nChecking pieces ${String(pieceA.coords)} (v=${firstPiece_v_Original}) and ${String(pieceB.coords)} (v=${secondPiece_v_Original})...`);

						// Ensure the 2nd piece comes later on the V-axis than the 1st piece.
						// So that its expected distance will be positive.
						let firstPiece = pieceA;
						let secondPiece = pieceB;
						if (secondPiece_v_Original < firstPiece_v_Original) {
							firstPiece = pieceB;
							secondPiece = pieceA;
						}

						// Required spacing
						const vDiff_Original = bimath.abs(secondPiece_v_Original - firstPiece_v_Original);
						
						// Get the actual transformed V-values
						const tv_first = negDiagAxisDeterminer(firstPiece.transformedCoords as Coords);
						const tv_second = negDiagAxisDeterminer(secondPiece.transformedCoords as Coords);

						// The distance after transformation by the orthogonal solution.
						// Could be negative if the second piece's TRANSFORMED V value is less
						// than the first piece's. (It's original V value is gauranteed greater)
						const vDiff_Transformed = tv_second - tv_first;

						console.log(`Transformed:   ${String(firstPiece.transformedCoords)} (tv=${tv_first}) and ${String(secondPiece.transformedCoords)} (tv=${tv_second}). Original spacing: ${vDiff_Original}. Current spacing: ${vDiff_Transformed}.`);

						// A positive push amount means we should push the second piece.
						// A negative push amount means we should push the first piece.
						// A zero push amount means no change is needed.
						const pushAmount: bigint = calculatePushAmount(vDiff_Original, vDiff_Transformed);

						// Check for a violation

						if (pushAmount > 0n) { // Second piece needs to be pushed in +X/+Y direction
							// VIOLATION FOUND!
							console.log(`V-Violation: SECOND piece must be pushed +X/+Y by ${pushAmount}!`);

							// Whether pushing on the second piece is safe (won't ripple-push the FIRST piece too!)
							// It is impossible for both of these to be true, as if the second piece in in the
							// top right quadrant, yet not connected to X/Y groups, then its V distance should also
							// be great enough to not be connected, so it shouldn't require any additional pushing.
							const X_push_safe = (secondPiece.axisGroups['1,0'] > firstPiece.axisGroups['1,0']);
							const Y_push_safe = (secondPiece.axisGroups['0,1'] > firstPiece.axisGroups['0,1']);

							if (X_push_safe && Y_push_safe) throw Error("Unexpected case!");
							else if (X_push_safe) makeOptimalRipplePush('1,0', firstPiece, secondPiece, pushAmount, axisDeterminer);
							else if (Y_push_safe) makeOptimalRipplePush('0,1', firstPiece, secondPiece, pushAmount, axisDeterminer);
							else throw Error("Neither push is safe. This is a logical deadlock. This case *should not happen* if the pieces are correctly ordered. If secondPiece comes after firstPiece on the V-axis, it must also come after it on at least one of the X or Y axes. Is there an error in the orthogonal solution?");
							
							changeMade = true;
							pushCount++;
						} else if (pushAmount < 0n) { // First piece needs to be pushed in +X/+Y direction
							// VIOLATION FOUND!
							console.log(`V-Violation: FIRST piece must be pushed +X/+Y by ${-pushAmount}!`);

							// I THINK these are mutually exclusive... Throw an error if they are not.
							const X_push_safe = (firstPiece.axisGroups['1,0'] > secondPiece.axisGroups['1,0']);
							const Y_push_safe = (firstPiece.axisGroups['0,1'] > secondPiece.axisGroups['0,1']);

							if (X_push_safe && Y_push_safe) throw Error("Unexpected case!");
							else if (X_push_safe) makeOptimalRipplePush('1,0', secondPiece, firstPiece, -pushAmount, axisDeterminer);
							else if (Y_push_safe) makeOptimalRipplePush('0,1', secondPiece, firstPiece, -pushAmount, axisDeterminer);
							else throw Error("Neither push is safe!");

							changeMade = true;
							pushCount++;
						} else console.log(`No V-violation found for pieces ${String(firstPiece.coords)} and ${String(secondPiece.coords)}.`);

						// DEBUGGING: Stop the iteration if we reached the max pushes
						if (pushCount >= MAX_PUSHES) {
							console.log(`\nReached max pushes of ${MAX_PUSHES}. Stopping iteration.`);
							break loop;
						}
					}
				}
			}
		}
		console.log(`\n${iteration - 1} iterations and ${pushCount} pushes needed to converge the UV-axis!`);
	}

	/**
	 * 
	 * @param axis 
	 * @param firstPiece 
	 * @param secondPiece - The piece of which group we are GUARANTEED to push. We will see if its optimal to push groups immediately before it, but not firstPiece's group.
	 */
	function makeOptimalRipplePush(
		axis: '1,0' | '0,1',
		firstPiece: PieceTransform,
		secondPiece: PieceTransform,
		pushAmount: bigint,
		axisDeterminer: AxisDeterminer // <-- New parameter
	) {
		const word = axis === '1,0' ? 'RIGHT' : 'UP';
		console.log(`Finding optimal ripple push for moving ${String(secondPiece.transformedCoords)} ${word} ${pushAmount}...\n`);

		const coordIndex = axis === '1,0' ? 0 : 1;
		const axisOrder = AllAxisOrders[axis];

		// --- Phase 1: Baseline Push & Initial State ---
		// Perform the mandatory push on the second piece's group and all subsequent groups.
		// We know this is REQUIRED because it is the ONLY action that will satisfy
		// the constraint between piece A and piece B!
		ripplePush(axis, secondPiece.axisGroups[axis], pushAmount);

		// Calculate the total board error after this baseline push. This is our score to beat.
		let minErrorSoFar = calculateTotalBoardAxisError(axisDeterminer);
		console.log("Current score: ", minErrorSoFar);
		// The number of groups we've pushed since we pushed
		// the group that resulted in the BEST state so far.
		let pushesSinceLastBest = 0;

		// --- Phase 2: The Search ---
		// We will try pushing more groups, one by one, iterating backward.

		// Start from the group before the second piece's group.
		// Iterate backward until we reach first piece's group (exclusive).
		for (let i = secondPiece.axisGroups[axis] - 1; i > firstPiece.axisGroups[axis]; i--) { 
			// i is the group index to try pushing next.
			const groupToPush = axisOrder[i];
			
			// Apply the next incremental push.
			pushGroup(groupToPush, pushAmount, coordIndex);

			// Check the new total board error.
			const currentError = calculateTotalBoardAxisError(axisDeterminer); // <-- Using the generic function

			// If this new state is better, record it as the best one so far.
			if (currentError < minErrorSoFar) {
				console.log("New best score: ", currentError);
				minErrorSoFar = currentError;
				pushesSinceLastBest = 0; // Reset the count of pushes since last best
			} else {
				// DEBUG LOGGING
				if (currentError === minErrorSoFar) console.log(`Group push didn't have an affect on the score.`);

				// This position is not better than the best one so far...
				pushesSinceLastBest++; // Increment the count of pushes since last best
			}
		}

		// --- Phase 3: Rewind to the Optimal State ---
		// The search is over. We know to rewind as many pushes as `pushesSinceLastBest`

		for (let i = firstPiece.axisGroups[axis] + 1; i < firstPiece.axisGroups[axis] + 1 + pushesSinceLastBest; i++) {
			const groupToUndo = axisOrder[i];
			// Undo the push by pushing with a negative amount.
			pushGroup(groupToUndo, -pushAmount, coordIndex);
		}

		// Calculate the final total board error after all the pushes.
		const finalError = calculateTotalBoardAxisError(axisDeterminer);
		console.log("Final V axis error after optimal push: ", finalError); // <-- GENERALIZE to U axis as well, later!!!!!
		console.log("Number of extra groups pushed: ", secondPiece.axisGroups[axis] - firstPiece.axisGroups[axis] - 1 - pushesSinceLastBest);
		console.log("Number of group pushes REWINDED: ", pushesSinceLastBest);
	}
	
	/**
     * Pushes all groups on a given orthogonal axis from a starting index onwards by a specific amount.
     */
	function ripplePush(axisToPush: '1,0' | '0,1', startingGroupIndex: number, pushAmount: bigint) {
		if (pushAmount <= 0n) throw Error(`Ripple push amount must be positive, got ${pushAmount}.`);

		const word = axisToPush === '1,0' ? 'RIGHT' : 'UP';
		console.log(`Ripple pushing group of index ${startingGroupIndex} ${word} by ${pushAmount}...`);

		const coordIndex = axisToPush === '1,0' ? 0 : 1;
		const axisOrder = AllAxisOrders[axisToPush];

		for (let i = startingGroupIndex; i < axisOrder.length; i++) {
			const groupToUpdate = axisOrder[i];
			pushGroup(groupToUpdate, pushAmount, coordIndex);
		}
	}

	/**
	 * Pushes a group by a specific amount in the X or Y direction,
	 * updating its transformed range and the transformed coordinates of all pieces in the group.
	 */
	function pushGroup(group: AxisGroup, pushAmount: bigint, coordIndex: 0 | 1) {
		// Update the transformed range of this group
		group.transformedRange![0] += pushAmount;
		group.transformedRange![1] += pushAmount;

		// Update the transformed coords of all pieces in this group
		for (const pieceToPush of group.pieces) {
			pieceToPush.transformedCoords[coordIndex]! += pushAmount;
		}
	}

	/**
	 * Helper for calculating by how much the given piece needs to be pushed
	 * so that its axis value matches the original position when compared to one other piece.
	 * @param axisDiff_Original - The axis difference the two pieces had in the original position.
	 * @param axisDiff_Transformed - The axis difference the two pieces have in the CURRENT transformed position.
	 * @returns The amount to push the piece by so it matches the original v difference in the original position, or 0n if no push is needed.
	 */
	function calculatePushAmount(axisDiff_Original: bigint, axisDiff_Transformed: bigint): bigint {
		// Original V distance is EXACTLY REQUIRED if they are within MIN_ARBITRARY_DISTANCE of each other.
		if (bimath.abs(axisDiff_Original) <= MIN_ARBITRARY_DISTANCE) {
			// console.log(`Original V distance is exactly required.`);
			return axisDiff_Original - axisDiff_Transformed; // Could be negative
		}
		// Otherwise, the current distance just has to be greater than or equal to MIN_ARBITRARY_DISTANCE
		else if (axisDiff_Original > MIN_ARBITRARY_DISTANCE && axisDiff_Transformed < MIN_ARBITRARY_DISTANCE) {
			// console.log(`Transformed V distance must be greater than or equal to MIN_ARBITRARY_DISTANCE.`);
			return MIN_ARBITRARY_DISTANCE - axisDiff_Transformed; // POSITIVE because of the comparison above
		}
		else if (axisDiff_Original < -MIN_ARBITRARY_DISTANCE && axisDiff_Transformed > -MIN_ARBITRARY_DISTANCE) {
			// console.log(`Transformed V distance must be less than or equal to -MIN_ARBITRARY_DISTANCE.`);
			return -MIN_ARBITRARY_DISTANCE - axisDiff_Transformed; // NEGATIVE because of the comparison above
		}

		return 0n; // No push needed
	}

	/**
	 * Takes a push amount and returns the level of error it has (absolute value).
	 */
	function calculateError(pushAmount: bigint) {
		return bimath.abs(pushAmount);
	}

	/**
	 * Sums the total axis error of a group's pieces against every other piece in the position.
	 */
	function calculateErrorOfGroup(group: AxisGroup, axisDeterminer: AxisDeterminer): bigint {

		let totalError: bigint = 0n;

		// For each piece within the group we are testing...
		for (const pieceInGroup of group.pieces) {
			const pieceInGroup_Original = axisDeterminer(pieceInGroup.coords);
			const pieceInGroup_Transformed = axisDeterminer(pieceInGroup.transformedCoords as Coords);

			// Compare it against every other piece in the entire position...
			for (const otherPiece of pieces) {
				// Don't compare a piece to itself.
				if (pieceInGroup === otherPiece) continue;

				const otherPiece_Original = axisDeterminer(otherPiece.coords);
				const otherPiece_Transformed = axisDeterminer(otherPiece.transformedCoords as Coords);

				// Determine the original and transformed differences on this axis.
				const axisDiff_Original = pieceInGroup_Original - otherPiece_Original;
				const axisDiff_Transformed = pieceInGroup_Transformed - otherPiece_Transformed;
				
				// Calculate the push amount needed to satisfy this single relationship.
				const pushAmount = calculatePushAmount(axisDiff_Original, axisDiff_Transformed);
				// The "error" is the magnitude of the required push.
				const error = calculateError(pushAmount);
				
				totalError += error;
			}
		}

		return totalError;
	}
	
	/**
	 * Calculates the sum of all errors on the board on a specific axis between every single pair of pieces.
	 * This gives one GRAND score where the higher the score, the more incorrect the position is (on that axis),
	 * and a score of 0n means the position is PERFECT and no pushes are necessary anymore to satisfy all constraints.
	 */
	function calculateTotalBoardAxisError(axisDeterminer: AxisDeterminer): bigint {
		let totalError = 0n;
		for (let i = 0; i < pieces.length; i++) {
			for (let j = i + 1; j < pieces.length; j++) {
				const pieceA = pieces[i];
				const pieceB = pieces[j];

				const vDiff_Original = axisDeterminer(pieceA.coords) - axisDeterminer(pieceB.coords);
				const vDiff_Transformed = axisDeterminer(pieceA.transformedCoords as Coords) - axisDeterminer(pieceB.transformedCoords as Coords);

				const pushAmount = calculatePushAmount(vDiff_Original, vDiff_Transformed);
				totalError += calculateError(pushAmount);
			}
		}
		return totalError;
	}



	// ================================ RETURN FINAL POSITION ================================


	// Now create the final compressed position from all
	// pieces known coord transformations

	const compressedPosition: Map<CoordsKey, number> = new Map();
	for (const piece of pieces) {
		// console.log(`Piece ${String(piece.coords)} transformed to ${String(piece.transformedCoords)}.`);
		if (piece.transformedCoords[0] === undefined || piece.transformedCoords[1] === undefined) throw Error(`Piece's transformed position is not entirely defined! Original piece location: ${String(piece.coords)}. Transformed location: ${String(piece.transformedCoords)}.`);

		const transformedCoordsKey = coordutil.getKeyFromCoords(piece.transformedCoords as Coords);
		compressedPosition.set(transformedCoordsKey, piece.type);
	}

	return {
		position: compressedPosition,
		axisOrders: AllAxisOrders,
		pieceTransformations: pieces,
	};
}


// ================================ MATHEMATICAL ================================


/**
 * Searches a sorted array of number ranges to see if a value belongs in one of them,
 * or is close enough in them to be merged with them, increasing their range.
 * If it can't be merged with any other range, it returns the index at which
 * you can create a new range for that value and retain the array's sorted order.
 * NO ranges will contain overlapping values, so the ranges are disjoint.
 * NEITHER will ranges overlap when given {@link mergeRange} padding!
 * @template T The type of elements in the array.
 * @template V The type of the extracted value used for comparison (number | bigint).
 * @param sortedArray The array of number ranges, sorted in ascending order.
 * @param rangeExtractor A function that takes an element of type T and returns the range of type [V,V].
 * @param mergeRange The range to merge the value with existing ranges if it is close enough to them.
 * @param value The value of type V to search for where it should be merged or a new range created for.
 * @returns An object with a 'found' boolean and the 'index'.
 *          - If found, `found` is true and `index` is the position of the range in the array that it should be merged into.
 *          - If not found, `found` is false and `index` is the correct insertion point for a new range for the value.
 */
function binarySearchRange<T>(
	sortedArray: T[],
	// eslint-disable-next-line no-unused-vars
	rangeExtractor: (element: T) => [bigint,bigint],
	mergeRange: bigint,
	value: bigint
): { found: boolean; index: number; } {
	let left: number = 0;
	let right: number = sortedArray.length - 1;

	while (left <= right) {
		const mid: number = Math.floor((left + right) / 2);
		const midRange: [bigint,bigint] = rangeExtractor(sortedArray[mid]);

		const lowMergeLimit: bigint = midRange[0] - mergeRange;
		const highMergeLimit: bigint = midRange[1] + mergeRange;

		// 1. Check for an exact match first.
		if (value >= lowMergeLimit && value <= highMergeLimit) {
			// Value already exists. Return its index and set found to true.
			return { found: true, index: mid };
		}

		// 2. Adjust search range.
		if (value < lowMergeLimit) right = mid - 1;
		else left = mid + 1; // highMergeLimit
	}

	// 3. If the loop completes, the value was not found.
	// 'left' is the correct index where it should be inserted.
	return { found: false, index: left };
}


// ===================================== EXPORTS =====================================


export type {
	AxisOrders,
	PieceTransform,
};

export default {
	// Constants
	MIN_ARBITRARY_DISTANCE,
	// Helpers
	XAxisDeterminer,
	YAxisDeterminer,
	posDiagAxisDeterminer,
	negDiagAxisDeterminer,
	// Implementation
	compressPosition,
};