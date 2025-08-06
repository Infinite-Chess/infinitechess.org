
// src/client/scripts/esm/chess/logic/positionconpressor.ts

/**
 * This script contains an algorithm that can take an infinite chess position,
 * which may have pieces at arbitrarily large coordinates, and compress it
 * so that all pieces are within the bounds of standard javascript doubles.
 */


import bd from "../../util/bigdecimal/bigdecimal.js";
import bimath from "../../util/bigdecimal/bimath.js";
import jsutil from "../../util/jsutil.js";
import bounds, { BoundingBox } from "../../util/math/bounds.js";
import geometry from "../../util/math/geometry.js";
import vectors, { LineCoefficients, Vec2, Vec2Key } from "../../util/math/vectors.js";
import coordutil, { BDCoords, Coords, CoordsKey, DoubleCoords } from "../util/coordutil.js";
import icnconverter from "./icn/icnconverter.js";



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



type MoveDraft = { startCoords: Coords, endCoords: Coords };


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

const chosenMove: MoveDraft = {
	startCoords: [20n, 5n],
	endCoords: [0n, 1n],
};

const expandedMove = expandMove(compressedPosition.axisOrders, compressedPosition.pieceTransformations, chosenMove);

console.log(`\nChosen move:   Start: (${String(chosenMove.startCoords)})   End: (${String(chosenMove.endCoords)})`);
console.log(`Expanded move:   Start: (${String(expandedMove.startCoords)})   End: (${String(expandedMove.endCoords)})\n`);




// ================================ Implementation ================================



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

/** Given a coordinate, returns the bigint value that represent the axis value for that piece. */
function XAxisDeterminer(fakeEndCoords: Coords): bigint { return fakeEndCoords[0]; }
function YAxisDeterminer(fakeEndCoords: Coords): bigint { return fakeEndCoords[1]; }



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
 * Takes a move that should have been calculated from the compressed position,
 * and modifies its start and end coords so that it moves the original
 * uncompressed position's piece, and so its destination coordinates still
 * threaten all the same original pieces.
 * @param compressedPosition - The original uncompressed position
 * @param move - The decided upon move based on the compressed position
 */
function expandMove(AllAxisOrders: AxisOrders, pieceTransformations: PieceTransform[], move: MoveDraft): MoveDraft {
	const startCoordsBigInt: Coords = [BigInt(move.startCoords[0]), BigInt(move.startCoords[1])];
	const endCoordsBigInt: Coords = [BigInt(move.endCoords[0]), BigInt(move.endCoords[1])];

	// Determine the piece's original position

	const originalPiece = pieceTransformations.find((pt) => coordutil.areCoordsEqual(startCoordsBigInt, pt.transformedCoords as Coords));
	if (originalPiece === undefined) throw Error(`Compressed position's pieces doesn't include the moved piece on coords ${String(move.startCoords)}! Were we sure to choose a move based on the compressed position and not the original?`);

	const originalStartCoords: Coords = originalPiece.coords; // EASY! This is already given

	/**
	 * Determine the piece's intended destination square.
	 * 
	 * How do we do that?
	 * 
	 * Determine if the piece is targetting any specific axis group.
	 * We can then calculate the intersection of its movement vector
	 * and the direction towards that group to determine its intended destination.
	 * 
	 * For now there aren't any gaps between groups, so it can't target an arbitrary
	 * opening between gaps, its always got to be a little to the left or right of a group.
	 * However, they can move arbitrarily far fast the farthest group,
	 * so we will just move it the same distance it wanted to.
	 */

	// Did it capture a piece?
	const capturedTransformedPiece = pieceTransformations.find((pt) => coordutil.areCoordsEqual(pt.transformedCoords as Coords, endCoordsBigInt));
	if (capturedTransformedPiece) { // EASY! Return the captured piece's original coords
		return {
			startCoords: originalStartCoords,
			endCoords: capturedTransformedPiece.coords
		};
	}

	// It didn't capture any piece
	// This is a little more complicated. But we will attach it to the nearest axis group.

	/** The direction the piece moved in. */
	const vector: Vec2 = vectors.absVector(vectors.normalizeVector(coordutil.subtractCoords(endCoordsBigInt, startCoordsBigInt)));
	const vec2Key: Vec2Key = vectors.getKeyFromVec2(vector);
	// console.log("Original start coords:", originalStartCoords);
	// console.log("Movement vector:", vector);
	const movementLine: LineCoefficients = vectors.getLineGeneralFormFromCoordsAndVec(originalStartCoords, vector);

	const HALF_ARBITRARY_DISTANCE = MIN_ARBITRARY_DISTANCE / 2n;

	let originalEndCoords: Coords | undefined;

	// Search each axis group besides the direction it moved in

	// Skip if our movement is perpendicular to that axis,
	// its impossible for us to increase our axis value along it
	// => not interested in threatening any of those groups.
	if (vec2Key !== '0,1') determineIfMovedPieceInterestedInAxis('1,0', XAxisDeterminer);
	if (vec2Key !== '1,0') determineIfMovedPieceInterestedInAxis('0,1', YAxisDeterminer);

	function determineIfMovedPieceInterestedInAxis(
		axis: '1,0' | '0,1',
		// eslint-disable-next-line no-unused-vars
		axisValueDeterminer: (fakeEndCoords: Coords) => bigint,
	) {
		if (originalEndCoords) return; // We already found the original end coords, no need to continue

		const axisOrder = AllAxisOrders[axis];

		const fakeEndCoordsAxisValue = axisValueDeterminer(endCoordsBigInt);
		// console.log("fakeEndCoordsAxisValue:", fakeEndCoordsAxisValue);
		// console.log('endCoords bigint:', endCoordsBigInt);

		for (const axisGroup of axisOrder) {
			if (fakeEndCoordsAxisValue + HALF_ARBITRARY_DISTANCE >= axisGroup.transformedRange![0] &&
				fakeEndCoordsAxisValue - HALF_ARBITRARY_DISTANCE <= axisGroup.transformedRange![1]) {
				// We found the group of interest this piece is targetting!
				console.log(`Moved piece is interested in group on the ${axis} axis with range ${axisGroup.transformedRange}.   Original range ${axisGroup.range}`);

				// The piece is on the same file as this axis group, so connect it to this axis group
				// so its position remains relative to them when the position is expanded back out.

				const offsetFromGroupStart = fakeEndCoordsAxisValue - axisGroup.transformedRange![0];
				const actualEndCoordsAxisValue = axisGroup.range[0] + offsetFromGroupStart;
				// console.log('offsetFromGroupStart:', offsetFromGroupStart);
				// console.log('actualEndCoordsAxisValue:', actualEndCoordsAxisValue);
				// The ACTUAL coordinates they moved to!
				originalEndCoords = trueEndCoordsDeterminer(movementLine, axis, actualEndCoordsAxisValue);
				break;
			}
		}
		if (!originalEndCoords) {
			// They didn't specifically target any group.
			// They must have moved further left or right than any group.
			if (fakeEndCoordsAxisValue + HALF_ARBITRARY_DISTANCE < axisOrder[0].transformedRange![0]) {
				// They moved left of the leftmost group
				console.log(`Moved piece wants to move left of the leftmost group on the ${axis} axis.`);

				const distToLeftMostGroup = fakeEndCoordsAxisValue - axisOrder[0]!.transformedRange![0];
				const actualEndCoordsAxisValue = axisOrder[0]!.range[0] + distToLeftMostGroup;
				// The ACTUAL coordinates they moved to!
				originalEndCoords = trueEndCoordsDeterminer(movementLine, axis, actualEndCoordsAxisValue);
			} else if (fakeEndCoordsAxisValue - HALF_ARBITRARY_DISTANCE > axisOrder[axisOrder.length - 1]!.transformedRange![1]) {
				// They moved right of the rightmost group
				console.log(`Moved piece wants to move right of the rightmost group on the ${axis} axis.`);

				const distToRightMostGroup = fakeEndCoordsAxisValue - axisOrder[axisOrder.length - 1]!.transformedRange![1];
				const actualEndCoordsAxisValue = axisOrder[axisOrder.length - 1]!.range[1] + distToRightMostGroup;
				// The ACTUAL coordinates they moved to!
				originalEndCoords = trueEndCoordsDeterminer(movementLine, axis, actualEndCoordsAxisValue);
			} else {
				console.log(`Moved piece is not interested in any groups on the ${axis} axis.`);
				console.log('fakeEndCoordsAxisValue:', fakeEndCoordsAxisValue);
			}
		}
	}

	function trueEndCoordsDeterminer(movementLine: LineCoefficients, axisOfGroupOfInterest: '1,0' | '0,1', targetAxisValue: bigint): Coords {
		// console.log("Determining true end coords for axis:", axisOfGroupOfInterest, " with target axis value:", targetAxisValue);

		const axisPerpendicularVec: Vec2 = vectors.getPerpendicularVector(vectors.getVec2FromKey(axisOfGroupOfInterest));

		// I need to find the intersection point between the movement line,
		// and the line of vector axisPerpendicularVec with the targetAxisValue.

		// First determine the axisPerpendicularVec line with the targetAxisValue.
		let intersectionLine: LineCoefficients;
		if (axisOfGroupOfInterest === '1,0') {
			// The line is vertical, so the x coordinate is targetAxisValue
			intersectionLine = vectors.getLineGeneralFormFromCoordsAndVec([targetAxisValue, 0n], axisPerpendicularVec);
		} else if (axisOfGroupOfInterest === '0,1') {
			// The line is horizontal, so the y coordinate is targetAxisValue
			intersectionLine = vectors.getLineGeneralFormFromCoordsAndVec([0n, targetAxisValue], axisPerpendicularVec);
		} else throw Error(`Unknown axis of group of interest: ${axisOfGroupOfInterest}`);

		// console.log("movementLine:", movementLine);
		// console.log("intersectionLine:", intersectionLine);

		// Now find the intersection point between the movement line and the intersection line.
		const intersectionPoint: BDCoords | undefined = geometry.calcIntersectionPointOfLines(...movementLine, ...intersectionLine);
		if (!intersectionPoint) throw Error(`Unable to find intersection point between movement line and group of interest!`);
		if (!bd.areCoordsIntegers(intersectionPoint)) throw Error(`Intersection point between movement line and group of interest is not an integer coordinate!`);

		return bd.coordsToBigInt(intersectionPoint);
	}

	if (!originalEndCoords) throw Error("Unable to determine the original end coordinates of the moved piece! ");

	return {
		startCoords: originalStartCoords,
		endCoords: originalEndCoords
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

