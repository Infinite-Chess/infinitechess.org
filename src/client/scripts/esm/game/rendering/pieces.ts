
/**
 * This script renders all of our pieces on the board,
 * including voids, and mini images.
 */

import type { Coords } from '../../chess/util/coordutil.js';
// @ts-ignore
import type { gamefile } from '../../chess/logic/gamefile.js';


import spritesheet from './spritesheet.js';
import { createModel } from './buffermodel.js';
import piecemodels from './piecemodels.js';
// @ts-ignore
import miniimage from './miniimage.js';
// @ts-ignore
import shapes from './shapes.js';

// Variables ---------------------------------------------------------------------


/** Opacity of ghost piece over legal move highlights. Default: 0.4 */
const ghostOpacity: number = 0.4;


// Functions -----------------------------------------------------------------------


/**
 * Renders all of our pieces on the board,
 * including voids, and mini images, if visible.
 */
function renderPiecesInGame(gamefile: gamefile) {
	piecemodels.renderAll(gamefile);
	miniimage.render();
}

/** Renders a semi-transparent piece at the specified coordinates. */
function renderGhostPiece(type: number, coords: Coords) {
	const data = shapes.getDataQuad_ColorTexture_FromCoordAndType(coords, type, [1, 1, 1, ghostOpacity]);
	console.log(data);
	const model = createModel(data, 2, "TRIANGLES", true, spritesheet.getSpritesheet());
	model.render();
}


// ------------------------------------------------------------------------------


export default {
	renderPiecesInGame,
	renderGhostPiece,
};