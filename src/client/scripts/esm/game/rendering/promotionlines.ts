
// src/client/scripts/esm/game/rendering/promotionlines.ts

/**
 * This script handles the rendering of our promotion lines.
 */


import type { Color } from '../../../../../shared/util/math/math.js';

import boardtiles from './boardtiles.js';
import gameslot from '../chess/gameslot.js';
import boardpos from './boardpos.js';
import bd from '../../../../../shared/util/bigdecimal/bigdecimal.js';
import { players } from '../../../../../shared/chess/util/typeutil.js';
import { createRenderable } from '../../webgl/Renderable.js';
import primitives from './primitives.js';
import camera from './camera.js';
import meshes from './meshes.js';


// ===================================== Constants =====================================


/** How many tiles on both ends the promotion lines should extend past the farthest piece */
const EXTRA_LENGTH = 2;
/** Vertical thickness of the promotion lines. */
const THICKNESS = 0.01;


// ===================================== Functions =====================================


function render(): void {
	const gamefile = gameslot.getGamefile()!;
	if (gamefile.basegame.gameRules.promotionRanks === undefined) return; // No promotion ranks in this game
	
	// Generate the vertex data

	const position = boardpos.getBoardPos();
	const scale = boardpos.getBoardScaleAsNumber();

	let left: number;
	let right: number;

	if (gamefile.boardsim.editor) {
		// In editor mode, the promotion lines extend to the edges of the screen
		({ left, right } = camera.getRespectiveScreenBox());
	} else {
		// Round the start position box away to encapsulate the entirity of all squares
		const floatingBox = meshes.expandTileBoundingBoxToEncompassWholeSquare(gamefile.boardsim.startSnapshot.box);
		left = (bd.toNumber(bd.subtract(floatingBox.left, position[0])) - EXTRA_LENGTH) * scale;
		right = (bd.toNumber(bd.subtract(floatingBox.right, position[0])) + EXTRA_LENGTH) * scale;
	}

	const squareCenterNum = boardtiles.getSquareCenterAsNumber();
	const color: Color = [0,0,0,1];
	const vertexData: number[] = [];

	addDataForSide(gamefile.basegame.gameRules.promotionRanks[players.WHITE]!, 1);
	addDataForSide(gamefile.basegame.gameRules.promotionRanks[players.BLACK]!, 0);

	function addDataForSide(ranks: bigint[], yShift: 1 | 0): void {
		ranks.forEach(rank => {
			const rankBD = bd.FromBigInt(rank);
			const relativeRank: number = bd.toNumber(bd.subtract(rankBD, position[1])); // Subtract our board position

			const bottom = (relativeRank - squareCenterNum + yShift - THICKNESS) * scale;
			const top = (relativeRank - squareCenterNum + yShift + THICKNESS) * scale;
			vertexData.push(...primitives.Quad_Color(left, bottom, right, top, color));
		});
	}

	// Create and Render the model

	createRenderable(vertexData, 2, "TRIANGLES", 'color', true).render();
}


// ===================================== Exports =====================================


export default {
	render
};