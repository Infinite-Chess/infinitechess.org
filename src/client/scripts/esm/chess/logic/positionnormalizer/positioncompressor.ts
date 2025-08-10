
// src/client/scripts/esm/chess/logic/positionnormalizer/positioncompressor.ts

/**
 * This script contains an algorithm that can take an infinite chess position,
 * which may have pieces at arbitrarily large coordinates, and compress it
 * so that all pieces are within the bounds of standard javascript doubles.
 */


import bimath from "../../../util/bigdecimal/bimath.js";
import { Vec2Key } from "../../../util/math/vectors.js";
import coordutil, { Coords, CoordsKey } from "../../util/coordutil.js";
import typeutil, { players as p, rawTypes as r } from "../../util/typeutil.js";



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
	/** The original coordinates of the piece in the uncompressed position. */
	coords: Coords;
	/**
	 * The pieces new coordinates in the transformed/compressed position.
	 * Both coords will be fully defined after the orthogonal solution is finished.
	 * */
	transformedCoords: [bigint | undefined, bigint | undefined];
	/** A reference to what group indexes it belongs to on each axis. */
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


/**
 * Takes a pair of coordinates and returns a single
 * value that is unique to the axis line that piece is on.
 */
// eslint-disable-next-line no-unused-vars
type AxisDeterminer = (coords: Coords) => bigint;


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
 * * Must be divisible by 2, as this is divided by two in moveexpander.ts
 */
const MIN_ARBITRARY_DISTANCE = 40n;
// const MIN_ARBITRARY_DISTANCE = 10n;


/**
 * Each axis determiner, given a coordinate, will return the bigint value
 * that represents the axis value on the given axis for that piece.
 * 
 * The axis value is an integer unique to all pieces that lie on the same axis line as it.
 */
const AXIS_DETERMINERS = {
	/** X Axis */
	'1,0': (compressedEndCoords: Coords): bigint => compressedEndCoords[0],
	/** Y Axis */
	'0,1': (compressedEndCoords: Coords): bigint => compressedEndCoords[1],
	/** Positive Diagonal Axis */
	'1,1': (coords: Coords): bigint => coords[1] - coords[0],
	/** Negative Diagonal Axis */
	'1,-1': (coords: Coords): bigint => coords[1] + coords[0],
};



// ==================================== Main Function ====================================



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

	// Init the Axis Orders
	AllAxisOrders['1,0'] = []; // X axis
	AllAxisOrders['0,1'] = []; // Y axis
	if (mode === 'diagonals') {
		AllAxisOrders['1,1'] = []; // Positive diagonal axis
		AllAxisOrders['1,-1'] = []; // Negative diagonal axis
	}

	// Connect the pieces into groups by axis!
	// This is what retains piece distances when they are close by.
	for (const piece of pieces) {
		// console.log(`\nAnalyzing piece at ${String(piece.coords)}...`);
		registerPieceInAxisOrder('1,0', AllAxisOrders, piece);
		registerPieceInAxisOrder('0,1', AllAxisOrders, piece);
		if (mode === 'diagonals') {
			registerPieceInAxisOrder('1,1', AllAxisOrders, piece);
			registerPieceInAxisOrder('1,-1', AllAxisOrders, piece);
		}
	}

	// Give each piece references to what groups it belongs in.
	addPieceGroupReferencesForAxis('1,0', AllAxisOrders);
	addPieceGroupReferencesForAxis('0,1', AllAxisOrders);
	if (mode === 'diagonals') {
		addPieceGroupReferencesForAxis('1,1', AllAxisOrders);
		addPieceGroupReferencesForAxis('1,-1', AllAxisOrders);
	}

	// All pieces are now in order!

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
	

	// ================================ ORTHOGONAL SOLUTION ================================


	// console.log("\nSolving for orthogonal solution...");

	/**
	 * First solve the group's positions relative to each other orthogonally.
	 * This is also the draft for the diagonal solution.
	 * Later we will stretch the position to solve those.
	 */

	TransformToOrthogonalSolution(AllAxisOrders['1,0'], 0); // X axis
	TransformToOrthogonalSolution(AllAxisOrders['0,1'], 1); // Y axis


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


	if (mode === 'diagonals') IterativeDiagonalSolve(pieces, AllAxisOrders);


	// ================================ RETURN FINAL POSITION ================================


	// Shift the entire solution so that the White King is in its original spot! (Doesn't break the solution/topology)
	// RecenterTransformedPosition(pieces, AllAxisOrders);

	// Now create the final compressed position from all pieces known coord transformations
	const compressedPosition: Map<CoordsKey, number> = new Map();
	for (const piece of pieces) {
		// console.log(`Piece ${String(piece.coords)} transformed to ${String(piece.transformedCoords)}.`);
		const transformedCoordsKey = coordutil.getKeyFromCoords(piece.transformedCoords as Coords);
		compressedPosition.set(transformedCoordsKey, piece.type);
	}

	return {
		position: compressedPosition,
		axisOrders: AllAxisOrders,
		pieceTransformations: pieces,
	};
}


// ==================================== Construct Axis Orders & Groups ====================================


/**
 * Adds a piece to the respective axis, connecting it to any nearby pieces on the same axis,
 * either joining their group, merging nearby groups, or creating its own new group.
 */
function registerPieceInAxisOrder(axis: '1,0' | '0,1' | '1,1' | '1,-1', AllAxisOrders: AxisOrders, piece: PieceTransform) {
	// console.log(`Axis value ${pieceAxisValue}`);

	const axisOrder = AllAxisOrders[axis];
	const axisDeterminer = AXIS_DETERMINERS[axis];
	const pieceAxisValue = axisDeterminer(piece.coords);

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

/**
 * Gives each transformed piece a reference to what group it belong to on each axis.
 * Call after the axis orders and their groups have all been formed.
 */
function addPieceGroupReferencesForAxis(axis: Vec2Key, AllAxisOrders: AxisOrders) {
	const axisOrder: AxisOrder = AllAxisOrders[axis];
	for (let groupIndex = 0; groupIndex < axisOrder.length; groupIndex++) {
		const group = axisOrder[groupIndex]!;
		for (const piece of group.pieces) piece.axisGroups[axis] = groupIndex;
	}
}


// ======================================== ORTHOGONAL SOLVER ========================================


/**
 * On either the X or Y axis groups, initially sets each's transformedRange,
 * and their pieces' transformed coordinates according to the position's
 * orthogonal compressed solution.
 */
function TransformToOrthogonalSolution(axisOrder: AxisOrder, coordIndex: 0 | 1) {
	let current: bigint = 0n;

	for (const group of axisOrder) {
		// Update the group's transformed range
		const groupSize = group.range[1] - group.range[0];
		// Set the group's first draft transformed range.
		group.transformedRange = [current, current + groupSize];

		// Update each piece's transformed coordinates
		for (const piece of group.pieces) {
			// Add the piece's offset from the start of the group
			const offset = piece.coords[coordIndex] - group.range[0];
			piece.transformedCoords[coordIndex] = group.transformedRange![0] + offset;
		}

		// Increment so that the next group has what's considered an arbitrary spacing between them
		current += MIN_ARBITRARY_DISTANCE + groupSize;
	}
}


// ======================================== ITERATIVE DIAGONAL SOLVER ========================================


/**
 * To solve the diagonal solutions, we must make incremental pushes, or stretches,
 * to the orthogonal solution, retaining the orthogonal solution, while satisfying
 * more and more diagonal contraints, decreasing the total error until it's zero.
 */
function IterativeDiagonalSolve(pieces: PieceTransform[], AllAxisOrders: AxisOrders) {

	let iteration = 0;
	let pushCount = 0;
	let changeMade = true;
	const MAX_ITERATIONS = 100;

	// FOR DEBUGGING
	// const MAX_PUSHES = 7;
	const MAX_PUSHES = 500;

	loop: while (changeMade) {
		iteration++;
		if (iteration > MAX_ITERATIONS) {
			// DEBUGGING-------
			console.error(`Diagonal solver exceeded ${MAX_ITERATIONS} iterations.`);
			break;
			// -----------------
			// In production, throw an error because we never want to have
			// an engine analyze an imperfect compressed position! Force us to patch the bug.
			// throw Error(`Diagonal solver exceeded ${MAX_ITERATIONS} iterations.`);
		}
		changeMade = false;
		console.log(`\nIteration ${iteration}...`);

		// Iterate through every unique pair of pieces (A, B)
		for (let i = 0; i < pieces.length; i++) {
			const pieceA = pieces[i];
			for (let j = i + 1; j < pieces.length; j++) {
				const pieceB = pieces[j];

				// --- U-AXIS RELATIONSHIP CHECK ---
				// Positive diagonal!

				// let pushOccurred = comparePiecesOnDiagonal('1,1', AllAxisOrders, pieces, pieceA, pieceB);

				// if (pushOccurred) {
				// 	pushCount++;
				// 	changeMade = true;
				// 	// DEBUGGING: Stop the iteration if we reached the max pushes
				// 	// Let's us review each push manually
				// 	if (pushCount >= MAX_PUSHES) {
				// 		console.log(`\nReached max pushes of ${MAX_PUSHES}. Stopping iteration.`);
				// 		break loop;
				// 	} // --------------------------------------------------------
				// }

				// --- V-AXIS RELATIONSHIP CHECK ---
				// Negative diagonal!

				const pushOccurred = comparePiecesOnDiagonal('1,-1', AllAxisOrders, pieceA, pieceB);

				if (pushOccurred) {
					pushCount++;
					changeMade = true;
					// DEBUGGING: Stop the iteration if we reached the max pushes
					// Let's us review each push manually
					if (pushCount >= MAX_PUSHES) {
						console.log(`\nReached max pushes of ${MAX_PUSHES}. Stopping iteration.`);
						break loop;
					} // --------------------------------------------------------
				}
			}
		}
	}
	console.log(`\n${iteration - 1} iterations and ${pushCount} pushes needed to converge the UV-axis!`);
}

/**
 * Compares two piece axis values on a specific diagonal axis.
 * If they are off when comparing to the original position,
 * we calculate and perform an optimal ripple push that decreases
 * the total error in the position the most.
 * @param axis - What diagonal axis to compare the piece's axis values on.
 * @returns Whether a ripple push happened.
 */
function comparePiecesOnDiagonal(
	axis: '1,1' | '1,-1',
	AllAxisOrders: AxisOrders,
	pieceA: PieceTransform,
	pieceB: PieceTransform,
): boolean {
	const axisDeterminer = AXIS_DETERMINERS[axis];

	// Original axis values
	const pieceA_Axis_Original = axisDeterminer(pieceA.coords);
	const pieceB_Axis_Original = axisDeterminer(pieceB.coords);
	// Current axis values (affected by running transformations)
	const pieceA_Axis_Transformed = axisDeterminer(pieceA.transformedCoords as Coords);
	const pieceB_Axis_Transformed = axisDeterminer(pieceB.transformedCoords as Coords);

	// Original spacing from pieceA to pieceB
	const axisDiff_Original = pieceB_Axis_Original - pieceA_Axis_Original;
	// Current spacing from pieceA to pieceB (affected by running transformations)
	const vDiff_Transformed = pieceB_Axis_Transformed - pieceA_Axis_Transformed;

	console.log(`\nChecking pieces ${String(pieceA.transformedCoords)} (tv=${pieceA_Axis_Transformed}) and ${String(pieceB.transformedCoords)} (tv=${pieceB_Axis_Transformed}). Original spacing: ${axisDiff_Original}. Current spacing: ${vDiff_Transformed}.`);

	// How much pieceB should be moved to align with pieceA
	const pushAmount: bigint = calculatePushAmount(axisDiff_Original, vDiff_Transformed);

	if (axis === '1,1') {

		throw Error("Don't know how to push pieces to align positive diagonal yet!");

	} else if (axis === '1,-1') {
		// To increase a piece's negative diagonal axis values, we can push it in either the +X or +Y directions.
		if (pushAmount > 0n) {
			// Push pieceB +X/+Y
			console.log(`V-Violation: piece B must be pushed +X/+Y by ${pushAmount}!`);
			pushPieceFromAnchor(pieceB, pieceA, pushAmount, axisDeterminer, AllAxisOrders);
			return true; // A push occurred
		} else if (pushAmount < 0n) { // First piece needs to be pushed in +X/+Y direction
			// We can't push pieceB left/down, so instead we push pieceA right/up
			// Push pieceA +X/+Y
			console.log(`V-Violation: piece A must be pushed +X/+Y by ${-pushAmount}!`);
			pushPieceFromAnchor(pieceA, pieceB, -pushAmount, axisDeterminer, AllAxisOrders);
			return true; // A push occurred
		} // else console.log(`No V-violation found for pieces ${String(firstPiece.coords)} and ${String(secondPiece.coords)}.`);
		return false; // No push occurred
	} else throw Error(`Unsupported diagonal axis ${axis}!`);
}

/**
 * Ripple pushes a piece to increase its negative diagonal axis value. <--- GENERALIZE THIS!!!!!!!!!!
 * We can push on either the +X or +Y axis.
 * Which one we choose depends on what side the anchor piece is on,
 * as we can't push that, and ripple pushes will push it
 * if our piece's group is before the anchor's group.
 * @param piece - The piece to be ripple pushed in either the +X/+Y directions.
 * @param anchor - The piece acting as the anchor, this SHOULD NOT be affected by the push.
 */
function pushPieceFromAnchor(
	piece: PieceTransform,
	anchor: PieceTransform,
	pushAmount: bigint,
	axisDeterminer: AxisDeterminer,
	AllAxisOrders: AxisOrders,
) {
	// Prioritize pushing the piece's group TOWARDS the anchor piece's group,
	// BUT ONLY AS FAR until it touches it. Then we spend the remaining push amount
	// on the other axis

	const X_push_is_towards_anchor = piece.axisGroups['1,0'] < anchor.axisGroups['1,0'];
	const Y_push_is_towards_anchor = piece.axisGroups['0,1'] < anchor.axisGroups['0,1'];
	console.log(`X push is towards anchor: ${X_push_is_towards_anchor}, Y push is towards anchor: ${Y_push_is_towards_anchor}.`);

	if (X_push_is_towards_anchor && Y_push_is_towards_anchor) throw Error("Unexpected case!");
	else if (X_push_is_towards_anchor) {
		// Push the piece's group right, but only as far as it needs to go to touch the anchor piece's group.
		const gapBetweenXGroups = calculateGapBetweenGroups('1,0', AllAxisOrders, anchor.axisGroups['1,0'], piece.axisGroups['1,0']);
		console.log(`Gap between X groups: ${gapBetweenXGroups}.`);
		const pushAmountTowardsAnchor = bimath.min(pushAmount, gapBetweenXGroups);
		console.log(`Push amount towards anchor: ${pushAmountTowardsAnchor}.`);
		if (pushAmountTowardsAnchor > 0n && piece.axisGroups['1,0'] !== 0) { // Don't allow pushing this group if they are the first on the axis (anchor to zero).
			console.log(`There is some gap to fill!`);
			makeCollapsingRipplePush('1,0', AllAxisOrders, piece, pushAmountTowardsAnchor);
			pushAmount -= pushAmountTowardsAnchor;
			console.log(`Remaining gap: ${pushAmount}`);
		} // else there was no gap to fill, so we don't push towards the anchor piece group.
	} else if (Y_push_is_towards_anchor) {
		// Push the piece's group up, but only as far as it needs to go to touch the anchor piece's group.
		const gapBetweenYGroups = calculateGapBetweenGroups('0,1', AllAxisOrders, anchor.axisGroups['0,1'], piece.axisGroups['0,1']);
		console.log(`Gap between Y groups: ${gapBetweenYGroups}.`);
		const pushAmountTowardsAnchor = bimath.min(pushAmount, gapBetweenYGroups);
		if (pushAmountTowardsAnchor > 0n && piece.axisGroups['0,1'] !== 0) { // Don't allow pushing this group if they are the first on the axis (anchor to zero).
			console.log(`There is some gap to fill!`);
			makeCollapsingRipplePush('0,1', AllAxisOrders, piece, pushAmountTowardsAnchor); // Push up
			pushAmount -= pushAmountTowardsAnchor;
			console.log(`Remaining gap: ${pushAmount}`);
		} // else there was no gap to fill, so we don't push towards the anchor piece group.
	} else throw Error("Unexpected case!");

	// Early exit if no push amount is left.
	if (pushAmount <= 0n) {
		console.log(`Closing gap absorbed entirity of pushAmount :)`);
		return;
	}

	// Spend the remaining push amount in the only other direction that can be pushed.

	// Now, these pushes (away from the anchor's group) are considered
	// safe to make AS LONG AS they don't MATCH the anchor's group!
	// I THINK due to the geometry, these are mutually exclusive... Throw an error if they ever are not so I know to patch it.
	const X_push_safe = piece.axisGroups['1,0'] > anchor.axisGroups['1,0'];
	const Y_push_safe = piece.axisGroups['0,1'] > anchor.axisGroups['0,1'];

	if (X_push_safe && Y_push_safe) throw Error("Unexpected case!");
	// else if (X_push_safe) ripplePush('1,0', AllAxisOrders, piece.axisGroups['1,0'], pushAmount, pushAction);
	else if (X_push_safe) makeCollapsingRipplePush('1,0', AllAxisOrders, piece, pushAmount);
	// else if (Y_push_safe) ripplePush('0,1', AllAxisOrders, piece.axisGroups['0,1'], pushAmount, pushAction);
	else if (Y_push_safe) makeCollapsingRipplePush('0,1', AllAxisOrders, piece, pushAmount);

	else throw Error("Unexpected case!");
}

/**
 * Calculates the total empty space (the sum of all gaps) between two groups on a given orthogonal axis.
 * The order of the group indices does not matter.
 * @param axis - The orthogonal axis ('1,0' or '0,1') to measure the gap on.
 * @param groupIndexA - The index of the first group.
 * @param groupIndexB - The index of the second group.
 * @returns The total gap size as a non-negative bigint. Returns 0n if the groups are adjacent or overlapping.
 */
function calculateGapBetweenGroups(axis: '1,0' | '0,1', AllAxisOrders: AxisOrders, groupIndexA: number, groupIndexB: number): bigint {
	const axisOrder = AllAxisOrders[axis];

	// Ensure startIndex is the smaller of the two indices.
	const startIndex = Math.min(groupIndexA, groupIndexB);
	const endIndex = Math.max(groupIndexA, groupIndexB);

	// If the groups are the same, there is no gap between them.
	if (endIndex === startIndex) return 0n;

	let totalGap: bigint = 0n;

	// Iterate through the groups *between* startIndex and endIndex.
	for (let i = startIndex; i < endIndex; i++) {
		const currentGroup = axisOrder[i];
		const nextGroup = axisOrder[i + 1];

		// The gap is the space between the end of the current group and the start of the next, subtract the padding.
		const gap = nextGroup.transformedRange![0] - MIN_ARBITRARY_DISTANCE - currentGroup.transformedRange![1];
		if (gap < 0n) throw Error("Gap is < 0!"); // Protection in case this bug ever happens.
		
		totalGap += gap;
	}

	return totalGap;
}

/**
 * Pushes all groups on a given orthogonal axis from a starting index onwards by a specific amount.
 * @param axisToPush 
 * @param axisOrder 
 * @param startingGroupIndex - This group and all following groups will be pushed by the same amount.
 * @param pushAmount 
 * @param coordIndex 
 */
function ripplePush(axisToPush: '1,0' | '0,1', AllAxisOrders: AxisOrders, startingGroupIndex: number, pushAmount: bigint) {
	if (pushAmount <= 0n) throw Error(`Ripple push amount must be positive, got ${pushAmount}.`);

	const coordIndex = axisToPush === '1,0' ? 0 : 1;
	const axisOrder = AllAxisOrders[axisToPush];

	const word = axisToPush === '1,0' ? 'RIGHT' : 'UP';
	console.log(`Ripple pushing group of index ${startingGroupIndex} ${word} by ${pushAmount}...`);

	for (let i = startingGroupIndex; i < axisOrder.length; i++) {
		const groupToPush = axisOrder[i];
		pushGroup(groupToPush, pushAmount, coordIndex);
	}
}

/**
 * Pushes a given piece's group in the specified X/Y direction by a specific amount.
 * If there are any gaps in the X/Y axis groups to be filled behind it, it will do so,
 * otherwise, it will ripple push all groups in front of it, too.
 * In other words, subsequent groups will only be pushed by enough to ensure there
 * is no overlap between the last pushed group and them.
 * @param axis - What X/Y axis to ripple push the groups on.
 * @param firstPiece - This piece isn't pushed by the ripple, nor is its group.
 * @param piece - The piece of which group we are GUARANTEED to push. We will see if its optimal to push groups immediately before it, but not firstPiece's group or prior.
 * @param pushAmount - The amount to push the piece's group by. Subsequent groups will only be pushed enough to ensure there aren't any overlaps in groups.
 * @param axisDeterminer - What AxisDeterminer to use to calculate the error with the push. NOT the same as the direction of the push!!
 */
function makeCollapsingRipplePush(
	axis: '1,0' | '0,1',
	AllAxisOrders: AxisOrders,
	piece: PieceTransform,
	pushAmount: bigint,
) {
	if (pushAmount <= 0n) throw Error(`Ripple push amount must be positive, got ${pushAmount}.`);

	const word = axis === '1,0' ? 'RIGHT' : 'UP';

	const coordIndex = axis === '1,0' ? 0 : 1;
	const axisOrder = AllAxisOrders[axis];

	console.log(`Collapse pushing group of piece ${String(piece.transformedCoords)} ${word} by ${pushAmount}...`);

	// Perform the mandatory push on the piece's group and contionally, subsequent groups.
	// If subsequent groups can fill a gap in this axis, they will. They just don't like to overlap.
	
	// We know this push is REQUIRED because it is the ONLY action that will satisfy
	// the constraint between piece A and piece B!

	// First, push the group of the piece that is mandatory to be pushed.
	const mandatoryGroup = axisOrder[piece.axisGroups[axis]];
	pushGroup(mandatoryGroup, pushAmount, coordIndex);

	// Next, we're going to iterate through all subsequent groups,
	// IF THEY NOW OVERLAP with the last pushed group, we push
	// them right too, by the minimum amount to make their range start
	// line up with the range end of the last pushed group.
	let lastPushedGroup = mandatoryGroup;
	for (let i = piece.axisGroups[axis] + 1; i < axisOrder.length; i++) {
		const groupToUpdate = axisOrder[i];

		// If the last pushed group and this group now overlap, we need to push this group too,
		// enough so that it starts at the end of the last pushed group's range end.
		if (groupToUpdate.transformedRange![0] < lastPushedGroup.transformedRange![1] + MIN_ARBITRARY_DISTANCE) {
			// Calculate how much to push this group by so that it starts at the end of the last pushed group's range.
			const pushAmount = lastPushedGroup.transformedRange![1] + MIN_ARBITRARY_DISTANCE - groupToUpdate.transformedRange![0];
			console.log(`Pushing next group by ${pushAmount} to avoid overlap.`);
			pushGroup(groupToUpdate, pushAmount, coordIndex);
			lastPushedGroup = groupToUpdate; // Update the last pushed group
		} else {
			// No more groups to push, as they are not overlapping anymore.
			break;
		}
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
 * If the piece's current transformed position is further than the MIN_ARBITRARY_DISTANCE
 * required, then no push amount is necessary (0n).
 * @param axisDiff_Original - The axis difference the two pieces had in the original position. May be negative.
 * @param axisDiff_Transformed - The axis difference the two pieces have in the CURRENT transformed position.
 * @returns The amount to push the piece by so it matches the original v difference in the original position, or 0n if no push is needed. May be negative.
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

// /**
//  * Takes a push amount and returns the level of error it has (absolute value).
//  */
// function calculateError(pushAmount: bigint) {
// 	return bimath.abs(pushAmount);
// }

// /**
//  * Calculates the sum of all errors on the board on a specific axis between every single pair of pieces.
//  * This gives one GRAND score where the higher the score, the more incorrect the pieces are relative
//  * to each other (on that axis), and a score of 0n means the pieces are positioned PERFECT
//  * relative to each other and no pushes are necessary anymore to satisfy all constraints between them.
//  */
// function calculateTotalAxisError(pieces: PieceTransform[], axisDeterminer: AxisDeterminer): bigint {
// 	let totalError = 0n;
// 	for (let i = 0; i < pieces.length; i++) {
// 		const pieceA = pieces[i];
// 		for (let j = i + 1; j < pieces.length; j++) {
// 			const pieceB = pieces[j];

// 			const axisDiff_Original = axisDeterminer(pieceA.coords) - axisDeterminer(pieceB.coords);
// 			const axisDiff_Transformed = axisDeterminer(pieceA.transformedCoords as Coords) - axisDeterminer(pieceB.transformedCoords as Coords);

// 			const pushAmount = calculatePushAmount(axisDiff_Original, axisDiff_Transformed);
// 			totalError += calculateError(pushAmount);
// 		}
// 	}
// 	return totalError;
// }

// /**
//  * Calculates the topology of the board on a specific diagonal axis.
//  * This is used for comparing against after doing some pushes
//  * to detect if we've starting infinite repeating.
//  * @param axis 
//  * @param AllAxisOrders 
//  */
// function calculateBoardTopology(pieces: PieceTransform[], axisDeterminer: AxisDeterminer): bigint[] {

// 	const topology: bigint[] = [];

// 	// Calculate the spacing between each pair of pieces on the board.
// 	for (let i = 0; i < pieces.length; i++) {
// 		const pieceA = pieces[i];
// 		const pieceA_AxisValue = axisDeterminer(pieceA.transformedCoords as Coords);
// 		for (let j = i + 1; j < pieces.length; j++) {
// 			const pieceB = pieces[j];
// 			const pieceB_AxisValue = axisDeterminer(pieceB.transformedCoords as Coords);

// 			let axisDiff = pieceB_AxisValue - pieceA_AxisValue;

// 			// Cap the axisDiff to the +-MIN_ARBITRARY_DISTANCE
// 			axisDiff = bimath.clamp(axisDiff, -MIN_ARBITRARY_DISTANCE, MIN_ARBITRARY_DISTANCE);

// 			topology.push(axisDiff);
// 		}
// 	}

// 	return topology;
// }


// ======================================== RECENTERING TRANFORMED POSITION ========================================


/**
 * Translates the entire transformed position so tht the White King
 * ends up on the same square it occupied in the original, uncompressed position.
 * This doesn't affect the solution or topology at all.
 * @param allPieces The list of all transformed pieces.
 * @param allAxisOrders The AxisOrders object containing all axis groups of the transformed position.
 */
function RecenterTransformedPosition(allPieces: PieceTransform[], allAxisOrders: AxisOrders) {
	// Define the type for a White King (you may need to import typeutil and players)
	const whiteKingType = typeutil.buildType(r.KING, p.WHITE);

	// 1. Find the White King in the list of pieces.
	const whiteKing: PieceTransform | undefined = allPieces.find(p => p.type === whiteKingType);

	if (!whiteKing) {
		console.warn("Could not find White King to normalize position. Skipping translation.");
		return;
	}

	// 2. Calculate the required translation vector (dx, dy).
	const transformedKingCoords = whiteKing.transformedCoords as Coords;
	const translationVector: Coords = [
		whiteKing.coords[0] - transformedKingCoords[0],
		whiteKing.coords[1] - transformedKingCoords[1]
	];

	console.log(`Normalizing position by translating all pieces by [${translationVector[0]}, ${translationVector[1]}] to match White King's original position.`);

	// 3. Apply the translation to every piece's transformed coordinates.
	for (const piece of allPieces) {
		piece.transformedCoords[0]! += translationVector[0];
		piece.transformedCoords[1]! += translationVector[1];
	}

	// 4. Apply the same translation to all axes' groups' transformedRange.
	for (const axisKey in allAxisOrders) {
		const axisOrder = allAxisOrders[axisKey as Vec2Key];
		const axisDeterminer = AXIS_DETERMINERS[axisKey];

		// Calculate how the translationVector translates on this specific axis.
		// This is equivalent to axisDeterminer([dx, dy]) - axisDeterminer([0, 0]).
		const pushAmount = axisDeterminer(translationVector);
		
		for (const group of axisOrder) {
			if (group.transformedRange) {
				group.transformedRange[0] += pushAmount;
				group.transformedRange[1] += pushAmount;
			}
		}
	}
}


// ===================================== EXPORTS =====================================


export type {
	AxisOrders,
	PieceTransform,
};

export default {
	// Constants
	MIN_ARBITRARY_DISTANCE,
	AXIS_DETERMINERS,
	// Implementation
	compressPosition,
};