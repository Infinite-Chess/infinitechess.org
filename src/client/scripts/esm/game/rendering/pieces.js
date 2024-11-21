
// Import Start
import perspective from './perspective.js';
import miniimage from './miniimage.js';
import movement from './movement.js';
import piecesmodel from './piecesmodel.js';
import voids from './voids.js';
import board from './board.js';
import onlinegame from '../misc/onlinegame.js';
import options from './options.js';
import buffermodel from './buffermodel.js';
import shapes from './shapes.js';
import spritesheet from './spritesheet.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('../../chess/logic/gamefile.js').gamefile} gamefile
 */

"use strict";

/**
 * This script contains our list of all possible piece types,
 * spritesheet data,
 * and contains the functions for rendering the main pieces,
 * ghost piece, and mini icons!
 */

/** Opacity of ghost piece over legal move highlights. Default: 0.4 */
const ghostOpacity = 0.4;

// Amount of extra undefined pieces to store with each type array!
// These placeholders are utilized when pieces are added or pawns promote!
const extraUndefineds = 5; // After this many promotions, need to add more undefineds and recalc the model!

function renderPiecesInGame(gamefile) {
	renderPieces(gamefile);
	voids.render(gamefile);
	miniimage.render();
}

/**
 * 
 * @param {gamefile} gamefile 
 * @returns 
 */
function renderPieces(gamefile) {
	if (gamefile.mesh.model === undefined) return;
	if (movement.isScaleLess1Pixel_Virtual() && !miniimage.isDisabled()) return;

	// Do we need to regen the pieces model? Are we out of bounds of our REGEN_RANGE?
	if (!movement.isScaleLess1Pixel_Virtual()
        && board.isOffsetOutOfRangeOfRegenRange(gamefile.mesh.offset, piecesmodel.REGEN_RANGE)) piecesmodel.shiftPiecesModel(gamefile);

	const boardPos = movement.getBoardPos();
	const position = [ // Translate
        -boardPos[0] + gamefile.mesh.offset[0], // Add the model's offset. 
        -boardPos[1] + gamefile.mesh.offset[1],
        0
    ]; // While separate these are each big decimals, TOGETHER they are small number! That's fast for rendering!

	const boardScale = movement.getBoardScale();
	const scale = [boardScale, boardScale, 1];

	let modelToUse;
	if (onlinegame.areWeColor('black')) modelToUse = perspective.getEnabled() && !perspective.getIsViewingBlackPerspective() && gamefile.mesh.rotatedModel !== undefined ? gamefile.mesh.rotatedModel : gamefile.mesh.model;
	else modelToUse = perspective.getEnabled() && perspective.getIsViewingBlackPerspective() && gamefile.mesh.rotatedModel !== undefined ? gamefile.mesh.rotatedModel : gamefile.mesh.model;

	modelToUse.render(position, scale);
	// Use this line when rendering with the tinted texture shader program.
	// modelToUse.render(position, scale, { uVertexColor: [1,0,0, 1] }); // Specifies the tint uniform value before rendering
}

/** Renders a semi-transparent piece at the specified coordinates. */
function renderGhostPiece(type, coords) {
	const color = options.getColorOfType(type); color.a *= ghostOpacity;
	const data = shapes.getDataQuad_ColorTexture_FromCoordAndType(coords, type, color);
	const model = buffermodel.createModel_ColorTextured(new Float32Array(data), 2, "TRIANGLES", spritesheet.getSpritesheet());
	model.render();
}

export default {
	extraUndefineds,
	renderPiecesInGame,
	renderGhostPiece,
};