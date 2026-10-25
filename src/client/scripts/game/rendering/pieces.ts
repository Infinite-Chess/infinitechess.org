// src/client/scripts/game/rendering/pieces.ts

/**
 * This script renders all of our pieces on the board,
 * as models or mini images, and the ghost piece.
 */

import type { Mesh } from '../../board/rendering/piecemodels.js';
import type { Coords } from '../../../../shared/util/coordutil.js';
import type RenderContext from '../../board/rendering/RenderContext.js';

import meshes from '../../board/rendering/meshes.js';
import camera from '../../board/rendering/camera.js';
import boardpos from '../../board/rendering/boardpos.js';
import miniimage from './miniimage.js';
import piecemodels from '../../board/rendering/piecemodels.js';
import texturecache from '../../chess/rendering/texturecache.js';
import { createRenderable } from './gamerenderable.js';

// Constants -------------------------------------------------------------------

/** Opacity of ghost piece over legal move highlights. */
const GHOST_OPACITY: number = 0.4;

// Functions -------------------------------------------------------------------

/** Renders all of our pieces on the board, excluding voids, and mini images, if visible. */
function renderPiecesInGame(ctx: RenderContext, mesh: Mesh | undefined): void {
	// Skip individual piece rendering when zoomed out and miniimage is active (it renders them instead).
	if (!boardpos.areZoomedOut() || miniimage.isDisabled()) {
		piecemodels.renderAll(ctx, mesh);
	}
	miniimage.render();
}

/** Renders a semi-transparent piece at the specified coordinates. */
function renderGhostPiece(type: number, coords: Coords): void {
	const data = meshes.QuadWorld_ColorTexture(camera, boardpos, coords, [1, 1, 1, GHOST_OPACITY]);
	const model = createRenderable(
		data,
		2,
		'TRIANGLES',
		'colorTexture',
		true,
		texturecache.getTexture(type),
	);
	model.render();
}

// Exports ---------------------------------------------------------------------

export default {
	renderPiecesInGame,
	renderGhostPiece,
};
