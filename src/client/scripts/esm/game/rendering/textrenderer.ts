// src/client/scripts/esm/game/rendering/textrenderer.ts

/**
 * This script renders arbitrary strings in world space.
 *
 * Each character is rendered as a textured quad whose height equals `size`
 * world-space units and whose width is `size × advanceWidth` — where
 * `advanceWidth` is the per-glyph ratio measured at atlas-generation time.
 */

import type { Color } from '../../../../../shared/util/math/math.js';
import type { DoubleCoords } from '../../../../../shared/chess/util/coordutil.js';

import primitives from './primitives.js';
import { createRenderable } from '../../webgl/Renderable.js';
import { getAtlasTexture, getGlyphMetrics } from './glyphatlas.js';

// Functions -------------------------------------------------------------------------

/**
 * Computes the total world-space width of `text` when rendered at the given `size`.
 * Unsupported characters are treated as if they were the replacement character.
 */
function getTextWidth(text: string, size: number): number {
	let width = 0;
	for (const char of text) {
		const m = getGlyphMetrics(char);
		width += size * m.advanceWidth;
	}
	return width;
}

/**
 * Renders a text string.
 * @param text - The string to render.
 * @param coords - World-space [x, y] of the anchor point.
 *                 `x` is positioned according to `align`; `y` is the vertical centre.
 * @param size - World-space height of each character.
 * @param color - RGBA tint applied to all characters.
 * @param align - Horizontal alignment relative to `coords[0]`.
 */
function render(
	text: string,
	coords: DoubleCoords,
	size: number,
	color: Color,
	align: 'left' | 'center' | 'right',
): void {
	if (text.length === 0) return;

	const totalWidth = getTextWidth(text, size);

	// Compute world-space X of the left edge of the first character.
	let cursorX: number;
	if (align === 'left') cursorX = coords[0];
	else if (align === 'center') cursorX = coords[0] - totalWidth / 2;
	else cursorX = coords[0] - totalWidth; // 'right'

	// Vertical extents are constant for all glyphs (text is vertically centred on y).
	const bottom = coords[1] - size / 2;
	const top = coords[1] + size / 2;

	const data: number[] = [];

	for (const char of text) {
		const m = getGlyphMetrics(char);

		const quadWidth = size * m.advanceWidth;
		const left = cursorX;
		const right = cursorX + quadWidth;

		data.push(
			// prettier-ignore
			...primitives.Quad_ColorTexture(left, bottom, right, top, m.u0, m.v0, m.u1, m.v1, ...color),
		);

		cursorX += quadWidth;
	}

	createRenderable(data, 2, 'TRIANGLES', 'colorTexture', true, getAtlasTexture()).render();
}

// Exports -------------------------------------------------------------------------

export default { render };
