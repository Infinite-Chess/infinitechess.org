// src/client/scripts/esm/board/rendering/squarerendering.ts

/**
 * This script knows how to generate buffer
 * models for rendering square highlights, such as:
 *
 * * Last move highlight
 * * Square annotations
 * * Premove highlights
 */

import type { Color } from '../../../../../shared/types/color.js';
import type { Coords } from '../../../../../shared/util/coordutil.js';
import type RenderContext from './RenderContext.js';
import type { Renderable } from '../../webgl/Renderable.js';

import bdcoords from '../../../../../shared/util/bdcoords.js';

import space from './space.js';
import instancedshapes from './instancedshapes.js';

// Constants -------------------------------------------------------------------

/** The opacity square highlights are rendered at while hovered. */
const HOVER_OPACITY = 0.5;

// Functions -------------------------------------------------------------------

/**
 * Generates a renderable buffer model for square highlights from given coordinates.
 * Doesn't require any position or scale tranformations before rendering, you can just call
 * `.render(undefined, undefined, { u_size: ctx.boardpos.getBoardScaleAsNumber() });` on the returned model.
 *
 * This type of model requires regeneration every single frame, so don't use it
 * if you have an arbitrary number of squares to render.
 */
function genModel(ctx: RenderContext, highlights: Coords[], color: Color): Renderable {
	const vertexData: number[] = instancedshapes.getDataLegalMoveSquare(color);
	const instanceData: number[] = [];

	const boardPos = ctx.boardpos.getBoardPos();
	const boardScale = ctx.boardpos.getBoardScale();
	highlights.forEach((coords) => {
		const worldLoc = space.convertCoordToWorldSpace(
			bdcoords.fromCoords(coords),
			boardPos,
			boardScale,
		);
		instanceData.push(...worldLoc);
	});

	return ctx.renderable.createRenderable_Instanced(
		vertexData,
		instanceData,
		'TRIANGLES',
		'highlights',
		true,
	);
}

export default {
	// Constants
	HOVER_OPACITY,
	// Functions
	genModel,
};
