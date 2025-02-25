
/**
 * This script calculates the vertex data of a single instance
 * of several different kinds of shapes.
 * 
 * Many are used for rendering legal moves, like the square, dot, or corner triangles.
 * The plus sign is used for special rights highlighting.
 */


// @ts-ignore
import board from "./board.js";
// @ts-ignore
import shapes from "./shapes.js";


import type { Coords } from "../../chess/util/coordutil.js";


// Variables ------------------------------------------------------------------------------


const DOTS = {
	/** The radius of the dots, where 1 equals the width of one square. */
	RADIUS: 0.16,
	/** How many points the edge of the dots have. */
	RESOLUTION: 32,
	/**
	 * This will be added to the theme's legal move color's opacity,
	 * as dots are a little less noticeable than big squares,
	 * so increasing their opacity helps.
	 */
	OPACITY_OFFSET: 0.2
};

/**
 * Properties for the corner triangles that are rendered on legal squares with an occupied piece,
 * they typically signify legal captures.
 */
const CORNER_TRIS = {
	/** The radius of the corner triangles, where 1 equals the width of one square. */
	TRI_WIDTH: 0.5,
	/**
	 * This will be added to the theme's legal move color's opacity,
	 * as the triangles are a little less noticeable than big squares,
	 * so increasing their opacity helps.
	 */
	OPACITY_OFFSET: 0.2
};

/**
 * Properties for the plus sign that is rendered when the special rights highlighing
 * debug mode is enabled, next to each piece that has its special rights.
 */
const PLUS_SIGN = {
	/** Default position of the plus sign center within a square ([0,0] is square center, [0.5,0.5] is top-right corner) */
	POSITION: [0.3, 0.3] as Coords, // Default: [0.3, 0.3]
	/** Length of both arms (horizontal and vertical) where 1.0 spans full square */
	ARM_LENGTH: 0.4, // Default: 0.4
	/** Width of the plus sign arms */
	EDGE_WIDTH: 0.12, // Default: 0.12
	/** Added to color alpha for better visibility */
	OPACITY_OFFSET: 0.2 // Default: 0.2
};

// Functions ------------------------------------------------------------------------------


/**
 * Generates the legal move square instance mesh, centered on [0,0]
 * @param color - The color [r, g, b, a]. This should MATCH the current theme's legal move color!
 * @returns The vertex data for the legal move square.
 */
function getDataLegalMoveSquare(color: [number,number,number,number]): number[] {
	const coords: Coords = [0,0]; // The instance is going to be at [0,0]

	// Generate and return the vertex data for the legal move square.
	return shapes.getDataQuad_Color_FromCoord(coords, color);
}

/**
 * Generates the legal move dot instance mesh, centered on [0,0]
 * @param color - The color [r, g, b, a]. This should MATCH the current theme's legal move color! An offset will be applied to its opacity.
 * @returns The vertex data for the "legal move dot" (circle).
 */
function getDataLegalMoveDot(color: [number,number,number,number]): number[] {
	// eslint-disable-next-line prefer-const
	let [r, g, b, a] = color;
	a += DOTS.OPACITY_OFFSET; // Add the offset
	a = Math.min(a, 1); // Cap it

	const coords: Coords = [0,0]; // The instance is going to be at [0,0]
	// The calculated dot's x & y have to be the VISUAL-CENTER of the square, not exactly at [0,0]
	const x = coords[0] + (1 - board.gsquareCenter()) - 0.5;
	const y = coords[1] + (1 - board.gsquareCenter()) - 0.5;

	// Generate and return the vertex data for the legal move dot (circle)
	return shapes.getDataCircle(x, y, DOTS.RADIUS, DOTS.RESOLUTION, r, g, b, a);
}

/**
 * Generates the legal move corner triangle mesh, centered on [0,0]
 * @param color - The color as an array [r, g, b, a].
 * @returns The vertex data for the four corner triangles.
 */
function getDataLegalMoveCornerTris(color: [number,number,number,number]): number[] {
	const opacityOffset = 0.2; // Increase opacity for better visibility
	// eslint-disable-next-line prefer-const
	let [r, g, b, a] = color;
	a += opacityOffset; // Add the offset
	a = Math.min(a, 1); // Cap it

	const coords: Coords = [0,0]; // The instance is going to be at [0,0]
	// The calculated vertex data's x & y have to be the VISUAL-CENTER of the square, not exactly at [0,0]
	const x = coords[0] + (1 - board.gsquareCenter()) - 0.5;
	const y = coords[1] + (1 - board.gsquareCenter()) - 0.5;

	// Generate and return the vertex data for the four corner triangles
	return getDataCornerTriangles(x, y, CORNER_TRIS.TRI_WIDTH, r, g, b, a);
}

/**
 * Generates vertex data for four small triangles, each located in a corner of a square.
 * @param centerX - The X coordinate of the square's center.
 * @param centerY - The Y coordinate of the square's center.
 * @param triWidth - The size of the small triangles (side length), where 1 is the width of a whole square.
 * @param r - Red
 * @param g - Green
 * @param b - Blue
 * @param a - Alpha
 * @returns The vertex data for the four triangles.
 */
function getDataCornerTriangles(centerX: number, centerY: number, triWidth: number, r: number, g: number, b: number, a: number) {
	const vertices: number[] = [];
	const pointFive = 1 / 2;

	// Helper function to add a triangle's vertex data
	function addTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
		vertices.push(
			x1, y1, r, g, b, a, // Vertex 1
			x2, y2, r, g, b, a, // Vertex 2
			x3, y3, r, g, b, a  // Vertex 3
		);
	}

	// Calculate the corner positions
	const topLeft: Coords = [centerX - pointFive, centerY + pointFive];
	const topRight: Coords = [centerX + pointFive, centerY + pointFive];
	const bottomLeft: Coords = [centerX - pointFive, centerY - pointFive];
	const bottomRight: Coords = [centerX + pointFive, centerY - pointFive];

	// Offset triangles into each corner
	const cornerOffset = triWidth / 2;

	// Top-left triangle (triangles are clockwise in each corner)
	addTriangle(
		topLeft[0], topLeft[1],                             // Corner of the square
		topLeft[0] + cornerOffset, topLeft[1],              // Right of the triangle
		topLeft[0], topLeft[1] - cornerOffset               // Bottom of the triangle
	);

	// Top-right triangle
	addTriangle(
		topRight[0], topRight[1],                           // Corner of the square
		topRight[0] - cornerOffset, topRight[1],            // Left of the triangle
		topRight[0], topRight[1] - cornerOffset             // Bottom of the triangle
	);

	// Bottom-left triangle
	addTriangle(
		bottomLeft[0], bottomLeft[1],                       // Corner of the square
		bottomLeft[0] + cornerOffset, bottomLeft[1],        // Right of the triangle
		bottomLeft[0], bottomLeft[1] + cornerOffset         // Top of the triangle
	);

	// Bottom-right triangle
	addTriangle(
		bottomRight[0], bottomRight[1],                     // Corner of the square
		bottomRight[0] - cornerOffset, bottomRight[1],      // Left of the triangle
		bottomRight[0], bottomRight[1] + cornerOffset       // Top of the triangle
	);

	return vertices;
}

/**
 * Generates vertex data for a plus sign using 5 non-overlapping rectangles
 * @param color - Color [r, g, b, a] from theme (opacity offset will be applied)
 */
function getDataPlusSign(color: [number, number, number, number]): number[] {
	// eslint-disable-next-line prefer-const
	let [r, g, b, a] = color;
	a = Math.min(a + PLUS_SIGN.OPACITY_OFFSET, 1);
	
	const halfEdge = PLUS_SIGN.EDGE_WIDTH / 2;
	const armLength = PLUS_SIGN.ARM_LENGTH;
	const [posX, posY] = PLUS_SIGN.POSITION;
	
	const vertices: number[] = [];
	
	// Helper to add quad vertices (2 triangles)
	const addQuad = (
		x1: number, y1: number,
		x2: number, y2: number,
		x3: number, y3: number,
		x4: number, y4: number
	) => {
		// Triangle 1
		vertices.push(x1, y1, r, g, b, a);
		vertices.push(x2, y2, r, g, b, a);
		vertices.push(x3, y3, r, g, b, a);
		// Triangle 2
		vertices.push(x3, y3, r, g, b, a);
		vertices.push(x4, y4, r, g, b, a);
		vertices.push(x1, y1, r, g, b, a);
	};

	// Vertical arm (top segment)
	addQuad(
		posX - halfEdge, posY + armLength / 2,  // top-left
		posX + halfEdge, posY + armLength / 2,  // top-right
		posX + halfEdge, posY + halfEdge,      // bottom-right
		posX - halfEdge, posY + halfEdge       // bottom-left
	);

	// Vertical arm (bottom segment)
	addQuad(
		posX - halfEdge, posY - halfEdge,      // top-left
		posX + halfEdge, posY - halfEdge,      // top-right
		posX + halfEdge, posY - armLength / 2,  // bottom-right
		posX - halfEdge, posY - armLength / 2   // bottom-left
	);

	// Horizontal arm (left segment)
	addQuad(
		posX - armLength / 2, posY + halfEdge,  // top-left
		posX - halfEdge, posY + halfEdge,      // top-right
		posX - halfEdge, posY - halfEdge,      // bottom-right
		posX - armLength / 2, posY - halfEdge   // bottom-left
	);

	// Horizontal arm (right segment)
	addQuad(
		posX + halfEdge, posY + halfEdge,      // top-left
		posX + armLength / 2, posY + halfEdge,  // top-right
		posX + armLength / 2, posY - halfEdge,  // bottom-right
		posX + halfEdge, posY - halfEdge       // bottom-left
	);

	// Center square
	addQuad(
		posX - halfEdge, posY + halfEdge,  // top-left
		posX + halfEdge, posY + halfEdge,  // top-right
		posX + halfEdge, posY - halfEdge,  // bottom-right
		posX - halfEdge, posY - halfEdge   // bottom-left
	);

	return vertices;
}

export default {
	getDataLegalMoveSquare,
	getDataLegalMoveDot,
	getDataLegalMoveCornerTris,
	getDataPlusSign,
};