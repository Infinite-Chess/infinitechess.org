// src/client/scripts/esm/game/rendering/textrenderer.ts

/**
 * This script renders arbitrary strings in world space using the glyph atlas
 * produced by {@link glyphatlas}.
 *
 * All printable ASCII characters plus the Unicode replacement character U+FFFD
 * are supported. Any character not found in the atlas is replaced with U+FFFD
 * and a warning is emitted to the console (once per unique unseen character).
 *
 * Each character is rendered as a textured quad whose height equals `size`
 * world-space units and whose width is `size × advanceWidth` — where
 * `advanceWidth` is the per-glyph ratio measured at atlas-generation time.
 * This makes the renderer font-agnostic: proportional fonts render correctly
 * because every glyph gets its own natural width.
 */

import type { Color } from '../../../../../shared/util/math/math.js';
import type { DoubleCoords } from '../../../../../shared/chess/util/coordutil.js';

import primitives from './primitives.js';
import { createRenderable } from '../../webgl/Renderable.js';
import {
	getAtlasTexture,
	getGlyphMetrics,
	getReplacementMetrics,
	REPLACEMENT_CHAR,
} from './glyphatlas.js';

// Types -------------------------------------------------------------------------

/** Horizontal alignment of text relative to the anchor world-space coordinate. */
type TextAlign = 'left' | 'center' | 'right';

// Variables -------------------------------------------------------------------------

/**
 * Characters that have already triggered a console warning.
 * Used to avoid flooding the console when the same unknown character is rendered
 * many times per frame.
 */
const warnedChars = new Set<string>();

// Functions -------------------------------------------------------------------------

/**
 * Computes the total world-space width of `text` when rendered at the given `size`.
 * Unsupported characters are treated as if they were the replacement character.
 */
function getTextWidth(text: string, size: number): number {
	let width = 0;
	for (const char of text) {
		const m = getGlyphMetrics(char) ?? getReplacementMetrics();
		width += size * m.advanceWidth;
	}
	return width;
}

/**
 * Renders a string in world space.
 * @param text - The string to render.
 * @param coords - World-space [x, y] of the anchor point.
 *                 `x` is positioned according to `align`; `y` is the vertical centre.
 * @param size - World-space height of each character.
 * @param color - RGBA tint applied to all characters.
 * @param align - Horizontal alignment relative to `coords[0]`.
 */
function renderText(
	text: string,
	coords: DoubleCoords,
	size: number,
	color: Color,
	align: TextAlign,
): void {
	if (text.length === 0) return;

	const [x, y] = coords;

	const totalWidth = getTextWidth(text, size);

	// Compute world-space X of the left edge of the first character.
	let cursorX: number;
	if (align === 'left') cursorX = x;
	else if (align === 'center') cursorX = x - totalWidth / 2;
	else cursorX = x - totalWidth; // 'right'

	// Vertical extents are constant for all glyphs (text is vertically centred on y).
	const bottom = y - size / 2;
	const top = y + size / 2;
	const [r, g, b, a] = color;

	const data: number[] = [];

	for (const char of text) {
		let m = getGlyphMetrics(char);
		if (m === undefined) {
			if (!warnedChars.has(char)) {
				console.warn(
					`textrenderer: unsupported character U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')} '${char}' — rendering replacement character '${REPLACEMENT_CHAR}' instead.`,
				);
				warnedChars.add(char);
			}
			m = getReplacementMetrics();
		}

		const quadWidth = size * m.advanceWidth;
		const left = cursorX;
		const right = cursorX + quadWidth;

		data.push(
			...primitives.Quad_ColorTexture(
				left,
				bottom,
				right,
				top,
				m.u0,
				m.v0,
				m.u1,
				m.v1,
				r,
				g,
				b,
				a,
			),
		);

		cursorX += quadWidth;
	}

	if (data.length === 0) return;

	createRenderable(data, 2, 'TRIANGLES', 'colorTexture', true, getAtlasTexture()).render();
}

// Exports -------------------------------------------------------------------------

export default { renderText };

export type { TextAlign };
