
import board from "./board.js";
import bufferdata from "./bufferdata.js";
import { createModel } from "./buffermodel.js";
import movement from "./movement.js";
import perspective from "./perspective.js";


/**
 * @typedef {import('../../util/math.js').BoundingBox} BoundingBox
 * @typedef {import("../../chess/util/coordutil.js").Coords} Coords
 */

/**
 * Returns a bounding box of a square.
 * ACCOUNTS FOR SQUARE CENTER.
 * REQUIRES uniform transformations before rendering.
 * @param {number[]} coords 
 * @returns {BoundingBox}
 */
function getBoundingBoxOfCoord(coords) {
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
 * @param {number[]} coords 
 * @returns {BoundingBox}
 */
function getTransformedBoundingBoxOfSquare(coords) {
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
 * @param {BoundingBox} boundingBox 
 */
function applyWorldTransformationsToSquareBoundingBox(boundingBox) {
	const boardPos = movement.getBoardPos();
	const boardScale = movement.getBoardScale();
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
 * @param {BoundingBox} boundingBox 
 */
function applyWorldTransformationsToBoundingBox(boundingBox) {
	const boardPos = movement.getBoardPos();
	const boardScale = movement.getBoardScale();
	const left = (boundingBox.left - boardPos[0]) * boardScale;
	const right = (boundingBox.right - boardPos[0]) * boardScale;
	const bottom = (boundingBox.bottom - boardPos[1]) * boardScale;
	const top = (boundingBox.top - boardPos[1]) * boardScale;
	return { left, bottom, right, top };
}

/**
 * If you have say a bounding box from coordinate [1,1] to [9,9],
 * this will round that outwards from [0.5,0.5] to [9.5,9.5]
 * @param {BoundingBox} boundingBox 
 * @returns {BoundingBox}
 */
function expandTileBoundingBoxToEncompassWholeSquare(boundingBox) {
	const squareCenter = board.gsquareCenter();
	const left = boundingBox.left - squareCenter;
	const right = boundingBox.right - squareCenter + 1;
	const bottom = boundingBox.bottom - squareCenter;
	const top = boundingBox.top - squareCenter + 1;
	return { left, bottom, right, top };
}




function getDataQuad_Color_FromCoord(coords, color) {
	const boundingBox = getBoundingBoxOfCoord(coords);
	return bufferdata.getDataQuad_Color(boundingBox, color);
}

function getDataQuad_Color3D_FromCoord(coords, z, color) {
	const boundingBox = getBoundingBoxOfCoord(coords);
	return bufferdata.getDataQuad_Color3D(boundingBox, z, color);
}

/**
 * Calculates the exact vertex data a square can be rendered at a given coordinate,
 * WITHOUT REQUIRING a positional or scale transformation when rendering!
 */
function getTransformedDataQuad_Color_FromCoord(coords, color) {
	const boundingBox = getTransformedBoundingBoxOfSquare(coords);
	return bufferdata.getDataQuad_Color(boundingBox, color);
}




/**
 * Generates the vertex data for a circle in 3D space with color attributes.
 * @param {number} x - The X coordinate of the circle's center.
 * @param {number} y - The Y coordinate of the circle's center.
 * @param {number} radius - The radius of the circle.
 * @param {number} resolution - The number of triangles (segments) used to approximate the circle.
 * @param {number} r - Red color component (0-1).
 * @param {number} g - Green color component (0-1).
 * @param {number} b - Blue color component (0-1).
 * @param {number} a - Alpha (transparency) component (0-1).
 * @returns {number[]} The vertex data for the circle, including position and color for each vertex.
 */
function getDataCircle(x, y, radius, resolution, r, g, b, a) {
	if (!Number.isInteger(resolution)) throw new Error("Resolution of circle data must be an integer!");

	const vertices = [];
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

/**
 * Generates the vertex data for a circle in 3D space with color attributes.
 * @param {number} x - The X coordinate of the circle's center.
 * @param {number} y - The Y coordinate of the circle's center.
 * @param {number} z - The Z coordinate of the circle's center.
 * @param {number} radius - The radius of the circle.
 * @param {number} resolution - The number of triangles (segments) used to approximate the circle.
 * @param {number} r - Red color component (0-1).
 * @param {number} g - Green color component (0-1).
 * @param {number} b - Blue color component (0-1).
 * @param {number} a - Alpha (transparency) component (0-1).
 * @returns {number[]} The vertex data for the circle, including position and color for each vertex.
 */
function getDataCircle_3D(x, y, z, radius, resolution, r, g, b, a) {
	const vertices = [];
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
			x, y, z, 		r, g, b, a,
			// Current circumference vertex
			x1, y1, z, 		r, g, b, a,
			// Next circumference vertex
			x2, y2, z, 		r, g, b, a
		);
	}

	return vertices;
}

/**
 * Returns the buffer model of a solid-color circle at the provided coordinates,
 * lying flat in xy space, with the provided dimensions, resolution, and color.
 * Renders with TRIANGLE_FAN, as it's less vertex data.
 * @param {number} x 
 * @param {number} y 
 * @param {number} z
 * @param {number} radius 
 * @param {number} resolution - How many points will be rendered on the circle's edge. 3+
 * @param {number} r - Red
 * @param {number} g - Green
 * @param {number} b - Blue
 * @param {number} a - Alpha
 * @returns {BufferModel} The buffer model
 */
function getModelCircle3D(x, y, z, radius, resolution, r, g, b, a) {
	if (resolution < 3) return console.error("Resolution must be 3+ to get data of a fuzz ball.");

	const data = [x, y, z, r, g, b, a]; // Mid point

	for (let i = 0; i <= resolution; i++) { // Add all outer points
		const theta = (i / resolution) * 2 * Math.PI;
		const thisX = x + radius * Math.cos(theta);
		const thisY = y + radius * Math.sin(theta);
		data.push(thisX, thisY, z, r, g, b, a);
	}

	return createModel(data, 3, 'TRIANGLE_FAN', true);
}

/**
 * Returns the buffer model of a gradient-colored ring at the provided coordinates,
 * lying flat in xy space, with the specified dimensions, resolution, and color gradient.
 * @param {number} x - The x-coordinate of the ring's center.
 * @param {number} y - The y-coordinate of the ring's center.
 * @param {number} z - The z-coordinate for the ring's plane.
 * @param {number} inRad - The radius of the inner edge of the ring.
 * @param {number} outRad - The radius of the outer edge of the ring.
 * @param {number} resolution - The number of points rendered along the ring's edge; must be 3 or greater.
 * @param {number[]} innerColor - RGBA color array for the inner edge [r1, g1, b1, a1].
 * @param {number[]} outerColor - RGBA color array for the outer edge [r2, g2, b2, a2].
 * @returns {BufferModel} The buffer model representing the gradient-colored ring.
 */
function getModelRing3D(x, y, z, inRad, outRad, resolution, [r1,g1,b1,a1], [r2,g2,b2,a2]) {
	if (resolution < 3) return console.error("Resolution must be 3+ to get model of a ring.");

	const data = [];

	for (let i = 0; i <= resolution; i++) {
		const theta = (i / resolution) * 2 * Math.PI;
		const innerX = x + inRad * Math.cos(theta);
		const innerY = y + inRad * Math.sin(theta);
		const outerX = x + outRad * Math.cos(theta);
		const outerY = y + outRad * Math.sin(theta);

		// Inner point
		data.push(innerX, innerY, z, r1, g1, b1, a1);

		// Outer point
		data.push(outerX, outerY, z, r2, g2, b2, a2);
	}

	return createModel(data, 3, "TRIANGLE_STRIP", true);
}

function getDataRect_FromTileBoundingBox(boundingBox, color) {
	boundingBox = expandTileBoundingBoxToEncompassWholeSquare(boundingBox);
	boundingBox = applyWorldTransformationsToBoundingBox(boundingBox);
	return bufferdata.getDataRect(boundingBox, color);
}



function getDataQuad_ColorTexture_FromCoordAndType(coords, type, color) {
	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(type, rotation);
	const { left, right, bottom, top } = getTransformedBoundingBoxOfSquare(coords);
	const [ r, g, b, a ] = color;

	return bufferdata.getDataQuad_ColorTexture(left, bottom, right, top, texleft, texbottom, texright, textop, r, g, b, a);
}

function getDataQuad_ColorTexture3D_FromCoordAndType(coords, z, type, color) {
	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(type, rotation);
	const { left, right, bottom, top } = getTransformedBoundingBoxOfSquare(coords);
	const [ r, g, b, a ] = color;

	return bufferdata.getDataQuad_ColorTexture3D(left, bottom, right, top, z, texleft, texbottom, texright, textop, r, g, b, a);
}

/**
 * Applies a rotational & translational transformation to an array of points.
 * @param {Coords[]} points 
 * @param {number} rotation 
 * @param {Coords} translation 
 * @returns {Coords[]}
 */
function applyTransformToPoints(points, rotation, translation) {
	// convert rotation angle to radians
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
    
	// apply rotation matrix and translation vector to each point
	const transformedPoints = points.map(point => {
		const xRot = point[0] * cos - point[1] * sin;
		const yRot = point[0] * sin + point[1] * cos;
		const xTrans = xRot + translation[0];
		const yTrans = yRot + translation[1];
		return [xTrans, yTrans];
	});
    
	// return transformed points as an array of length-2 arrays
	return transformedPoints;
}



export default {
	getBoundingBoxOfCoord,
	getDataCircle,
	getDataCircle_3D,
	getDataQuad_Color_FromCoord,
	getDataQuad_Color3D_FromCoord,
	getTransformedDataQuad_Color_FromCoord,
	expandTileBoundingBoxToEncompassWholeSquare,
	applyWorldTransformationsToBoundingBox,
	getModelCircle3D,
	getModelRing3D,
	getDataRect_FromTileBoundingBox,
	getDataQuad_ColorTexture_FromCoordAndType,
	getDataQuad_ColorTexture3D_FromCoordAndType,
	getTransformedBoundingBoxOfSquare,
	applyTransformToPoints,
};