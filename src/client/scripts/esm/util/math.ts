
/**
 * This script contains many generalized mathematical operations that
 * SEVERAL scripts use.
 */


import { Coords } from "../chess/util/coordutil";


// Type Definitions ------------------------------------------------------------------


/** A rectangle object with properties for the coordinates of its sides. */
interface BoundingBox {
	/** The x-coordinate of the left side of the box. */
	left: number,
	/** The x-coordinate of the right side of the box. */
	right: number,
	/** The y-coordinate of the bottom side of the box. */
	bottom: number,
	/** The y-coordinate of the top side of the box. */
	top: number
};

/** A length-2 number array. Commonly used for storing directions. */
type Vec2 = [number,number]

/** 
 * A pair of x & y vectors, represented in a string, separated by a `,`.
 * 
 * This is often used as the key for a slide direction in an object.
 */
type Vec2Key = `${number},${number}`

/** A length-3 number array. Commonly used for storing positional and scale transformations. */
type Vec3 = [number,number,number]

/** A color in a length-4 array: `[r,g,b,a]` */
type Color = [number,number,number,number];

// Geometry -------------------------------------------------------------------------------------------


/**
 * Finds the intersection of two lines in general form.
 * [x, y] or undefined if there is no intersection (or infinite intersections).
 */
function calcIntersectionPointOfLines(A1: number, B1: number, C1: number, A2: number, B2: number, C2: number): Coords | undefined {
	const determinant = A1 * B2 - A2 * B1;
	
	if (determinant === 0) return undefined; // Lines are parallel or identical

	// Calculate the intersection point
	const x = (C2 * B1 - C1 * B2) / determinant;
	const y = (A2 * C1 - A1 * C2) / determinant;

	return [x, y];
}

/**
 * Calculates the general form coefficients (A, B, C) of a line given a point and a direction vector.
 */
function getLineGeneralFormFromCoordsAndVec(coords: Coords, vector: Vec2): [number, number, number] {
	// General form: Ax + By + C = 0
	const A = vector[1];
	const B = -vector[0];
	const C = vector[0] * coords[1] - vector[1] * coords[0];

	return [A, B, C];
}

/**
 * Calculates the general form of a line (Ax + By + C = 0) given two points on the line.
 * Handles both regular and vertical lines.
 */
function getLineGeneralFormFrom2Coords(coords1: Coords, coords2: Coords): [number, number, number] {
	// Handle the case of a vertical line (infinite slope)
	if (coords1[0] === coords2[0]) {
		return [1, 0, -coords1[0]];  // The line equation is x = x1, which in general form is: 1*x + 0*y - x1 = 0
	}

	// Calculate the slope (m)
	const m = (coords2[1] - coords1[1]) / (coords2[0] - coords1[0]);

	// General form coefficients: A = m, B = -1, and C = y1 - m * x1
	const A = m;
	const B = -1;
	const C = coords1[1] - m * coords1[0];

	return [A, B, C];
}

/**
 * Compares two lines in general form to see if they are equal/coincident.
 * Two lines are considered equal if their coefficients are proportional.
 * @param line1 - The first line in general form [A1, B1, C1]
 * @param line2 - The second line in general form [A2, B2, C2]
 * @returns true if the lines are equal, false otherwise
 */
function areLinesInGeneralFormEqual(line1: [number, number, number], line2: [number, number, number]): boolean {
	const [A1, B1, C1] = line1;
	const [A2, B2, C2] = line2;

	// Check if the ratios of the coefficients are equal (proportional)
	// Avoid division by zero by checking the relationship with multiplication
	return (A1 * B2 === A2 * B1) && (A1 * C2 === A2 * C1) && (B1 * C2 === B2 * C1);
}

/**
 * Calculates the vector between 2 points.
 */
function calculateVectorFromPoints(start: Coords, end: Coords): Vec2 {
	return [end[0] - start[0], end[1] - start[1]];
}

/**
 * Calculates the C coefficient of a line in general form (Ax + By + C = 0) 
 * given a point (coords) and a direction vector (vector).
 * 
 * Step size here is unimportant, but the slope **is**.
 * This value will be unique for every line that *has the same slope*, but different positions.
 */
function getLineCFromCoordsAndVec(coords: Coords, vector: Vec2): number {
	return vector[0] * coords[1] - vector[1] * coords[0];
}

/**
 * Calculates the X and Y components of a unit vector given an angle in radians.
 * @param theta - The angle in radians.
 * @returns A tuple containing the X and Y components, both between -1 and 1.
 */
function getXYComponents_FromAngle(theta: number): Coords {
	return [Math.cos(theta), Math.sin(theta)]; // When hypotenuse is 1.0
}

/**
 * Rounds the given point to the nearest grid point multiple of the provided gridSize.
 * 
 * For example, a point of [5200,1100] and gridSize of 10000 would yield [10000,0]
 */
function roundPointToNearestGridpoint(point: Coords, gridSize: number): Coords { // point: [x,y]  gridSize is width of cells, typically 10,000
	const nearestX = Math.round(point[0] / gridSize) * gridSize;
	const nearestY = Math.round(point[1] / gridSize) * gridSize;

	return [nearestX, nearestY];
}

/**
 * Determines if one bounding box (`innerBox`) is entirely contained within another bounding box (`outerBox`).
 */
function boxContainsBox(outerBox: BoundingBox, innerBox: BoundingBox): boolean {
	if (innerBox.left < outerBox.left) return false;
	if (innerBox.right > outerBox.right) return false;
	if (innerBox.bottom < outerBox.bottom) return false;
	if (innerBox.top > outerBox.top) return false;

	return true;
}

/**
 * Returns true if the provided box contains the square coordinate.
 */
function boxContainsSquare(box: BoundingBox, square: Coords): boolean {
	if (square[0] < box.left) return false;
	if (square[0] > box.right) return false;
	if (square[1] < box.bottom) return false;
	if (square[1] > box.top) return false;

	return true;
}

/**
 * Calculates the minimum bounding box that contains all the provided coordinates.
 */
function getBoxFromCoordsList(coordsList: Coords[]): BoundingBox {
	// Initialize the bounding box using the first coordinate
	const firstPiece = coordsList.shift()!;
	const box: BoundingBox = {
		left: firstPiece[0],
		right: firstPiece[0],
		bottom: firstPiece[1],
		top: firstPiece[1],
	};

	// Expands the bounding box to include every coordinate
	for (const coord of coordsList) {
		expandBoxToContainSquare(box, coord);
	}

	return box;
}

/**
 * Expands the bounding box to include the provided coordinates, if it doesn't already.
 * DESTRUCTIVE. Modifies the original box.
 */
function expandBoxToContainSquare(box: BoundingBox, coord: Coords): void {
	if (coord[0] < box.left) box.left = coord[0];
	else if (coord[0] > box.right) box.right = coord[0];
	if (coord[1] < box.bottom) box.bottom = coord[1];
	else if (coord[1] > box.top) box.top = coord[1];
}

/**
 * Returns the mimimum bounding box that contains both of the provided boxes.
 */
function mergeBoundingBoxes(box1: BoundingBox, box2: BoundingBox): BoundingBox {
	return {
		left: Math.min(box1.left, box2.left),
		right: Math.max(box1.right, box2.right),
		bottom: Math.min(box1.bottom, box2.bottom),
		top: Math.max(box1.top, box2.top),
	};
}

/**
 * Calculates the center of a bounding box.
 */
function calcCenterOfBoundingBox(box: BoundingBox): Coords {
	return [
		(box.left + box.right) / 2,
		(box.bottom + box.top) / 2
	];
}

/**
 * Returns the point on the line SEGMENT that is nearest/perpendicular to the given point.
 * @param lineStart - The starting point of the line segment.
 * @param lineEnd - The ending point of the line segment.
 * @param point - The point to find the nearest point on the line to.
 * @returns An object containing the properties `coords`, which is the closest point on our segment to our point, and the `distance` to it.
 */
function closestPointOnLine(lineStart: Coords, lineEnd: Coords, point: Coords): { coords: Coords, distance: number } {
	let closestPoint: Coords | undefined;

	const dx = lineEnd[0] - lineStart[0];
	const dy = lineEnd[1] - lineStart[1];

	if (dx === 0) { // Vertical line
		closestPoint = [lineStart[0], clamp(lineStart[1], lineEnd[1], point[1])];
	} else { // Not vertical
		const m = dy / dx;
		const b = lineStart[1] - m * lineStart[0];
        
		// Calculate x and y coordinates of closest point on line
		let x = (m * (point[1] - b) + point[0]) / (m * m + 1);
		x = clamp(lineStart[0], lineEnd[0], x);
		const y = m * x + b;

		closestPoint = [x, y];
	}

	return {
		coords: closestPoint,
		distance: euclideanDistance(closestPoint, point)
	};
}

/**
 * Calculates the distance between two parallel lines given their coefficients in the form Ax + By + C = 0.
 * @param A - The coefficient A of the line equation (this will be the same for both lines).
 * @param B - The coefficient B of the line equation (this will be the same for both lines).
 * @param C1 - The coefficient C for the first line.
 * @param C2 - The coefficient C for the second line.
 * @returns The distance between the two parallel lines.
 */
function distanceBetweenParallelLines(A: number, B: number, C1: number, C2: number): number {
	if (A === 0 && B === 0)  throw new Error("Invalid line equation: A and B cannot both be zero.");
	return Math.abs(C2 - C1) / Math.sqrt(A * A + B * B);
}

/**
 * Finds the two lines intersecting the corners of a bounding box that are the farthest apart.
 * The lines are defined by the direction of the given vector and pass through the corners of the bounding box.
 * @param vector - The direction vector [dx, dy] defining the slope of the lines.
 * @param boundingBox - The bounding box with left, right, bottom, and top properties.
 * @returns The pair of corners that define the farthest apart lines.
 */
function findFarthestPointsALineSweepsABox(vector: Vec2, boundingBox: BoundingBox): [Coords, Coords] {
	const { left, right, bottom, top } = boundingBox;
	const [dx, dy] = vector;

	// Handle edge case: zero direction vector
	if (dx === 0 && dy === 0) throw new Error("Direction vector cannot be zero.");

	// Define the 4 corners of the bounding box
	const corners: Coords[] = [
		[left, top],     // Top-left
		[right, top],    // Top-right
		[left, bottom],  // Bottom-left
		[right, bottom]  // Bottom-right
	];

	let maxDistance = -Infinity;
	let farthestLines: [Coords, Coords] = [corners[0]!, corners[1]!];

	// Compare each pair of corners and calculate the distance between parallel lines
	for (let i = 0; i < corners.length; i++) {
		for (let j = i + 1; j < corners.length; j++) {
			const [x1, y1] = corners[i]!;
			const [x2, y2] = corners[j]!;

			// Calculate A, B, and C for the lines passing through the corners
			const A = dy;
			const B = -dx;
			const C1 = dx * y1 - dy * x1;
			const C2 = dx * y2 - dy * x2;

			// Calculate the distance between the two parallel lines
			const distance = distanceBetweenParallelLines(A, B, C1, C2);

			// Update if this distance is the greatest so far
			if (distance > maxDistance) {
				maxDistance = distance;
				farthestLines = [corners[i]!, corners[j]!];
			}
		}
	}

	return farthestLines;
}

/**
 * Computes the dot product of two 2D vectors.
 * WILL BE POSITIVE if they roughly point in the same direction.
 */
function dotProduct(v1: Vec2, v2: Vec2): number {
	return v1[0] * v2[0] + v1[1] * v2[1];
}


/**
 * Finds the intersection points of a vector starting at a point with a bounding box.
 * SORTS THEM IN ORDER OF FIRST INTERSECTED.
 * 
 * THIS RARELY WILL MISS AN INTERSECTION. I think this is due to floating point imprecision
 * when an intersection lies exactly on the corners, but idk, because it is built to count that point.
 * @param coords - A point the line intersects.
 * @param direction - The direction of travel of the line (vector).
 * @param box - The bounding box defined by {left, right, bottom, top}.
 * @returns An array of intersection points, or an empty array if no intersections are found, along with a boolean indicating whether the intersection is in the positive direction of the vector.
 */
function findLineBoxIntersections(coords: Coords, direction: Vec2, box: BoundingBox): { coords: Coords, positiveDotProduct: boolean }[] {
	const intersections: Coords[] = [];

	// Function to check intersection with a vertical line (x = constant)
	function checkVerticalEdge(x: number): number | null {
		if (direction[0] === 0) return null; // No intersection with vertical line if no x-direction
		const t = (x - coords[0]) / direction[0];
		return coords[1] + t * direction[1]; // Calculate corresponding y
	};

	// Function to check intersection with a horizontal line (y = constant)
	function checkHorizontalEdge(y: number): number | null {
		if (direction[1] === 0) return null; // No intersection with horizontal line if no y-direction
		const t = (y - coords[1]) / direction[1];
		return coords[0] + t * direction[0]; // Calculate corresponding x
	};

	// Check intersection with the left edge (x = box.left)
	const yAtLeft = checkVerticalEdge(box.left);
	if (yAtLeft !== null && yAtLeft > box.bottom && yAtLeft < box.top) {
		intersections.push([box.left, yAtLeft]);
	}

	// Check intersection with the right edge (x = box.right)
	const yAtRight = checkVerticalEdge(box.right);
	if (yAtRight !== null && yAtRight > box.bottom && yAtRight < box.top) {
		intersections.push([box.right, yAtRight]);
	}

	// Check intersection with the bottom edge (y = box.bottom)
	const xAtBottom = checkHorizontalEdge(box.bottom);
	if (xAtBottom !== null && xAtBottom >= box.left && xAtBottom <= box.right) {
		intersections.push([xAtBottom, box.bottom]);
	}

	// Check intersection with the top edge (y = box.top)
	const xAtTop = checkHorizontalEdge(box.top);
	if (xAtTop !== null && xAtTop >= box.left && xAtTop <= box.right) {
		intersections.push([xAtTop, box.top]);
	}

	// Sort the intersections by distance along the direction of travel
	intersections.sort((a, b) => {
		const distA = (a[0] - coords[0]) * direction[0] + (a[1] - coords[1]) * direction[1]; // Dot product
		const distB = (b[0] - coords[0]) * direction[0] + (b[1] - coords[1]) * direction[1]; // Dot product
		return distA - distB;  // Sort by distance in the direction of the vector
	});

	const result = intersections.map(intersection => {
		const dotProduct = (intersection[0] - coords[0]) * direction[0] + (intersection[1] - coords[1]) * direction[1];
		return { coords: intersection, positiveDotProduct: dotProduct >= 0 };
	});

	return result;
}

/**
 * Checks if all lines are colinear aka `[[1,0],[2,0]]` would be as they are both the same direction
 */
function areLinesCollinear(lines: Vec2[]): boolean {
	let gradient: number | undefined;
	for (const line of lines) {
		const lgradient = line[1] / line[0];
		if (gradient === undefined) gradient = lgradient;
		else if (!Number.isFinite(gradient) && !Number.isFinite(lgradient)) continue;
		else if (!isAproxEqual(lgradient, gradient)) return false;
	}
	return true;
}

/**
 * Returns the key string of the coordinates: [dx,dy] => 'dx,dy'
 */
function getKeyFromVec2(vec2: Vec2): Vec2Key {
	return `${vec2[0]},${vec2[1]}`;
}

/**
 * Returns the vector from the Vec2Key: 'dx,dy' => [dx,dy]
 */
function getVec2FromKey(vec2Key: Vec2Key): Vec2 {
	return vec2Key.split(',').map(Number) as Vec2;
}

/**
 * Negates the provided length-2 vector so it points in the opposite direction
 * 
 * Non-destructive. Returns a new vector.
 */
function negateVector(vec2: Vec2): Vec2 {
	return [-vec2[0],-vec2[1]];
}

/**
 * Calculates X and Y components of a vector of given length.
 * @param vector - The direction vector [dx, dy].
 * @param length - The length of the vector.
 * @returns The x and y components of the vector.
 */
function calculateVectorComponents(vector: Vec2, length: number): Coords {
	// Normalize the direction vector
	const magnitude = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1]);
	if (magnitude === 0) throw new Error("Direction vector cannot be zero.");

	const normalizedDx = vector[0] / magnitude;
	const normalizedDy = vector[1] / magnitude;

	// Calculate the endpoint
	return [
		normalizedDx * length,
		normalizedDy * length
	];
}


// Number-Theoretic Algorithms -----------------------------------------------------------------------------------------------


/**
 * Computes the greatest common divisor (GCD) of two numbers using the Euclidean algorithm.
 */
function GCD(a: number, b: number): number {
	while (b !== 0) {
		[a, b] = [b, a % b];
	}
	return Math.abs(a); // Ensure it's always non-negative
}

/**
 * Calculates the least common multiple between all integers in an array.
 */
function LCM(array: number[]): number {
	// Copied from https://www.geeksforgeeks.org/lcm-of-given-array-elements/

	if (array.length === 0) throw Error('Array of numbers must have atleast one number to calculate the LCM.');

	// Initialize result
	let answer: number = array[0]!;

	// answer will contain the LCM of arr[0], ..arr[i] after the i'th iteration, 
	for (let i = 1; i < array.length; i++) {
		answer = ((array[i]! * answer) / GCD(array[i]!, answer)); 
	}

	return answer; 
}


// Distance Calculation ----------------------------------------------------------------------------


/**
 * Returns the euclidean (hypotenuse) distance between 2 points.
 */
function euclideanDistance(point1: Coords, point2: Coords): number { // [x,y]
	return Math.hypot(point2[0] - point1[0], point2[1] - point1[1]);
}

/**
 * Returns the manhatten distance between 2 points.
 * This is the sum of the distances between the points' x distance and y distance.
 * This is often the distance of roads, because you can't move diagonally.
 */
function manhattanDistance(point1: Coords, point2: Coords): number {
	return Math.abs(point2[0] - point1[0]) + Math.abs(point2[1] - point1[1]);
}

/**
 * Returns the chebyshev distance between 2 points.
 * This is the maximum between the points' x distance and y distance.
 * This is often used for chess pieces, because moving
 * diagonally 1 is the same distance as moving orthogonally one.
 */
function chebyshevDistance(point1: Coords, point2: Coords): number {
	return Math.max(Math.abs(point2[0] - point1[0]), Math.abs(point2[1] - point1[1]));
}


// Mathematical ---------------------------------------------------------------------------------------


/**
 * Tests if the provided value is a power of 2.
 * 
 * It does this efficiently by using bitwise operations.
 */
function isPowerOfTwo(value: number): boolean {
	return (value & (value - 1)) === 0;
}

/**
 * Returns true if the given values are approximately equal, with the most amount
 * of difference allowed being the provided epsilon value.
 * @param a - The first value.
 * @param b - The second value.
 * @param epsilon - The allowed maximum difference between `a` and `b` for them to be considered equal.
 * @returns `true` if the values are approximately equal within the epsilon tolerance, otherwise `false`.
 */
function isAproxEqual(a: number, b: number, epsilon: number = 0.000001): boolean {
	return Math.abs(a - b) < epsilon;
}

/**
 * Returns the base-10 logarithm of a given value.
 */
function getBaseLog10(value: number): number {
	return Math.log(value) / Math.log(10);
}

/**
 * Clamps a value between a minimum and a maximum value.
 * @param min - The minimum value.
 * @param max - The maximum value.
 * @param value - The value to clamp.
 * @returns The clamped value.
 */
function clamp(min: number, max: number, value: number): number {
	if (min > value) return min;
	if (max < value) return max;
	return value;
}

/**
 * Rounds a number away from zero.
 * If it's positive, it rounds up.
 * If it's negative, it rounds down.
 */
function roundAwayFromZero(value: number): number {
	return value > 0 ? Math.ceil(value) : Math.floor(value);
}

/**
 * Converts an angle in degrees to radians
 */
function degreesToRadians(angleDegrees: number): number {
	return angleDegrees * (Math.PI / 180);
}

/**
 * Rounds up the given number to the next lowest power of two.
 * 
 * Time complexity O(1), because bitwise operations are extremely fast.
 * @param num - The number to round up.
 * @returns The nearest power of two greater than or equal to the given number.
 */
function roundUpToNextPowerOf2(num: number): number {
	if (num <= 1) return 1; // Handle edge case for numbers 0 and 1
	num--; // Step 1: Decrease by 1 to handle numbers like 8
	num |= num >> 1; // Step 2: Propagate the most significant bit to the right
	num |= num >> 2;
	num |= num >> 4;
	num |= num >> 8;
	num |= num >> 16; // Additional shift for 32-bit numbers
	return num + 1; // Step 3: Add 1 to get the next power of 2
}

/**
 * Computes the positive modulus of two numbers.
 * @param a - The dividend.
 * @param b - The divisor.
 * @returns The positive remainder of the division.
 */
function posMod(a: number, b: number): number {
	return a - (Math.floor(a / b) * b);
}

/**
 * Starts with `s`, steps it by +-`progress` towards `e`, then returns that number.
 */
function moveTowards(s: number, e: number, progress: number): number {
	return s + Math.sign(e - s) * Math.min(Math.abs(e - s), progress);
}


// Easing Functions --------------------------------------------------------------------------------


/**
 * Applies an ease-in-out interpolation.
 * @param t - The interpolation factor (0 to 1).
 */
function easeInOut(t: number): number {
	return -0.5 * Math.cos(Math.PI * t) + 0.5;
}


// Exports --------------------------------------------------------------------------------------------


export default {
	calcIntersectionPointOfLines,
	getLineGeneralFormFromCoordsAndVec,
	getLineGeneralFormFrom2Coords,
	areLinesInGeneralFormEqual,
	calculateVectorFromPoints,
	getLineCFromCoordsAndVec,
	getXYComponents_FromAngle,
	roundPointToNearestGridpoint,
	boxContainsBox,
	boxContainsSquare,
	getBoxFromCoordsList,
	expandBoxToContainSquare,
	mergeBoundingBoxes,
	calcCenterOfBoundingBox,
	closestPointOnLine,
	findFarthestPointsALineSweepsABox,
	dotProduct,
	findLineBoxIntersections,
	areLinesCollinear,
	getKeyFromVec2,
	getVec2FromKey,
	negateVector,
	calculateVectorComponents,
	GCD,
	LCM,
	euclideanDistance,
	manhattanDistance,
	chebyshevDistance,
	isPowerOfTwo,
	isAproxEqual,
	getBaseLog10,
	clamp,
	roundAwayFromZero,
	degreesToRadians,
	roundUpToNextPowerOf2,
	posMod,
	moveTowards,
	easeInOut,
};

export type {
	BoundingBox,
	Vec2,
	Vec2Key,
	Vec3,
	Color
};