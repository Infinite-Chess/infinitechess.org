// src/client/scripts/esm/game/rendering/glyphatlas.ts

/**
 * This script generates and manages a runtime glyph atlas texture for text rendering.
 *
 * The atlas supports all printable ASCII characters (U+0020–U+007E) plus the Unicode
 * replacement character U+FFFD (displayed when an unsupported character is requested).
 *
 * Glyphs are packed into a multi-row atlas with variable column widths so that the
 * texture remains roughly square (at most 512 × 512 px), which stays safely within
 * the WebGL-guaranteed minimum of 2048 px per dimension and avoids extreme aspect
 * ratios that could cause issues on older hardware.
 *
 * Each glyph cell is CELL_HEIGHT pixels tall and as wide as the character's measured
 * advance width (rounded up, with 1 px of padding on each side to prevent UV bleeding).
 */

import { gl } from './webgl.js';

// Types -------------------------------------------------------------------------

/**
 * UV coordinates and advance-width ratio for a single glyph in the atlas.
 * All UV values are in [0, 1] where (0, 0) is the bottom-left corner of the texture
 * (after UNPACK_FLIP_Y_WEBGL is applied during upload).
 */
interface GlyphMetrics {
	/** Left UV edge of the glyph cell. */
	u0: number;
	/** Bottom UV edge of the glyph cell (after Y-flip). */
	v0: number;
	/** Right UV edge of the glyph cell. */
	u1: number;
	/** Top UV edge of the glyph cell (after Y-flip). */
	v1: number;
	/**
	 * Advance width relative to CELL_HEIGHT. Multiply by the desired world-space
	 * character height (`size`) to get the world-space quad width for this glyph.
	 */
	advanceWidth: number;
}

// Constants -------------------------------------------------------------------------

/**
 * Height of every glyph cell in the atlas in pixels.
 * The font is rendered at {@link FONT_SIZE} px inside this cell.
 */
const CELL_HEIGHT = 64;

/** Font size used when rendering glyphs onto the atlas canvas. */
const FONT_SIZE = Math.round(CELL_HEIGHT * 0.8);

/** Font string passed to Canvas 2D context. */
const FONT_STRING = `bold ${FONT_SIZE}px sans-serif`;

/**
 * Horizontal padding (pixels) added on each side of a glyph cell to prevent
 * UV bleeding between adjacent cells at low resolutions / with mipmaps.
 */
const CELL_PADDING = 1;

/**
 * Target atlas width in pixels. Must be a power of two.
 * With ~96 glyphs at an average advance width of ~38 px (+ 2 px padding),
 * each row holds ≈ 12 glyphs, and all glyphs fit inside a 512 × 512 atlas.
 */
const ATLAS_WIDTH = 512;

/**
 * The Unicode replacement character (U+FFFD '?'). Rendered whenever
 * {@link renderText} encounters a character that is not in the atlas.
 */
const REPLACEMENT_CHAR = '\uFFFD';

/**
 * All characters pre-rendered into the atlas.
 *
 * Printable ASCII 0x20–0x7E (95 chars) followed by the replacement character
 * so that every out-of-range character has a visible fallback glyph.
 */
const SUPPORTED_CHARS: string[] = [
	...Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 0x20)),
	REPLACEMENT_CHAR,
];

// Variables -------------------------------------------------------------------------

/** WebGL texture for the glyph atlas. Lazily initialised on first use. */
let atlasTexture: WebGLTexture | undefined;

/**
 * Per-character metrics table.
 * Keys are individual characters; values describe where that glyph lives in the atlas.
 */
let metricsTable: Map<string, GlyphMetrics> | undefined;

// Functions -------------------------------------------------------------------------

/**
 * Returns the next integer that is a power of two and ≥ `n`.
 */
function nextPowerOfTwo(n: number): number {
	if (n <= 1) return 1;
	let p = 1;
	while (p < n) p <<= 1;
	return p;
}

/**
 * Builds the glyph atlas: measures every supported character, packs the glyphs
 * into rows, draws them onto a Canvas 2D, uploads the result as a WebGL texture,
 * and populates {@link metricsTable}.
 */
function initGlyphAtlas(): void {
	// ── 1. Measure every glyph ──────────────────────────────────────────────
	const measureCanvas = document.createElement('canvas');
	measureCanvas.width = ATLAS_WIDTH;
	measureCanvas.height = CELL_HEIGHT;
	const mCtx = measureCanvas.getContext('2d');
	if (!mCtx) throw new Error('Could not get 2D context for glyph measurement.');

	mCtx.font = FONT_STRING;

	/** Cell width (px) for each character, including padding on both sides. */
	const cellWidths: number[] = SUPPORTED_CHARS.map((ch) => {
		const measured = mCtx.measureText(ch).width;
		return Math.ceil(measured) + CELL_PADDING * 2;
	});

	// ── 2. Pack glyphs into rows ─────────────────────────────────────────────
	interface GlyphPlacement {
		char: string;
		cellX: number; // pixel X of left edge of cell (including left padding)
		cellY: number; // pixel Y of top edge of cell (row top, canvas-space, y-down)
		cellWidth: number;
	}

	const placements: GlyphPlacement[] = [];
	let cursorX = 0;
	let cursorY = 0;
	let numRows = 1;

	for (let i = 0; i < SUPPORTED_CHARS.length; i++) {
		const cw = cellWidths[i]!;

		if (cursorX + cw > ATLAS_WIDTH) {
			// Start a new row.
			cursorX = 0;
			cursorY += CELL_HEIGHT;
			numRows++;
		}

		placements.push({
			char: SUPPORTED_CHARS[i]!,
			cellX: cursorX,
			cellY: cursorY,
			cellWidth: cw,
		});

		cursorX += cw;
	}

	const atlasHeight = nextPowerOfTwo(numRows * CELL_HEIGHT);

	// ── 3. Draw all glyphs onto the atlas canvas ─────────────────────────────
	const atlasCanvas = document.createElement('canvas');
	atlasCanvas.width = ATLAS_WIDTH;
	atlasCanvas.height = atlasHeight;
	const ctx = atlasCanvas.getContext('2d');
	if (!ctx) throw new Error('Could not get 2D context for glyph atlas.');

	ctx.clearRect(0, 0, ATLAS_WIDTH, atlasHeight);
	ctx.fillStyle = 'white';
	ctx.textBaseline = 'middle';
	ctx.font = FONT_STRING;

	// Build the metrics table while drawing.
	const table = new Map<string, GlyphMetrics>();

	for (const p of placements) {
		// Draw glyph centred within its cell (excluding padding).
		const drawX = p.cellX + CELL_PADDING;
		const drawY = p.cellY + CELL_HEIGHT / 2;
		ctx.fillText(p.char, drawX, drawY);

		// UV coordinates: (0,0) = bottom-left after UNPACK_FLIP_Y_WEBGL.
		// Canvas Y increases downward; flipping maps canvasY → (atlasHeight - canvasY).
		const u0 = p.cellX / ATLAS_WIDTH;
		const u1 = (p.cellX + p.cellWidth) / ATLAS_WIDTH;
		// Cell top in flipped space is the larger V value.
		const v0 = (atlasHeight - (p.cellY + CELL_HEIGHT)) / atlasHeight;
		const v1 = (atlasHeight - p.cellY) / atlasHeight;

		// advanceWidth is the inner glyph width (without padding) relative to cell height.
		const innerWidth = p.cellWidth - CELL_PADDING * 2;
		const advanceWidth = innerWidth / CELL_HEIGHT;

		table.set(p.char, { u0, v0, u1, v1, advanceWidth });
	}

	// ── 4. Upload to GPU ─────────────────────────────────────────────────────
	const texture = gl.createTexture();
	if (!texture) throw new Error('Failed to create glyph atlas WebGL texture.');

	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
	gl.generateMipmap(gl.TEXTURE_2D);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	// CLAMP_TO_EDGE prevents UV bleeding at the atlas borders.
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.bindTexture(gl.TEXTURE_2D, null);

	atlasTexture = texture;
	metricsTable = table;
}

/** Lazily initialises the atlas on first access, then returns the WebGL texture. */
function getAtlasTexture(): WebGLTexture {
	if (atlasTexture === undefined) initGlyphAtlas();
	return atlasTexture!;
}

/**
 * Returns the {@link GlyphMetrics} for `char`, or `undefined` if the character
 * is not present in the atlas.
 *
 * Lazily initialises the atlas on first call.
 */
function getGlyphMetrics(char: string): GlyphMetrics | undefined {
	if (metricsTable === undefined) initGlyphAtlas();
	return metricsTable!.get(char);
}

/** Returns the metrics for the replacement character U+FFFD. Always defined. */
function getReplacementMetrics(): GlyphMetrics {
	const m = getGlyphMetrics(REPLACEMENT_CHAR);
	if (!m) throw new Error('Replacement glyph missing from atlas — this should never happen.');
	return m;
}

// Exports -------------------------------------------------------------------------

export { getAtlasTexture, getGlyphMetrics, getReplacementMetrics, REPLACEMENT_CHAR };

export type { GlyphMetrics };
