
// src/client/scripts/esm/chess/logic/positionconpressor.ts

/**
 * This script contains an algorithm that can take an infinite chess position,
 * which may have pieces at arbitrarily large coordinates, and compress it
 * so that all pieces are within the bounds of standard javascript doubles.
 */


import bimath from "../../util/bigdecimal/bimath.js";
import bounds, { BoundingBox } from "../../util/math/bounds.js";
import vectors, { LineCoefficients } from "../../util/math/vectors.js";
import coordutil, { Coords, CoordsKey, DoubleCoords } from "../util/coordutil.js";
import icnconverter from "./icn/icnconverter.js";



// ============================== Type Definitions ==============================



interface CompressionInfo {
	position: Map<CoordsKey, number>;
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


type DoubleMoveDraft = { startCoords: DoubleCoords, endCoords: DoubleCoords };

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
// const UNSAFE_BOUND_BIGINT = BigInt(Math.trunc(Number.MAX_SAFE_INTEGER * 0.1));
const UNSAFE_BOUND_BIGINT = 1000n;


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
 */
const GROUP_PAD_DISTANCE = 20n;



// ================================ Testing Usage ================================



const example_position = 'k0,0|Q2000,4000';
// const example_position = 'k0,0|Q0,0|N2000,4000';
// const example_position = 'k0,0|Q0,0|N40,120';
// const example_position = 'K0,0|Q5000,10000|Q5000,7000';

const parsedPosition = icnconverter.ShortToLong_Format(example_position);
// console.log("parsedPosition:", JSON.stringify(parsedPosition.position, jsutil.stringifyReplacer));

const compressedPosition = compressPosition(parsedPosition.position!);
parsedPosition.position = compressedPosition.position;
const newICN = icnconverter.getShortFormPosition(compressedPosition.position, parsedPosition.state_global.specialRights!);
console.log("compressedPosition:", newICN);



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

	const needsCompression = pieces.some(piece =>
		bimath.abs(piece.coords[0]) > UNSAFE_BOUND_BIGINT || bimath.abs(piece.coords[1]) > UNSAFE_BOUND_BIGINT
	);

	if (!needsCompression) {
		console.log("No compression needed.");
		for (const piece of pieces) piece.transformedCoords = piece.coords;
		return { position, pieceTransformations: pieces };
	}

	// The position needs COMPRESSION.

	/** An array of pieces in order of one axis ascending. */
	type AxisOrder = PieceTransform[][];
	
	const axisOrdering: {
		x: AxisOrder;
		y: AxisOrder;
	} = {
		x: [],
		y: [],
	};

	// Order the pieces

	for (const piece of pieces) {
		let { found, index } = binarySearch(axisOrdering.x, (pieces: PieceTransform[]) => pieces[0]!.coords[0], piece.coords[0]);
		if (found) axisOrdering.x[index]!.push(piece);
		else axisOrdering.x.splice(index, 0, [piece]);

		({ found, index } = binarySearch(axisOrdering.y, (pieces: PieceTransform[]) => pieces[0]!.coords[1], piece.coords[1]));
		if (found) axisOrdering.y[index]!.push(piece);
		else axisOrdering.y.splice(index, 0, [piece]);
	}

	// Now that the pieces are all in order,

	// Let's determine their transformed coordinates.

	// Choosing a smart start coord ensure the resulting position is centered on (0,0)
	let currentX: bigint = BigInt(axisOrdering.x.length - 1) * -GROUP_PAD_DISTANCE / 2n;
	for (const pieces of axisOrdering.x) {
		for (const piece of pieces) piece.transformedCoords[0] = currentX;
		
		// Increment so that the next x coordinate with a piece has
		// what's considered an arbitrary spacing between them
		currentX += GROUP_PAD_DISTANCE;
	}

	// Choosing a smart start coord ensure the resulting position is centered on (0,0)
	let currentY: bigint = BigInt(axisOrdering.y.length - 1) * -GROUP_PAD_DISTANCE / 2n;
	for (const pieces of axisOrdering.x) {
		for (const piece of pieces) piece.transformedCoords[0] = currentY;
		
		// Increment so that the next y coordinate with a piece has
		// what's considered an arbitrary spacing between them
		currentY += GROUP_PAD_DISTANCE;
	}

	// Now create the final compressed position from all
	// pieces known coord transformations

	const compressedPosition: Map<CoordsKey, number> = new Map();
	for (const piece of pieces) {
		if (!piece.transformedCoords[0] || !piece.transformedCoords[1]) throw Error(`Piece's transformed position is not entirely defined! Original piece location: ${JSON.stringify(piece.coords)}. Transformed location: ${JSON.stringify(piece.transformedCoords)}.`);

		const transformedCoordsKey = coordutil.getKeyFromCoords(piece.transformedCoords as Coords);
		compressedPosition[transformedCoordsKey] = piece.type;
	}

	return {
		position: compressedPosition,
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
// function expandMove(pieceTransformations: PieceTransform[], move: DoubleMoveDraft): MoveDraft {
// 	const startCoordsBigInt: Coords = [BigInt(move.startCoords[0]), BigInt(move.startCoords[1])];
// 	const endCoordsBigInt: Coords = [BigInt(move.endCoords[0]), BigInt(move.endCoords[1])];

// 	// Determine the piece's original position

// 	const originalPiece = pieceTransformations.find((pt) => coordutil.areCoordsEqual(startCoordsBigInt, pt.transformedCoords as Coords));
// 	if (originalPiece === undefined) throw Error(`Compressed position's pieces doesn't include the moved piece on coords ${JSON.stringify(move.startCoords)}! Were we sure to choose a move based on the compressed position and not the original?`);

// 	const originalStartCoords: Coords = originalPiece.coords;

// 	/**
// 	 * Determine the piece's intended destination square.
// 	 * 
// 	 * How do we do that?
// 	 * 
// 	 * A. If the piece is on the same rank/file/diagonal as another piece
// 	 * in the compressed position, then its intended destination is the intersection
// 	 * between the line of its movement vector through its original uncompressed start square,
// 	 * and the rank/file/diagonal line going through that other piece.
// 	 * 
// 	 * There may potentially be multiple pieces in the compressed position that are on
// 	 * its same ran/file/diagonal, but all that means is its a fork, and the final
// 	 * uncompressed position should still fork both, so we only care about finding
// 	 * the intersection between one of the pieces.
// 	 * 
// 	 * B. The piece isn't on the same rank/file/diagonal as another piece. It could have
// 	 * wanted to move to an arbitrary location between ranks/files/diagonals with pieces,
// 	 * where nothing threats it, not trying to threaten any pieces. Or it could be a finite mover,
// 	 * in that case move it the same distance it wanted to.
// 	 */

// 	// Did it capture a piece?
// 	const capturedTransformedPiece = pieceTransformations.find((pt) => coordutil.areCoordsEqual(pt.transformedCoords as Coords, endCoordsBigInt));
// 	if (capturedTransformedPiece) return {
// 		startCoords: originalStartCoords,
// 		endCoords: capturedTransformedPiece.coords
// 	};

// 	// It didn't capture any piece

// 	// Expand lines out of its destination square in all directions except its movement vector

// 	/** The direction the piece moved in. */
// 	const vector = vectors.absVector(vectors.normalizeVector(coordutil.subtractCoords(endCoordsBigInt, startCoordsBigInt)));

// 	const targetVectors = [...vectors.VECTORS_ORTHOGONAL].filter((vec2) => !coordutil.areCoordsEqual(vec2, vector));

// 	// Eminate lines in all directions from the entity coords
// 	const eminatingLines: LineCoefficients[] = targetVectors.map(vec2 => vectors.getLineGeneralFormFromCoordsAndVec(startCoordsBigInt, vec2));


// }








/**
 * Searches a sorted array (no duplicates) to see if a value exists. If it does not, it returns
 * the correct index to insert the value to maintain the array's sorted order.
 * @template T The type of elements in the array.
 * @template V The type of the extracted value used for comparison (number | bigint).
 * @param sortedArray The array, sorted in ascending order, without duplicates.
 * @param valueExtractor A function that takes an element of type T and returns its value of type V.
 * @param value The value of type V to search for.
 * @returns An object with a 'found' boolean and the 'index'.
 *          - If found, `found` is true and `index` is the position of the existing element.
 *          - If not found, `found` is false and `index` is the correct insertion point.
 */
function binarySearch<T, V>(
	sortedArray: T[],
	valueExtractor: (element: T) => V,
	value: V
): { found: boolean; index: number; } {
	let left: number = 0;
	let right: number = sortedArray.length - 1;

	while (left <= right) {
		const mid: number = Math.floor((left + right) / 2);
		const midValue: V = valueExtractor(sortedArray[mid]);

		// 1. Check for an exact match first.
		if (value === midValue) {
			// Value already exists. Return its index and set found to true.
			return { found: true, index: mid };
		}

		// 2. Adjust search range.
		if (value < midValue) {
			right = mid - 1;
		} else {
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

