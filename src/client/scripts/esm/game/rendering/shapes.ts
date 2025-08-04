// src/client/scripts/esm/game/rendering/shapes.ts

import board from "./boardtiles.js";
import boardpos from "./boardpos.js";
import perspective from "./perspective.js";
import spritesheet from "./spritesheet.js";
import primitives from "./primitives.js";
import { Coords, DoubleCoords } from "../../chess/util/coordutil.js";
import { BoundingBox } from "../../util/math/bounds.js";
import { Color } from "../../util/math/math.js";



/**
 * Returns a bounding box of a square.
 * ACCOUNTS FOR SQUARE CENTER.
 * REQUIRES uniform transformations before rendering.
 */
function getBoundingBoxOfCoord(coords: Coords): BoundingBox {
	const squareCenter = board.gsquareCenter();
	const left = coords[0] - squareCenter;
	const bottom = coords[1] - squareCenter;
	const right = left + 1;
	const top = bottom + 1;
	return { left, right, bottom, top };
}

/**
 * Returns a bounding box of the coordinates at which
 * you can EXACTLY render a highlight on the provided coords.
 * 
 * Does not require uniform translations before rendering.
 */
function getTransformedBoundingBoxOfSquare(coords: Coords): BoundingBox {
	const coordsBoundingBox = getBoundingBoxOfCoord(coords);
	return applyWorldTransformationsToSquareBoundingBox(coordsBoundingBox);
}

/**
 * Applies our board position and scale transformations to a SQUARE's bounding box
 * so it can be rendered exactly where it is without requiring uniform translations.
 * 
 * ONLY WORKS WITH transforming square bounding box data!! To make it work with
 * any size bounding box, we have to apply the exact transformation to each point!
 * Use {@link applyWorldTransformationsToSquareBoundingBox} instead.
 * This one is slightly faster than that for single squares.
 */
function applyWorldTransformationsToSquareBoundingBox(boundingBox: BoundingBox): BoundingBox {
	const boardPos = boardpos.getBoardPos();
	const boardScale = boardpos.getBoardScale();
	const left = (boundingBox.left - boardPos[0]) * boardScale;
	const bottom = (boundingBox.bottom - boardPos[1]) * boardScale;
	const right = left + boardScale;
	const top = bottom + boardScale;
	return { left, right, bottom, top };
}

/**
 * GENERIC. Applies our board position and scale transformations to a bounding box
 * so it can be rendered exactly where it is without requiring uniform translations.
 * 
 * If the bounding box is of a single square, using {@link applyWorldTransformationsToSquareBoundingBox}
 * is slightly faster.
 */
function applyWorldTransformationsToBoundingBox(boundingBox: BoundingBox): BoundingBox {
	const boardPos = boardpos.getBoardPos();
	const boardScale = boardpos.getBoardScale();
	const left = (boundingBox.left - boardPos[0]) * boardScale;
	const right = (boundingBox.right - boardPos[0]) * boardScale;
	const bottom = (boundingBox.bottom - boardPos[1]) * boardScale;
	const top = (boundingBox.top - boardPos[1]) * boardScale;
	return { left, bottom, right, top };
}

/**
 * If you have say a bounding box from coordinate [1,1] to [9,9],
 * this will round that outwards from [0.5,0.5] to [9.5,9.5]
 */
function expandTileBoundingBoxToEncompassWholeSquare(boundingBox: BoundingBox): BoundingBox {
	const squareCenter = board.gsquareCenter();
	const left = boundingBox.left - squareCenter;
	const right = boundingBox.right - squareCenter + 1;
	const bottom = boundingBox.bottom - squareCenter;
	const top = boundingBox.top - squareCenter + 1;
	return { left, bottom, right, top };
}




function getDataQuad_Color_FromCoord(coords: Coords, color: Color): number[] {
	const { left, bottom, right, top } = getBoundingBoxOfCoord(coords);
	return primitives.Quad_Color(left, bottom, right, top, color);
}

/**
 * Calculates the exact vertex data a square can be rendered at a given coordinate,
 * WITHOUT REQUIRING a positional or scale transformation when rendering!
 */
function getTransformedDataQuad_Color_FromCoord(coords: Coords, color: Color): number[] {
	const { left, bottom, right, top } = getTransformedBoundingBoxOfSquare(coords);
	return primitives.Quad_Color(left, bottom, right, top, color);
}




/**
 * Generates the vertex data for a circle in 3D space with color attributes.
 * @param x - The X coordinate of the circle's center.
 * @param y - The Y coordinate of the circle's center.
 * @param radius - The radius of the circle.
 * @param resolution - The number of triangles (segments) used to approximate the circle.
 * @param r - Red color component (0-1).
 * @param g - Green color component (0-1).
 * @param b - Blue color component (0-1).
 * @param a - Alpha (transparency) component (0-1).
 * @returns The vertex data for the circle, including position and color for each vertex.
 */
function getDataCircle(x: number, y: number, radius: number, resolution: number, r: number, g: number, b: number, a: number): number[] {
	if (!Number.isInteger(resolution)) throw new Error("Resolution of circle data must be an integer!");

	const vertices: number[] = [];
	const angleStep = (2 * Math.PI) / resolution;

	// Center point of the circle
	for (let i = 0; i < resolution; i++) {
		// Current and next angle positions
		const currentAngle = i * angleStep;
		const nextAngle = (i + 1) * angleStep;

		// Position of current and next points on the circumference
		const x1 = x + radius * Math.cos(currentAngle);
		const y1 = y + radius * Math.sin(currentAngle);
		const x2 = x + radius * Math.cos(nextAngle);
		const y2 = y + radius * Math.sin(nextAngle);

		// Triangle fan: center point, current point, and next point
		vertices.push(
			// Center vertex
			x, y, 		r, g, b, a,
			// Current circumference vertex
			x1, y1, 	r, g, b, a,
			// Next circumference vertex
			x2, y2, 	r, g, b, a
		);
	}

	return vertices;
}

// Intended to be rendered using LINE_LOOP
function getDataRect_FromTileBoundingBox(boundingBox: BoundingBox, color: Color): number[] {
	boundingBox = expandTileBoundingBoxToEncompassWholeSquare(boundingBox);
	const { left, right, bottom, top } = applyWorldTransformationsToBoundingBox(boundingBox);
	return primitives.Rect(left, bottom, right, top, color);
}



function getDataQuad_ColorTexture_FromCoordAndType(coords: Coords, type: string, color: Color): number[] {
	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const { texleft, texbottom, texright, textop } = spritesheet.getTexDataOfType(type, rotation);
	const { left, right, bottom, top } = getTransformedBoundingBoxOfSquare(coords);
	const [ r, g, b, a ] = color;

	return primitives.Quad_ColorTexture(left, bottom, right, top, texleft, texbottom, texright, textop, r, g, b, a);
}

/** Applies a rotational & translational transformation to an array of points. */
function applyTransformToPoints(points: DoubleCoords[], rotation: number, translation: DoubleCoords): DoubleCoords[] {
	// convert rotation angle to radians
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
    
	// apply rotation matrix and translation vector to each point
	const transformedPoints = points.map(point => {
		const xRot = point[0] * cos - point[1] * sin;
		const yRot = point[0] * sin + point[1] * cos;
		const xTrans = xRot + translation[0];
		const yTrans = yRot + translation[1];
		return [xTrans, yTrans] as DoubleCoords;
	});
    
	// return transformed points as an array of length-2 arrays
	return transformedPoints;
}



export default {
	getBoundingBoxOfCoord,
	getDataCircle,
	getDataQuad_Color_FromCoord,
	getTransformedDataQuad_Color_FromCoord,
	expandTileBoundingBoxToEncompassWholeSquare,
	applyWorldTransformationsToBoundingBox,
	getDataRect_FromTileBoundingBox,
	getDataQuad_ColorTexture_FromCoordAndType,
	getTransformedBoundingBoxOfSquare,
	applyTransformToPoints,
};