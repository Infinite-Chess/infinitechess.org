
/**
 * This script renders all of our pieces on the board,
 * including voids, and mini images.
 */

import type { BufferModel } from './buffermodel.js';
import type { Coords } from '../../chess/util/coordutil.js';
// @ts-ignore
import type { gamefile } from '../../chess/logic/gamefile.js';


import spritesheet from './spritesheet.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import { createModel } from './buffermodel.js';
import preferences from '../../components/header/preferences.js';
// @ts-ignore
import perspective from './perspective.js';
// @ts-ignore
import miniimage from './miniimage.js';
// @ts-ignore
import movement from './movement.js';
// @ts-ignore
import piecesmodel from './piecesmodel.js';
// @ts-ignore
import voids from './voids.js';
// @ts-ignore
import board from './board.js';
// @ts-ignore
import shapes from './shapes.js';


// Variables ---------------------------------------------------------------------


/** Opacity of ghost piece over legal move highlights. Default: 0.4 */
const ghostOpacity: number = 0.4;

/**
 * A tiny z offset, to prevent the pieces from tearing with highlights while in perspective.
 * 
 * We can't solve that problem by using blending mode ALWAYS because we need animations
 * to be able to block out the currently-animated piece by rendering a transparent square
 * on the animated piece's destination that is higher in the depth buffer.
 */
const z: number = 0.001;


// Functions -----------------------------------------------------------------------


/**
 * Renders all of our pieces on the board,
 * including voids, and mini images, if visible.
 */
function renderPiecesInGame(gamefile: gamefile) {
	renderPieces(gamefile);
	voids.render(gamefile);
	miniimage.render();
}

/** Renders the main mesh of the pieces, no voids. */
function renderPieces(gamefile: gamefile) {
	if (gamefile.mesh.model === undefined) return;
	if (movement.isScaleLess1Pixel_Virtual() && !miniimage.isDisabled()) return;

	// Do we need to regen the pieces model? Are we out of bounds of our REGEN_RANGE?
	if (!movement.isScaleLess1Pixel_Virtual()
        && board.isOffsetOutOfRangeOfRegenRange(gamefile.mesh.offset, piecesmodel.REGEN_RANGE)) piecesmodel.shiftPiecesModel(gamefile);

	const boardPos = movement.getBoardPos();
	const position: [number, number, number] = [ // Translate
        -boardPos[0] + gamefile.mesh.offset[0], // Add the model's offset. 
        -boardPos[1] + gamefile.mesh.offset[1],
        z
    ]; // While separate these may each be big decimals, TOGETHER they are small number! That's fast for rendering!

	const boardScale = movement.getBoardScale();
	const scale: [number, number, number] = [boardScale, boardScale, 1];

	let modelToUse: BufferModel;
	if (onlinegame.areWeColorInOnlineGame('black')) modelToUse = perspective.getEnabled() && !perspective.getIsViewingBlackPerspective() && gamefile.mesh.rotatedModel !== undefined ? gamefile.mesh.rotatedModel : gamefile.mesh.model;
	else modelToUse = perspective.getEnabled() && perspective.getIsViewingBlackPerspective() && gamefile.mesh.rotatedModel !== undefined ? gamefile.mesh.rotatedModel : gamefile.mesh.model;

	modelToUse.render(position, scale);
	// Use this line when rendering with the tinted texture shader program.
	// modelToUse.render(position, scale, { tintColor: [1,0,0, 1] }); // Specifies the tint uniform value before rendering
}

/** Renders a semi-transparent piece at the specified coordinates. */
function renderGhostPiece(type: string, coords: Coords) {
	const color = preferences.getTintColorOfType(type); color.a *= ghostOpacity;
	const data = shapes.getDataQuad_ColorTexture_FromCoordAndType(coords, type, color);
	const model = createModel(data, 2, "TRIANGLES", true, spritesheet.getSpritesheet());
	model.render();
}


// ------------------------------------------------------------------------------


export default {
	renderPiecesInGame,
	renderGhostPiece,
};