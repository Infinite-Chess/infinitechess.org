// src/client/scripts/esm/game/rendering/textrenderer.ts

/**
 * This script renders strings of digits (0-9) in world space using a
 * runtime-generated texture atlas.
 *
 * The atlas is a 1024×64 canvas where each of the 10 digit glyphs
 * occupies a 64×64 pixel square cell, making UV calculations straightforward.
 * Each rendered quad is a square whose side length equals `size` world-space units.
 */

import type { Color } from '../../../../../shared/util/math/math.js';

import { gl } from './webgl.js';
import primitives from './primitives.js';
import { createRenderable } from '../../webgl/Renderable.js';

// Types -------------------------------------------------------------------------

/** Horizontal alignment of text relative to the anchor world-space coordinate. */
type TextAlign = 'left' | 'center' | 'right';

// Constants -------------------------------------------------------------------------

/** Number of digit characters supported (0-9). */
const DIGIT_COUNT = 10;

/**
 * Width of the texture atlas in pixels.
 * Must be a power of two. 10 cells × 64 px/cell = 640 px used; padded to 1024.
 */
const ATLAS_WIDTH = 1024;

/** Height of the texture atlas in pixels. Must be a power of two. */
const ATLAS_HEIGHT = 64;

/** Side length of each individual digit cell in the atlas in pixels. */
const CELL_SIZE = 64; // ATLAS_HEIGHT, so each cell is square

/**
 * UV width of one digit cell: CELL_SIZE / ATLAS_WIDTH.
 * Digit `d` spans U coordinates [d * CELL_UV_WIDTH, (d+1) * CELL_UV_WIDTH].
 */
const CELL_UV_WIDTH = CELL_SIZE / ATLAS_WIDTH;

// Variables -------------------------------------------------------------------------

/** The WebGL texture containing all digit glyphs. Lazily initialised on first render. */
let digitAtlas: WebGLTexture | undefined;

// Functions -------------------------------------------------------------------------

/**
 * Generates the digit texture atlas using Canvas 2D and uploads it to the GPU.
 * Called automatically the first time `renderText` is invoked.
 */
function initDigitAtlas(): void {
	const canvas = document.createElement('canvas');
	canvas.width = ATLAS_WIDTH;
	canvas.height = ATLAS_HEIGHT;

	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not get 2D context for digit atlas generation.');

	ctx.clearRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
	ctx.fillStyle = 'white';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	// Bold monospace so every digit has the same advance width inside its cell.
	ctx.font = `bold ${CELL_SIZE * 0.8}px monospace`;

	for (let d = 0; d < DIGIT_COUNT; d++) {
		ctx.fillText(String(d), d * CELL_SIZE + CELL_SIZE / 2, ATLAS_HEIGHT / 2);
	}

	const texture = gl.createTexture();
	if (!texture) throw new Error('Failed to create digit atlas WebGL texture.');

	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
	gl.generateMipmap(gl.TEXTURE_2D);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	// CLAMP_TO_EDGE prevents UV bleeding between adjacent digit cells.
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.bindTexture(gl.TEXTURE_2D, null);

	digitAtlas = texture;
}

/** Returns the digit atlas texture, lazily initializing it on first access. */
function getDigitAtlas(): WebGLTexture {
	if (digitAtlas === undefined) initDigitAtlas();
	return digitAtlas!;
}

/**
 * Renders a string of digit characters (0-9) in world space.
 * @param text - The string to render; only digit characters '0'–'9' are drawn.
 * @param x - World-space X coordinate of the anchor point.
 * @param y - World-space Y coordinate of the center of the characters.
 * @param size - Height (and width) of each character in world-space units,
 *               where 1 unit equals the height of one character's atlas cell.
 * @param color - RGBA tint applied to the text.
 * @param align - Horizontal alignment: 'left' aligns the left edge of the first
 *                character to `x`; 'center' centers the string on `x`; 'right'
 *                aligns the right edge of the last character to `x`.
 */
function renderText(
	text: string,
	x: number,
	y: number,
	size: number,
	color: Color,
	align: TextAlign,
): void {
	if (text.length === 0) return;

	const totalWidth = text.length * size;

	// Compute the world-space X of the left edge of the first character.
	let startX: number;
	if (align === 'left') startX = x;
	else if (align === 'center') startX = x - totalWidth / 2;
	else startX = x - totalWidth; // 'right'

	const bottom = y - size / 2;
	const top = y + size / 2;
	const [r, g, b, a] = color;

	const data: number[] = [];

	for (let i = 0; i < text.length; i++) {
		const digit = text.charCodeAt(i) - 48; // '0' is char code 48
		if (digit < 0 || digit > 9) continue;

		const left = startX + i * size;
		const right = left + size;

		const texleft = digit * CELL_UV_WIDTH;
		const texright = (digit + 1) * CELL_UV_WIDTH;
		// The atlas is stored upright; UNPACK_FLIP_Y_WEBGL handles the Y flip.
		const texbottom = 0;
		const textop = 1;

		data.push(
			...primitives.Quad_ColorTexture(
				left,
				bottom,
				right,
				top,
				texleft,
				texbottom,
				texright,
				textop,
				r,
				g,
				b,
				a,
			),
		);
	}

	if (data.length === 0) return;

	createRenderable(data, 2, 'TRIANGLES', 'colorTexture', true, getDigitAtlas()).render();
}

// Exports -------------------------------------------------------------------------

export default { renderText };

export type { TextAlign };
