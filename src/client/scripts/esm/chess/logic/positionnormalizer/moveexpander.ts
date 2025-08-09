
// src/client/scripts/esm/chess/logic/positionnormalizer/moveexpander.ts

/**
 * This script takes a chosen move from analyzing a COMPRESSED/NORMALIZED position
 * by positioncompressor.ts, and the transformation information of the position,
 * and expands the move out so it can be applied to the original UNCOMPRESSED position.
 */


import type { _Move_Compact } from "../icn/icnconverter.js";
import type { Coords } from "../movesets.js";

import bd from "../../../util/bigdecimal/bigdecimal.js";
import geometry from "../../../util/math/geometry.js";
import vectors, { LineCoefficients, Vec2, Vec2Key } from "../../../util/math/vectors.js";
import coordutil, { BDCoords } from "../../util/coordutil.js";
import positioncompressor, { AxisOrders, PieceTransform } from "./positioncompressor.js";



// ================================== MOVE EXPANDER ==================================



/**
 * Takes a move that should have been calculated from the compressed position,
 * and modifies its start and end coords so that it moves the original
 * uncompressed position's piece, and so its destination coordinates still
 * threaten all the same original pieces.
 * @param compressedPosition - The original uncompressed position
 * @param move - The decided upon move based on the compressed position
 */
function expandMove(AllAxisOrders: AxisOrders, pieceTransformations: PieceTransform[], move: _Move_Compact): _Move_Compact {
	const startCoordsBigInt: Coords = [BigInt(move.startCoords[0]), BigInt(move.startCoords[1])];
	const endCoordsBigInt: Coords = [BigInt(move.endCoords[0]), BigInt(move.endCoords[1])];

	// Determine the piece's original position

	const originalPiece = pieceTransformations.find((pt) => coordutil.areCoordsEqual(startCoordsBigInt, pt.transformedCoords as Coords));
	if (originalPiece === undefined) throw Error(`Compressed position's pieces doesn't include the moved piece on coords ${String(move.startCoords)}! Were we sure to choose a move based on the compressed position and not the original?`);

	/** The true start coordinates of the piece they moved. */
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

	/** The direction the piece moved in. We KNOW this is preserved when expanding back out! */
	const vector: Vec2 = vectors.absVector(vectors.normalizeVector(coordutil.subtractCoords(endCoordsBigInt, startCoordsBigInt)));
	const vec2Key: Vec2Key = vectors.getKeyFromVec2(vector);
	// console.log("Original start coords:", originalStartCoords);
	// console.log("Movement vector:", vector);
	const movementLine: LineCoefficients = vectors.getLineGeneralFormFromCoordsAndVec(originalStartCoords, vector);

	// Half the distance between groups so that we can pick the nearest one threatened.
	const HALF_ARBITRARY_DISTANCE = positioncompressor.MIN_ARBITRARY_DISTANCE / 2n;

	/** The true end coordinates they want to move to. */
	let originalEndCoords: Coords | undefined;

	// Search each axis group besides the direction it moved in

	// Skip if our movement is perpendicular to that axis,
	// its impossible for us to increase our axis value along it
	// => not interested in threatening any of those groups.
	if (vec2Key !== '0,1') determineIfMovedPieceInterestedInAxis('1,0');
	if (vec2Key !== '1,0') determineIfMovedPieceInterestedInAxis('0,1');

	/**
	 * Determines if the moved piece is interested in any group in the given axis.
	 * If so, its final destination will still be relative to that group.
	 */
	function determineIfMovedPieceInterestedInAxis(axis: '1,0' | '0,1') {
		if (originalEndCoords) {
			console.log(`Moved piece already has end coords determined. Skipping axis ${axis}.`);
			return; // We already found the original end coords, no need to continue
		}

		const axisOrder = AllAxisOrders[axis];
		const axisValueDeterminer = positioncompressor.AXIS_DETERMINERS[axis];

		const compressedEndCoordsAxisValue = axisValueDeterminer(endCoordsBigInt);
		// console.log("compressedEndCoordsAxisValue:", compressedEndCoordsAxisValue);
		// console.log('endCoords bigint:', endCoordsBigInt);

		for (const axisGroup of axisOrder) {
			if (compressedEndCoordsAxisValue + HALF_ARBITRARY_DISTANCE >= axisGroup.transformedRange![0] &&
				compressedEndCoordsAxisValue - HALF_ARBITRARY_DISTANCE <= axisGroup.transformedRange![1]) {
				// We found the group of interest this piece is targetting!
				console.log(`Moved piece is interested in group on the ${axis} axis with range ${axisGroup.transformedRange}.   Original range ${axisGroup.range}`);

				// The piece is on the same file as this axis group, so connect it to this axis group
				// so its position remains relative to them when the position is expanded back out.

				const offsetFromGroupStart = compressedEndCoordsAxisValue - axisGroup.transformedRange![0];
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
			if (compressedEndCoordsAxisValue + HALF_ARBITRARY_DISTANCE < axisOrder[0].transformedRange![0]) {
				// They moved left of the leftmost group
				console.log(`Moved piece wants to move left of the leftmost group on the ${axis} axis.`);

				const distToLeftMostGroup = compressedEndCoordsAxisValue - axisOrder[0]!.transformedRange![0];
				const actualEndCoordsAxisValue = axisOrder[0]!.range[0] + distToLeftMostGroup;
				// The ACTUAL coordinates they moved to!
				originalEndCoords = trueEndCoordsDeterminer(movementLine, axis, actualEndCoordsAxisValue);
			} else if (compressedEndCoordsAxisValue - HALF_ARBITRARY_DISTANCE > axisOrder[axisOrder.length - 1]!.transformedRange![1]) {
				// They moved right of the rightmost group
				console.log(`Moved piece wants to move right of the rightmost group on the ${axis} axis.`);

				const distToRightMostGroup = compressedEndCoordsAxisValue - axisOrder[axisOrder.length - 1]!.transformedRange![1];
				const actualEndCoordsAxisValue = axisOrder[axisOrder.length - 1]!.range[1] + distToRightMostGroup;
				// The ACTUAL coordinates they moved to!
				originalEndCoords = trueEndCoordsDeterminer(movementLine, axis, actualEndCoordsAxisValue);
			} else {
				console.log(`Moved piece is not interested in any groups on the ${axis} axis.`);
				console.log('compressedEndCoordsAxisValue:', compressedEndCoordsAxisValue);
			}
		}
	}

	if (!originalEndCoords) throw Error("Unable to determine the original end coordinates of the moved piece! ");

	return {
		startCoords: originalStartCoords,
		endCoords: originalEndCoords
	};
}

/**
 * Takes the movement line of the moved piece, the axis it is interested in,
 * the axis value of the axis group it is interested in,
 * and determines the true end coordinates it wants to land on
 * in the original uncompressed position.
 */
function trueEndCoordsDeterminer(movementLine: LineCoefficients, axisOfInterest: '1,0' | '0,1', targetAxisValue: bigint): Coords {
	// console.log("Determining true end coords for axis:", axisOfGroupOfInterest, " with target axis value:", targetAxisValue);

	const axisPerpendicularVec: Vec2 = vectors.getPerpendicularVector(vectors.getVec2FromKey(axisOfInterest));

	// I need to find the intersection point between the movement line,
	// and the line of vector axisPerpendicularVec with the targetAxisValue.

	// First determine the axisPerpendicularVec line with the targetAxisValue.
	let intersectionLine: LineCoefficients;
	if (axisOfInterest === '1,0') {
		// The line is vertical, so the x coordinate is targetAxisValue
		intersectionLine = vectors.getLineGeneralFormFromCoordsAndVec([targetAxisValue, 0n], axisPerpendicularVec);
	} else if (axisOfInterest === '0,1') {
		// The line is horizontal, so the y coordinate is targetAxisValue
		intersectionLine = vectors.getLineGeneralFormFromCoordsAndVec([0n, targetAxisValue], axisPerpendicularVec);
	} else throw Error(`Unknown axis of group of interest: ${axisOfInterest}`);

	// console.log("movementLine:", movementLine);
	// console.log("intersectionLine:", intersectionLine);

	// Now find the intersection point between the movement line and the intersection line.
	const intersectionPoint: BDCoords | undefined = geometry.calcIntersectionPointOfLines(...movementLine, ...intersectionLine);
	if (!intersectionPoint) throw Error(`Unable to find intersection point between movement line and group of interest!`);
	if (!bd.areCoordsIntegers(intersectionPoint)) throw Error(`Intersection point between movement line and group of interest is not an integer coordinate!`);

	return bd.coordsToBigInt(intersectionPoint);
}


// ================================== EXPORTS ==================================


export default {
	expandMove,
};