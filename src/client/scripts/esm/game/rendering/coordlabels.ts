// src/client/scripts/esm/game/rendering/coordlabels.ts

/**
 * Renders coordinate labels (file numbers along the bottom, rank numbers along
 * the left side) in a style similar to classical chess board notation.
 *
 * Labels are fixed-size in screen pixels regardless of zoom level.
 * When zoomed out, labels are skipped to prevent overlap, using the step
 * sequence [1, 2, 5, 10, 20, 50, 100, ...]. The step is determined by the
 * widest file label in the current view (the more restrictive axis), which
 * automatically ensures rank labels also won't overlap.
 */

import type { Color } from '../../../../../shared/util/math/math.js';

import bimath from '../../../../../shared/util/math/bimath.js';
import bdcoords from '../../../../../shared/chess/util/bdcoords.js';

import space from '../misc/space.js';
import camera from './camera.js';
import boardpos from './boardpos.js';
import boardtiles from './boardtiles.js';
import perspective from './perspective.js';
import textrenderer from './text/textrenderer.js';

// Constants -------------------------------------------------------------------------

/** Virtual-pixel height of each coordinate label. Zoom-independent. */
const LABEL_SIZE_PX = 24;
/** Virtual-pixel gap between the screen edge and the near edge of each label. */
const LABEL_PADDING_PX = 5;
/** RGBA color applied to all coordinate labels. */
const LABEL_COLOR: Color = [0, 0, 0, 0.4];
/** Significant figures used when a coordinate is too long to display in full. */
const COORD_E_PRECISION = 3;
/** Labels with more characters than this threshold switch to scientific notation. */
const MAX_FULL_DISPLAY_LENGTH = 7;
/** Gap between adjacent labels as a multiple of the label height. */
const LABEL_GAP_SIZE = 0.4;

/**
 * Fraction of the glyph cell height that lies below the alphabetic baseline.
 * Derived from glyphatlas.ts constants:
 *   FONT_SIZE = CELL_HEIGHT * 0.8  (FONT_SIZE_RATIO = 0.8)
 *   textBaseline = 'middle'  → em midpoint is at CELL_HEIGHT / 2
 *
 * For typical sans-serif: ascent ≈ 0.8 × FONT_SIZE, descent ≈ 0.2 × FONT_SIZE.
 * The baseline sits (ascent − descent) / 2 = 0.3 × FONT_SIZE below the em midpoint,
 * so the fraction of the cell below the baseline is 0.5 − 0.3 × 0.8 ≈ 0.26.
 *
 * Applied as a downward shift to file labels so the invisible descender space goes below
 * the screen edge rather than acting as additional padding which the rank labels does not have.
 */
const ATLAS_DESCENDER_FRACTION = 0.5 - 0.3 * 0.8; // ≈ 0.26

// Functions -------------------------------------------------------------------------

/**
 * Formats a BigInt into scientific notation with the given number of significant figures.
 * e.g., formatBigIntExponential(123456789n, 3) => "1.23e8"
 */
function formatBigIntExponential(bigint: bigint, precision: number): string {
	const isNegative = bigint < 0n;
	const absString: string = bimath.abs(bigint).toString();

	const exponent: number = absString.length - 1;
	const mantissaDigits: string = absString.substring(0, precision);

	let mantissa: string;
	if (mantissaDigits.length > 1) {
		mantissa = mantissaDigits[0] + '.' + mantissaDigits.substring(1);
	} else {
		mantissa = mantissaDigits;
	}

	return `${isNegative ? '-' : ''}${mantissa}e${exponent}`;
}

/** Returns the display string for a coordinate label, switching to scientific notation for large values. */
function formatCoord(coord: bigint): string {
	const full = coord.toString();
	if (full.length <= MAX_FULL_DISPLAY_LENGTH) return full;
	return formatBigIntExponential(coord, COORD_E_PRECISION);
}

/**
 * Returns the smallest value from the sequence [1, 2, 5, 10, 20, 50, 100, 200, 500, ...]
 * that is >= minStep.
 */
function computeStep(minStep: number): number {
	const magnitudes = [1, 2, 5];
	let power = 1;
	while (true) {
		for (const m of magnitudes) {
			const step = m * power;
			if (step >= minStep) return step;
		}
		power *= 10;
	}
}

/** Returns the smallest multiple of `multiple` that is >= `n`. */
function ceilToMultiple(n: bigint, multiple: bigint): bigint {
	const mod = ((n % multiple) + multiple) % multiple;
	return mod === 0n ? n : n + multiple - mod;
}

// API -------------------------------------------------------------------------

/** Renders the file (x-axis) and rank (y-axis) coordinate labels for the current frame. */
function render(): void {
	if (perspective.getEnabled()) return;

	const scale = boardpos.getBoardScaleAsNumber();
	const sizeWorld = space.convertPixelsToWorldSpace_Virtual(LABEL_SIZE_PX);
	const paddingWorld = space.convertPixelsToWorldSpace_Virtual(LABEL_PADDING_PX);
	const screenBox = camera.getScreenBoundingBox(false);
	const tileBox = boardtiles.gboundingBox();
	// Shrink the bounding box by 1 on each side to skip cut off edge tiles.
	tileBox.left += 1n;
	tileBox.right -= 1n;
	tileBox.bottom += 1n;
	tileBox.top -= 1n;

	if (tileBox.left > tileBox.right || tileBox.bottom > tileBox.top) return;

	// The step is driven by the widest visible file label (width-based overlap).
	// File labels overlap sooner than rank labels because characters are wider than
	// they are tall, so a step sufficient for files is automatically sufficient for ranks.
	const widestFileLabelWidth = Math.max(
		textrenderer.getTextWidth(formatCoord(tileBox.left), sizeWorld),
		textrenderer.getTextWidth(formatCoord(tileBox.right), sizeWorld),
	);
	const minStep = (widestFileLabelWidth + sizeWorld * LABEL_GAP_SIZE) / scale;

	// Guard against degenerate states (e.g., extreme zoom-out overflowing floats).
	if (!Number.isFinite(minStep) || minStep > Number.MAX_SAFE_INTEGER / 10) return;

	const step = computeStep(minStep);
	const stepBig = BigInt(step);

	// X-axis: file labels centered on each file column, fixed at the bottom of the screen.
	// Shifted down by ATLAS_DESCENDER_FRACTION so the invisible descender space goes below
	// the screen edge rather than adding unwanted gap above the visible characters.
	const fileWorldY =
		screenBox.bottom + paddingWorld + sizeWorld * (0.5 - ATLAS_DESCENDER_FRACTION);
	const firstFile = ceilToMultiple(tileBox.left, stepBig);
	for (let file = firstFile; file <= tileBox.right; file += stepBig) {
		const worldX = space.convertCoordToWorldSpace(bdcoords.FromCoords([file, 0n]))[0];
		// prettier-ignore
		textrenderer.render(formatCoord(file), [worldX, fileWorldY], sizeWorld, LABEL_COLOR, 'center');
	}

	// Y-axis: rank labels left-aligned from the left edge of the screen, at each rank row.
	const rankWorldX = screenBox.left + paddingWorld;
	const firstRank = ceilToMultiple(tileBox.bottom, stepBig);
	for (let rank = firstRank; rank <= tileBox.top; rank += stepBig) {
		const rankWorldY = space.convertCoordToWorldSpace(bdcoords.FromCoords([0n, rank]))[1];
		// prettier-ignore
		textrenderer.render(formatCoord(rank), [rankWorldX, rankWorldY], sizeWorld, LABEL_COLOR, 'left');
	}
}

// Exports -------------------------------------------------------------------------

export default { render, formatBigIntExponential };
