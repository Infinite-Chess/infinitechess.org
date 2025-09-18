
// src/client/scripts/esm/game/rendering/primitives.ts

/**
 * This script contains methods for obtaining the vertex array data
 * of many common shapes, when their dimensions and position are known.
 * 
 * This vertex data can then be used to pass into a buffer model for rendering.
 */


import type { Color } from '../../../../../shared/util/math/math.js';



// =========================================== Quads ==================================================



/** [TRIANGLES] Generates vertex data for a 2D quad with NO COLOR DATA. */
function Quad(left: number, bottom: number, right: number, top: number): number[] {
	return [
    //     Position
        left,  bottom,
        left,  top,
        right, bottom,
        right, bottom,
        left,  top,
        right, top,
    ];
}


/** [TRIANGLES] Generates vertex data for a solid-colored 2D quad. */
function Quad_Color(left: number, bottom: number, right: number, top: number, [r,g,b,a]: Color): number[] {
	return [
    //      Position           Color
        left,  bottom,      r, g, b, a,
        left,  top,         r, g, b, a,
        right, bottom,      r, g, b, a,

        right, bottom,      r, g, b, a,
        left,  top,         r, g, b, a,
        right, top,         r, g, b, a,
    ];
}

/** [TRIANGLES] Generates vertex data for a solid-colored 3D quad. */
function Quad_Color3D(left: number, bottom: number, right: number, top: number, z: number, [r,g,b,a]: Color): number[] {
	return [
    //      Position              Color
        left,  bottom, z,      r, g, b, a,
        left,  top,    z,      r, g, b, a,
        right, bottom, z,      r, g, b, a,

        right, bottom, z,      r, g, b, a,
        left,  top,    z,      r, g, b, a,
        right, top,    z,      r, g, b, a,
    ];
}

/** [TRIANGLES] Generates vertex and texture coordinate data for a textured 2D quad. */
function Quad_Texture(left: number, bottom: number, right: number, top: number, texleft: number, texbottom: number, texright: number, textop: number): number[] {
	return [
    //     Position          Texture Coord
        left,  bottom,    texleft,  texbottom,
        left,  top,       texleft,  textop,
        right, bottom,    texright, texbottom,

        right, bottom,    texright, texbottom,
        left,  top,       texleft,  textop,
        right, top,       texright, textop,
    ];
}

/** [TRIANGLES] Generates vertex, texture coordinate, and color data for a tinted textured 2D quad. */
function Quad_ColorTexture(left: number, bottom: number, right: number, top: number, texleft: number, texbottom: number, texright: number, textop: number, r: number, g: number, b: number, a: number): number[] {
	return [
    //     Position          Texture Coord           Color
        left,  bottom,    texleft,  texbottom,    r, g, b, a,
        left,  top,       texleft,  textop,       r, g, b, a,
        right, bottom,    texright, texbottom,    r, g, b, a,

        right, bottom,    texright, texbottom,    r, g, b, a,
        left,  top,       texleft,  textop,       r, g, b, a,
        right, top,       texright, textop,       r, g, b, a,
    ];
}

/** [TRIANGLES] Generates vertex, texture coordinate, and color data for a tinted textured 3D quad. */
function Quad_ColorTexture3D(left: number, bottom: number, right: number, top: number, z: number, texleft: number, texbottom: number, texright: number, textop: number, r: number, g: number, b: number, a: number): number[] {
	return [
    //       Position            Texture Coord           Color
        left,  bottom, z,     texleft,  texbottom,    r, g, b, a,
        left,  top,    z,     texleft,  textop,       r, g, b, a,
        right, bottom, z,     texright, texbottom,    r, g, b, a,

        right, bottom, z,     texright, texbottom,    r, g, b, a,
        left,  top,    z,     texleft,  textop,       r, g, b, a,
        right, top,    z,     texright, textop,       r, g, b, a,
    ];
}

/** [LINE_LOOP] Generates vertex data for the outline of a 2D rectangle. */
function Rect(left: number, bottom: number, right: number, top: number, [r,g,b,a]: Color): number[] {
	return [
    //    x     y            color
        left,  bottom,    r, g, b, a,
        left,  top,       r, g, b, a,
        right, top,       r, g, b, a,
        right, bottom,    r, g, b, a,
    ];
}



// =========================================== Circles ================================================



/** [LINE_LOOP] Generates vertex data for the outline of a hollow circle. */
// function Circle_LINES(x: number, y: number, radius: number, r: number, g: number, b: number, a: number, resolution: number): number[] { // res is resolution
// 	if (resolution < 3) throw Error("Resolution must be 3+ to get data of a circle.");

// 	const data: number[] = [];

// 	for (let i = 0; i < resolution; i++) {
// 		const theta = (i / resolution) * 2 * Math.PI;

// 		const thisX = x + radius * Math.cos(theta);
// 		const thisY = y + radius * Math.sin(theta);

// 		// Points around the circle
// 		data.push(thisX, thisY, r, g, b, a);
// 	}

// 	return data;
// }

/** [TRIANGLES] Generates vertex data for a solid-colored circle composed of triangles. */
function Circle(x: number, y: number, radius: number, resolution: number, [r,g,b,a]: Color): number[] {
	if (resolution < 3) throw Error("Resolution must be 3+ to get data of a circle.");

	const data: number[] = [];

	for (let i = 0; i < resolution; i++) {
		// Current and next angle positions
		const theta = (i / resolution) * 2 * Math.PI;
		const nextTheta = ((i + 1) / resolution) * 2 * Math.PI;

		// Position of current and next points on the circumference
		const x1 = x + radius * Math.cos(theta);
		const y1 = y + radius * Math.sin(theta);
		const x2 = x + radius * Math.cos(nextTheta);
		const y2 = y + radius * Math.sin(nextTheta);

		// Center point
		data.push(x,  y,    r, g, b, a);
		// Points around the circle
		data.push(x1, y1,   r, g, b, a);
		data.push(x2, y2,   r, g, b, a);
	}

	return data;
}

/** [TRIANGLE_FAN] Generates vertex data for a circle with a color gradient from the center to the edge. */
function GlowDot(x: number, y: number, radius: number, resolution: number, [r1,g1,b1,a1]: Color, [r2,g2,b2,a2]: Color): number[] { 
	if (resolution < 3) throw Error("Resolution must be 3+ to get data of a fuzz ball.");

	const data: number[] = [x, y,   r1, g1, b1, a1]; // Mid point

	for (let i = 0; i <= resolution; i++) { // Add all outer points
		const theta = (i / resolution) * 2 * Math.PI;
		const thisX = x + radius * Math.cos(theta);
		const thisY = y + radius * Math.sin(theta);
		data.push(...[thisX, thisY,   r2, g2, b2, a2]);
	}

	return data;
}

/** [TRIANGLES] Generates vertex data for a solid-colored ring. */
// function RingSolid(x: number, y: number, inRad: number, outRad: number, resolution: number, [r,g,b,a]: Color): number[] {
// 	if (resolution < 3) throw Error("Resolution must be 3+ to get data of a ring.");

// 	const data: number[] = [];

// 	for (let i = 0; i < resolution; i++) {
// 		const theta = (i / resolution) * 2 * Math.PI;
// 		const nextTheta = ((i + 1) / resolution) * 2 * Math.PI;

// 		const innerX = x + inRad * Math.cos(theta);
// 		const innerY = y + inRad * Math.sin(theta);
// 		const outerX = x + outRad * Math.cos(theta);
// 		const outerY = y + outRad * Math.sin(theta);

// 		const innerXNext = x + inRad * Math.cos(nextTheta);
// 		const innerYNext = y + inRad * Math.sin(nextTheta);
// 		const outerXNext = x + outRad * Math.cos(nextTheta);
// 		const outerYNext = y + outRad * Math.sin(nextTheta);

// 		// Add triangles for the current and next segments
// 		data.push(
// 			innerX, innerY, r, g, b, a,
// 			outerX, outerY, r, g, b, a,
// 			innerXNext, innerYNext, r, g, b, a,

// 			outerX, outerY, r, g, b, a,
// 			outerXNext, outerYNext, r, g, b, a,
// 			innerXNext, innerYNext, r, g, b, a
// 		);
// 	}

// 	return data;
// }

/** [TRIANGLES] Generates vertex data for a ring with color gradients between the inner and outer edges. */
function Ring(x: number, y: number, inRad: number, outRad: number, resolution: number, [r1,g1,b1,a1]: Color, [r2,g2,b2,a2]: Color): number[] {
	if (resolution < 3) throw Error("Resolution must be 3+ to get data of a ring.");

	const data: number[] = [];

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
			innerX,     innerY,          r1, g1, b1, a1,
			outerX,     outerY,          r2, g2, b2, a2,
			innerXNext, innerYNext,      r1, g1, b1, a1,

			outerX,     outerY,          r2, g2, b2, a2,
			outerXNext, outerYNext,      r2, g2, b2, a2,
			innerXNext, innerYNext,      r1, g1, b1, a1
		);
	}

	return data;
}



// =========================================== Other Shapes ================================================



/** [TRIANGLES] Generates vertex data for a four-sided, hollow rectangular prism. */
function BoxTunnel(left: number, bottom: number, startZ: number, right: number, top: number, endZ: number, r: number, g: number, b: number, a: number): number[] {
	return [
        //     Vertex                   Color
        left,  bottom, startZ,      r, g, b, a,
        left,  bottom, endZ,        r, g, b, a,
        right, bottom, startZ,      r, g, b, a,
        right, bottom, startZ,      r, g, b, a,
        left,  bottom, endZ,        r, g, b, a,
        right, bottom, endZ,        r, g, b, a,

        right, bottom, startZ,      r, g, b, a,
        right, bottom, endZ,        r, g, b, a,
        right, top,    startZ,      r, g, b, a,
        right, top,    startZ,      r, g, b, a,
        right, bottom, endZ,        r, g, b, a,
        right, top,    endZ,        r, g, b, a,

        right, top,    startZ,      r, g, b, a,
        right, top,    endZ,        r, g, b, a,
        left,  top,    startZ,      r, g, b, a,
        left,  top,    startZ,      r, g, b, a,
        right, top,    endZ,        r, g, b, a,
        left,  top,    endZ,        r, g, b, a,

        left,  top,    startZ,      r, g, b, a,
        left,  top,    endZ,        r, g, b, a,
        left,  bottom, startZ,      r, g, b, a,
        left,  bottom, startZ,      r, g, b, a,
        left,  top,    endZ,        r, g, b, a,
        left,  bottom, endZ,        r, g, b, a,
    ];
}



// =========================================== Exports ================================================



export default {
	// Quads
	Quad,
	Quad_Color,
	Quad_Color3D,
	Quad_Texture,
	Quad_ColorTexture,
	Quad_ColorTexture3D,
	Rect,
	// Circles
	Circle,
	GlowDot,
	Ring,
	// Other Shapes
	BoxTunnel,
};