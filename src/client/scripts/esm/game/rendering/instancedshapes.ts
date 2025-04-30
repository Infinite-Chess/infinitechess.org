
/**
 * This script calculates the vertex data of a single instance
 * of several different kinds of shapes.
 * 
 * Many are used for rendering legal moves, like the square, dot, or corner triangles.
 * The plus sign is used for special rights highlighting.
 * 
 * The vertex data returned from any shape in this script
 * ALWAYS has a stride length of 6 (x,y, r,g,b,a)
 */



import type { Coords } from "../../chess/util/coordutil.js";
import type { Color } from "../../util/math.js";


// @ts-ignore
import bufferdata from "./bufferdata.js";
// @ts-ignore
import board from "./board.js";
// @ts-ignore
import shapes from "./shapes.js";



// Variables ------------------------------------------------------------------------------


/**
 * Properties for the dots that are rendered on legal squares without an occupying piece.
 */
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
function getDataLegalMoveSquare(color: Color): number[] {
	const coords: Coords = [0,0]; // The instance is going to be at [0,0]

	// Generate and return the vertex data for the legal move square.
	return shapes.getDataQuad_Color_FromCoord(coords, color);
}

/**
 * Generates the legal move dot instance mesh, centered on [0,0]
 * @param color - The color [r, g, b, a]. This should MATCH the current theme's legal move color! An offset will be applied to its opacity.
 * @returns The vertex data for the "legal move dot" (circle).
 */
function getDataLegalMoveDot(color: Color): number[] {
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
 * Generates vertex data for four corner triangles used for legal move indicators,
 * with opacity adjustment and proper visual centering.
 * @param color - Color [r, g, b, a] from theme (opacity offset will be applied)
 * @returns Vertex data for four corner triangles
 */
function getDataLegalMoveCornerTris(color: [number, number, number, number]): number[] {
	// Adjust opacity
	// eslint-disable-next-line prefer-const
	let [r, g, b, a] = color;
	a = Math.min(a + CORNER_TRIS.OPACITY_OFFSET, 1);

	// Calculate visual center position (original [0,0] instance adjusted for board centering)
	const boardCenterAdjust = (1 - board.gsquareCenter()) - 0.5;
	const centerX = boardCenterAdjust;
	const centerY = boardCenterAdjust;

	const vertices: number[] = [];
	const squareHalfSize = 0.5;
	const triHalfWidth = CORNER_TRIS.TRI_WIDTH / 2;

	// Helper to add a single corner triangle
	const addTriangle = (cornerX: number, cornerY: number, dx: number, dy: number) => {
		vertices.push(
			cornerX, cornerY, r, g, b, a,
			cornerX + dx, cornerY, r, g, b, a,
			cornerX, cornerY + dy, r, g, b, a
		);
	};

	// Generate all four corners
	addTriangle(centerX - squareHalfSize, centerY + squareHalfSize, triHalfWidth, -triHalfWidth);  // Top-left
	addTriangle(centerX + squareHalfSize, centerY + squareHalfSize, -triHalfWidth, -triHalfWidth); // Top-right
	addTriangle(centerX - squareHalfSize, centerY - squareHalfSize, triHalfWidth, triHalfWidth);   // Bottom-left
	addTriangle(centerX + squareHalfSize, centerY - squareHalfSize, -triHalfWidth, triHalfWidth);  // Bottom-right

	return vertices;
}
/**
 * Generates vertex data for a plus sign using 5 non-overlapping rectangles
 */
function getDataPlusSign(color: Color): number[] {
	// eslint-disable-next-line prefer-const
	let [r, g, b, a] = color;
	a = Math.min(a + PLUS_SIGN.OPACITY_OFFSET, 1);
	
	const halfEdge = PLUS_SIGN.EDGE_WIDTH / 2;
	const armLength = PLUS_SIGN.ARM_LENGTH;
	const [posX, posY] = PLUS_SIGN.POSITION;
	
	const vertices: number[] = [];
	
	// Helper to add quad vertices (2 triangles)
	const addQuad = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) => {
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

/**
 * Generates the vertex data for a single square draw with a texture, centered on [0,0]
 * @param inverted - Whether to invert the position data. Should be true if we're viewing black's perspective.
 */
function getDataTexture(inverted: boolean): number[] {
	let { left, right, bottom, top } = shapes.getBoundingBoxOfCoord([0,0]);
	if (inverted) {
		[left, right] = [right, left]; // Swap left and right
		[bottom, top] = [top, bottom]; // Swap bottom and top
	}
	return bufferdata.getDataQuad_Texture(left, bottom, right, top, 0, 0, 1, 1);
}

/**
 * Generates the vertex data for a single square draw with a colored texture, centered on [0,0]
 * @param inverted - Whether to invert the position data. Should be true if we're viewing black's perspective.
 */
function getDataColoredTexture(color: Color, inverted: boolean): number[] {
	let { left, right, bottom, top } = shapes.getBoundingBoxOfCoord([0,0]);
	if (inverted) {
		[left, right] = [right, left]; // Swap left and right
		[bottom, top] = [top, bottom]; // Swap bottom and top
	}
	return bufferdata.getDataQuad_ColorTexture(left, bottom, right, top, 0, 0, 1, 1, ...color);
}

export default {
	getDataLegalMoveSquare,
	getDataLegalMoveDot,
	getDataLegalMoveCornerTris,
	getDataPlusSign,
	getDataTexture,
	getDataColoredTexture,
};