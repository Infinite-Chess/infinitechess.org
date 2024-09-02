
// Import Start
import board from './board.js';
import pieces from './pieces.js';
import movement from './movement.js';
import perspective from './perspective.js';
import buffermodel from './buffermodel.js';
// Import End

/**
 * Type Definitions
 * @typedef {import('./buffermodel.js').BufferModel} BufferModel
 */

"use strict";

/**
 * This script contains methods for obtaining the vertex data
 * of many common shapes.
 * This vertex data can then be used in the construction
 * of a buffer model for rendering.
 */
const bufferdata = (function() {

    // Coordinate data...

    // Returns coord data of piece WITHOUT the offset of the pieces model,
    // and without needing uniform translations before rendering.
    function getCoordDataOfTile(coords) {
        const boardPos = movement.getBoardPos();
        const boardScale = movement.getBoardScale();
        const startX = (coords[0] - board.gsquareCenter() - boardPos[0]) * boardScale;
        const startY = (coords[1] - board.gsquareCenter() - boardPos[1]) * boardScale;
        const endX = startX + /* 1 * */ boardScale;
        const endY = startY + /* 1 * */ boardScale;

        return {
            startX,
            startY,
            endX,
            endY
        };
    }

    /**
     * Returns the coordinate data of the piece, shifted in the negative direction of the offset.
     * @param {number[]} offset - The offset: `[x,y]`
     * @param {number[]} coords - The coordinate of the piece
     * @returns {Object} The coordinate data: `{ startX, startY, endX, endY }`
     */
    function getCoordDataOfTile_WithOffset(offset, coords) {
        const startX = coords[0] - board.gsquareCenter() - offset[0];
        const startY = coords[1] - board.gsquareCenter() - offset[1];
        const endX = startX + 1;
        const endY = startY + 1;

        return {
            startX,
            startY,
            endX,
            endY
        };
    }

    // Takes a bounding box in grid-space, converts it to screen/world-space.
    // Useful for rendering the outline of area we're rendering (dev-mode)
    function getCoordDataOfTileBoundingBox(boundingBox) { // { left, right, bottom, top }
        const boardPos = movement.getBoardPos();
        const boardScale = movement.getBoardScale();
        const startX = (boundingBox.left - boardPos[0] - board.gsquareCenter()) * boardScale;
        const endX = (boundingBox.right - boardPos[0] + 1 - board.gsquareCenter()) * boardScale;
        const startY = (boundingBox.bottom - boardPos[1] - board.gsquareCenter()) * boardScale;
        const endY = (boundingBox.top - boardPos[1] + 1 - board.gsquareCenter()) * boardScale;

        return { startX, startY, endX, endY };
    }

    // Texture data...

    function getTexDataOfType(type, rotation = 1) {
        const texLocation = pieces.getSpritesheetDataTexLocation(type);
        const texWidth = pieces.getSpritesheetDataPieceWidth();

        const texStartX = texLocation[0];
        const texStartY = texLocation[1];

        if (rotation === 1) return { // Regular rotation
            texStartX,
            texStartY,
            texEndX: texStartX + texWidth,
            texEndY: texStartY + texWidth
        };

        return { // Inverted rotation
            texStartX: texStartX + texWidth,
            texStartY: texStartY + texWidth,
            texEndX: texStartX,
            texEndY: texStartY
        };
    }

    // Quads...

    function getDataQuad_Color(startX, startY, endX, endY, r, g, b, a) {
        return [
        //      Position            Color
            startX, startY,      r, g, b, a,
            startX, endY,        r, g, b, a,
            endX, startY,        r, g, b, a,
            
            endX, startY,        r, g, b, a,
            startX, endY,        r, g, b, a,
            endX, endY,          r, g, b, a
        ];
    }

    function getDataQuad_Color3D(startX, startY, endX, endY, z, r, g, b, a) {
        return [
        //      Position               Color
            startX, startY, z,      r, g, b, a,
            startX, endY, z,        r, g, b, a,
            endX, startY, z,        r, g, b, a,
            
            endX, startY, z,        r, g, b, a,
            startX, endY, z,        r, g, b, a,
            endX, endY, z,          r, g, b, a
        ];
    }

    // Returns an array of the data that can be entered into the buffer model!
    function getDataQuad_Texture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY) {
        return [
        //     Position            Texture Coord
            startX, startY,     texStartX, texStartY,
            startX, endY,       texStartX, texEndY,
            endX, startY,       texEndX, texStartY,
            
            endX, startY,       texEndX, texStartY,
            startX, endY,       texStartX, texEndY,
            endX, endY,         texEndX, texEndY
        ];
    }

    // Returns an array of the data that can be entered into the buffer model!
    function getDataQuad_Texture3D(startX, startY, endX, endY, z, texStartX, texStartY, texEndX, texEndY) {
        return [
        //     Position               Texture Coord
            startX, startY, z,     texStartX, texStartY,
            startX, endY, z,       texStartX, texEndY,
            endX, startY, z,       texEndX, texStartY,
            
            endX, startY, z,       texEndX, texStartY,
            startX, endY, z,       texStartX, texEndY,
            endX, endY, z,         texEndX, texEndY
        ];
    }

    // Returns an array of the tinted/colored data that can be entered into the buffer model!
    function getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, a) {
        return [
        //     Position           Texture Coord              Color
            startX, startY,     texStartX, texStartY,     r, g, b, a,
            startX, endY,       texStartX, texEndY,       r, g, b, a,
            endX, startY,       texEndX, texStartY,       r, g, b, a,
            
            endX, startY,       texEndX, texStartY,       r, g, b, a,
            startX, endY,       texStartX, texEndY,       r, g, b, a,
            endX, endY,         texEndX, texEndY,         r, g, b, a
        ];
    }

    // Returns an array of the tinted/colored data that can be entered into the buffer model!
    function getDataQuad_ColorTexture3D(startX, startY, endX, endY, z, texStartX, texStartY, texEndX, texEndY, r, g, b, a) {
        return [
        //     Position           Texture Coord              Color
            startX, startY, z,     texStartX, texStartY,     r, g, b, a,
            startX, endY, z,       texStartX, texEndY,       r, g, b, a,
            endX, startY, z,       texEndX, texStartY,       r, g, b, a,
            
            endX, startY, z,       texEndX, texStartY,       r, g, b, a,
            startX, endY, z,       texStartX, texEndY,       r, g, b, a,
            endX, endY, z,         texEndX, texEndY,         r, g, b, a
        ];
    }

    // Rectangles...

    function getDataRect(startX, startY, endX, endY, r, g, b, a) {
        return [
        //       x y               color
            startX, startY,     r, g, b,  a,
            startX, endY,       r, g, b,  a,
            endX, endY,         r, g, b,  a,
            endX, startY,       r, g, b,  a
        ];
    }

    // Circles...

    // Hollow circle
    function getDataCircle(x, y, radius, r, g, b, a, resolution) { // res is resolution
        if (resolution == null) return console.error("Cannot get data of circle with no specified resolution!");
        if (resolution < 3) return console.error("Resolution must be 3+ to get data of a circle.");

        const data = [];

        for (let i = 0; i < resolution; i++) {
            const theta = (i / resolution) * 2 * Math.PI;

            const thisX = x + radius * Math.cos(theta);
            const thisY = y + radius * Math.sin(theta);

            // Points around the circle
            data.push(thisX, thisY, r, g, b, a);
        }

        return data;
    }

    // Other odd shapes...

    // A rectangular prism with 2 holes opposite, in the z direction.
    function getDataBoxTunnel(startX, startY, startZ, endX, endY, endZ, r, g, b, a) {
        return [
            //     Vertex                  Color
            startX, startY, startZ,     r, g, b,  a,
            startX, startY, endZ,       r, g, b,  a,
            endX, startY, startZ,       r, g, b,  a,
            endX, startY, startZ,       r, g, b,  a,
            startX, startY, endZ,       r, g, b,  a,
            endX, startY, endZ,         r, g, b,  a,

            endX, startY, startZ,       r, g, b,  a,
            endX, startY, endZ,         r, g, b,  a,
            endX, endY, startZ,         r, g, b,  a,
            endX, endY, startZ,         r, g, b,  a,
            endX, startY, endZ,         r, g, b,  a,
            endX, endY, endZ,           r, g, b,  a,

            endX, endY, startZ,         r, g, b,  a,
            endX, endY, endZ,           r, g, b,  a,
            startX, endY, startZ,       r, g, b,  a,
            startX, endY, startZ,       r, g, b,  a,
            endX, endY, endZ,           r, g, b,  a,
            startX, endY, endZ,         r, g, b,  a,

            startX, endY, startZ,       r, g, b,  a,
            startX, endY, endZ,         r, g, b,  a,
            startX, startY, startZ,     r, g, b,  a,
            startX, startY, startZ,     r, g, b,  a,
            startX, endY, endZ,         r, g, b,  a,
            startX, startY, endZ,       r, g, b,  a
        ];
    }

    // A circle, solid color.
    // Resolution is the number of points around on the edge.
    // REQUIRES TRIANGLES mode to render.
    function getDataCircle3D(x, y, z, radius, resolution, r, g, b, a) {
        if (resolution < 3) return console.error("Resolution must be 3+ to get data of a circle.");

        const data = [];

        for (let i = 0; i < resolution; i++) {
            const theta = (i / resolution) * 2 * Math.PI;
            const nextTheta = ((i + 1) / resolution) * 2 * Math.PI;

            const centerX = x;
            const centerY = y;

            const thisX = x + radius * Math.cos(theta);
            const thisY = y + radius * Math.sin(theta);

            const nextX = x + radius * Math.cos(nextTheta);
            const nextY = y + radius * Math.sin(nextTheta);

            // Center point
            data.push(centerX, centerY, z, r, g, b, a);

            // Points around the circle
            data.push(thisX, thisY, z, r, g, b, a);
            data.push(nextX, nextY, z, r, g, b, a);
        }

        return data;
    }

    /**
     * Returns the buffer model of a solid-color circle at the provided coordinates,
     * lying flat in xy space, with the provided dimensions, resolution, and color.
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

        // return buffermodel.createModel_Color3D(new Float32Array(data))
        return buffermodel.createModel_Colored(new Float32Array(data), 3, 'TRIANGLE_FAN');
    }

    // A circle with color points for the middle and edge. 1 is mid, 2 is outer.
    // Resolution is number of points around on the edge.
    // REQUIRES TRIANGLE_FAN mode to render.
    function getDataFuzzBall3D(x, y, z, radius, resolution, r1, g1, b1, a1, r2, g2, b2, a2) {
        if (resolution < 3) return console.error("Resolution must be 3+ to get data of a fuzz ball.");

        const data = [x, y, z, r1, g1, b1, a1]; // Mid point

        for (let i = 0; i <= resolution; i++) { // Add all outer points
            const theta = (i / resolution) * 2 * Math.PI;
            const thisX = x + radius * Math.cos(theta);
            const thisY = y + radius * Math.sin(theta);
            data.push(...[thisX, thisY, z, r2, g2, b2, a2]);
        }

        return data;
    }

    // A ring with color points for the inner and outer edges.
    // Resolution is the number of points around the ring.
    function getDataRingSolid(x, y, inRad, outRad, resolution, r, g, b, a) {
        if (resolution < 3) return console.error("Resolution must be 3+ to get data of a ring.");

        const data = [];

        for (let i = 0; i < resolution; i++) {
            const theta = (i / resolution) * 2 * Math.PI;
            const nextTheta = ((i + 1) / resolution) * 2 * Math.PI;

            const innerX = x + inRad * Math.cos(theta);
            const innerY = y + inRad * Math.sin(theta);
            const outerX = x + outRad * Math.cos(theta);
            const outerY = y + outRad * Math.sin(theta);

            const innerXNext = x + inRad * Math.cos(nextTheta);
            const innerYNext = y + inRad * Math.sin(nextTheta);
            const outerXNext = x + outRad * Math.cos(nextTheta);
            const outerYNext = y + outRad * Math.sin(nextTheta);

            // Add triangles for the current and next segments
            data.push(
                innerX, innerY, r, g, b, a,
                outerX, outerY, r, g, b, a,
                innerXNext, innerYNext, r, g, b, a,

                outerX, outerY, r, g, b, a,
                outerXNext, outerYNext, r, g, b, a,
                innerXNext, innerYNext, r, g, b, a
            );
        }

        return data;
    }

    // A ring with color points for the inner and outer edges.
    // Resolution is the number of points around the ring.
    // REQUIRES TRIANGLES mode to render.
    function getDataRing3D(x, y, z, inRad, outRad, resolution, r1, g1, b1, a1, r2, g2, b2, a2) {
        if (resolution < 3) return console.error("Resolution must be 3+ to get data of a ring.");

        const data = [];

        for (let i = 0; i < resolution; i++) {
            const theta = (i / resolution) * 2 * Math.PI;
            const nextTheta = ((i + 1) / resolution) * 2 * Math.PI;

            const innerX = x + inRad * Math.cos(theta);
            const innerY = y + inRad * Math.sin(theta);
            const outerX = x + outRad * Math.cos(theta);
            const outerY = y + outRad * Math.sin(theta);

            const innerXNext = x + inRad * Math.cos(nextTheta);
            const innerYNext = y + inRad * Math.sin(nextTheta);
            const outerXNext = x + outRad * Math.cos(nextTheta);
            const outerYNext = y + outRad * Math.sin(nextTheta);

            // Add triangles for the current and next segments
            data.push(
                innerX, innerY, z, r1, g1, b1, a1,
                outerX, outerY, z, r2, g2, b2, a2,
                innerXNext, innerYNext, z, r1, g1, b1, a1,

                outerX, outerY, z, r2, g2, b2, a2,
                outerXNext, outerYNext, z, r2, g2, b2, a2,
                innerXNext, innerYNext, z, r1, g1, b1, a1
            );
        }

        return data;
    }

    /**
     * Returns the buffer model of a gradient-colored ring, at the provided coordinates,
     * lying flat in xy space, with the provided dimensions, resolution, and gradient
     * @param {number} x 
     * @param {number} y 
     * @param {number} z 
     * @param {number} inRad - The radious of the inner circle.
     * @param {number} outRad  - The radious of the outer circle.
     * @param {number} resolution - How many points are rendered along the ring's edge. 3+
     * @param {number} r1 - Red, inner.
     * @param {number} g1  - Green, inner.
     * @param {number} b1  - Blue, inner.
     * @param {number} a1  - Alpha, inner.
     * @param {number} r2  - Red, outer.
     * @param {number} g2  - Green, outer.
     * @param {number} b2  - Blue, outer.
     * @param {number} a2  - Alpha, outer.
     * @returns {BufferModel} The buffer model
     */
    function getModelRing3D(x, y, z, inRad, outRad, resolution, r1, g1, b1, a1, r2, g2, b2, a2) {
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

        // return buffermodel.createModel_Color3D(new Float32Array(data))
        return buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLE_STRIP");
    }

    // Universal...

    function getDataQuad_Color_FromCoord(coords, color) {
        const { startX, startY, endX, endY } = getCoordDataOfTile(coords);
        const [ r, g, b, a ] = color;
        return getDataQuad_Color(startX, startY, endX, endY, r, g, b, a);
    }

    // Needs to be translated by the pieces mesh offset before rendering.
    function getDataQuad_Color_FromCoord_WithOffset(offset, coords, color) {
        const { startX, startY, endX, endY } = getCoordDataOfTile_WithOffset(offset, coords);
        const [ r, g, b, a ] = color;
        return getDataQuad_Color(startX, startY, endX, endY, r, g, b, a);
    }

    function getDataQuad_Color3D_FromCoord(coords, z, color) {
        const { startX, startY, endX, endY } = getCoordDataOfTile(coords);
        const [ r, g, b, a ] = color;
        return getDataQuad_Color3D(startX, startY, endX, endY, z, r, g, b, a);
    }

    // Needs to be translated by the pieces mesh offset before rendering.
    function getDataQuad_Color3D_FromCoord_WithOffset(offset, coords, z, color) {
        const { startX, startY, endX, endY } = getCoordDataOfTile_WithOffset(offset, coords);
        const [ r, g, b, a ] = color;
        return getDataQuad_Color3D(startX, startY, endX, endY, z, r, g, b, a);
    }

    function getDataQuad_ColorTexture_FromCoordAndType(coords, type, color) {
        const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
        const { texStartX, texStartY, texEndX, texEndY } = getTexDataOfType(type, rotation);
        const { startX, startY, endX, endY } = getCoordDataOfTile(coords);
        const { r, g, b, a } = color;

        return getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, a);
    }

    function getDataQuad_ColorTexture3D_FromCoordAndType(coords, z, type, color) {
        const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
        const { texStartX, texStartY, texEndX, texEndY } = getTexDataOfType(type, rotation);
        const { startX, startY, endX, endY } = getCoordDataOfTile(coords);
        const { r, g, b, a } = color;

        return getDataQuad_ColorTexture3D(startX, startY, endX, endY, z, texStartX, texStartY, texEndX, texEndY, r, g, b, a);
    }

    function getDataQuad_ColorTexture_FromPositionWidthType(x, y, width, type, color) { // Position in world-space
        const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
        const { texStartX, texStartY, texEndX, texEndY } = getTexDataOfType(type, rotation);
        const halfWidth = width / 2;
        const startX = x - halfWidth;
        const endX = x + halfWidth;
        const startY = y - halfWidth;
        const endY = y + halfWidth;
        const { r, g, b, a } = color;

        return getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, a);
    }

    function getDataRect_FromTileBoundingBox(boundingBox, color) { // { left, right, bottom, top }
        const { startX, startY, endX, endY } = getCoordDataOfTileBoundingBox(boundingBox);
        const [ r, g, b, a ] = color;
        return getDataRect(startX, startY, endX, endY, r, g, b, a);
    }

    // Modifying data...

    // Rotates the piece 180 of a stride-4 model utilizing the texture shader.
    function rotateDataTexture(data, rotation = 1) {
        const copiedData = data.slice(); // Creates shallow copy (data array must not contain objects)
        const texWidth = pieces.getSpritesheetDataPieceWidth() * rotation;

        // Point 1
        copiedData[2] += texWidth;
        copiedData[3] += texWidth;

        // Point 2
        copiedData[6] += texWidth;
        copiedData[7] -= texWidth;

        // Point 3
        copiedData[10] -= texWidth;
        copiedData[11] += texWidth;

        // Point 4
        copiedData[14] -= texWidth;
        copiedData[15] += texWidth;

        // Point 5
        copiedData[18] += texWidth;
        copiedData[19] -= texWidth;

        // Point 6
        copiedData[22] -= texWidth;
        copiedData[23] -= texWidth;

        return copiedData;
    }

    // Rotates the piece 180 of a stride-8 model utilizing the colored-texture shader.
    function rotateDataColorTexture(data, rotation = 1) {
        const copiedData = data.slice(); // Creates shallow copy (data array must not contain objects)
        const texWidth = pieces.getSpritesheetDataPieceWidth() * rotation;

        // Point 1
        copiedData[2] += texWidth;
        copiedData[3] += texWidth;

        // Point 2
        copiedData[10] += texWidth;
        copiedData[11] -= texWidth;

        // Point 3
        copiedData[18] -= texWidth;
        copiedData[19] += texWidth;

        // Point 4
        copiedData[26] -= texWidth;
        copiedData[27] += texWidth;
        
        // Point 5
        copiedData[34] += texWidth;
        copiedData[35] -= texWidth;

        // Point 6
        copiedData[42] -= texWidth;
        copiedData[43] -= texWidth;

        return copiedData;
    }
    
    return Object.freeze({
        getCoordDataOfTile,
        getCoordDataOfTile_WithOffset,
        getCoordDataOfTileBoundingBox,
        getTexDataOfType,
        getDataQuad_Color,
        getDataQuad_Color3D,
        getDataQuad_Texture,
        getDataQuad_Texture3D,
        getDataQuad_ColorTexture,
        getDataQuad_ColorTexture3D,
        getDataRect,
        getDataCircle,
        getDataBoxTunnel,
        getDataCircle3D,
        getModelCircle3D,
        getDataFuzzBall3D,
        getDataRingSolid,
        getDataRing3D,
        getModelRing3D,
        getDataQuad_Color_FromCoord,
        getDataQuad_Color_FromCoord_WithOffset,
        getDataQuad_Color3D_FromCoord,
        getDataQuad_Color3D_FromCoord_WithOffset,
        getDataQuad_ColorTexture_FromCoordAndType,
        getDataQuad_ColorTexture3D_FromCoordAndType,
        getDataQuad_ColorTexture_FromPositionWidthType,
        getDataRect_FromTileBoundingBox,
        rotateDataTexture,
        rotateDataColorTexture
    });

})();

export default bufferdata;