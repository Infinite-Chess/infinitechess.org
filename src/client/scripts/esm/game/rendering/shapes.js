
/**
 * Generates the vertex data for a circle in 3D space with color attributes.
 * @param {number} centerX - The X coordinate of the circle's center.
 * @param {number} centerY - The Y coordinate of the circle's center.
 * @param {number} centerZ - The Z coordinate of the circle's center.
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

export default {
	getDataCircle_3D,
};