
// Import Start
import spritesheet from './spritesheet.js';
// Import End


"use strict";

/**
 * This script contains methods for obtaining the vertex array data
 * of many common shapes, when their dimensions and position are known.
 * 
 * This vertex data can then be used to pass into a buffer model for rendering.
 */



// Texture data...

function getTexDataOfType(type, rotation = 1) {
	const texLocation = spritesheet.getSpritesheetDataTexLocation(type);
	const texWidth = spritesheet.getSpritesheetDataPieceWidth();

	const texleft = texLocation[0];
	const texbottom = texLocation[1];

	if (rotation === 1) return { // Regular rotation
		texleft,
		texbottom,
		texright: texleft + texWidth,
		textop: texbottom + texWidth
	};

	return { // Inverted rotation
		texleft: texleft + texWidth,
		texbottom: texbottom + texWidth,
		texright: texleft,
		textop: texbottom
	};
}

// Quads...

function getDataQuad_Color({left,right,bottom,top}, [r,g,b,a]) {
	return [
    //      Position           Color
        left, bottom,       r, g, b, a,
        left, top,          r, g, b, a,
        right, bottom,      r, g, b, a,
        
        right, bottom,      r, g, b, a,
        left, top,          r, g, b, a,
        right, top,         r, g, b, a
    ];
}

function getDataQuad_Color3D({left,right,bottom,top}, z, [r,g,b,a]) {
	return [
    //      Position               Color
        left, bottom, z,      r, g, b, a,
        left, top, z,        r, g, b, a,
        right, bottom, z,        r, g, b, a,
        
        right, bottom, z,        r, g, b, a,
        left, top, z,        r, g, b, a,
        right, top, z,          r, g, b, a
    ];
}

// Returns an array of the data that can be entered into the buffer model!
function getDataQuad_Texture(left, bottom, right, top, texleft, texbottom, texright, textop) {
	return [
    //     Position            Texture Coord
        left, bottom,     texleft, texbottom,
        left, top,       texleft, textop,
        right, bottom,       texright, texbottom,
        
        right, bottom,       texright, texbottom,
        left, top,       texleft, textop,
        right, top,         texright, textop
    ];
}

// Returns an array of the data that can be entered into the buffer model!
function getDataQuad_Texture3D(left, bottom, right, top, z, texleft, texbottom, texright, textop) {
	return [
    //     Position               Texture Coord
        left, bottom, z,     texleft, texbottom,
        left, top, z,       texleft, textop,
        right, bottom, z,       texright, texbottom,
        
        right, bottom, z,       texright, texbottom,
        left, top, z,       texleft, textop,
        right, top, z,         texright, textop
    ];
}

// Returns an array of the tinted/colored data that can be entered into the buffer model!
function getDataQuad_ColorTexture(left, bottom, right, top, texleft, texbottom, texright, textop, r, g, b, a) {
	return [
    //     Position           Texture Coord              Color
        left, bottom,     texleft, texbottom,     r, g, b, a,
        left, top,       texleft, textop,       r, g, b, a,
        right, bottom,       texright, texbottom,       r, g, b, a,
        
        right, bottom,       texright, texbottom,       r, g, b, a,
        left, top,       texleft, textop,       r, g, b, a,
        right, top,         texright, textop,         r, g, b, a
    ];
}

// Returns an array of the tinted/colored data that can be entered into the buffer model!
function getDataQuad_ColorTexture3D(left, bottom, right, top, z, texleft, texbottom, texright, textop, r, g, b, a) {
	return [
    //     Position           Texture Coord              Color
        left, bottom, z,     texleft, texbottom,     r, g, b, a,
        left, top, z,       texleft, textop,       r, g, b, a,
        right, bottom, z,       texright, texbottom,       r, g, b, a,
        
        right, bottom, z,       texright, texbottom,       r, g, b, a,
        left, top, z,       texleft, textop,       r, g, b, a,
        right, top, z,         texright, textop,         r, g, b, a
    ];
}

// Rectangles...

function getDataRect({left,right,bottom,top}, [r,g,b,a]) {
	return [
    //      x y               color
        left, bottom,      r, g, b,  a,
        left, top,         r, g, b,  a,
        right, top,        r, g, b,  a,
        right, bottom,     r, g, b,  a
    ];
}

// Circles...

// Hollow circle
function getDataCircle(x, y, radius, r, g, b, a, resolution) { // res is resolution
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
function getDataBoxTunnel(left, bottom, startZ, right, top, endZ, r, g, b, a) {
	return [
        //     Vertex                  Color
        left, bottom, startZ,     r, g, b,  a,
        left, bottom, endZ,       r, g, b,  a,
        right, bottom, startZ,       r, g, b,  a,
        right, bottom, startZ,       r, g, b,  a,
        left, bottom, endZ,       r, g, b,  a,
        right, bottom, endZ,         r, g, b,  a,

        right, bottom, startZ,       r, g, b,  a,
        right, bottom, endZ,         r, g, b,  a,
        right, top, startZ,         r, g, b,  a,
        right, top, startZ,         r, g, b,  a,
        right, bottom, endZ,         r, g, b,  a,
        right, top, endZ,           r, g, b,  a,

        right, top, startZ,         r, g, b,  a,
        right, top, endZ,           r, g, b,  a,
        left, top, startZ,       r, g, b,  a,
        left, top, startZ,       r, g, b,  a,
        right, top, endZ,           r, g, b,  a,
        left, top, endZ,         r, g, b,  a,

        left, top, startZ,       r, g, b,  a,
        left, top, endZ,         r, g, b,  a,
        left, bottom, startZ,     r, g, b,  a,
        left, bottom, startZ,     r, g, b,  a,
        left, top, endZ,         r, g, b,  a,
        left, bottom, endZ,       r, g, b,  a
    ];
}

// A circle, solid color.
// Resolution is the number of points around on the edge.
// REQUIRES TRIANGLES mode to render.
function getDataCircle3D(x, y, z, radius, resolution, [r,g,b,a]) {
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


// A circle with color points for the middle and edge. 1 is mid, 2 is outer.
// Resolution is number of points around on the edge.
// REQUIRES TRIANGLE_FAN mode to render.
function getDataFuzzBall3D(x, y, z, radius, resolution, [r1,g1,b1,a1], [r2,g2,b2,a2]) {
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
function getDataRingSolid(x, y, inRad, outRad, resolution, [r,g,b,a]) {
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
function getDataRing3D(x, y, z, inRad, outRad, resolution, [r1,g1,b1,a1], [r2,g2,b2,a2]) {
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


// Modifying data...

// Rotates the piece 180 of a stride-4 model utilizing the texture shader.
function rotateDataTexture(data, rotation = 1) {
	const copiedData = data.slice(); // Creates shallow copy (data array must not contain objects)
	const texWidth = spritesheet.getSpritesheetDataPieceWidth() * rotation;

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
	const texWidth = spritesheet.getSpritesheetDataPieceWidth() * rotation;

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



export default {
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
	getDataFuzzBall3D,
	getDataRingSolid,
	getDataRing3D,
	rotateDataTexture,
	rotateDataColorTexture,
};