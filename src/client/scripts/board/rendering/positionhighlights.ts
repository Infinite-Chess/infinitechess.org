// src/client/scripts/board/rendering/positionhighlights.ts

/**
 * Renders the highlights the viewed position alone decides, on any board showing a game:
 * the last move's start and end squares, then the red glow around royals in check.
 */

import type { Board } from '../../../../shared/chess/logic/boardinit.js';
import type { Color } from '../../../../shared/types/color.js';
import type RenderContext from './RenderContext.js';
import type { Renderable } from '../../webgl/Renderable.js';
import type { BDCoords, Coords } from '../../../../shared/util/coordutil.js';

import moveutil from '../../../../shared/chess/logic/moveutil.js';
import bdcoords from '../../../../shared/util/bdcoords.js';
import gamefileutility from '../../../../shared/chess/logic/gamefileutility.js';

import space from './space.js';
import primitives from './primitives.js';
import preferences from '../../util/preferences.js';
import squarerendering from './squarerendering.js';

// Rendering -------------------------------------------------------------------

/** Renders the last move and check highlights, while zoomed in far enough to see squares. */
function render(ctx: RenderContext, boardsim: Board): void {
	if (ctx.boardpos.areZoomedOut()) return;
	renderLastMove(ctx, boardsim);
	renderCheck(ctx, boardsim);
}

// Last Move -------------------------------------------------------------------

/** Highlights the start and end squares of the most recently played move. */
function renderLastMove(ctx: RenderContext, boardsim: Board): void {
	const lastMove = moveutil.getCurrentMove(boardsim);
	if (!lastMove) return; // Don't render if last move is undefined.

	const color: Color = preferences.getLastMoveHighlightColor();
	const u_size: number = ctx.boardpos.getBoardScaleAsNumber();

	squarerendering
		.genModel(ctx, [lastMove.startCoords, lastMove.endCoords], color)
		.render(undefined, undefined, { u_size });
}

// Check -----------------------------------------------------------------------

/** Renders the red glow around all pieces in check on the currently-viewed move. */
function renderCheck(ctx: RenderContext, boardsim: Board): void {
	const royalsInCheck = gamefileutility.getCheckCoordsOfCurrentViewedPosition(boardsim);
	if (royalsInCheck.length === 0) return; // Nothing in check

	const model = genCheckHighlightModel(ctx, royalsInCheck);
	model.render();
}

/** Generates the buffer model of the red-glow around each royal piece currently in check. */
function genCheckHighlightModel(ctx: RenderContext, royalsInCheck: Coords[]): Renderable {
	const color = preferences.getCheckHighlightColor(); // [r,g,b,a]
	const colorOfPerimeter: Color = [color[0], color[1], color[2], 0]; // Same color, but zero opacity

	const boardPos = ctx.boardpos.getBoardPos();
	const boardScale = ctx.boardpos.getBoardScale();
	const outRad = 0.65 * ctx.boardpos.getBoardScaleAsNumber();
	const inRad = 0.3 * ctx.boardpos.getBoardScaleAsNumber();
	const resolution = 20;

	const data: number[] = [];
	for (let i = 0; i < royalsInCheck.length; i++) {
		const thisRoyalInCheckCoordsBD: BDCoords = bdcoords.fromCoords(royalsInCheck[i]!);
		const worldSpaceCoord = space.convertCoordToWorldSpace(
			thisRoyalInCheckCoordsBD,
			boardPos,
			boardScale,
		);
		const x = worldSpaceCoord[0];
		const y = worldSpaceCoord[1];

		const dataCircle: number[] = primitives.Circle(x, y, inRad, resolution, color);
		// prettier-ignore
		const dataRing: number[] = primitives.Ring(x, y, inRad, outRad, resolution, color, colorOfPerimeter);
		data.push(...dataCircle);
		data.push(...dataRing);
	}

	return ctx.renderable.createRenderable(data, 2, 'TRIANGLES', 'color', true);
}

// Exports ---------------------------------------------------------------------

export default {
	render,
};
