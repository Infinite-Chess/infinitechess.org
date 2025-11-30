
// src/client/scripts/esm/game/rendering/meshes.ts


/**
 * This script can generate mesh vertex data for common shapes,
 * given game info such as coordinates, color, and textures.
 * 
 * [Model Space] - REQUIRES position and scale transformations when rendering.
 * [World Space] - DOES NOT require positional or scale transformations when rendering.
 */


import type { Color } from "../../../../../shared/util/math/math.js";
import type { BoundingBox, BoundingBoxBD, DoubleBoundingBox } from "../../../../../shared/util/math/bounds.js";

import boardtiles from "./boardtiles.js";
import boardpos from "./boardpos.js";
import spritesheet from "./spritesheet.js";
import primitives from "./primitives.js";
import perspective from "./perspective.js";
import { Vec3 } from "../../../../../shared/util/math/vectors.js";
import bd, { BigDecimal } from "../../../../../shared/util/bigdecimal/bigdecimal.js";
import coordutil, { BDCoords, Coords, DoubleCoords } from "../../../../../shared/chess/util/coordutil.js";
import bounds from "../../../../../shared/util/math/bounds.js";


// Constants -------------------------------------------------------------------------


const ONE = bd.FromBigInt(1n);


// Square Bounds ---------------------------------------------------------------------------


/**
 * [Model Space] Returns a bounding box of a square.
 * @param coords - Must be within double bounds because it should only be for model vertice data.
 */
function getCoordBoxModel(coords: DoubleCoords): DoubleBoundingBox {
	const squareCenter = boardtiles.getSquareCenterAsNumber();
	const left = coords[0] - squareCenter;
	const bottom = coords[1] - squareCenter;
	const right = left + 1;
	const top = bottom + 1;
	return { left, right, bottom, top };
}

/**
 * [World Space] Returns a bounding box of a square.
 */
function getCoordBoxWorld(coords: Coords): DoubleBoundingBox {
	const boardPos = boardpos.getBoardPos();
	const boardScale = boardpos.getBoardScaleAsNumber();

	const squareCenterScaled = boardtiles.getSquareCenterAsNumber() * boardScale;

	const coordsBD = bd.FromCoords(coords);

	const relativeCoords: DoubleCoords = bd.coordsToDoubles(coordutil.subtractBDCoords(coordsBD, boardPos));

	const scaledCoords: DoubleCoords = [
		relativeCoords[0] * boardScale,
		relativeCoords[1] * boardScale
	];

	const left = scaledCoords[0] - squareCenterScaled;
	const right = left + boardScale;
	const bottom = scaledCoords[1] - squareCenterScaled;
	const top = bottom + boardScale;

	return { left, right, bottom, top };
}

/**
 * [Model Space] If you have say a bounding box from coordinate [1,1] to [9,9],
 * this will round that outwards from [0.5,0.5] to [9.5,9.5].
 * 
 * Expands the edges of the box, which should contain integer squares for values,
 * to encapsulate the whole of the squares on their edges.
 * Turns it into a floating point edge.
 */
function expandTileBoundingBoxToEncompassWholeSquare(boundingBox: BoundingBox): BoundingBoxBD {
	const boxBD = bounds.castBoundingBoxToBigDecimal(boundingBox);
	return expandTileBoundingBoxToEncompassWholeSquareBD(boxBD);
}

/**
 * {@link expandTileBoundingBoxToEncompassWholeSquare}, but use this if you already have a BigDecimal bounding box.
 */
function expandTileBoundingBoxToEncompassWholeSquareBD(boundingBox: BoundingBoxBD): BoundingBoxBD {
	const squareCenter = boardtiles.getSquareCenter();
	const inverseSquareCenter = bd.subtract(ONE, squareCenter);

	const left = bd.subtract(boundingBox.left, squareCenter);
	const right = bd.add(boundingBox.right, inverseSquareCenter);
	const bottom = bd.subtract(boundingBox.bottom, squareCenter);
	const top = bd.add(boundingBox.top, inverseSquareCenter);

	return { left, bottom, right, top };
}

/**
 * [World Space] Applies our board position and scale transformations to a floating bounding box
 * so it can be rendered exactly where it is without requiring uniform translations.
 * 
 * Since its floating, we don't bother to subtract squareCenter.
 */
function applyWorldTransformationsToBoundingBox(boundingBox: BoundingBoxBD): DoubleBoundingBox {
	const boardPos = boardpos.getBoardPos();
	const boardScale = boardpos.getBoardScaleAsNumber();

	const left: number = bd.toNumber(bd.subtract(boundingBox.left, boardPos[0])) * boardScale;
	const right: number = bd.toNumber(bd.subtract(boundingBox.right, boardPos[0])) * boardScale;
	const bottom: number = bd.toNumber(bd.subtract(boundingBox.bottom, boardPos[1])) * boardScale;
	const top: number = bd.toNumber(bd.subtract(boundingBox.top, boardPos[1])) * boardScale;

	return { left, bottom, right, top };
}


// Mesh Data ---------------------------------------------------------------------------------


/**
 * [Model Space] Generates the vertex data of a square highlight, given the coords and color.
 */
function QuadModel_Color(coords: DoubleCoords, color: Color): number[] {
	const { left, bottom, right, top } = getCoordBoxModel(coords);
	return primitives.Quad_Color(left, bottom, right, top, color);
}

/**
 * [World Space] Generates the vertex data of a square highlight, given the coords and color.
 */
function QuadWorld_Color(coords: Coords, color: Color): number[] {
	const { left, bottom, right, top } = getCoordBoxWorld(coords);
	return primitives.Quad_Color(left, bottom, right, top, color);
}

/**
 * [World Space] Generates the vertex data of a colored texture.
 */
function QuadWorld_ColorTexture(coords: Coords, type: number, color: Color): number[] {
	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const { texleft, texbottom, texright, textop } = spritesheet.getTexDataOfType(type, rotation);
	const { left, right, bottom, top } = getCoordBoxWorld(coords);
	const [ r, g, b, a ] = color;

	return primitives.Quad_ColorTexture(left, bottom, right, top, texleft, texbottom, texright, textop, r, g, b, a);
}

/**
 * [World Space, LINE_LOOP] Generates the vertex data of a rectangle outline.
 */
function RectWorld(boundingBox: BoundingBox, color: Color): number[] {
	const boundingBoxBD = expandTileBoundingBoxToEncompassWholeSquare(boundingBox);
	const { left, right, bottom, top } = applyWorldTransformationsToBoundingBox(boundingBoxBD);
	return primitives.Rect(left, bottom, right, top, color);
}

// /**
//  * [World Space, TRIANGLES] Generates the vertex data of a filled rectangle.
//  */
// function RectWorld_Filled(boundingBox: BoundingBox, color: Color): number[] {
// 	const boundingBoxBD = expandTileBoundingBoxToEncompassWholeSquare(boundingBox);
// 	const { left, right, bottom, top } = applyWorldTransformationsToBoundingBox(boundingBoxBD);
// 	return primitives.Quad_Color(left, bottom, right, top, color);
// }


// Transforming Vertices ---------------------------------------------------------------


/** Applies a rotational & translational transformation to an array of points. */
// function applyTransformToPoints(points: DoubleCoords[], rotation: number, translation: DoubleCoords): DoubleCoords[] {
// 	// convert rotation angle to radians
// 	const cos = Math.cos(rotation);
// 	const sin = Math.sin(rotation);
    
// 	// apply rotation matrix and translation vector to each point
// 	const transformedPoints = points.map(point => {
// 		const xRot = point[0] * cos - point[1] * sin;
// 		const yRot = point[0] * sin + point[1] * cos;
// 		const xTrans = xRot + translation[0];
// 		const yTrans = yRot + translation[1];
// 		return [xTrans, yTrans] as DoubleCoords;
// 	});
    
// 	// return transformed points as an array of length-2 arrays
// 	return transformedPoints;
// }


// Other Generic Rendering Methods -------------------------------------------------------


/**
 * Returns a model's transformed position that should be used when rendering its buffer model.
 * 
 * Any model that has a bigint offset, should be able to subtract that offset
 * from our board position to obtain a number small emough for the gpu to render.
 * 
 * Typically this will always include numbers smaller than 10,000
 */
function getModelPosition(boardPos: BDCoords, modelOffset: Coords, z: number = 0): Vec3 {
	function getAxis(position: BigDecimal, offset: bigint): number {
		const offsetBD = bd.FromBigInt(offset);
		return bd.toNumber(bd.subtract(offsetBD, position));
	}

	return [
		// offset - boardPos
		getAxis(boardPos[0], modelOffset[0]),
		getAxis(boardPos[1], modelOffset[1]),
		z
	];
}


// Exports -----------------------------------------------------------------------


export default {
	// Square Bounds
	getCoordBoxModel,
	getCoordBoxWorld,
	expandTileBoundingBoxToEncompassWholeSquare,
	expandTileBoundingBoxToEncompassWholeSquareBD,
	applyWorldTransformationsToBoundingBox,
	// Mesh Data
	QuadModel_Color,
	QuadWorld_Color,
	QuadWorld_ColorTexture,
	RectWorld,
	// RectWorld_Filled,
	// Other Generic Rendering Methods
	getModelPosition,
};