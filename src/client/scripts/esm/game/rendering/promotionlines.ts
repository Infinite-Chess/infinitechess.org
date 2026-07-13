// src/client/scripts/esm/game/rendering/promotionlines.ts

/**
 * This script handles the rendering of our promotion lines.
 */

import type { Color } from '../../../../../shared/util/math/math.js';
import type { Promotion } from '../../../../../shared/chess/util/gamerules.js';
import type RenderContext from './RenderContext.js';
import type { BoundingBox } from '../../../../../shared/util/math/bounds.js';

import bd from '@naviary/bigdecimal';

import { players as p } from '../../../../../shared/chess/util/typeutil.js';

import meshes from './meshes.js';
import primitives from './primitives.js';
import boardgeometry from './boardgeometry.js';

// ===================================== Constants =====================================

/** How many tiles on both ends the promotion lines should extend past the farthest piece */
const EXTRA_LENGTH = 2;
/** Vertical thickness of the promotion lines. */
const THICKNESS = 0.01;

// ===================================== Functions =====================================

/**
 * Renders the promotion lines for the given promotion rules.
 * @param ctx - The render context to draw into.
 * @param promotion - The promotion rules, if any.
 * @param startBox - The starting position bounding box. When undefined, lines extend to screen edges.
 */
function render(
	ctx: RenderContext,
	promotion: Promotion | undefined,
	startBox?: BoundingBox,
): void {
	if (promotion === undefined) return; // No promotion ranks in this game

	// Generate the vertex data

	const position = ctx.boardpos.getBoardPos();
	const scale = ctx.boardpos.getBoardScaleAsNumber();

	let left: number;
	let right: number;

	if (startBox === undefined) {
		// Lines extend to the edges of the screen
		({ left, right } = ctx.camera.getRespectiveScreenBox());
	} else {
		// Round the start position box away to encapsulate the entirety of all squares
		const floatingBox = meshes.expandTileBoundingBoxToEncompassWholeSquare(startBox);
		left = (bd.toNumber(bd.subtract(floatingBox.left, position[0])) - EXTRA_LENGTH) * scale;
		right = (bd.toNumber(bd.subtract(floatingBox.right, position[0])) + EXTRA_LENGTH) * scale;
	}

	const squareCenterNum = boardgeometry.getSquareCenterAsNumber();
	const color: Color = [0, 0, 0, 1];
	const vertexData: number[] = [];

	addDataForSide(promotion.ranks[p.WHITE], 1);
	addDataForSide(promotion.ranks[p.BLACK], 0);

	function addDataForSide(ranks: bigint[] | undefined, yShift: 1 | 0): void {
		if (!ranks) return;
		ranks.forEach((rank) => {
			const rankBD = bd.fromBigInt(rank);
			const relativeRank: number = bd.toNumber(bd.subtract(rankBD, position[1])); // Subtract our board position

			const bottom = (relativeRank - squareCenterNum + yShift - THICKNESS) * scale;
			const top = (relativeRank - squareCenterNum + yShift + THICKNESS) * scale;
			vertexData.push(...primitives.Quad_Color(left, bottom, right, top, color));
		});
	}

	// Create and Render the model

	ctx.renderable.createRenderable(vertexData, 2, 'TRIANGLES', 'color', true).render();
}

// ===================================== Exports =====================================

export default {
	render,
};
