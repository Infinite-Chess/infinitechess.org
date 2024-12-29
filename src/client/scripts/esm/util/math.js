
"use strict";

// Custom defined types...

/**
 * A rectangle object with properties for the coordinates of its sides.
 * @typedef {Object} BoundingBox
 * @property {number} left - The x-coordinate of the left side of the box.
 * @property {number} right - The x-coordinate of the right side of the box.
 * @property {number} bottom - The y-coordinate of the bottom side of the box.
 * @property {number} top - The y-coordinate of the top side of the box.
 */

/**
 * This script contains many utility mathematical operations.
 * 
 * ZERO dependancies.
 */

/**
 * Tests if the provided value is a power of 2.
 * It does this efficiently by using bitwise operations.
 * @param {number} value 
 * @returns {boolean} true if the value is a power of 2.
 */
function isPowerOfTwo(value) {
	return (value & (value - 1)) === 0;
}

/**
 * Returns true if the given values are approximately equal, with the most amount
 * of difference allowed being the provided epsilon value.
 * @param {number} a - Value 1
 * @param {number} b - Value 2
 * @param {number} [epsilon] The custom epsilon value. Default: Number.EPSILON (~2.2 x 10^-16). Idon us's old epsilon default value: 0.001
 * @returns {boolean} true if the values are approximately equal, within the threshold.
 */
function isAproxEqual(a, b, epsilon = Number.EPSILON) { // Idon us's old epsilon default value: 0.001
	return Math.abs(a - b) < epsilon;
}

/**
 * Finds the intersection point of two lines given in the form dx * x + dy * y = c.
 * This will return `null` if there isn't one, or if there's infinite (colinear).
 * @param {number} dx1 - The coefficient of x for the first line.
 * @param {number} dy1 - The coefficient of y for the first line.
 * @param {number} c1 - The constant term for the first line.
 * @param {number} dx2 - The coefficient of x for the second line.
 * @param {number} dy2 - The coefficient of y for the second line.
 * @param {number} c2 - The constant term for the second line.
 * @returns {number[] | null} - The intersection point [x, y], or null if there isn't one, or if there's infinite.
 */
function getLineIntersection(dx1, dy1, c1, dx2, dy2, c2) {
	// Idon us's old code
	// return [
	//     ((dx2*c1)-(dx1*c2))/((dx1*dy2)-(dx2*dy1)),
	//     ((dy2*c1)-(dy1*c2))/((dx1*dy2)-(dx2*dy1))
	// ]

	// Naviary's new code
	const denominator = (dx1 * dy2) - (dx2 * dy1);
	if (denominator === 0) {
		// The lines are parallel or coincident (no single intersection point)
		return null;
	}
    
	const x = ((dx2 * c1) - (dx1 * c2)) / denominator;
	const y = ((dy2 * c1) - (dy1 * c2)) / denominator;
    
	return [x, y];
}

// Receives theta in RADIANS
function getXYComponents_FromAngle(theta) { // x & y will be between -1 & 1
	return [Math.cos(theta), Math.sin(theta)]; // When hypotenuse is 1.0
}

/**
 * Whenever you move 10,000 tiles away, the piece rendering starts to get gittery, so we generate it with an offset.
 * This function calculates that offset by rounding our coords to the nearest 10,000 by default.  returns [x,y]
 * @param {[number,number]} point 
 * @param {number} gridSize 
 * @returns {[number,number]}
 */
function roundPointToNearestGridpoint(point, gridSize) { // point: [x,y]  gridSize is width of cells, typically 10,000
	const nearestX = Math.round(point[0] / gridSize) * gridSize;
	const nearestY = Math.round(point[1] / gridSize) * gridSize;

	return [nearestX, nearestY];
}

function boxContainsBox(outerBox, innerBox) { // Boxes in the format { left, right, bottom, top }

	if (innerBox.left < outerBox.left) return false;
	if (innerBox.right > outerBox.right) return false;
	if (innerBox.bottom < outerBox.bottom) return false;
	if (innerBox.top > outerBox.top) return false;

	return true;
}

/**
 * Returns true if the provided box contains the square coordinate
 * @param {BoundingBox} box - The bounding box
 * @param {number[]} square - The coordinates of the square
 * @returns {boolean} true if the box contains the square
 */
function boxContainsSquare(box, square) { // box: { left, right, bottom, top }  square: [x,y]
	if (!square) console.log("We need a square to test if it's within this box!");
	if (typeof square[0] !== 'number') console.log("Square is of the wrong data type!");
	if (square[0] < box.left) return false;
	if (square[0] > box.right) return false;
	if (square[1] < box.bottom) return false;
	if (square[1] > box.top) return false;

	return true;
}

/**
 * Calculates the minimum bounding box that contains all the provided coordinates.
 * @param {number[][]} coordsList 
 * @returns {BoundingBox} The minimum bounding box
 */
function getBoxFromCoordsList(coordsList) { // Array of coordinates in the form [x,y]
	if (coordsList === undefined) return console.error("Coords not specified when calculating the bounding box of a coordinate list!");
	else if (coordsList.length === 0) return console.error("Cannot calculate the bounding box of 0 coordinates!");

	const box = {};
	const firstPiece = coordsList.shift(); // Removes first element
	box.left = firstPiece[0];
	box.right = firstPiece[0];
	box.bottom = firstPiece[1];
	box.top = firstPiece[1];

	// Expands the bounding box to include every piece's coordinates. Centered on the piece.
	for (const coord of coordsList) expandBoxToContainSquare(box, coord);

	return box;
}

// Expands the bounding box to include the provided coordinates, if it doesn't already
// Modifies the ORIGINAL
function expandBoxToContainSquare(box, coord) {
	if (!box) return console.error("Cannot expand an undefined box to fit a square!");
	if (!coord) return console.error("Undefined coords shouldn't be passed into math.expandBoxToContainSquare()!");

	if (coord[0] < box.left) box.left = coord[0];
	else if (coord[0] > box.right) box.right = coord[0];
	if (coord[1] < box.bottom) box.bottom = coord[1];
	else if (coord[1] > box.top) box.top = coord[1];
}
/**
 * Returns the mimimum bounding box that contains both of the provided boxes.
 * @param {BoundingBox} box1 
 * @param {BoundingBox} box2 
 * @returns {BoundingBox} The merged box
 */
function mergeBoundingBoxes(box1, box2) {
	if (!box1 || !box2) return console.error("Cannot merge 2 bounding boxes when 1+ isn't defined.");

	const mergedBox = {
		left: box1.left < box2.left ? box1.left : box2.left,
		right: box1.right > box2.right ? box1.right : box2.right,
		bottom: box1.bottom < box2.bottom ? box1.bottom : box2.bottom,
		top: box1.top > box2.top ? box1.top : box2.top,
	};
	return mergedBox;
}

/**
 * Computes the positive modulus of two numbers.
 * @param {number} a - The dividend.
 * @param {number} b - The divisor.
 * @returns {number} The positive remainder of the division.
 */
function posMod(a, b) {
	return a - (Math.floor(a / b) * b);
}

// /**
//  * ALTERNATIVE to {@link areCoordsIntegers}, if we end up having floating point imprecision problems!
//  *
//  * Checks if a number is effectively an integer considering floating point imprecision.
//  * @param {number} num - The number to check.
//  * @param {number} [epsilon=Number.EPSILON] - The tolerance for floating point imprecision.
//  * @returns {boolean} - Returns true if the number is effectively an integer, otherwise false.
//  */
// function isEffectivelyInteger(num, epsilon = Number.EPSILON) {
//     return Math.abs(num - Math.round(num)) < epsilon;
// }

/**
 * Checks if all lines are colinear aka `[[1,0],[2,0]]` would be as they are both the same direction
 * @param {number[][]} lines Array of vectors `[[1,0],[2,0]]`
 * @returns {boolean} 
 */
function areLinesCollinear(lines) {
	let gradient;
	for (const line of lines) {
		const lgradient = line[1] / line[0];
		if (!gradient) gradient = lgradient;
		if (!Number.isFinite(gradient) && !Number.isFinite(lgradient)) continue;
		if (!isAproxEqual(lgradient, gradient)) return false;
	}
	return true;
}

// Calculates if the orthogonal distance between 2 points is atleast the value
function isOrthogonalDistanceGreaterThanValue(point1, point2, value) {
	const xDiff = Math.abs(point2[0] - point1[0]);
	const yDiff = Math.abs(point2[1] - point1[1]);
	if (xDiff > value || yDiff > value) return true;
	return false;
}

function getBaseLog10(value) {
	return Math.log(value) / Math.log(10);
}

/**
 * Clamps a value between a minimum and a maximum value.
 * @param {number} min - The minimum value.
 * @param {number} max - The maximum value.
 * @param {number} value - The value to clamp.
 * @returns {number} The clamped value.
 */
function clamp(min,max,value) {
	if (min > value) return min;
	if (max < value) return max;
	return value;
}

/**
 * Returns the point on the line segment that is nearest/perpendicular to the given point.
 * @param {number[]} lineStart - The starting point of the line segment as [x, y].
 * @param {number[]} lineEnd - The ending point of the line segment as [x, y].
 * @param {number[]} point - The point to find the nearest point on the line to as [x, y].
 * @returns {Object} An object containing the proeprties `coords`, which is the closest point on our segment to our point, and the `distance` to it.
 */
function closestPointOnLine(lineStart, lineEnd, point) {
	let closestPoint;

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
 * Returns the side of the box, in english language, the line intersects with the box.
 * If {@link negateSide} is false, it will return the positive X/Y side.
 * If the line is orthogonal, it will only return top/bottom/left/right.
 * Otherwise, it will return the corner name.
 * @param {number[]} line - [dx,dy]
 * @param {boolean} negateSide 
 * @returns {string} Which side/corner the line passes through. [0,1] & false => "top"   [2,1] & true => "bottomleft"
 */
function getAABBCornerOfLine(line, negateSide) {
	let corner = "";
	v: {
		if (line[1] === 0) break v; // Horizontal so parallel with top/bottom lines
		corner += ((line[0] > 0 === line[1] > 0) === negateSide === (line[0] !== 0)) ? "bottom" : "top"; 
		// Gonna be honest I have no idea how this works but it does sooooooo its staying
	}
	h: {
		if (line[0] === 0) break h; // Vertical so parallel with left/right lines
		corner += negateSide ? "left" : "right";
	}
	return corner;
}

/**
 * Get the corner coordinate of the bounding box.
 * Will revert to top left if the corners sides aren't provided.
 * @param {BoundingBox} boundingBox 
 * @param {String} corner 
 * @returns {Number[]}
 */
function getCornerOfBoundingBox(boundingBox, corner) {
	const { left, right, top, bottom } = boundingBox;
	const yval = corner.startsWith('bottom') ? bottom : top;
	const xval = corner.endsWith('right') ? right : left;
	return [xval, yval];
}

/**
 * Returns the tile-point the line intersects, on the specified side, of the provided box.
 * DOES NOT round to nearest tile, but returns the floating point intersection.
 * @param {number} dx - X change of the line
 * @param {number} dy - Y change of the line
 * @param {number} c - The c value of the line
 * @param {BoundingBox} boundingBox - The box
 * @param {string} corner - What side/corner the line intersects, in english language. "left"/"topright"...
 * @returns {[number,number] | undefined} - The tile the line intersects, on the specified side, of the provided box, if it does intersect, otherwise undefined.
 */
function getLineIntersectionEntryTile(dx, dy, c, boundingBox, corner) {
	const { left, right, top, bottom } = boundingBox;

	// Check for intersection with left side of rectangle
	if (corner.endsWith('left')) {
		const yIntersectLeft = ((left * dy) + c) / dx;
		if (yIntersectLeft >= bottom && yIntersectLeft <= top) return [left, yIntersectLeft];
	}
    
	// Check for intersection with bottom side of rectangle
	if (corner.startsWith('bottom')) {
		const xIntersectBottom = ((bottom * dx) - c) / dy;
		if (xIntersectBottom >= left && xIntersectBottom <= right) return [xIntersectBottom, bottom];
	}

	// Check for intersection with right side of rectangle
	if (corner.endsWith('right')) {
		const yIntersectRight = ((right * dy) + c) / dx;
		if (yIntersectRight >= bottom && yIntersectRight <= top) return [right, yIntersectRight];
	}

	// Check for intersection with top side of rectangle
	if (corner.startsWith('top')) {
		const xIntersectTop = ((top * dx) - c) / dy;
		if (xIntersectTop >= left && xIntersectTop <= right) return [xIntersectTop, top];
	}

	// Doesn't intersect any tile in the box.
}

/**
 * Returns the number of steps needed to reach from startCoord to endCoord, rounded down.
 * @param {number[]} step - [dx,dy]
 * @param {number[]} startCoord - Coordinates to start on
 * @param {number[]} endCoord - Coordinate to stop at, proceeding no further
 * @returns {number} the number of steps
 */
function getLineSteps(step, startCoord, endCoord) {
	const chebyshevDist = chebyshevDistance(startCoord, endCoord);
	const stepChebyshev = Math.max(step[0], step[1]);
	return Math.floor(chebyshevDist / stepChebyshev);
}

/**
 * Returns the hypotenuse distance between the 2 points.
 * @param {number[]} point1 - `[x,y]`
 * @param {number[]} point2 - `[x,y]`
 * @returns {number} The Euclidean distance
 */
function euclideanDistance(point1, point2) { // [x,y]
	const xDiff = point2[0] - point1[0];
	const yDiff = point2[1] - point1[1];
	return Math.hypot(xDiff, yDiff);
}

/**
 * Returns the sum of the distances between the points' x distance and y distance.
 * This is often the distance of roads, because you can't move diagonally.
 * @param {number[]} point1 - `[x,y]`
 * @param {number[]} point2 - `[x,y]`
 * @returns {number} The Manhattan distance
 */
function manhattanDistance(point1, point2) {
	return Math.abs(point1[0] - point2[0]) + Math.abs(point1[1] - point2[1]);
}

/**
 * Returns the distance that is the maximum between the points' x distance and y distance.
 * This distance is often used for chess pieces, because moving diagonally 1 is the same
 * distance as moving orthogonally one.
 * @param {number[]} point1 - `[x,y]`
 * @param {number[]} point2 - `[x,y]`
 * @returns {number} The Chebyshev distance
 */
function chebyshevDistance(point1, point2) {
	const xDistance = Math.abs(point1[0] - point2[0]);
	const yDistance = Math.abs(point1[1] - point2[1]);
	return Math.max(xDistance, yDistance);
}

function toRadians(angleDegrees) {
	return angleDegrees * (Math.PI / 180);
}

function roundAwayFromZero(value) {
	return value > 0 ? Math.ceil(value) : Math.floor(value);
}

// Can be used to generate pseudo-random numbers.
// When called as a CONSTRUCTOR (ie new PseudoRandomGenerator()), it returns an object
// with properties set by the "this" command within!
// THIS NEEDS TO BE CHANGED to match the server-side pseudoRandomGenerator, because we use this generator
// to determine the KEY of our moves, so the server knows we aren't cheating!
function PseudoRandomGenerator(seed) {
	const a = 16807;
	const c = 2491057;
	// const b = 2147483647;
	// Making the id never greater than this means that there will never be arithmetic rounding with too high numbers!
	const b = 8388607;

	let previous = seed;

	this.nextInt = function() {
		const next = (previous * a + c) % b;
		previous = next;
		return next; // 0 - 2147483647
	};

	this.nextFloat = function() {
		const next = (previous * a + c) % b;
		previous = next;
		return next / b; // 0-1
	};
}

function decimalToPercent(decimal) {
	// Multiply by 100 to convert to percentage, then round
	const percent = Math.round(decimal * 100);
    
	// Convert the rounded percentage to a string with a percentage sign
	return percent.toString() + "%";
}

/**
 * Get the GCD of two numbers
 * Copied from https://www.geeksforgeeks.org/gcd-greatest-common-divisor-practice-problems-for-competitive-programming/
 * @param {Number} a 
 * @param {Number} b
 * @returns {Number} 
 */
function GCD(a, b) {
	if (b === 0) {
		return a;
	} else {
		return GCD(b, a % b);
	}
}

/**
 * Get the LCM of an array
 * Copied from https://www.geeksforgeeks.org/lcm-of-given-array-elements/
 * @param {Number[]} arr
 */
function LCM(arr) {
	// Initialize result 
	let ans = arr[0]; 

	// ans contains LCM of arr[0], ..arr[i] 
	// after i'th iteration, 
	for (let i = 1; i < arr.length; i++) 
		ans = (((arr[i] * ans)) / 
                (GCD(arr[i], ans))); 

	return ans; 
}

/**
 * Rounds up the given number to the nearest power of two.
 * @param {number} num - The number to round up.
 * @returns {number} - The nearest power of two greater than or equal to the given number.
 */
function roundUpToPowerOf2(num) {
	if (num <= 0) throw new Error("Input must be a positive number.");
	return Math.pow(2, Math.ceil(Math.log2(num)));
}

export default {
	isPowerOfTwo,
	isAproxEqual,
	getLineIntersection,
	getXYComponents_FromAngle,
	roundPointToNearestGridpoint,
	boxContainsBox,
	boxContainsSquare,
	posMod,
	areLinesCollinear,
	isOrthogonalDistanceGreaterThanValue,
	getBaseLog10,
	clamp,
	closestPointOnLine,
	getAABBCornerOfLine,
	getCornerOfBoundingBox,
	getLineIntersectionEntryTile,
	getLineSteps,
	euclideanDistance,
	manhattanDistance,
	chebyshevDistance,
	toRadians,
	roundAwayFromZero,
	PseudoRandomGenerator,
	decimalToPercent,
	mergeBoundingBoxes,
	getBoxFromCoordsList,
	expandBoxToContainSquare,
	GCD,
	LCM,
	roundUpToPowerOf2,
};