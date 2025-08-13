
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


/**
 * A constraint that must be satisfied by the final group positions.
 * `pos(to) - pos(from) >= weight`
 */
interface Constraint {
    from: number; // group index
    to: number;   // group index
	/**
	 * The start ranges (range[0]) of the groups must be atleast this far apart.
	 * This is NOT the padding between them.
	 */
    weight: bigint;
    axis: '1,0' | '0,1';
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
	

	// ================================ PHASE 2: DERIVE ALL CONSTRAINTS ================================


	

	const allConstraints: Constraint[] = [];

	// 1. Iterate through all unique pairs of pieces
	for (let i = 0; i < pieces.length; i++) {
		const pieceA = pieces[i]!;
		for (let j = i + 1; j < pieces.length; j++) {
			const pieceB = pieces[j]!;

			const pairConstraints = deriveConstraintsForPair(pieceA, pieceB, AllAxisOrders);
			allConstraints.push(...pairConstraints);
		}
	}

	// 1. Separate the master list of constraints by axis.
	const xConstraints = allConstraints.filter(c => c.axis === '1,0');
	const yConstraints = allConstraints.filter(c => c.axis === '0,1');

	console.log(`\nAll X group contraints:`);
	console.log(xConstraints);
	console.log(`\nAll Y group contraints:`);
	console.log(yConstraints);

	// 2. Solve for the final positions of each group on each axis.
	let xGroupPositions = solveConstraintSystem(AllAxisOrders['1,0'].length, xConstraints);
	let yGroupPositions = solveConstraintSystem(AllAxisOrders['0,1'].length, yConstraints);

	// Now we have the initial DRAFT group positions.
	// Since each axes' solution is dependant on the positioning of the groups on the opposite axis,
	// we must iteratively update each axis' constraints, until they stop changing.

	const MAX_ITERATIONS = 100;
	// DEBUGGING
	const PREFERRED_ITERATIONS = 1;
	// const PREFERRED_ITERATIONS = 100;

	let iteration = 0;
	let changeMade = true;

	while (changeMade) {
		changeMade = false;
		iteration++;
		if (iteration >= MAX_ITERATIONS) throw Error("Max iterations!");

		console.log(`\nIteration ${iteration}...`)
		
		// Update the X constraints based on the minimum distances between Y groups
		const newConstraints: Constraint[] = [];

		// Iterate through all unique pairs of pieces
		for (let i = 0; i < pieces.length; i++) {
			const pieceA = pieces[i]!;
			for (let j = i + 1; j < pieces.length; j++) {
				const pieceB = pieces[j]!;

				const pairConstraints = upgradeConstraintsForPair(pieceA, pieceB, xGroupPositions, yGroupPositions, AllAxisOrders);
				newConstraints.push(...pairConstraints);
			}
		}

		// Separate the master list of constraints by axis.
		const newXConstraints = newConstraints.filter(c => c.axis === '1,0');
		const newYConstraints = newConstraints.filter(c => c.axis === '0,1');

		// Update the solved X & Y group positions with the new required constraints
		const newXGroupPositions = solveConstraintSystem(AllAxisOrders['1,0'].length, newXConstraints);
		const newYGroupPositions = solveConstraintSystem(AllAxisOrders['0,1'].length, newYConstraints);

		// If any position has changed, keep iterating!
		if (!areGroupPositionsEqual(xGroupPositions, newXGroupPositions)) {
			changeMade = true;
			console.log("X Group Positions changed after updating all constraints!");
		} if (!areGroupPositionsEqual(yGroupPositions, newYGroupPositions)) {
			console.log("Y Group Positions changed after updating all constraints!");
			changeMade = true;
		}

		if (changeMade) {
			console.log(`\nNew X group contraints:`);
			console.log(xConstraints);
			console.log(`\nNew Y group contraints:`);
			console.log(yConstraints);
		}

		xGroupPositions = newXGroupPositions;
		yGroupPositions = newYGroupPositions;
		
		if (iteration >= PREFERRED_ITERATIONS) {
			console.log(`Loop reached preferred iterations of ${PREFERRED_ITERATIONS}. Stopping early...`);
			break;
		}
	}

	console.log(`Convergence reached after ${iteration} iterations!`);



	// ==================================== Phase 4: Final Coordinate Assembly ====================================



	// 1. Assemble the final compressed position from the solved group positions.
	const compressedPosition: Map<CoordsKey, number> = new Map();

	const XAxisDeterminer = AXIS_DETERMINERS['1,0'];
	const YAxisDeterminer = AXIS_DETERMINERS['0,1'];

	for (const piece of pieces) {
		// a. Identify the piece's X and Y groups.
		const xGroupIndex = piece.axisGroups['1,0']!;
		const yGroupIndex = piece.axisGroups['0,1']!;

		// b. Look up the solved position for each group.
		const xGroupPos = xGroupPositions.get(xGroupIndex);
		const yGroupPos = yGroupPositions.get(yGroupIndex);
		
		// Safety check: a group position should always be found if the graph is connected.
		if (xGroupPos === undefined || yGroupPos === undefined) throw new Error(`Could not solve for position of piece at ${piece.coords}`);

		// c. Calculate the piece's original offset within its group. This preserves
		//    the internal structure of multi-piece groups.
		const originalXGroup = AllAxisOrders['1,0'][xGroupIndex]!;
		const originalYGroup = AllAxisOrders['0,1'][yGroupIndex]!;
		
		const offsetX = XAxisDeterminer(piece.coords) - originalXGroup.range[0];
		const offsetY = YAxisDeterminer(piece.coords) - originalYGroup.range[0];

		// d. The final coordinate is the group's solved position plus the piece's offset.
		piece.transformedCoords = [xGroupPos + offsetX, yGroupPos + offsetY];

		// e. Add the final coordinate and piece type to our output map.
		const transformedCoordsKey = coordutil.getKeyFromCoords(piece.transformedCoords as Coords);
		compressedPosition.set(transformedCoordsKey, piece.type);
	}

	// Shift the entire solution so that the White King is in its original spot! (Doesn't break the solution/topology)
	// ISN'T required for engines, but may be nice for visuals.
	// Commented-out for decreasing the script size.
	// RecenterTransformedPosition(pieces, AllAxisOrders);

	// 2. Return the complete compression information, which is used to expand moves later.
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


// ==================================== HELPERS FOR SOLVER ====================================


/**
 * Analyzes two pieces, and does almost all the same things that deriveConstraintsForPair() does,
 * except instead of calculating x_sep_A_to_B and y_sep_A_to_B from the number of groups between
 * them, we grab the minimum distance required from the xGroupPositions, as we know those are required!
 * @param pieceA 
 * @param pieceB 
 * @param xGroupPositions 
 * @param yGroupPositions 
 * @param AllAxisOrders 
 */
function upgradeConstraintsForPair(
	pieceA: PieceTransform,
	pieceB: PieceTransform,
	xGroupPositions: Map<number, bigint>,
	yGroupPositions: Map<number, bigint>,
	AllAxisOrders: AxisOrders
): Constraint[] {

	// console.log(`\Deriving NEW constraints for piece ${pieceA.coords} and ${pieceB.coords}`);
	
	const piecesXSeparation = getPiecesAxisSeparation('1,0', xGroupPositions);
	const piecesYSeparation = getPiecesAxisSeparation('0,1', yGroupPositions);
	
	/** Calculates required piece X/Y separation from the provided groupPositions. */
	function getPiecesAxisSeparation(axis: '1,0' | '0,1', groupPositions: Map<number, bigint>) {
		const axisDeterminer = AXIS_DETERMINERS[axis];

		const pieceAGroupIndex = pieceA.axisGroups[axis];
		const pieceBGroupIndex = pieceB.axisGroups[axis];
		const pieceAGroup = AllAxisOrders[axis][pieceAGroupIndex];
		const pieceBGroup = AllAxisOrders[axis][pieceBGroupIndex];

		/**
		 * The minimum required distance from group A to group B,
		 * based on the running groupPosition we have.
		 */
		const groupsXSeparation = groupPositions.get(pieceBGroupIndex)! - groupPositions.get(pieceAGroupIndex)!;

		// Add the offsets from the start of their groups
		const pieceAGroupStartOffset = axisDeterminer(pieceA.coords) - pieceAGroup.range[0];
		const pieceBGroupStartOffset = axisDeterminer(pieceB.coords) - pieceBGroup.range[0];
		const piecesSeparation = groupsXSeparation - pieceAGroupStartOffset + pieceBGroupStartOffset;

		return piecesSeparation;
	}

	// eslint-disable-next-line prefer-const
	let { separation: piecesVSeparation, type: piecesVSeparationType } = calculateRequiredAxisSeparation(pieceA, pieceB, '1,-1', AllAxisOrders);

	return getGroupConstraintsForRequiredPieceSeparations(
		pieceA, pieceB,
		piecesXSeparation, piecesYSeparation,
		piecesVSeparation, piecesVSeparationType,
		AllAxisOrders
	)
}

/**
 * Analyzes a single pair of pieces to derive the definitive separation
 * requirements for them on the X and Y axes.
 * @returns An array of Constraint objects.
 */
function deriveConstraintsForPair(pieceA: PieceTransform, pieceB: PieceTransform, AllAxisOrders: AxisOrders): Constraint[] {

	// console.log(`\nDeriving initial constraints for piece ${pieceA.coords} and ${pieceB.coords}`);
	
	let { separation: x_sep_A_to_B } = calculateRequiredAxisSeparation(pieceA, pieceB, '1,0', AllAxisOrders);
	let { separation: y_sep_A_to_B } = calculateRequiredAxisSeparation(pieceA, pieceB, '0,1', AllAxisOrders);

	// eslint-disable-next-line prefer-const
	let { separation: v_sep_A_to_B, type: v_separation_type } = calculateRequiredAxisSeparation(pieceA, pieceB, '1,-1', AllAxisOrders);

	return getGroupConstraintsForRequiredPieceSeparations(
		pieceA, pieceB,
		x_sep_A_to_B, y_sep_A_to_B,
		v_sep_A_to_B, v_separation_type,
		AllAxisOrders
	)
}

/**
 * Calculates the required constraints between two pieces,
 * given the required separations on every axis we have.
 */
function getGroupConstraintsForRequiredPieceSeparations(
	pieceA: PieceTransform,
	pieceB: PieceTransform,
	x_separation: bigint,
	y_separation: bigint,
	v_separation: bigint,
	v_separation_type: 'exact' | 'min',
	AllAxisOrders: AxisOrders
): Constraint[] {

	// --- 2. Solve the System of Inequalities ---

	/**
	 * Gives the updated required dx and dy separations between the pieces, as Coords.
	 * SATISFIES V-axis separations.
	 */
	const finalSeparations: Coords = solveSeparationSystem(
		x_separation,
		y_separation,
		v_separation,
		v_separation_type
	);

	// --- 3. Generate Constraint Objects ---

	const constraints: Constraint[] = [];
	
	generateGroupConstraintFromPieceSeparations(finalSeparations[0], '1,0');
	generateGroupConstraintFromPieceSeparations(finalSeparations[1], '1,0');

	/**
	 * Takes required separations betweeen 2 PIECES, and transforms them
	 * to be relative to their group range starts, then pushes that constraint.
	 */
	function generateGroupConstraintFromPieceSeparations(finalSeparation: bigint, axis: '1,0' | '0,1'): Constraint | undefined {
		const axisDeterminer = AXIS_DETERMINERS[axis];
		// Get the group indices for both pieces on the X-axis.
		const x_groupA_idx = pieceA.axisGroups[axis]!;
		const x_groupB_idx = pieceB.axisGroups[axis]!;

		// No constraints needed if they are in the same group. They are linked together!
		if (x_groupA_idx === x_groupB_idx) return;

		// The pieces are in different X-groups, so we need a constraint.

		// First, determine which piece is in the group with the smaller index.
		const firstPiece = (x_groupA_idx < x_groupB_idx) ? pieceA : pieceB;
		const secondPiece = (x_groupA_idx < x_groupB_idx) ? pieceB : pieceA;

		// Get the original groups to calculate offsets.
		const firstGroup = AllAxisOrders[axis][firstPiece.axisGroups[axis]!]!;
		const secondGroup = AllAxisOrders[axis][secondPiece.axisGroups[axis]!]!;

		// Calculate each piece's offset from the start of its original group.
		const firstPieceOffset = axisDeterminer(firstPiece.coords) - firstGroup.range[0];
		const secondPieceOffset = axisDeterminer(secondPiece.coords) - secondGroup.range[0];

		// The required separation between the groups is adjusted by the offsets.
		const adjustedWeight = finalSeparation + firstPieceOffset - secondPieceOffset;

		const constraint: Constraint = { 
			from: firstPiece.axisGroups[axis]!, 
			to: secondPiece.axisGroups[axis]!, 
			weight: adjustedWeight, 
			axis,
		};
		constraints.push(constraint);
	}

	// Finally, return the array of constraints for this pair.
	return constraints;
}

/**
 * Receives required X, Y, and V separations, and returns the updated
 * X & Y separation that also satisfy the V separation.
 */
function solveSeparationSystem(
	base_x_sep: bigint,
	base_y_sep: bigint,
	base_v_sep: bigint,
	v_type: 'exact' | 'min'
): Coords {

	// Let dx and dy be the absolute, non-negative separations.
	let dx = bimath.abs(base_x_sep);
	let dy = bimath.abs(base_y_sep);

	// Formulate the V-axis rule in terms of dx and dy.
	// The V-axis is (x+y). The separation between A and B is Vb - Va.
	// (xB' + yB') - (xA' + yA') = (xB' - xA') + (yB' - yA')
	// The signs of the terms depend on the original group ordering.
	const x_sign = base_x_sep >= 0n ? 1n : -1n;
	const y_sign = base_y_sep >= 0n ? 1n : -1n;

	// The V-rule is: (x_sign * dx) + (y_sign * dy)  (must be >= or ==)  base_v_sep

	if (v_type === 'exact') {
		// Example: dx - dy = 5
		// We need to find the smallest dx and dy that satisfy this AND their base rules.
		// Let's test two possibilities.

		// Possibility 1: Assume dy is at its minimum. What must dx be?
		const required_dx = base_v_sep - (y_sign * dy);
		if (x_sign * required_dx >= dx) dx = x_sign * required_dx; // This works if the result is positive

		// Possibility 2: Assume dx is at its minimum. What must dy be?
		const required_dy = base_v_sep - (x_sign * dx);
		if (y_sign * required_dy >= dy) dy = y_sign * required_dy; // This works if the result is positive

	} else { // v_type === 'min'
		// Example: dx - dy >= 20.
		// Check if the current minimums already satisfy the rule.
		const current_v_sep = (x_sign * dx) + (y_sign * dy);
        
		if (base_v_sep > 0n && current_v_sep < base_v_sep) {
			// There is a shortfall. Add it to the positive term.
			const shortfall = base_v_sep - current_v_sep;
			if (x_sign > 0n) dx += shortfall;
			else dy += shortfall; // y_sign must be > 0n
		} else if (base_v_sep < 0n && current_v_sep > base_v_sep) {
			// There is a shortfall (e.g. current is -10, required is <= -20).
			// Add the negative shortfall to the negative term.
			const shortfall = base_v_sep - current_v_sep; // This will be negative
			if (x_sign < 0n) dx -= shortfall; // dx is absolute, so this increases it
			else dy -= shortfall; // y_sign must be < 0n
		}
	}

	return [dx,dy];
}

/**
 * Finds the most compact arrangement for a set of groups that satisfies all
 * given difference constraints using the Bellman-Ford algorithm.
 * This is used to solve for the final positions of all groups on one axis.
 * @param numGroups The number of groups on the axis.
 * @param constraints The list of all constraints that must be satisfied.
 * @returns A map from group index to its final solved position.
 */
function solveConstraintSystem(numGroups: number, constraints: Constraint[]): Map<number, bigint> {
	// 1. Initialize positions. Only the starting group has a known position.
	// A group not in the map is considered "unreached"
	const positions = new Map<number, bigint>();
	if (numGroups > 0) positions.set(0, 0n); // The first group is our anchor at the origin.

	// 2. Apply Bellman-Ford: Relax edges repeatedly.
	// We loop N-1 times, where N is the number of groups.
	for (let i = 0; i < numGroups - 1; i++) {
		let changed = false;
		for (const constraint of constraints) {
			const { from, to, weight } = constraint;

			// Only proceed if the 'from' node has a known position.
			// On the first iteration, only start points of group 0 are defined.
			if (!positions.has(from)) continue;

			const fromPos = positions.get(from)!;
			const potentialNewPos = fromPos + weight;
			const toPos = positions.get(to);

			// Relaxation step: Is the path through 'from' better?
			// "Better" means either the 'to' node hasn't been reached yet,
			// or the new path is longer than the existing one.
			if (toPos === undefined || potentialNewPos > toPos) {
				positions.set(to, potentialNewPos);
				changed = true;
			}
		}
		// Optimization: If a full pass makes no changes, the system is solved.
		if (!changed) {
			console.log(`Bellman-Ford algorithm early exiting after i = ${i}. Number of groups: ${numGroups}`)
			break;
		}
	}

	return positions;
}


/** Tests if two maps containing group positions on the X/Y axis are equivalent. */
function areGroupPositionsEqual(groupPositions1: Map<number, bigint>, groupPositions2: Map<number, bigint>): boolean {
	if (groupPositions1.size !== groupPositions2.size) return false;
	for (const [groupNumber, g1_position] of groupPositions1.entries()) {
		const g2_position = groupPositions2.get(groupNumber)
		if (g1_position !== g2_position) return false;
	}
	return true;
}


// ============================================================================================


interface SeparationRequirement {
    separation: bigint;
	/**
	 * 'exact => the separation must be exactly this value,
	 * 'min' => the separation must be at least this value (or at most if separation is negative).
	 */
    type: 'exact' | 'min';
}

/**
 * Calculates the required separation between two pieces on a single axis from the original position.
 * Determines if the separation should be "tight" (an exact value)
 * or "loose" (a minimum distance), based on whether the pieces are in the same
 * axis group or different ones.
 * 
 * Only takes into account number of groups between them, doesn't take into account
 * other constraints.
 */
function calculateRequiredAxisSeparation(
	pieceA: PieceTransform,
	pieceB: PieceTransform,
	axis: '1,0' | '0,1' | '1,1' | '1,-1',
	AllAxisOrders: AxisOrders
): SeparationRequirement {
	const axisDeterminer = AXIS_DETERMINERS[axis];
	const axisOrder = AllAxisOrders[axis];

	const groupIndexA = pieceA.axisGroups[axis];
	const groupIndexB = pieceB.axisGroups[axis];

	const axisValueA = axisDeterminer(pieceA.coords);
	const axisValueB = axisDeterminer(pieceB.coords);

	// Case 1: Pieces are in the same group.
	// The distance between them is "tight" and must be preserved exactly.
	if (groupIndexA === groupIndexB) {
		return {
			separation: axisValueB - axisValueA,
			type: 'exact',
		};
	}

	// Case 2: Pieces are in different groups.
	// The distance is "loose" and is defined by the space between their groups,
	// plus the distance from the piece's axis value to the edge of their group's range.
    
	const groupA = axisOrder[groupIndexA];
	const groupB = axisOrder[groupIndexB];

	// The number of full groups sitting *between* the two pieces' groups. Can be negative
	const distInGroups = groupIndexB - groupIndexA;

	// Start with the total minimum separation from the gaps between groups.
	// If they are adjacent (groupsBetween = 0), this is 1 * MIN_ARBITRARY_DISTANCE.
	// If there is 1 group between, this is 2 * MIN_ARBITRARY_DISTANCE.
	let minSeparation = MIN_ARBITRARY_DISTANCE * BigInt(distInGroups); // Can be negative

	if (distInGroups > 0n) {
		// Add the distance from the first piece to the end of its group's range.
		// The range end is the maximum value in the group.
		minSeparation += groupA.range[1] - axisValueA;

		// Add the distance from the start of the second group's range to the second piece.
		// The range start is the minimum value in the group.
		minSeparation += axisValueB - groupB.range[0];
	} else { // distInGroups < 0n
		minSeparation -= groupB.range[1] - axisValueB;
		minSeparation -= axisValueA - groupA.range[0];
	}

	return {
		separation: minSeparation,
		type: 'min',
	};
}

function fea() {
	
}


// ======================================== RECENTERING TRANFORMED POSITION ========================================



// ISN'T required for engines, but may be nice for visuals.
// Commented-out for decreasing the script size.
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