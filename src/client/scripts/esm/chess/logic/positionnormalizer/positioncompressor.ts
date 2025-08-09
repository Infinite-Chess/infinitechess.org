
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
// const MIN_ARBITRARY_DISTANCE = 40n;
const MIN_ARBITRARY_DISTANCE = 5n;


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
}



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
	RecenterTransformedPosition(pieces, AllAxisOrders);

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
	const MAX_ITERATIONS = 100; // Increased for diagonal complexity

	// FOR DEBUGGING
	// const MAX_PUSHES = 9;
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
			const pieceA = pieces[i];
			for (let j = i + 1; j < pieces.length; j++) {
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
				// Negative diagonal!
				{ // Use a block to keep variable names from colliding
					const axisDeterminer = AXIS_DETERMINERS['1,-1'];

					// Determine original V-axis ordering from their original coordinates
					const firstPiece_v_Original = axisDeterminer(pieceA.coords);
					const secondPiece_v_Original = axisDeterminer(pieceB.coords);

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
					const tv_first = axisDeterminer(firstPiece.transformedCoords as Coords);
					const tv_second = axisDeterminer(secondPiece.transformedCoords as Coords);

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
						else if (X_push_safe) makeOptimalRipplePush('1,0', AllAxisOrders, firstPiece, secondPiece, pushAmount, axisDeterminer);
						else if (Y_push_safe) makeOptimalRipplePush('0,1', AllAxisOrders, firstPiece, secondPiece, pushAmount, axisDeterminer);
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
						else if (X_push_safe) makeOptimalRipplePush('1,0', AllAxisOrders, secondPiece, firstPiece, -pushAmount, axisDeterminer);
						else if (Y_push_safe) makeOptimalRipplePush('0,1', AllAxisOrders, secondPiece, firstPiece, -pushAmount, axisDeterminer);
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
 * @param firstPiece - This piece isn't pushed by the ripple, nor is its group.
 * @param secondPiece - The piece of which group we are GUARANTEED to push. We will see if its optimal to push groups immediately before it, but not firstPiece's group or prior.
 * @param pushAmount
 * @param axisDeterminer - What AxisDeterminer to use to calculate the error with the push. NOT the same as the direction of the push!!
 */
function makeOptimalRipplePush(
	axis: '1,0' | '0,1',
	AllAxisOrders: AxisOrders,
	firstPiece: PieceTransform,
	secondPiece: PieceTransform,
	pushAmount: bigint,
	axisDeterminer: AxisDeterminer
) {
	const word = axis === '1,0' ? 'RIGHT' : 'UP';
	console.log(`Finding optimal ripple push for moving ${String(secondPiece.transformedCoords)} ${word} ${pushAmount}...\n`);

	const coordIndex = axis === '1,0' ? 0 : 1;
	const axisOrder = AllAxisOrders[axis];

	// --- Phase 1: Baseline Push & Initial State ---
	// Perform the mandatory push on the second piece's group and all subsequent groups.
	// We know this is REQUIRED because it is the ONLY action that will satisfy
	// the constraint between piece A and piece B!
	ripplePush(axis, axisOrder, secondPiece.axisGroups[axis], pushAmount, coordIndex);

	/** The first group that comes after the first piece's group (which is immovable). */
	const startingGroupIndex = firstPiece.axisGroups[axis] + 1;

	/**
	 * --- Identify the pieces relevant to THIS decision ---
	 * The relevant pieces are all those in groups that could possibly be moved by the ripple push.
	 * 
	 * When calculating the total score of the position after this action
	 * (and potential additional group pushes below), we must ONLY TAKE
	 * into account all pieces that can potentially be affected by the pushes
	 * we make! Pieces far below the first piece's group shouldn't be able to
	 * veto potential improving pushes we can make to the groups nearby us now!
	 */
	const relevantPieces = getRelevantPieces(axisOrder, startingGroupIndex);

	// Calculate the total board error after this baseline push. This is our score to beat.
	let minErrorSoFar = calculateScopedAxisError(relevantPieces, axisDeterminer);
	console.log("Checking if pushing more groups will improve the score: ", minErrorSoFar);
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
		const currentError = calculateScopedAxisError(relevantPieces, axisDeterminer);

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

	for (let i = startingGroupIndex; i < startingGroupIndex + pushesSinceLastBest; i++) {
		const groupToUndo = axisOrder[i];
		// Undo the push by pushing with a negative amount.
		pushGroup(groupToUndo, -pushAmount, coordIndex);
	}

	console.log("Number of extra groups pushed: ", secondPiece.axisGroups[axis] - firstPiece.axisGroups[axis] - 1 - pushesSinceLastBest);
	console.log("Number of group pushes REWINDED: ", pushesSinceLastBest);
}

/**
 * Pushes all groups on a given orthogonal axis from a starting index onwards by a specific amount.
 */
function ripplePush(axisToPush: '1,0' | '0,1', axisOrder: AxisOrder, startingGroupIndex: number, pushAmount: bigint, coordIndex: 0 | 1) {
	if (pushAmount <= 0n) throw Error(`Ripple push amount must be positive, got ${pushAmount}.`);

	const word = axisToPush === '1,0' ? 'RIGHT' : 'UP';
	console.log(`Ripple pushing group of index ${startingGroupIndex} ${word} by ${pushAmount}...`);

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
 * If the piece's current transformed position is further than the MIN_ARBITRARY_DISTANCE
 * required, then no push amount is necessary (0n).
 * @param axisDiff_Original - The axis difference the two pieces had in the original position.
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

/**
 * Gathers all pieces from a starting group index onwards on a given orthogonal axis.
 * @param axis The orthogonal axis ('1,0' for X, '0,1' for Y) to gather pieces from.
 * @param startingGroupIndex The index of the first group to include pieces from (inclusive).
 * @returns An array of all PieceTransform objects found.
 */
function getRelevantPieces(axisOrder: AxisOrder, startingGroupIndex: number): PieceTransform[] {
	const relevantPieces: PieceTransform[] = [];
	for (let i = startingGroupIndex; i < axisOrder.length; i++) {
		relevantPieces.push(...axisOrder[i].pieces);
	}
	return relevantPieces;
}

/**
 * Takes a push amount and returns the level of error it has (absolute value).
 */
function calculateError(pushAmount: bigint) {
	return bimath.abs(pushAmount);
}

/**
 * Calculates the sum of all errors on the board on a specific axis between every single pair of pieces provided.
 * This gives one GRAND score where the higher the score, the more incorrect the pieces are relative
 * to each other (on that axis), and a score of 0n means the pieces are positioned PERFECT
 * relative to each other and no pushes are necessary anymore to satisfy all constraints between them.
 */
function calculateScopedAxisError(relevantPieces: PieceTransform[], axisDeterminer: AxisDeterminer): bigint {
	let totalError = 0n;
	for (let i = 0; i < relevantPieces.length; i++) {
		const pieceA = relevantPieces[i];
		for (let j = i + 1; j < relevantPieces.length; j++) {
			const pieceB = relevantPieces[j];

			const axisDiff_Original = axisDeterminer(pieceA.coords) - axisDeterminer(pieceB.coords);
			const axisDiff_Transformed = axisDeterminer(pieceA.transformedCoords as Coords) - axisDeterminer(pieceB.transformedCoords as Coords);

			const pushAmount = calculatePushAmount(axisDiff_Original, axisDiff_Transformed);
			totalError += calculateError(pushAmount);
		}
	}
	return totalError;
}


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