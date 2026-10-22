// src/client/scripts/esm/game/rendering/highlights/highlightline.ts

/**
 * This script renders our single-line legal sliding moves
 * when we are zoomed out far.
 */

import type { Color } from '../../../../../../shared/types/color.js';
import type { BDCoords } from '../../../../../../shared/util/coordutil.js';
import type { BoundingBoxBD } from '../../../../../../shared/util/math/bounds.js';
import type { LineCoefficients } from '../../../../../../shared/util/math/vectors.js';
import type { Renderable } from '../../../webgl/Renderable.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import space from '../../../board/rendering/space.js';
import camera from '../../../board/rendering/camera.js';
import boardpos from '../../../board/rendering/boardpos.js';
import boardview from '../boardview.js';
import perspective from '../perspective.js';
import { createRenderable } from '../gamerenderable.js';

// Types -----------------------------------------------------------------------

/**
 * A single highlight line.
 *
 * Coords are clamped to screen edge, since
 * we can't render lines out to infinity.
 */
export interface Line {
	/** The starting point coords. May have floating point inaccuracy. */
	start: BDCoords;
	/** The ending point coords. May have floating point inaccuracy. */
	end: BDCoords;
	/** The equation of the line in general form. [A,B,C]. PERFECT integers, use this for calculating intersections. */
	coefficients: LineCoefficients;
	/** The color of the line. */
	color: Color;
	/**
	 * The piece type that should be displayed when hovering over the line, if there is one.
	 * Otherwise, a glow dot is rendered when hovering over it.
	 */
	piece?: number;
}

// Render Range ----------------------------------------------------------------

/**
 * Returns the respective bounding box inside which we should render highlight lines out to,
 * according to whether we're in perspective mode or not.
 */
function getRenderRange(): BoundingBoxBD {
	if (!perspective.getEnabled()) {
		// 2D mode
		return boardview.gboundingBoxFloat();
	} else {
		// Perspective mode

		const DIST_TO_RENDER_BOARD_BD: BigDecimal = bd.fromNumber(camera.DIST_TO_RENDER_BOARD);
		const scale: BigDecimal = boardpos.getBoardScale();
		const position = boardpos.getBoardPos();

		const DIST_TO_RENDER_BOARD_TILES: BigDecimal = bd.divideFloating(
			DIST_TO_RENDER_BOARD_BD,
			scale,
		);

		// Shift the box based on our current board position
		return {
			left: bd.subtract(position[0], DIST_TO_RENDER_BOARD_TILES),
			right: bd.add(position[0], DIST_TO_RENDER_BOARD_TILES),
			bottom: bd.subtract(position[1], DIST_TO_RENDER_BOARD_TILES),
			top: bd.add(position[1], DIST_TO_RENDER_BOARD_TILES),
		};
	}
}

// Line Models -----------------------------------------------------------------

/** Generates the buffer model of the given highlight lines. */
function genLinesModel(lines: Line[]): Renderable {
	const boardPos = boardpos.getBoardPos();
	const boardScale = boardpos.getBoardScale();
	const data: number[] = lines.flatMap((line) => getLineData(line, boardPos, boardScale));
	return createRenderable(data, 2, 'LINES', 'color', true);
}

/** Returns the world-space vertex data of a single highlight line. */
function getLineData(line: Line, boardPos: BDCoords, boardScale: BigDecimal): number[] {
	const startWorld = space.convertCoordToWorldSpace(line.start, boardPos, boardScale);
	const endWorld = space.convertCoordToWorldSpace(line.end, boardPos, boardScale);
	const [r, g, b, a] = line.color;
	// prettier-ignore
	return [
		//         Vertex                 Color
		startWorld[0], startWorld[1],   r, g, b, a,
		endWorld[0], endWorld[1],       r, g, b, a
	];
}

// Exports ---------------------------------------------------------------------

export default {
	// Render Range
	getRenderRange,
	// Line Models
	genLinesModel,
};
