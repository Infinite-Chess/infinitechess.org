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
	// prettier-ignore
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
// prettier-ignore
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
// prettier-ignore
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
// prettier-ignore
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
// prettier-ignore
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
// prettier-ignore
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
// prettier-ignore
function Rect(left: number, bottom: number, right: number, top: number, [r,g,b,a]: Color): number[] {
	return [
		//    x     y            color
        left,  bottom,    r, g, b, a,
        left,  top,       r, g, b, a,
        right, top,       r, g, b, a,
        right, bottom,    r, g, b, a,
	];
}

/** [TRIANGLES] Generates vertex data for the outline of a 2D DASHED rectangle. */
// prettier-ignore
function DashedRect(left: number, bottom: number, right: number, top: number, thickness: number, dashLength: number, gapLength: number, [r,g,b,a]: Color): number[] {
	const data: number[] = [];
	const cycleLength = dashLength + gapLength;
	const halfThick = thickness / 2;

	// Return empty array for invalid parameters to avoid infinite loops or drawing garbage.
	if (dashLength <= 0 || thickness <= 0 || cycleLength <= 0) return [];

	const pushQuad = (left: number, bottom: number, right: number, top: number): void => {
		data.push(
			// Position     	  Color
			left,  bottom,      r, g, b, a,
			left,  top,         r, g, b, a,
			right, bottom,      r, g, b, a,
			right, bottom,      r, g, b, a,
			left,  top,         r, g, b, a,
			right, top,         r, g, b, a
		);
	};

	// Horizontal dashes (bottom and top edges)
	for (let x = left; x < right; x += cycleLength) {
		const dashEnd = Math.min(x + dashLength, right);
		if (dashEnd > x) {
			// Bottom
			pushQuad(x, bottom - halfThick, dashEnd, bottom + halfThick);
			// Top
			pushQuad(x, top - halfThick, dashEnd, top + halfThick);
		}
	}

	// Vertical dashes (left and right edges)
	for (let y = bottom; y < top; y += cycleLength) {
		const dashEnd = Math.min(y + dashLength, top);
		if (dashEnd > y) {
			// Left
			pushQuad(left - halfThick, y, left + halfThick, dashEnd);
			// Right
			pushQuad(right - halfThick, y, right + halfThick, dashEnd);
		}
	}

	return data;
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
// prettier-ignore
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
// prettier-ignore
function GlowDot(x: number, y: number, radius: number, resolution: number, [r1,g1,b1,a1]: Color, [r2,g2,b2,a2]: Color): number[] { 
	if (resolution < 3) throw Error("Resolution must be 3+ to get data of a fuzz ball.");

	const data: number[] = [x, y, r1, g1, b1, a1]; // Mid point

	for (let i = 0; i <= resolution; i++) {
		// Add all outer points
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
// prettier-ignore
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

/**
 * [TRIANGLES] Generates vertex data for a radial gradient centered at (x, y).
 * Colors repeat outward with the given spacing (same units as x/y) and phase offset.
 */
// prettier-ignore
function RadialGradient(x: number, y: number, radius: number, colors: Color[], spacing: number, phase: number, resolution: number): number[] {
	if (colors.length === 0 || spacing <= 0 || radius <= 0) return [];

	const n = colors.length;

	function colorAtRadius(r: number): Color {
		const t = (r + phase) / spacing;
		const lower = Math.floor(t);
		const frac = t - lower;
		const c1 = colors[((lower % n) + n) % n]!;
		const c2 = colors[(((lower + 1) % n) + n) % n]!;
		return [
			c1[0] + (c2[0] - c1[0]) * frac,
			c1[1] + (c2[1] - c1[1]) * frac,
			c1[2] + (c2[2] - c1[2]) * frac,
			c1[3] + (c2[3] - c1[3]) * frac,
		];
	}

	// Build ring boundaries: radii where (r + phase) is an exact multiple of spacing.
	const phasemod = ((phase % spacing) + spacing) % spacing;
	const firstBoundary = phasemod === 0 ? 0 : spacing - phasemod;

	const boundaries: number[] = [0];
	let r = firstBoundary > 0 ? firstBoundary : spacing;
	while (r < radius) {
		boundaries.push(r);
		r += spacing;
	}
	boundaries.push(radius);

	const data: number[] = [];

	for (let i = 0; i < boundaries.length - 1; i++) {
		const innerR = boundaries[i]!;
		const outerR = boundaries[i + 1]!;
		const [r1, g1, b1, a1] = colorAtRadius(innerR);
		const [r2, g2, b2, a2] = colorAtRadius(outerR);

		for (let j = 0; j < resolution; j++) {
			const theta     = (j     / resolution) * 2 * Math.PI;
			const nextTheta = ((j + 1) / resolution) * 2 * Math.PI;

			const outerX     = x + outerR * Math.cos(theta);
			const outerY     = y + outerR * Math.sin(theta);
			const outerXNext = x + outerR * Math.cos(nextTheta);
			const outerYNext = y + outerR * Math.sin(nextTheta);

			if (innerR === 0) {
				data.push(
					x,          y,              r1, g1, b1, a1,
					outerX,     outerY,         r2, g2, b2, a2,
					outerXNext, outerYNext,     r2, g2, b2, a2,
				);
			} else {
				const innerX     = x + innerR * Math.cos(theta);
				const innerY     = y + innerR * Math.sin(theta);
				const innerXNext = x + innerR * Math.cos(nextTheta);
				const innerYNext = y + innerR * Math.sin(nextTheta);

				data.push(
					innerX,     innerY,         r1, g1, b1, a1,
					outerX,     outerY,         r2, g2, b2, a2,
					innerXNext, innerYNext,     r1, g1, b1, a1,

					outerX,     outerY,         r2, g2, b2, a2,
					outerXNext, outerYNext,     r2, g2, b2, a2,
					innerXNext, innerYNext,     r1, g1, b1, a1,
				);
			}
		}
	}

	return data;
}

// =========================================== Other Shapes ================================================

/** [TRIANGLES] Generates vertex data for a four-sided, hollow rectangular prism. */
// prettier-ignore
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
	DashedRect,
	// Circles
	Circle,
	GlowDot,
	Ring,
	RadialGradient,
	// Other Shapes
	BoxTunnel,
};
