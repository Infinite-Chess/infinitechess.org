
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
// Linear Programming Solver!
import { Model, solve } from "yalps";




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

type OrthoAxis = '1,0' | '0,1'; // X or Y axis
type DiagAxis = '1,1' | '1,-1'; // Positive or negative diagonal axis
type Axis = OrthoAxis | DiagAxis; // Any axis


/**
 * A variable name in the Linear Programming Model.
 * 
 * The first letter is what axis the piece coord is for.
 * After the `-` is the index of the piece in its sorted list.
 */
type VariableName = `x-${number}` | `y-${number}` | `u-${number}` | `v-${number}`;

/**
 * One column in a constraint of the Linear Programming Model.
 * 
 * It contains the variable, and its coefficient (usually 1 or -1)
 */
type Column = {
	variable: string; // The name of the variable
	coefficient: number; // The coefficient of the variable in the equation
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
// const MIN_ARBITRARY_DISTANCE = 100n;
const MIN_ARBITRARY_DISTANCE = 10n;


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

	/**
	 * All pieces, organized in ascending order on every axis.
	 */
	const OrderedPieces: Record<Vec2Key, PieceTransform[]> = {};

	// Init the Axis Orders

	processAxis('1,0');
	processAxis('0,1');
	if (mode === 'diagonals') {
		processAxis('1,1');
		processAxis('1,-1');
	}

	function processAxis(axis: Axis): void {
		const axisDeterminer = AXIS_DETERMINERS[axis];

		// First sort the pieces by ascending axis value
		const sortedPieces: PieceTransform[] = pieces.slice();
		sortedPieces.sort((a, b) => bimath.compare(axisDeterminer(a.coords), axisDeterminer(b.coords)));
		OrderedPieces[axis] = sortedPieces;

		console.log(`Sorted pieces on axis ${axis}:`, sortedPieces);

		const axisOrder: AxisOrder = [];
		AllAxisOrders[axis] = axisOrder;

		// Go through the sorted pieces one by one, creating the groups on this axis.
		let currentGroup: AxisGroup | null = null;
		for (const piece of sortedPieces) {
			const currentAxisValue = axisDeterminer(piece.coords);
			
			// If the axis value is less than or equal to MIN_ARBITRARY_DISTANCE from the current group being pushed to,
			// add it to that group and extend its range.
			// Else start a new group

			if (currentGroup === null || currentAxisValue - currentGroup.range[1] > MIN_ARBITRARY_DISTANCE) {
				// Start a new group
				currentGroup = { pieces: [], range: [currentAxisValue, currentAxisValue] };
				axisOrder.push(currentGroup);
			}

			// Add the piece to the current running group
			currentGroup.pieces.push(piece);
			currentGroup.range[1] = currentAxisValue;
		}
	}


	// All pieces are now in order!

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
	

	// ================================ PHASE 2: DERIVE ALL CONSTRAINTS ================================

	
	// Initiate the linear programming model for solving.

	const model: Model = {
		direction: 'minimize',
		objective: 'manhatten_norm', // The objective function to minimize
		constraints: {
			// An equation
			// piece1_X_constraint: { min: 10 }, // The right hand side of the equation:   >= 10
			// piece1_Y_constraint: { min: 10 },
		},
		variables: {
			// piece1_X: { manhatten_norm: 1,   piece1_X_constraint: 1 }, // A list of what equations this variable is a part of (a column in), and the coefficient it gets (1 for addition, -1 for subtraction).
			// piece1_Y: { manhatten_norm: 1,   piece1_Y_constraint: 1 },
		},
	};

	// Add all the constraints between our piece coordinates to the model.
	// For each sorted piece on a specific axis, add a constraint to that piece and the previous piece

	createConstraintsForAxis('1,0');
	createConstraintsForAxis('0,1');
	if (mode === 'diagonals') {
		createConstraintsForAxis('1,1');
		createConstraintsForAxis('1,-1');
	}

	function createConstraintsForAxis(axis: Axis) {
		const axisDeterminer = AXIS_DETERMINERS[axis];
		const sortedPieces = OrderedPieces[axis];

		const firstPiece = sortedPieces[0];
		let firstPieceAxisValue = axisDeterminer(firstPiece.coords);

		for (let i = 1; i < sortedPieces.length; i++) {
			const secondPiece = sortedPieces[i];
			const secondPieceAxisValue = axisDeterminer(secondPiece.coords);

			// Determine if the constraint is exact, or min
			let type: 'equal' | 'min';
			let constraint: number;
			const difference = secondPieceAxisValue - firstPieceAxisValue;
			if (difference <= MIN_ARBITRARY_DISTANCE) {
				type = 'equal';
				constraint = Number(difference);
			} else {
				type = 'min';
				constraint = Number(MIN_ARBITRARY_DISTANCE);
			}

			if (axis === '1,0' || axis === '0,1') {
				// What does the constraint look like if this is the X axis?
				const firstPieceVarName = getVariableName(axis, i - 1);
				const secondPieceVarName = getVariableName(axis, i);

				const constraintName = getConstraintName(secondPieceVarName);

				// Desired:			   thisPieceXY >= prevPieceXY + 10
				// To get that we do:  thisPieceXY - prevPieceXY >= 10

				addConstraintToModel(model, constraintName, [
					{ variable: secondPieceVarName, coefficient: 1 },
					{ variable: firstPieceVarName, coefficient: -1 },
				], type, constraint);
				
				// If this is the last piece on the X/Y axis, then we
				// need to include it in our optimization function!
				// The optimization function tries to minimize the furthest piece
				// on the X/Y axes. This naturally tries to shrink the position.
				const lastPiece = i === sortedPieces.length - 1;
				if (lastPiece) model.variables[secondPieceVarName][model.objective!] = 1;
				
			} else if (axis === '1,1' || axis === '1,-1') {
				const firstPieceVarNameX = getVariableName('1,0', i - 1);
				const firstPieceVarNameY = getVariableName('0,1', i - 1);
				const secondPieceVarNameX = getVariableName('1,0', i);
				const secondPieceVarNameY = getVariableName('0,1', i);

				const constraintName = getConstraintName(getVariableName(axis, i));

				if (axis === '1,1') {
					// What does the constraint look like if this is the V axis?
					// U axis value (positive diagonal) is determined by:  Y - X
					// Desired:			   thisPieceY - thisPieceX >= prevPieceY - prevPieceX + 10
					// To get that we do:  thisPieceY - thisPieceX - prevPieceY + prevPieceX >= 10
					addConstraintToModel(model, constraintName, [
						// Second piece diagonal
						{ variable: secondPieceVarNameY, coefficient: 1 },
						{ variable: secondPieceVarNameX, coefficient: -1 },
						// First piece diagonal
						{ variable: firstPieceVarNameY, coefficient: -1 },
						{ variable: firstPieceVarNameX, coefficient: 1 },
					], type, constraint);
				} else if (axis === '1,-1') {
					// What does the constraint look like if this is the V axis?
					// V axis value (negative diagonal) is determined by:  X + Y
					// Desired:			   thisPieceX + thisPieceY >= prevPieceX + prevPieceY + 10
					// To get that we do:  thisPieceX + thisPieceY - prevPieceX - prevPieceY >= 10
					addConstraintToModel(model, constraintName, [
						// Second piece diagonal
						{ variable: secondPieceVarNameX, coefficient: 1 },
						{ variable: secondPieceVarNameY, coefficient: 1 },
						// First piece diagonal
						{ variable: firstPieceVarNameX, coefficient: -1 },
						{ variable: firstPieceVarNameY, coefficient: -1 },
					], type, constraint);
				} else throw Error("Unexpected!");
			} else throw Error(`Unsupported axis ${axis}.`);

			// Prepare for next iteration
			firstPieceAxisValue = secondPieceAxisValue;
		}
	}


	// Solve the Model

	const solution = solve(model, {
		// Include variables that are zero in the solution.
		// Our first piece's coords are anchored to zero so we need those.
		includeZeroVariables: true,
	});

	// console.log("Solution status:", solution.status);
	console.log("Solution:", solution);

	if (solution.status !== 'optimal') {
		console.error("The unified solver could not find a feasible solution.");
		throw new Error("Unified LP solver failed. Constraints may be contradictory.");
	}

	
	// ==================================== Phase 4: Final Coordinate Assembly ====================================

	
	// The solution object contains the solved X & Y positions for every single piece.
	// Extract all the variables...

	for (const [variableName, value] of solution.variables) {
		const [axis, pieceIndexStr] = variableName.split('-');
		const pieceIndex = Number(pieceIndexStr);

		if (axis === 'x') {
			const sortedPieces = OrderedPieces['1,0'];
			const piece = sortedPieces[pieceIndex]!;
			// Find the piece in the original, unsorted, transformed pieces array
			const originalPiece = pieces.find((op) => coordutil.areCoordsEqual(op.coords, piece.coords));
			if (!originalPiece) throw Error("Unable to find original piece.");
			// Set its transformed X coord.
			originalPiece.transformedCoords[0] = BigInt(value);
		} else if (axis === 'y') {
			const sortedPieces = OrderedPieces['0,1'];
			const piece = sortedPieces[pieceIndex]!;
			// Find the piece in the original, unsorted, transformed pieces array
			const originalPiece = pieces.find((op) => coordutil.areCoordsEqual(op.coords, piece.coords));
			if (!originalPiece) throw Error("Unable to find original piece.");
			// Set its transformed Y coord.
			originalPiece.transformedCoords[1] = BigInt(value);
		} else throw Error("Unknown axis.");
	}

	// Assemble the final compressed position from the solved piece's transformed coordinates.

	const compressedPosition: Map<CoordsKey, number> = new Map();
	for (const piece of pieces) {
		// Safety check
		if (piece.transformedCoords[0] === undefined || piece.transformedCoords[1] === undefined) throw Error("Not all pieces transformedCoords were set.");

		// Add the final coordinate and piece type to our output map.
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


// ==================================== MODEL HELPERS ====================================


/**
 * Returns a string we'll use for the variable name in the linear programming model.
 * @param axis - What axis this variable is for
 * @param index - The index of the piece in its sorted list.
 */
function getVariableName(axis: Axis, index: number): VariableName {
	const axisLetter = axis === '1,0' ? 'x' : axis === '0,1' ? 'y' : axis === '1,1' ? 'u' : axis === '1,-1' ? 'v' : (() => { throw Error("Unsupported axis."); })();
	return `${axisLetter}-${index}`;
}

function getConstraintName(varName: VariableName) {
	return `${varName}_constraint`;
}

/**
 * 
 * @param model 
 * @param name - The name of the constraint equation
 * @param columns 
 * @param type 
 * @param value 
 */
function addConstraintToModel(model: Model, name: string, columns: Column[], type: 'equal' | 'min' | 'max', value: number): void {
	// Add the equation
	model.constraints[name] = { [type]: value };
	// Add the variables as columns to it
	for (const column of columns) {
		// Initialize first if not already
		if (!model.variables[column.variable]) model.variables[column.variable] = {};
		model.variables[column.variable][name] = column.coefficient;
	}
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