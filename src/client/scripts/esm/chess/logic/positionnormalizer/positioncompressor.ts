
// src/client/scripts/esm/chess/logic/positionnormalizer/positioncompressor.ts

/**
 * This script contains an algorithm that can take an infinite chess position,
 * which may have pieces at arbitrarily large coordinates, and compress it
 * so that all pieces are within the bounds of standard javascript doubles.
 */


import vectors, { Vec2Key } from "../../../util/math/vectors.js";
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
const MIN_ARBITRARY_DISTANCE = 40n;



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

/** Given a coordinate, returns the bigint value that represent the X-axis value for that piece. */
function XAxisDeterminer(compressedEndCoords: Coords): bigint { return compressedEndCoords[0]; }
/** Given a coordinate, returns the bigint value that represent the Y-axis value for that piece. */
function YAxisDeterminer(compressedEndCoords: Coords): bigint { return compressedEndCoords[1]; }
/** Given a coordinate, returns the bigint value that represent the positive diagonal axis value for that piece. */
function posDiagAxisDeterminer(coords: Coords): bigint { return coords[1] - coords[0]; }
/** Given a coordinate, returns the bigint value that represent the negative diagonal axis value for that piece. */
function negDiagAxisDeterminer(coords: Coords): bigint { return coords[1] + coords[0]; }



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
		registerPieceInAxisOrder(AllAxisOrders['1,0'], piece, XAxisDeterminer(piece.coords));
		registerPieceInAxisOrder(AllAxisOrders['0,1'], piece, YAxisDeterminer(piece.coords));
		if (mode === 'diagonals') {
			registerPieceInAxisOrder(AllAxisOrders['1,1'], piece, posDiagAxisDeterminer(piece.coords));
			registerPieceInAxisOrder(AllAxisOrders['-1,1'], piece, negDiagAxisDeterminer(piece.coords));
		}
	}

	// Helper for registering a piece in any axis order.
	function registerPieceInAxisOrder(axisOrder: AxisOrder, piece: PieceTransform, pieceAxisValue: bigint) {
		// console.log(`Axis value ${pieceAxisValue}`);

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


	// ONLY FOR LOGGING ---------------------------------------------
	console.log("\nAll axis orders after registering pieces:");
	for (const vec2Key in AllAxisOrders) {
		const axisOrder = AllAxisOrders[vec2Key] as AxisOrder;
		console.log(`Axis order ${vec2Key}:`);
		for (const axisGroup of axisOrder) {
			console.log(`  Range: ${axisGroup.range}, Pieces: ${axisGroup.pieces.length}`);
		}
	}
	// --------------------------------------------------------------
	

	// All pieces are now in order!


	// ================================ ORTHOGONAL SOLUTION ================================


	/**
	 * First solve the group's positions relative to each other orthogonally.
	 * This is also the draft for the diagonal solution.
	 * Later we will stretch the position.
	 */

	console.log("\nSolving for orthogonal solution...");

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



	// let iteration = 0;
	// let changeMade = true;

	// while (changeMade === true) {
	// 	iteration++;
	// 	changeMade = false;
	// 	console.log(`\nIteration ${iteration}...`);

		


		
	// }

	// console.log(`\nNo more changes made after ${iteration} iterations.`);



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