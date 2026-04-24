// src/client/scripts/esm/game/rendering/coordinates.ts

/**
 * Board Coordinates
 *
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

import bounds from '../../../../../shared/util/math/bounds.js';
import bdcoords from '../../../../../shared/chess/util/bdcoords.js';

import space from '../misc/space.js';
import camera from './camera.js';
import arrows from './arrows/arrows.js';
import boardpos from './boardpos.js';
import boardtiles from './boardtiles.js';
import primitives from './primitives.js';
import guigameinfo from '../gui/guigameinfo.js';
import perspective from './perspective.js';
import preferences from '../../components/header/preferences.js';
import textrenderer from './text/textrenderer.js';
import { createRenderable } from '../../webgl/Renderable.js';
import { ATLAS_DESCENDER_FRACTION } from './text/glyphatlas.js';

// Constants -------------------------------------------------------------------------

/** Virtual-pixel height of each coordinate label at full size. Zoom-independent. */
const LABEL_SIZE_PX = 24;
/**
 * Controls how labels shrink on small screens.
 * The smaller canvas dimension (min of width and height) is used as the screen-size metric.
 */
const LABEL_SHRINK = {
	/**
	 * Virtual-pixel threshold for the smaller canvas dimension.
	 * Above this value labels are always {@link LABEL_SIZE_PX} tall; below it they start shrinking.
	 */
	threshold: 1000,
	/**
	 * How aggressively labels shrink below the threshold.
	 * At `1.0` labels scale fully to zero as the screen shrinks to zero.
	 * At `0.5` they only ever shrink to half of {@link LABEL_SIZE_PX} no matter how small the screen gets.
	 * Valid range: [0, 1].
	 */
	rate: 0.5,
} as const;
/** Virtual-pixel gap between the screen edge and the near edge of each label. */
const LABEL_PADDING_PX = 5;
/** RGBA color applied to all coordinate labels. */
const LABEL_COLOR: Color = [0, 0, 0, 0.65];
/** Labels with more characters than this threshold switch to the abbreviated "...XX" format. */
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

/** Returns the label size in virtual pixels for the current frame. */
function calcLabelSizePx(): number {
	const minDim = Math.min(
		camera.getCanvasWidthVirtualPixels(),
		camera.getCanvasHeightVirtualPixels(),
	);
	if (minDim >= LABEL_SHRINK.threshold) return LABEL_SIZE_PX;
	const ratio = minDim / LABEL_SHRINK.threshold;
	return LABEL_SIZE_PX * (1 - LABEL_SHRINK.rate * (1 - ratio));
}

/** Returns the display string for a coordinate label, abbreviating large values to "...XX" (last two digits). */
function formatCoord(coord: bigint): string {
	const full = coord.toString();
	if (full.length <= MAX_FULL_DISPLAY_LENGTH) return full;
	return '...' + full.slice(-2);
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
	if (!preferences.getCoordinatesEnabled()) return; // Not enabled in the setting dropdown
	if (perspective.getEnabled()) return;

	const scale = boardpos.getBoardScale();
	const labelSizePx = calcLabelSizePx();
	const sizeWorld = space.convertPixelsToWorldSpace_Virtual(labelSizePx);
	const paddingWorld = space.convertPixelsToWorldSpace_Virtual(LABEL_PADDING_PX);
	const screenBox = camera.getScreenBoundingBox(false);
	const tileBox = boardtiles.gboundingBox(false);
	// Shrink the bounding box by 1 on each side to skip cut off edge tiles.
	tileBox.left += 1n;
	tileBox.right -= 1n;
	tileBox.bottom += 1n;
	tileBox.top -= 1n;

	if (tileBox.left > tileBox.right || tileBox.bottom > tileBox.top) return;

	// The step is driven by the widest visible file label (width-based overlap).
	// File labels overlap sooner than rank labels because characters are wider than
	// they are tall, so a step sufficient for files is automatically sufficient for ranks.

	// If both endpoints are abbreviated but the visible range spans the non-abbreviated zone,
	// the endpoints would underestimate the widest label. Guard against that by also
	// measuring the widest possible non-abbreviated label when the zone is in range.
	const unabbrevMax = 10n ** BigInt(MAX_FULL_DISPLAY_LENGTH) - 1n; // e.g. 9999999n
	const unabbrevMin = -(10n ** BigInt(MAX_FULL_DISPLAY_LENGTH - 1) - 1n); // e.g. -999999n
	// Only needed when at least one endpoint is abbreviated (outside the non-abbreviated zone)
	// but the range still spans into it, meaning interior labels will be wider than the endpoints.
	const hasUnabbrevInRange =
		(tileBox.left < unabbrevMin || tileBox.right > unabbrevMax) &&
		tileBox.left <= unabbrevMax &&
		tileBox.right >= unabbrevMin;
	const widestFileLabelWidth = Math.max(
		textrenderer.getTextWidth(formatCoord(tileBox.left), sizeWorld),
		textrenderer.getTextWidth(formatCoord(tileBox.right), sizeWorld),
		hasUnabbrevInRange
			? textrenderer.getTextWidth('9'.repeat(MAX_FULL_DISPLAY_LENGTH), sizeWorld)
			: 0,
	);
	const threshold = widestFileLabelWidth + sizeWorld * LABEL_GAP_SIZE;
	const stepBig = computeStep(threshold, scale);

	// Pre-compute arrow indicator hitboxes for this frame to skip overlapping labels.
	const arrowHalfWidth =
		arrows.getArrowIndicatorHalfWidth() +
		space.convertPixelsToWorldSpace_Virtual(LABEL_ARROW_PADDING_PX);
	const arrowLocations = arrows.getAllArrowWorldLocations();

	const isBlackPerspective = perspective.getIsViewingBlackPerspective();
	// Arrow hitbox locations in black's perspective need to be negated so overlap detection remains accurate.
	const effectiveArrowLocations: DoubleCoords[] = isBlackPerspective
		? arrowLocations.map((loc) => [-loc[0], -loc[1]])
		: arrowLocations;

	// X-axis: file labels centered on each file column, fixed at the bottom of the screen.
	// Shifted down by ATLAS_DESCENDER_FRACTION so the invisible descender space goes below
	// the screen edge rather than adding unwanted gap above the visible characters.
	// Shifted up by the game info bar height so labels aren't covered when it's visible.
	const gameInfoBarOffsetWorld = space.convertPixelsToWorldSpace_Virtual(
		guigameinfo.getHeightOfGameInfoBar(),
	);
	const fileWorldY =
		screenBox.bottom +
		gameInfoBarOffsetWorld +
		paddingWorld +
		sizeWorld * (0.5 - ATLAS_DESCENDER_FRACTION);
	const firstFile = ceilToMultiple(tileBox.left, stepBig);

	// Y-axis: rank labels left-aligned from the left edge of the screen, at each rank row.
	const rankWorldX = screenBox.left + paddingWorld;
	const firstRank = ceilToMultiple(tileBox.bottom, stepBig);

	// Render without any rotation so glyphs always appear upright.
	// In black's perspective the view matrix carries a 180° Z-rotation that would otherwise flip the text.
	perspective.renderWithoutPerspectiveRotations(() => {
		for (let file = firstFile; file <= tileBox.right; file += stepBig) {
			let worldX = space.convertCoordToWorldSpace(bdcoords.FromCoords([file, 0n]))[0];
			if (isBlackPerspective) worldX = -worldX; // Invert world coords
			// prettier-ignore
			renderLabel(formatCoord(file), [worldX, fileWorldY], sizeWorld, 'center', arrowHalfWidth, effectiveArrowLocations);
		}
		for (let rank = firstRank; rank <= tileBox.top; rank += stepBig) {
			let worldY = space.convertCoordToWorldSpace(bdcoords.FromCoords([0n, rank]))[1];
			if (isBlackPerspective) worldY = -worldY; // Invert world coords
			// prettier-ignore
			renderLabel(formatCoord(rank), [rankWorldX, worldY], sizeWorld, 'left', arrowHalfWidth, effectiveArrowLocations);
		}
	});
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
