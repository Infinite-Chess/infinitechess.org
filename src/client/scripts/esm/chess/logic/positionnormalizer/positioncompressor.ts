
// src/client/scripts/esm/chess/logic/positionnormalizer/positioncompressor.ts

/**
 * This script contains an algorithm that can take an infinite chess position,
 * which may have pieces at arbitrarily large coordinates, and compress it
 * so that all pieces are within the bounds of standard javascript doubles.
 */


import bd from "../../../util/bigdecimal/bigdecimal.js";
import bimath from "../../../util/bigdecimal/bimath.js";
import jsutil from "../../../util/jsutil.js";
import bounds, { BoundingBox } from "../../../util/math/bounds.js";
import geometry from "../../../util/math/geometry.js";
import vectors, { LineCoefficients, Vec2, Vec2Key } from "../../../util/math/vectors.js";
import coordutil, { BDCoords, Coords, CoordsKey, DoubleCoords } from "../../util/coordutil.js";
import icnconverter, { _Move_Compact } from "../icn/icnconverter.js";
import moveexpander from "./moveexpander.js";



// ============================== Type Definitions ==============================



interface CompressionInfo {
	position: Map<CoordsKey, number>;
	axisOrders: Record<Vec2Key, AxisOrder>;
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




// interface Group {
// 	/** The bounding box of this group. */
// 	bounds: BoundingBox;
// 	/** The center of the box */
// 	center: Coords;
// 	/** All pieces included in this group. */
// 	pieces: Piece[];
// 	/** How much the group has been shifted compared to the original, uncompressed input position. */
// 	offset?: Coords;
// }



// ================================== Constants ==================================


/**
 * Piece groups further than this many squares away from the origin
 * will be compressed closer to the origin.
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
const MIN_ARBITRARY_DISTANCE = 20n;



// ================================ Testing Usage ================================



const example_position = 'k5,5|R35,10';
// const example_position = 'k0,0|Q0,0|N2000,4000';
// const example_position = 'k0,0|Q0,0|N40,120';
// const example_position = 'K0,0|Q5000,10000|Q5000,7000';

const parsedPosition = icnconverter.ShortToLong_Format(example_position);
// console.log("parsedPosition:", JSON.stringify(parsedPosition.position, jsutil.stringifyReplacer));

const compressedPosition = compressPosition(parsedPosition.position!);

console.log("\nBefore:");
console.log(example_position);

const newICN = icnconverter.getShortFormPosition(compressedPosition.position, parsedPosition.state_global.specialRights!);
console.log("\nAfter:");
console.log(newICN);
console.log("\n");

const chosenMove: _Move_Compact = {
	startCoords: [20n, 5n],
	endCoords: [0n, 1n],
};

const expandedMove = moveexpander.expandMove(compressedPosition.axisOrders, compressedPosition.pieceTransformations, chosenMove);

console.log(`\nChosen move:   Start: (${String(chosenMove.startCoords)})   End: (${String(chosenMove.endCoords)})`);
console.log(`Expanded move:   Start: (${String(expandedMove.startCoords)})   End: (${String(expandedMove.endCoords)})\n`);




// ================================ Implementation ================================






function compressPosition(position: Map<CoordsKey, number>): CompressionInfo {

	// 1. List all pieces with their bigint arbitrary coordinates.

	const pieces: PieceTransform[] = [];

	position.forEach((type, coordsKey) => {
		const coords = coordutil.getCoordsFromKey(coordsKey);
		pieces.push({
			type,
			coords,
			transformedCoords: [undefined, undefined],
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

	
	/**
	 * Orderings of the pieces on every axis of movement,
	 * and how they are all connected together.
	 */
	const AllAxisOrders: AxisOrders = {};

	// Init the axis orders as empty
	for (const vec2 of vectors.VECTORS_ORTHOGONAL) { // [[1,0], [0,1]]
		const vec2Key: Vec2Key = vectors.getKeyFromVec2(vec2); // '1,0' | '0,1'
		AllAxisOrders[vec2Key] = [];
	}

	// Order the pieces

	for (const piece of pieces) {
		console.log(`\nAnalyzing piece at ${String(piece.coords)}...`);
		registerPieceInAxisOrder(AllAxisOrders['1,0'], piece, piece.coords[0]);
		registerPieceInAxisOrder(AllAxisOrders['0,1'], piece, piece.coords[1]);
	}

	// ONLY FOR LOGGING
	console.log("\nAll axis orders after registering pieces:");
	for (const vec2Key in AllAxisOrders) {
		const axisOrder = AllAxisOrders[vec2Key];
		console.log(`Axis order ${vec2Key}:`);
		for (const axisGroup of axisOrder) {
			console.log(`  Range: ${axisGroup.range}, Pieces: ${axisGroup.pieces.length}`);
		}
	}
	
	function registerPieceInAxisOrder(axisOrder: AxisOrder, piece: PieceTransform, pieceAxisValue: bigint) {
		console.log(`Axis value ${pieceAxisValue}`);

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
			
			console.log(`Created new group for piece with axis value ${pieceAxisValue}.`);
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

		console.log(`Pushing piece to group with range ${axisGroup.range}...`);

		let sideExtended: -1 | 0 | 1 = 0; // -1 = left side extended, 0 = no extension, 1 = right extended

		// Update the axis group's start and end coordinates
		if (pieceAxisValue < axisGroup.range[0]) {
			axisGroup.range[0] = pieceAxisValue;
			sideExtended = -1; // Piece extended the group on the negative side
		} else if (pieceAxisValue > axisGroup.range[1]) {
			axisGroup.range[1] = pieceAxisValue;
			sideExtended = 1; // Piece extended the group on the positive side
		}

		console.log(`New range: ${axisGroup.range}.`);

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

		console.log("Group 1:", firstGroup.range, "count: ", firstGroup?.pieces.length);
		console.log("Group 2:", secondGroup.range, "count: ", secondGroup?.pieces.length);

		if (firstGroup.range[1] + MIN_ARBITRARY_DISTANCE >= secondGroup.range[0]) { // Group ranges are touching or overlapping
			// Merge second group into first group

			console.log(`Merging groups into one...`);

			firstGroup.pieces.push(...secondGroup.pieces);
			firstGroup.range[1] = secondGroup.range[1];
			const secondGroupIndex = sideExtended === -1 ? extendedGroupIndex : adjacentGroupIndex;
			axisOrder.splice(secondGroupIndex, 1);

			console.log("Merged group:", firstGroup.range, "count: ", firstGroup.pieces.length);
		}

		else console.log(`No merging needed, groups are not close enough.`);
	}

	// Now that the pieces are all in order,

	// Let's determine their transformed coordinates.

	console.log("\nTransforming pieces to final coordinates...");

	// Choosing a smart start coord ensure the resulting position is centered on (0,0)
	// let currentX: bigint = BigInt(AllAxisOrders['1,0'].length - 1) * -MIN_ARBITRARY_DISTANCE / 2n;
	let currentX: bigint = 0n;
	for (const axisGroup of AllAxisOrders['1,0']) {
		for (const piece of axisGroup.pieces) piece.transformedCoords[0] = currentX + piece.coords[0] - axisGroup.range[0]; // Add the piece's offset from the start of the group
		
		const axisGroupSize = axisGroup.range[1] - axisGroup.range[0];

		// Set the group's transformed range.
		// This is important for determining what groups we are interested in
		// when we try to make a move in the compressed position.
		axisGroup.transformedRange = [currentX, currentX + axisGroupSize];

		// Increment so that the next x coordinate with a piece has
		// what's considered an arbitrary spacing between them
		currentX += MIN_ARBITRARY_DISTANCE + axisGroupSize;
	}

	// Choosing a smart start coord ensure the resulting position is centered on (0,0)
	// let currentY: bigint = BigInt(AllAxisOrders['0,1'].length - 1) * -MIN_ARBITRARY_DISTANCE / 2n;
	let currentY: bigint = 0n;
	for (const axisGroup of AllAxisOrders['0,1']) {
		for (const piece of axisGroup.pieces) piece.transformedCoords[1] = currentY + piece.coords[1] - axisGroup.range[0]; // Add the piece's offset from the start of the group
		
		const axisGroupSize = axisGroup.range[1] - axisGroup.range[0];

		// Set the group's transformed range.
		// This is important for determining what groups we are interested in
		// when we try to make a move in the compressed position.
		axisGroup.transformedRange = [currentY, currentY + axisGroupSize];

		// Increment so that the next y coordinate with a piece has
		// what's considered an arbitrary spacing between them
		currentY += MIN_ARBITRARY_DISTANCE + axisGroupSize;
	}



	// Now create the final compressed position from all
	// pieces known coord transformations

	const compressedPosition: Map<CoordsKey, number> = new Map();
	for (const piece of pieces) {
		console.log(`Piece ${String(piece.coords)} transformed to ${String(piece.transformedCoords)}.`);
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
		if (value < lowMergeLimit) {
			right = mid - 1;
		} else { // highMergeLimit
			left = mid + 1;
		}
	}

	// 3. If the loop completes, the value was not found.
	// 'left' is the correct index where it should be inserted.
	return { found: false, index: left };
}



/**
 * Returns the chebyshev distance from the provided coordinates to the bounds.
 * If the coordinates are within the bounds, returns 0.
 */
// function getCoordsDistanceToBounds(coords: Coords, bounds: BoundingBox): bigint {
// 	const boundsWidth = bounds.right - bounds.left;
// 	const boundsHeight = bounds.bottom - bounds.top;

// 	const xDistLeft = bimath.abs(coords[0] - bounds.left);
// 	const xDistRight = bimath.abs(coords[0] - bounds.right);
// 	const yDistBottom = bimath.abs(coords[1] - bounds.bottom);
// 	const yDistTop = bimath.abs(coords[1] - bounds.top);

// 	if (xDistLeft < boundsWidth && xDistRight < boundsWidth &&
// 		yDistBottom < boundsHeight && yDistTop < boundsHeight) {
// 		// The coordinates are within the bounds.
// 		return 0n;
// 	}

// 	// The coordinates are outside the bounds.
// 	// Return the chebyshev distance to the closest edge.
// 	return bimath.max(
// 		bimath.min(xDistLeft, xDistRight),
// 		bimath.min(yDistBottom, yDistTop)
// 	);
// }

export type {
	AxisOrders,
	PieceTransform,
};

export default {
	// Constants
	MIN_ARBITRARY_DISTANCE
};