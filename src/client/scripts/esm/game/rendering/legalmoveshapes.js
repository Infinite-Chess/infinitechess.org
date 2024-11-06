import board from "./board.js";
import bufferdata from "./bufferdata.js";
import shapes from "./shapes.js";

/**
 * Generates the vertex data for a "legal move dot" (a circle) on the board.
 * @param {Array<number>} coords - The tile coordinates in [coordX, coordY] format.
 * @param {number} z - The Z coordinate (depth) for the circle.
 * @param {Array<number>} color - The color as an array [r, g, b, a].
 * @returns {Array<number>} The vertex data for the "legal move dot" (circle).
 */
function getDataLegalMoveDot(coords, z, color) {
	const radius = 0.16;
	const resolution = 32;  // Adjust resolution as needed for circle smoothness
	const opacityOffset = 0.2; // Increase the opacity of dots because they are harder and smaller to see than squares
	// eslint-disable-next-line prefer-const
	let [r, g, b, a] = color; a += opacityOffset;

	// Get the tile's center point with the mesh offset applied
	const x = coords[0] + (1 - board.gsquareCenter()) - 0.5;
	const y = coords[1] + (1 - board.gsquareCenter()) - 0.5;

	// Generate and return the vertex data for the legal move dot (circle)
	return shapes.getDataCircle_3D(x, y, z, radius, resolution, r, g, b, a);
}

/**
 * Generates vertex data for four small triangles, each located in a corner of a square.
 * @param {number} centerX - The X coordinate of the square's center.
 * @param {number} centerY - The Y coordinate of the square's center.
 * @param {number} z - The Z coordinate (depth) for the triangles.
 * @param {number} size - The size of the square (full side length).
 * @param {number} triSize - The size of the small triangles (side length).
 * @param {Array<number>} color - The color as an array [r, g, b, a].
 * @returns {Array<number>} The vertex data for the four triangles.
 */
function getDataCornerTriangles(centerX, centerY, z, triSize, color) {
	const vertices = [];
	const halfSize = 1 / 2;
	const [r, g, b, a] = color;

	// Helper function to add a triangle's vertex data
	function addTriangle(x1, y1, x2, y2, x3, y3) {
		vertices.push(
			x1, y1, z, r, g, b, a, // Vertex 1
			x2, y2, z, r, g, b, a, // Vertex 2
			x3, y3, z, r, g, b, a  // Vertex 3
		);
	}

	// Calculate the corner positions
	const topLeft = [centerX - halfSize, centerY + halfSize];
	const topRight = [centerX + halfSize, centerY + halfSize];
	const bottomLeft = [centerX - halfSize, centerY - halfSize];
	const bottomRight = [centerX + halfSize, centerY - halfSize];

	// Offset triangles into each corner
	const cornerOffset = triSize / 2;

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
 * Generates the vertex data for four small triangles in the corners of a tile.
 * @param {Array<number>} coords - The tile coordinates in [coordX, coordY] format.
 * @param {number} z - The Z coordinate (depth) for the triangles.
 * @param {Array<number>} color - The color as an array [r, g, b, a].
 * @returns {Array<number>} The vertex data for the four corner triangles.
 */
function getDataLegalMoveCornerTris(coords, z, color) {
	const triSize = 0.50;     // Default: 0.50     Adjust this for triangle size in each corner
	const opacityOffset = 0.2; // Increase opacity for better visibility
	// eslint-disable-next-line prefer-const
	let [r, g, b, a] = color; a += opacityOffset;

	// Get the tile's center point with the mesh offset applied
	const x = coords[0] + (1 - board.gsquareCenter()) - 0.5;
	const y = coords[1] + (1 - board.gsquareCenter()) - 0.5;

	// Generate and return the vertex data for the four corner triangles
	return getDataCornerTriangles(x, y, z, triSize, [r, g, b, a]);
}

export default {
	getDataLegalMoveDot,
	getDataLegalMoveCornerTris,
};