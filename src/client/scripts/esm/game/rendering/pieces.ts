// src/client/scripts/esm/game/rendering/pieces.ts

/**
 * This script renders all of our pieces on the board,
 * including voids, and mini images.
 */

import type { Mesh } from '../../board/rendering/piecemodels.js';
import type { Coords } from '../../../../../shared/util/coordutil.js';
import type RenderContext from '../../board/rendering/RenderContext.js';

import meshes from '../../board/rendering/meshes.js';
import boardpos from '../../board/rendering/boardpos.js';
import miniimage from './miniimage.js';
import piecemodels from '../../board/rendering/piecemodels.js';
import texturecache from '../../chess/rendering/texturecache.js';
import { createRenderable } from '../../board/rendering/renderable.js';

// Variables ---------------------------------------------------------------------

/** Opacity of ghost piece over legal move highlights. Default: 0.4 */
const ghostOpacity: number = 0.4;

// Functions -----------------------------------------------------------------------

/**
 * Renders all of our pieces on the board,
 * including voids, and mini images, if visible.
 */
function renderPiecesInGame(ctx: RenderContext, mesh: Mesh | undefined): void {
	// Skip individual piece rendering when zoomed out and miniimage is active (it renders them instead).
	if (!boardpos.areZoomedOut() || miniimage.isDisabled()) {
		piecemodels.renderAll(ctx, mesh);
	}
	miniimage.render();
}

/** Renders a semi-transparent piece at the specified coordinates. */
function renderGhostPiece(type: number, coords: Coords): void {
	const data = meshes.QuadWorld_ColorTexture(coords, [1, 1, 1, ghostOpacity]);
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

// ------------------------------------------------------------------------------

export default {
	renderPiecesInGame,
	renderGhostPiece,
};
