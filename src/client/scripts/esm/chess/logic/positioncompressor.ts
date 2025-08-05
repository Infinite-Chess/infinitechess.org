
// src/client/scripts/esm/chess/logic/positionconpressor.ts

/**
 * This script contains an algorithm that can take an infinite chess position,
 * which may have pieces at arbitrarily large coordinates, and compress it
 * so that all pieces are within the bounds of standard javascript doubles.
 */


import bd from "../../util/bigdecimal/bigdecimal.js";
import bimath from "../../util/bigdecimal/bimath.js";
import bounds, { BoundingBox } from "../../util/math/bounds.js";
import coordutil, { Coords, CoordsKey } from "../util/coordutil.js";
import icnconverter from "./icn/icnconverter.js";



// ============================== Type Definitions ==============================



interface CompressionInfo {
	position: Map<CoordsKey, number>;
	/**
	 * Contains information on each group, the group's
	 * original position, and each piece in the group.
	 */
	groups: any
}



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


const TWO = bd.FromNumber(2.0);



// ================================ Testing Usage ================================



const example_position = 'k0,0|Q2000,4000';
const example_position = 'k0,0|Q0,0|N2000,4000';
const example_position = 'k0,0|Q0,0|N40,120';
// const example_position = 'K0,0|Q5000,10000|Q5000,7000';

const parsedPosition = icnconverter.ShortToLong_Format(example_position);
// console.log("parsedPosition:", JSON.stringify(parsedPosition.position, jsutil.stringifyReplacer));

const compressedPosition = compressPosition(parsedPosition.position!);
// console.log("compressedPosition:", JSON.stringify(compressedPosition.position, jsutil.stringifyReplacer));



// ================================ Implementation ================================



function compressPosition(position: Map<CoordsKey, number>): CompressionInfo {

	// 1. List all pieces with their bigint arbitrary coordinates.

	type Piece = { type: number; coords: Coords; };
	const pieces: Piece[] = [];

	position.forEach((type, coordsKey) => {
		const coords = coordutil.getCoordsFromKey(coordsKey);
		pieces.push({ type, coords });
	});

	// 2. Determine whether any piece lies beyond UNSAFE_BOUND_BIGINT.
	// If not, we don't need to compress the position.

	const needsCompression = pieces.some(piece =>
		bimath.abs(piece.coords[0]) > UNSAFE_BOUND_BIGINT || bimath.abs(piece.coords[1]) > UNSAFE_BOUND_BIGINT
	);

	if (!needsCompression) {
		console.log("No compression needed.");
		return { position, groups: [] };
	}

	// The position needs COMPRESSION.

	// 3. Organize the pieces into groups based on their coordinates.

	// What determines whether two pieces belong to the same group?
	// They are 1 square adjacent

	interface Group {
		/** The bounding box of this group. */
		bounds: BoundingBox;
		/** The center of the box */
		center: Coords;
		/** All pieces included in this group. */
		pieces: Piece[];
		/** How much the group has been shifted compared to the original, uncompressed input position. */
		offset?: Coords;
	}

	const groups: Group[] = [];

	pieces.forEach(piece => {
		// Check if this is adjacent to any existing group. If so, add it to that group.
		// Else, create a new group for this piece.

		for (const group of groups) {
			const pieceDistanceToGroup = getCoordsDistanceToBounds(piece.coords, group.bounds);
			if (pieceDistanceToGroup <= GROUP_PAD_DISTANCE) {
				// The piece is adjacent to the group.
				// Merge them.
				group.pieces.push(piece);
				bounds.expandBoxToContainSquare(group.bounds, piece.coords); // Mutating
				group.center = calcCenterOfBoundingBox(group.bounds);
				return;
			}
		}

		// The piece is not adjacent to any existing group.
		// Create a new group for this piece.
		const newGroup: Group = {
			bounds: bounds.getBoxFromCoordsList([piece.coords]),
			pieces: [piece],
			center: piece.coords,
		};
		groups.push(newGroup);
	});

	console.log("Groups:", groups);

	// Now that we have all groups. Shrink the position

	

}




/**
 * Returns the chebyshev distance from the provided coordinates to the bounds.
 * If the coordinates are within the bounds, returns 0.
 */
function getCoordsDistanceToBounds(coords: Coords, bounds: BoundingBox): bigint {
	const boundsWidth = bounds.right - bounds.left;
	const boundsHeight = bounds.bottom - bounds.top;

	const xDistLeft = bimath.abs(coords[0] - bounds.left);
	const xDistRight = bimath.abs(coords[0] - bounds.right);
	const yDistBottom = bimath.abs(coords[1] - bounds.bottom);
	const yDistTop = bimath.abs(coords[1] - bounds.top);

	if (xDistLeft < boundsWidth && xDistRight < boundsWidth &&
		yDistBottom < boundsHeight && yDistTop < boundsHeight) {
		// The coordinates are within the bounds.
		return 0n;
	}

	// The coordinates are outside the bounds.
	// Return the chebyshev distance to the closest edge.
	return bimath.max(
		bimath.min(xDistLeft, xDistRight),
		bimath.min(yDistBottom, yDistTop)
	);
}

/**
 * Calculates the center of a bounding box.
 */
function calcCenterOfBoundingBox(box: BoundingBox): Coords {
	return [(box.left + box.right) / 2n, (box.bottom + box.top) / 2n];
}