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
import type { DoubleCoords } from '../../../../../shared/chess/util/coordutil.js';
import type { DoubleBoundingBox } from '../../../../../shared/util/math/bounds.js';

import bd, { BigDecimal, toNumber } from '@naviary/bigdecimal';

import bimath from '../../../../../shared/util/math/bimath.js';
import bounds from '../../../../../shared/util/math/bounds.js';
import bdcoords from '../../../../../shared/chess/util/bdcoords.js';

import space from '../misc/space.js';
import camera from './camera.js';
import arrows from './arrows/arrows.js';
import boardpos from './boardpos.js';
import boardtiles from './boardtiles.js';
import primitives from './primitives.js';
import perspective from './perspective.js';
import textrenderer from './text/textrenderer.js';
import { createRenderable } from '../../webgl/Renderable.js';
import { ATLAS_DESCENDER_FRACTION } from './text/glyphatlas.js';

// Constants -------------------------------------------------------------------------

/** Virtual-pixel height of each coordinate label. Zoom-independent. */
const LABEL_SIZE_PX = 24;
/** Virtual-pixel gap between the screen edge and the near edge of each label. */
const LABEL_PADDING_PX = 5;
/** RGBA color applied to all coordinate labels. */
const LABEL_COLOR: Color = [0, 0, 0, 0.65];
/** Significant figures used when a coordinate is too long to display in full. */
const COORD_E_PRECISION = 3;
/** Labels with more characters than this threshold switch to scientific notation. */
const MAX_FULL_DISPLAY_LENGTH = 7;
/** Gap between adjacent labels as a multiple of the label height. */
const LABEL_GAP_SIZE = 0.4;
/**
 * Extra padding, in virual-pixels, added to each side
 * of a label's hitbox when testing against arrow indicator hitboxes.
 */
const LABEL_ARROW_PADDING_PX = 6;

/** Whether to render a wireframe outline of each label's bounding box for debugging. */
const DEBUG_RENDER_LABEL_BOUNDS = false;

// Functions -------------------------------------------------------------------------

/** Returns the display string for a coordinate label, switching to scientific notation for large values. */
function formatCoord(coord: bigint): string {
	const full = coord.toString();
	if (full.length <= MAX_FULL_DISPLAY_LENGTH) return full;
	return bimath.formatBigIntExponential(coord, COORD_E_PRECISION);
}

/**
 * Returns the smallest value from the sequence [1, 2, 5, 10, 20, 50, 100, 200, 500, ...]
 * such that `step * scale >= threshold`.
 */
function computeStep(threshold: number, scale: BigDecimal): bigint {
	const magnitudes = [1n, 2n, 5n];
	let power = 1n;
	while (true) {
		for (const m of magnitudes) {
			const step = m * power;
			// Multiplies rather than divides so that an arbitrarily small `scale` (BigDecimal)
			// never causes float overflow or a division-by-zero. `toNumber` is safe here because
			// values too large to represent become Infinity (still >= threshold) and values too
			// small become 0 (still < threshold).
			if (toNumber(bd.multiply(bd.fromBigInt(step), scale)) >= threshold) return step;
		}
		power *= 10n;
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

	const scale = boardpos.getBoardScale();
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
	const threshold = widestFileLabelWidth + sizeWorld * LABEL_GAP_SIZE;
	const stepBig = computeStep(threshold, scale);

	// Pre-compute arrow indicator hitboxes for this frame to skip overlapping labels.
	const arrowHalfWidth =
		arrows.getArrowIndicatorHalfWidth() +
		space.convertPixelsToWorldSpace_Virtual(LABEL_ARROW_PADDING_PX);
	const arrowLocations = arrows.getAllArrowWorldLocations();

	// X-axis: file labels centered on each file column, fixed at the bottom of the screen.
	// Shifted down by ATLAS_DESCENDER_FRACTION so the invisible descender space goes below
	// the screen edge rather than adding unwanted gap above the visible characters.
	const fileWorldY =
		screenBox.bottom + paddingWorld + sizeWorld * (0.5 - ATLAS_DESCENDER_FRACTION);
	const firstFile = ceilToMultiple(tileBox.left, stepBig);
	for (let file = firstFile; file <= tileBox.right; file += stepBig) {
		const worldX = space.convertCoordToWorldSpace(bdcoords.FromCoords([file, 0n]))[0];
		// prettier-ignore
		renderLabel(formatCoord(file), [worldX, fileWorldY], sizeWorld, 'center', arrowHalfWidth, arrowLocations);
	}

	// Y-axis: rank labels left-aligned from the left edge of the screen, at each rank row.
	const rankWorldX = screenBox.left + paddingWorld;
	const firstRank = ceilToMultiple(tileBox.bottom, stepBig);
	for (let rank = firstRank; rank <= tileBox.top; rank += stepBig) {
		const rankWorldY = space.convertCoordToWorldSpace(bdcoords.FromCoords([0n, rank]))[1];
		// prettier-ignore
		renderLabel(formatCoord(rank), [rankWorldX, rankWorldY], sizeWorld, 'left', arrowHalfWidth, arrowLocations);
	}
}

/**
 * Renders a single coordinate label at the given position, unless its hitbox
 * intersects an arrow indicator hitbox (expanded by the current arrow padding).
 */
function renderLabel(
	label: string,
	coords: DoubleCoords,
	sizeWorld: number,
	align: 'left' | 'center' | 'right',
	arrowHalfWidth: number,
	arrowLocations: DoubleCoords[],
): void {
	const labelBounds = textrenderer.getTextBounds(label, coords, sizeWorld, align);
	for (const loc of arrowLocations) {
		if (
			!bounds.areBoxesDisjoint(labelBounds, {
				left: loc[0] - arrowHalfWidth,
				right: loc[0] + arrowHalfWidth,
				bottom: loc[1] - arrowHalfWidth,
				top: loc[1] + arrowHalfWidth,
			})
		)
			return; // Skip, it overlaps an arrow indicator.
	}
	// Proceed to render
	textrenderer.render(label, coords, sizeWorld, LABEL_COLOR, align);
	if (DEBUG_RENDER_LABEL_BOUNDS) renderLabelBoundsOutline(labelBounds);
}

/**
 * [DEBUG] Renders a wireframe outline of a label's bounding box.
 * Only called when {@link DEBUG_RENDER_LABEL_BOUNDS} is `true`.
 */
function renderLabelBoundsOutline(labelBounds: DoubleBoundingBox): void {
	const DEBUG_BOUNDS_COLOR: Color = [1, 0, 0, 1]; // Red
	const data = primitives.Rect(
		labelBounds.left,
		labelBounds.bottom,
		labelBounds.right,
		labelBounds.top,
		DEBUG_BOUNDS_COLOR,
	);
	createRenderable(data, 2, 'LINE_LOOP', 'color', true).render();
}

// Exports -------------------------------------------------------------------------

export default { render };
