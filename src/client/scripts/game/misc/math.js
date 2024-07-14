
/*
 * This script contains many utility mathematical operations, and javascript 
 * object functions, we've created for the game and its variables.
 * 
 * Many deal with coordinates, or bounding boxes.
 * 
 * In theory, should should have ZERO dependancies.
 */

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

const math = (function() {

    function isPowerOfTwo(value) {
        return (value & (value - 1)) === 0;
    }

    function isAproxEqual(a, b, epsilon) {
        if (epsilon == null) {
            epsilon = 0.001;
        }
        return Math.abs(a-b)<epsilon
    }


    function getLineIntersection(dx1,dy1,c1,dx2,dy2,c2) {
        return [
            ((dx2*c1)-(dx1*c2))/((dx1*dy2)-(dx2*dy1)),
            ((dy2*c1)-(dy1*c2))/((dx1*dy2)-(dx2*dy1))
        ]

    }

    // Receives theta in RADIANS
    function getXYComponents_FromAngle (theta) { // x & y will be between -1 & 1
        return [Math.cos(theta), Math.sin(theta)]; // When hypotenuse is 1.0
    }

    // Whenever you move 10,000 tiles away, the piece rendering starts to get gittery, so we generate it with an offset.
    // This function calculates that offset by rounding our coords to the nearest 10,000 by default.  returns [x,y]
    function roundPointToNearestGridpoint (point, gridSize) { // point: [x,y]  gridSize is width of cells, typically 10,000
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
        if (!square) console.log("We need a square to test if it's within this box!")
        if (typeof square[0] !== 'number') console.log("Square is of the wrong data type!")

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
        if (coordsList == null) return console.error("Coords not specified when calculating the bounding box of a coordinate list!")
        else if (coordsList.length === 0) return console.error("Cannot calculate the bounding box of 0 coordinates!")

        const box = {};
        const firstPiece = coordsList.shift() // Removes first element
        box.left = firstPiece[0]
        box.right = firstPiece[0]
        box.bottom = firstPiece[1]
        box.top = firstPiece[1]

        // Expands the bounding box to include every piece's coordinates. Centered on the piece.
        for (const coord of coordsList) expandBoxToContainSquare(box, coord)

        return box;
    }

    // Expands the bounding box to include the provided coordinates, if it doesn't already
    // Modifies the ORIGINAL
    function expandBoxToContainSquare(box, coord) {
        if (!box) return console.error("Cannot expand an undefined box to fit a square!")
        if (!coord) return console.error("Undefined coords shouldn't be passed into math.expandBoxToContainSquare()!");

        if (coord[0] < box.left) box.left = coord[0]
        else if (coord[0] > box.right) box.right = coord[0]
        if (coord[1] < box.bottom) box.bottom = coord[1]
        else if (coord[1] > box.top) box.top = coord[1]
    }
    /**
     * Returns the mimimum bounding box that contains both of the provided boxes.
     * @param {BoundingBox} box1 
     * @param {BoundingBox} box2 
     * @returns {BoundingBox} The merged box
     */
    function mergeBoundingBoxes(box1, box2) {
        if (!box1 || !box2) return console.error("Cannot merge 2 bounding boxes when 1+ isn't defined.")

        const mergedBox = {
            left: box1.left < box2.left ? box1.left : box2.left,
            right: box1.right > box2.right ? box1.right : box2.right,
            bottom: box1.bottom < box2.bottom ? box1.bottom : box2.bottom,
            top: box1.top > box2.top ? box1.top : box2.top,
        }
        return mergedBox;
    }
    /**
     * Calculates the bounding box of the board visible on screen,
     * when the camera is at the specified position.
     * This is different from the bounding box of the canvas, because
     * this is effected by the camera's scale (zoom) property.
     * 
     * Returns in float form. To round away from the origin to encapsulate
     * the whole of all tiles atleast partially visible, further use {@link board.roundAwayBoundingBox}
     * @param {number[]} [position] - The position of the camera.
     * @param {number} [scale] - The scale (zoom) of the camera.
     * @returns {BoundingBox} The bounding box
     */
    function getBoundingBoxOfBoard(position = movement.getBoardPos(), scale = movement.getBoardScale()) {

        const distToHorzEdgeDivScale = camera.getScreenBoundingBox().right / scale

        const left = position[0] - distToHorzEdgeDivScale
        const right = position[0] + distToHorzEdgeDivScale

        const distToVertEdgeDivScale = camera.getScreenBoundingBox().top / scale

        const bottom = position[1] - distToVertEdgeDivScale
        const top = position[1] + distToVertEdgeDivScale

        return { left, right, bottom, top }
    }

    /**
     * Uses the calculation of ax + by = c
     * c=b*y-intercept so is unique for each line
     * Not unique when step can be factored
     * eg [2,2]
     * @param {number[]} step The gradient
     * @param {number[]} coords 
     * @returns {number} integer c
     */
    function getLineFromCoords(step, coords) {
        return step[0]*coords[1]-step[1]*coords[0]
    }

    /**
     * Gets a unique key from the line equation.
     * Compatable with factorable steps like `[2,2]`.
     * @param {Number[]} step Line step `[deltax,deltay]`
     * @param {Number[]} coords `[x,y]`
     * @returns {String} the key `id|intercept`
     */
    function getKeyFromLine(step, coords) {
        const lineIsVertical = step[0]===0;
        const deltaAxis = lineIsVertical ? step[1] : step[0];
        const coordAxis = lineIsVertical ? coords[1] : coords[0];
        return `${getLineFromCoords(step,coords)}|${coordAxis - (Math.floor(coordAxis / deltaAxis) * deltaAxis)}`
    }

    /**
     * TODO: implement this
     * @param {Number[][]} lines 
     * @returns {Boolean}
     */

    function areLinesCollinear(lines) {
        return false
    }

    /**
     * Deep copies an entire object, no matter how deep its nested.
     * No properties will contain references to the source object.
     * Use this instead of structuredClone() when that throws an error due to nested functions.
     * 
     * SLOW. Avoid using for very massive objects.
     * @param {Object | string | number | bigint | boolean} src - The source object
     * @returns {Object | string | number | bigint | boolean} The copied object
     */
    function deepCopyObject(src) {
        if (typeof src !== "object" || src === null) return src;
        
        let copy = Array.isArray(src) ? [] : {}; // Create an empty array or object
        
        for (let key in src) {
            const value = src[key];
            copy[key] = deepCopyObject(value); // Recursively copy each property
        }
        
        return copy; // Return the copied object
    }

    /**
     * Deep copies a Float32Array.
     * @param {Float32Array} src - The source Float32Array
     * @returns {Float32Array} The copied Float32Array
     */
    function copyFloat32Array(src) {
        if (!src || !(src instanceof Float32Array)) {
          throw new Error('Invalid input: must be a Float32Array');
        }
      
        const copy = new Float32Array(src.length);
      
        for (let i = 0; i < src.length; i++) {
          copy[i] = src[i];
        }
      
        return copy;
    }

    /**
     * Returns the key string of the coordinates: [x,y] => 'x,y'
     * @param {number[]} coords - The coordinates
     * @returns {string} The key
     */
    // Receives coords, returns it's key to access it in game.getGamefile().piecesOrganizedByKey object.
    function getKeyFromCoords (coords) {
        return `${coords[0]},${coords[1]}`
    }

    /**
     * Returns a length-2 array of the provided coordinates
     * @param {string} key - 'x,y'
     * @return {number[]} The coordinates of the piece, [x,y]
     */
    function getCoordsFromKey(key) {
        // const coords = key.split(',');
        // return [parseInt(coords[0]), parseInt(coords[1])];

        // ChatGPT's method!
        return key.split(',').map(Number);
    }

    // Calculates if the orthogonal distance between 2 points is atleast the value
    function isOrthogonalDistanceGreaterThanValue(point1, point2, value) {
        const xDiff = Math.abs(point2[0] - point1[0])
        const yDiff = Math.abs(point2[1] - point1[1])
        if (xDiff > value || yDiff > value) return true
        return false
    }

    function getBaseLog10(value) {
        return Math.log(value) / Math.log(10);
    }

    function convertWorldSpaceToCoords(worldCoords) {

        const boardPos = movement.getBoardPos();
        const boardScale = movement.getBoardScale();
        const xCoord = worldCoords[0] / boardScale + boardPos[0]
        const yCoord = worldCoords[1] / boardScale + boardPos[1]

        return [xCoord, yCoord]
    }

    function convertWorldSpaceToCoords_Rounded(worldCoords) {

        const boardPos = movement.getBoardPos();
        const boardScale = movement.getBoardScale();
        const xCoord = worldCoords[0] / boardScale + boardPos[0]
        const yCoord = worldCoords[1] / boardScale + boardPos[1]

        const squareCenter = board.gsquareCenter();
        return [Math.floor(xCoord + squareCenter), Math.floor(yCoord + squareCenter)]
    }

    // Takes a square coordinate, returns the world-space location of the square's VISUAL center! Dependant on board.gsquareCenter().
    function convertCoordToWorldSpace(coords, position = movement.getBoardPos(), scale = movement.getBoardScale()) {

        const worldX = (coords[0] - position[0] + 0.5 - board.gsquareCenter()) * scale;
        const worldY = (coords[1] - position[1] + 0.5 - board.gsquareCenter()) * scale;

        return [worldX, worldY]
    }

    // Returns [x,y], primed to add to buffer data.
    // This function is used to calculate highlightline buffer data!
    // It works by, if the coord is off screen, snapping it to the nearest screen edge! 
    // We can't render arbitrarily far so let's stop at the edge of the screen.
    function convertCoordToWorldSpace_ClampEdge(coords) {

        const boardPos = movement.getBoardPos();
        const boardScale = movement.getBoardScale();
        let worldX = (coords[0] - boardPos[0] + 0.5 - board.gsquareCenter()) * boardScale;
        let worldY = (coords[1] - boardPos[1] + 0.5 - board.gsquareCenter()) * boardScale;

        const inPerspective = perspective.getEnabled();

        const a = perspective.distToRenderBoard
        /** @type {BoundingBox} */
        const boundingBox = inPerspective ? { left: -a, right: a, bottom: -a, top: a } : camera.getScreenBoundingBox(false)

        if      (worldX < boundingBox.left)  worldX = inPerspective ? -perspective.distToRenderBoard : camera.getScreenBoundingBox(false).left;
        else if (worldX > boundingBox.right) worldX = inPerspective ? perspective.distToRenderBoard : camera.getScreenBoundingBox(false).right;
        if      (worldY < boundingBox.bottom)  worldY = inPerspective ? -perspective.distToRenderBoard : camera.getScreenBoundingBox(false).bottom;
        else if (worldY > boundingBox.top) worldY = inPerspective ? perspective.distToRenderBoard : camera.getScreenBoundingBox(false).top;

        return [worldX, worldY]
    }

    // fast clampfunc
    function clamp(min,max,value) {
        if (min>value) return min;
        if (max<value) return max;
        return value
    }

    // Returns the point on the line segment that is nearest/perpendicular to the given point.
    function closestPointOnLine (lineStart, lineEnd, point) {

        let closestPoint;
        let distance;

        const dx = lineEnd[0] - lineStart[0];
        const dy = lineEnd[1] - lineStart[1];

        if (dx === 0) {
            closestPoint = [lineStart[0], clamp(lineStart[1], lineEnd[1], point[1])]
        } else {

            const m = dy / dx;
            const b = lineStart[1] - m * lineStart[0];
        
            // Calculate x and y coordinates of closest point on line
            let x = (m * (point[1] - b) + point[0]) / (m * m + 1);
            x = clamp(lineStart[0],lineEnd[0],x)
            const y = m * x + b;

            closestPoint = [x,y];
        }

        distance = euclideanDistance(closestPoint, point)

        return {
            coords: closestPoint,
            distance: distance
        }
    }

    function convertPixelsToWorldSpace_Virtual(value) {
        return (value / camera.getCanvasHeightVirtualPixels()) * (camera.getScreenBoundingBox(false).top - camera.getScreenBoundingBox(false).bottom)
    }

    function convertWorldSpaceToPixels_Virtual(value) {
        return (value / (camera.getScreenBoundingBox(false).top - camera.getScreenBoundingBox(false).bottom)) * camera.getCanvasHeightVirtualPixels()
    }

    function getAABBCornerOfLine(line, leftSide) {
        let corner = "";
        v: {
            if (line[0]==0) break v; // Horizontal so parallel with top/bottom lines
            corner += ((line[0]>0==line[1]>0)==leftSide) ? "bottom" : "top"
        }
        h: {
            if (line[1]==0) break h; // Vertical so parallel with left/right lines
            corner += leftSide ? "left" : "right"
        }
        return corner;
    }

    function getLineIntersectionEntryTile (ax, by, c, boundingBox, corner) {
        const { left, right, top, bottom } = boundingBox;
        let xIntersectBottom = undefined;
        let xIntersectTop = undefined;
        let yIntersectLeft = undefined;
        let yIntersectRight = undefined;
        // Check for intersection with left side of rectangle
        if (corner.endsWith('left')) {
            yIntersectLeft = ((left * ax) + c) / by;
            if (yIntersectLeft >= bottom && yIntersectLeft <= top) return [left, yIntersectLeft]
        }
        
        // Check for intersection with bottom side of rectangle
        if (corner.startsWith('bottom')) {
            xIntersectBottom = (c - (bottom * by)) / ax;
            if (xIntersectBottom >= left && xIntersectBottom <= right) return [xIntersectBottom, bottom]
        }

        // Check for intersection with right side of rectangle
        if (corner.endsWith('right')) {
            yIntersectRight = ((right * ax) + c) / by;
            if (yIntersectRight >= bottom && yIntersectRight <= top) return [right, yIntersectRight];
        }

        // Check for intersection with top side of rectangle
        if (corner.startsWith('top')) {
            xIntersectTop = (c - (top * by)) / ax;
            if (xIntersectTop >= left && xIntersectTop <= right) return [xIntersectTop, top];
        }
        console.log(corner)
        console.log(boundingBox)
        console.log(xIntersectBottom, xIntersectTop, yIntersectLeft, yIntersectRight)
    }

    // Returns point, if there is one, of a line with specified slope "b" intersection screen edge on desired corner
    function getIntersectionEntryTile (slope, b, boundingBox, corner) { // corner: "topright"/"bottomright"...
        const { left, right, top, bottom } = boundingBox;
        
        // Check for intersection with left side of rectangle
        if (corner.endsWith('left')) {
            const yIntersectLeft = left * slope + b;
            if (yIntersectLeft >= bottom && yIntersectLeft <= top) return [left, yIntersectLeft]
        }
        
        // Check for intersection with bottom side of rectangle
        if (corner.startsWith('bottom')) {
            const xIntersectBottom = (bottom - b) * slope;
            if (xIntersectBottom >= left && xIntersectBottom <= right) return [xIntersectBottom, bottom]
        }

        // Check for intersection with right side of rectangle
        if (corner.endsWith('right')) {
            const yIntersectRight = right * slope + b;
            if (yIntersectRight >= bottom && yIntersectRight <= top) return [right, yIntersectRight];
        }

        // Check for intersection with top side of rectangle
        if (corner.startsWith('top')) {
            const xIntersectTop = (top - b) * slope;
            if (xIntersectTop >= left && xIntersectTop <= right) return [xIntersectTop, top];
        }
    }

    function convertWorldSpaceToGrid(value) {
        return value / movement.getBoardScale()
    }
    
    /**
     * Returns the hypotenuse distance between the 2 points.
     * @param {number[]} point1 - `[x,y]`
     * @param {number[]} point2 - `[x,y]`
     * @returns {number} The Euclidean distance
     */
    function euclideanDistance(point1, point2) { // [x,y]
        const xDiff = point2[0] - point1[0]
        const yDiff = point2[1] - point1[1]
        return Math.hypot(xDiff, yDiff)
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

    function toRadians(angleDegrees) { return angleDegrees * (Math.PI / 180); }

    /**
     * Returns the expected render range bounding box when we're in perspective mode.
     * @param {number} rangeOfView - The distance in tiles (when scale is 1) to render the legal move fields in perspective mode.
     * @returns {BoundingBox} The perspective mode render range bounding box
     */
    function generatePerspectiveBoundingBox(rangeOfView) { // ~18

        const coords = movement.getBoardPos();
        const renderDistInSquares = rangeOfView / movement.getBoardScale();

        return {
            left: coords[0] - renderDistInSquares,
            right: coords[0] + renderDistInSquares,
            bottom: coords[1] - renderDistInSquares,
            top: coords[1] + renderDistInSquares,
        }
    }

    /**
     * Returns true if the coordinates are equal
     * @param {number[]} coord1 [x,y]
     * @param {number[]} coord2 [x,y]
     * @returns {boolean} Whether the coordinates are equal
     */
    function areCoordsEqual(coord1, coord2) {
        if (!coord2 || !coord2) return false; // One undefined, can't be equal
        return coord1[0] === coord2[0] && coord1[1] === coord2[1]
    }

    function areCoordsEqual_noValidate(coord1, coord2) {
        return coord1[0] === coord2[0] && coord1[1] === coord2[1];
    }

    // Assumes the sortedArray DOES NOT contain the value!
    function binarySearch_findSplitPoint(sortedArray, value) {
        if (value == null) throw new Error(`Cannot binary search when value is null! ${value}`)

        let left = 0;
        let right = sortedArray.length - 1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const midValue = sortedArray[mid];

            if (value < midValue) right = mid - 1;
            else if (value > midValue) left = mid + 1;
            else if (midValue === value) {
                throw new(`Cannot find split point of sortedArray when it already contains the value! ${value}. List: ${JSON.stringify(sortedArray)}`)
            }
        }

        // The left is the index at which you could insert the new value at the correct location!
        return left;
    }

    // Returns the index at which you could insert the value and keep it organized,
    // OR returns the index of the value!
    function binarySearch_findValue(sortedArray, value) {
        if (value == null) return console.error(`Cannot binary search when value is null! ${value}`)

        let left = 0;
        let right = sortedArray.length - 1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const midValue = sortedArray[mid];

            if (value < midValue) right = mid - 1;
            else if (value > midValue) left = mid + 1;
            else if (midValue === value) return mid;
        }

        // The left is the index at which you could insert the new value at the correct location!
        return left;
    }

    // Returns the index if deletion was successful.
    // false if not found
    function deleteValueFromOrganizedArray(sortedArray, value) { // object can't be an array

        let left = 0;
        let right = sortedArray.length - 1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const midValue = sortedArray[mid];

            if (value === midValue) {
                sortedArray.splice(mid, 1);
                return mid;
            } else if (value < midValue) { // Set the new left
                right = mid - 1;
            } else if (value > midValue) {
                left = mid + 1;
            }
        }
    }

    /**
     * Makes a deep copy of the provided coordinates
     * @param {number[]} coords - [x,y]
     * @returns Copied coords
     */
    function copyCoords(coords) {
        return [coords[0], coords[1]]
    }

    function roundAwayFromZero(value) {
        return value > 0 ? Math.ceil(value) : Math.floor(value);
    }

    /**
     * Returns the color of the provided piece type
     * @param {string} type - The type of the piece (e.g., "pawnsW")
     * @returns {string | undefined} The color of the piece, "white", "black", or "neutral", or undefined if not valid
     */
    function getPieceColorFromType(type) {
        // If the last letter of the piece type is 'W', the piece is white.
        if (type.endsWith('W')) return "white"
        else if (type.endsWith('B')) return "black"
        else if (type.endsWith('N')) return "neutral"
        else throw new Error(`Cannot get the color of piece with type ${pieceType}`)
    }

    /**
     * Returns the opposite color of the color provided.
     * @param {string} color - "White" / "Black"
     * @returns {string} The opposite color, "White" / "Black"
     */
    function getOppositeColor(color) {
        if (color === 'white') return 'black';
        else if (color === 'black') return 'white';
        else throw new Error(`Cannot return the opposite color of color ${color}!`)
    }

    // REQUIRES the type of piece to be valid, and have a W or B at the end!
    function getWorBFromType(type) {
        return type.charAt(type.length - 1);
    }

    function getWorBFromColor(color) {
        if (color === 'white') return 'W';
        else if (color === 'black') return 'B';
        else if (color === 'neutral') return 'N';
        else throw new Error(`Cannot return WorB from strange color ${color}!`)
    }

    /**
     * Trims the W, B, or N from the end of the piece type. "pawnsW" => "pawns"
     * @param {string} type - The type of piece (eg "pawnsW").
     * @returns {string} The trimmed type.
     */
    function trimWorBFromType(type) {
        return type.slice(0, -1); // Returns a new string that starts from the first character (index 0) and excludes the last character (because of -1).
    }

    // Returns true if provided object is a float32array
    function isFloat32Array(param) {
        return param instanceof Float32Array;
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
            const next = (previous * a + c) % b
            previous = next;
            return next; // 0 - 2147483647
        };

        this.nextFloat = function() {
            const next = (previous * a + c) % b
            previous = next;
            return next / b; // 0-1
        }
    }

    function decimalToPercent(decimal) {
        // Multiply by 100 to convert to percentage, then round
        const percent = Math.round(decimal * 100);
      
        // Convert the rounded percentage to a string with a percentage sign
        return percent.toString() + "%";
    }

    /**
     * Copies the properties from one object to another,
     * without overwriting the existing properties on the destination object.
     * @param {Object} objSrc - The source object
     * @param {Object} objDest - The destination object
     */
    function copyPropertiesToObject(objSrc, objDest) {
        const objSrcKeys = Object.keys(objSrc);
        for (let i = 0; i < objSrcKeys.length; i++) {
            const key = objSrcKeys[i];
            objDest[key] = objSrc[key];
        }
    }

    /**
     * O(1) method of checking if an object/dict is empty
     * @param {Object} obj 
     * @returns {Boolean}
     */
    function isEmpty(obj) {
        for (var prop in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, prop)) {
                return false;
            }
        }
        
        return true
    }

    /**
     * Tests if a string is in valid JSON format, and can thus be parsed into an object.
     * @param {string} str - The string to test
     * @returns {boolean} *true* if the string is in valid JSON fromat
     */
    function isJson(str) {
        try {
            JSON.parse(str);
        } catch (e) {
            return false;
        }
        return true;
    }

    /**
     * Returns a new object with the keys being the values of the provided object, and the values being the keys.
     * @param {Object} obj - The object to invert
     * @returns {Object} The inverted object
     */
    function invertObj(obj) {
        let inv = {};
        for(let key in obj){
            inv[obj[key]] = key;
        }
        return inv;
    }
    
    /**
     * Converts a date and time string in the format `YYYY/MM/DD HH:MM:SS` to a UTC timestamp.
     * @param {string} dateTimeString - The date and time string.
     * @returns {number} The timestamp in milliseconds since the Unix epoch.
     */
    function getUTCTimestamp(dateTimeString) {
        const [datePart, timePart] = dateTimeString.split(' ');
        const [year, month, day] = datePart.split('/').map(num => parseInt(num, 10));
        const [hours, minutes, seconds] = timePart.split(':').map(num => parseInt(num, 10));
        
        // Constructing a Date object from the parts
        const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
        
        // Return the timestamp in milliseconds
        return date.getTime();
    }

    /**
     * Capitalizes the first letter of the string.
     * @param {string} str - Thes tring
     * @returns 
     */
    function capitalizeFirstLetter(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Generates a random ID of the provided length, with the characters 0-9 and a-z.
     * @param {number} length - The length of the desired ID
     * @returns {string} The ID
     */
    function generateID(length) {
        let result           = '';
        const characters       = '0123456789abcdefghijklmnopqrstuvwxyz';
        const charactersLength = characters.length;
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.random() * charactersLength); // Coerc to an int
        }
        return result;
    }

    /**
     * Generates a **UNIQUE** ID of the provided length, with the characters 0-9 and a-z.
     * The provided object should contain the keys of the existing IDs.
     * @param {number} length - The length of the desired ID
     * @param {Object} object - The object that contains keys of the existing IDs.
     * @returns {string} The ID
     */
    function genUniqueID(length, object) { // object contains the key value list where the keys are the ids we want to not have duplicates of.
        let id;
        do {
            id = generateID(length);
        } while (object[id] != null)
        return id;
    }

    /**
     * Generates a random numeric ID of the provided length, with the numbers 0-9.
     * @param {number} length - The length of the desired ID
     * @returns {number} The ID
     */
    function generateNumbID(length) {
        const zeroOne = Math.random();
        const multiplier = 10 ** length;
        return Math.floor(zeroOne * multiplier);
    }
    
    // Removes specified object from given array. Throws error if it fails. The object cannot be an object or array, only a single value.
    function removeObjectFromArray(array, object) { // object can't be an array
        const index = array.indexOf(object);
        if (index !== -1) array.splice(index, 1)
        else throw new Error(`Could not delete object from array, not found! Array: ${JSON.stringify(array)}. Object: ${object}`)
    }

    /**
     * Converts minutes to milliseconds
     * @param {number} minutes 
     * @returns {number} Milliseconds
     */
    function minutesToMillis(minutes) { return minutes * 60 * 1000; }

    /**
     * Converts seconds to milliseconds
     * @param {number} seconds 
     * @returns {number} Milliseconds
     */
    function secondsToMillis(seconds) { return seconds * 1000; }

    /**
     * Returns the date and time in UTC in the format `YYYY/MM/DD HH:MM:SS`.
     * If a timestamp is provided, it will be used; otherwise, the current date and time will be used.
     * Useful for recording the `Date` metadata of new games.
     * @param {number} [timestamp] - Optional. The timestamp in milliseconds. Defaults to the current time if not provided.
     * @returns {string} The date and time in the format `YYYY/MM/DD HH:MM:SS`.
     */
    function getUTCDateTime(timestamp) {
        const currentDate = timestamp ? new Date(timestamp) : new Date();
        
        const year = currentDate.getUTCFullYear();
        const month = ('0' + (currentDate.getUTCMonth() + 1)).slice(-2); // Adding 1 because months are zero-based
        const day = ('0' + currentDate.getUTCDate()).slice(-2);
        const hours = ('0' + currentDate.getUTCHours()).slice(-2);
        const minutes = ('0' + currentDate.getUTCMinutes()).slice(-2);
        const seconds = ('0' + currentDate.getUTCSeconds()).slice(-2);
        
        return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
    }

    /**
     * Calculates the total milliseconds based on the provided options.
     * @param {Object} options - An object containing time units and their values.
     * @param {number} [options.milliseconds=0] - The number of milliseconds.
     * @param {number} [options.seconds=0] - The number of seconds.
     * @param {number} [options.minutes=0] - The number of minutes.
     * @param {number} [options.hours=0] - The number of hours.
     * @param {number} [options.days=0] - The number of days.
     * @param {number} [options.weeks=0] - The number of weeks.
     * @param {number} [options.months=0] - The number of months.
     * @param {number} [options.years=0] - The number of years.
     * @returns {number} The total milliseconds calculated from the provided options.
     */
    function getTotalMilliseconds(options) {
        const millisecondsIn = {
            milliseconds: 1,
            seconds: 1000,
            minutes: 1000 * 60,
            hours: 1000 * 60 * 60,
            days: 1000 * 60 * 60 * 24,
            weeks: 1000 * 60 * 60 * 24 * 7,
            months: 1000 * 60 * 60 * 24 * 30, // Approximation, not precise
            years: 1000 * 60 * 60 * 24 * 365, // Approximation, not precise
        };
    
        let totalMilliseconds = 0;
    
        for (const option in options) {
            if (millisecondsIn[option]) totalMilliseconds += options[option] * millisecondsIn[option];
        }
    
        return totalMilliseconds;
    }

    return Object.freeze({
        isPowerOfTwo,
        isAproxEqual,
        getLineIntersection,
        getXYComponents_FromAngle,
        removeObjectFromArray,
        roundPointToNearestGridpoint,
        boxContainsBox,
        boxContainsSquare,
        getLineFromCoords,
        getKeyFromLine,
        areLinesCollinear,
        deepCopyObject,
        getKeyFromCoords,
        getCoordsFromKey,
        isOrthogonalDistanceGreaterThanValue,
        getBaseLog10,
        convertWorldSpaceToCoords,
        convertWorldSpaceToCoords_Rounded,
        convertCoordToWorldSpace,
        convertCoordToWorldSpace_ClampEdge,
        closestPointOnLine,
        getBoundingBoxOfBoard,
        convertPixelsToWorldSpace_Virtual,
        convertWorldSpaceToPixels_Virtual,
        getAABBCornerOfLine,
        getLineIntersectionEntryTile,
        getIntersectionEntryTile,
        convertWorldSpaceToGrid,
        euclideanDistance,
        manhattanDistance,
        chebyshevDistance,
        generateID,
        generateNumbID,
        toRadians,
        generatePerspectiveBoundingBox,
        areCoordsEqual,
        areCoordsEqual_noValidate,
        binarySearch_findSplitPoint,
        binarySearch_findValue,
        deleteValueFromOrganizedArray,
        copyCoords,
        roundAwayFromZero,
        getPieceColorFromType,
        getOppositeColor,
        getWorBFromType,
        getWorBFromColor,
        trimWorBFromType,
        isFloat32Array,
        PseudoRandomGenerator,
        decimalToPercent,
        copyPropertiesToObject,
        copyFloat32Array,
        mergeBoundingBoxes,
        getBoxFromCoordsList,
        expandBoxToContainSquare,
        isEmpty,
        isJson,
        invertObj,
        getUTCDateTime,
        getUTCTimestamp,
        capitalizeFirstLetter,
        minutesToMillis,
        secondsToMillis,
        getTotalMilliseconds,
        genUniqueID
    });
})();