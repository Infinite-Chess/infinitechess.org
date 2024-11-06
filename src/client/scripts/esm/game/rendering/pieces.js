
// Import Start
import bufferdata from './bufferdata.js';
import perspective from './perspective.js';
import miniimage from './miniimage.js';
import movement from './movement.js';
import piecesmodel from './piecesmodel.js';
import voids from './voids.js';
import board from './board.js';
import texture from './texture.js';
import onlinegame from '../misc/onlinegame.js';
import options from './options.js';
import buffermodel from './buffermodel.js';
import shapes from './shapes.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('../chess/gamefile.js').gamefile} gamefile
 */

"use strict";

/**
 * This script contains our list of all possible piece types,
 * spritesheet data,
 * and contains the functions for rendering the main pieces,
 * ghost piece, and mini icons!
 */

let spritesheet; // Texture. 8x8 containing every texture of every piece, black and white.
let spritesheetData; // Contains where each piece is located in the spritesheet (texture coord)

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
	if (gamefile.mesh == null) return;
	if (gamefile.mesh.model == null) return;
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
	if (onlinegame.areWeColor('black')) modelToUse = perspective.getEnabled() && !perspective.getIsViewingBlackPerspective() && gamefile.mesh.rotatedModel != null ? gamefile.mesh.rotatedModel : gamefile.mesh.model;
	else modelToUse = perspective.getEnabled() && perspective.getIsViewingBlackPerspective() && gamefile.mesh.rotatedModel != null ? gamefile.mesh.rotatedModel : gamefile.mesh.model;

	modelToUse.render(position, scale);
	// Use this line when rendering with the tinted texture shader program.
	// modelToUse.render(position, scale, { uVertexColor: [1,0,0, 1] }); // Specifies the tint uniform value before rendering
}

/** Renders a semi-transparent piece at the specified coordinates. */
function renderGhostPiece(type, coords) {
	const color = options.getColorOfType(type); color.a *= ghostOpacity;
	const data = shapes.getDataQuad_ColorTexture_FromCoordAndType(coords, type, color);
	const model = buffermodel.createModel_ColorTextured(new Float32Array(data), 2, "TRIANGLES", getSpritesheet());
	model.render();
}

function initSpritesheet() {
	spritesheet = texture.loadTexture('spritesheet', { useMipmaps: true });
}

// Returns the spritesheet texture object!
// I need a getter for this because it's not immediately initialized.
function getSpritesheet() {
	return spritesheet;
}

// The spritesheet data contains where each piece's texture is located in the spritesheet. Only called once per run.
function initSpritesheetData() {

	const pieceWidth = 1 / 8; // In texture coords. Our spritesheet is 8x8

	spritesheetData = {
		pieceWidth,
        
		// One-sided pieces
		pawnsW: getSpriteCoords(1,1),
		pawnsB: getSpriteCoords(2,1),
		knightsW: getSpriteCoords(3,1),
		knightsB: getSpriteCoords(4,1),
		bishopsW: getSpriteCoords(5,1),
		bishopsB: getSpriteCoords(6,1),
		rooksW: getSpriteCoords(7,1),
		rooksB: getSpriteCoords(8,1),
		queensW: getSpriteCoords(1,2),
		queensB: getSpriteCoords(2,2),
		kingsW: getSpriteCoords(3,2),
		kingsB: getSpriteCoords(4,2),
		chancellorsW: getSpriteCoords(5,2),
		chancellorsB: getSpriteCoords(6,2),
		archbishopsW: getSpriteCoords(7,2),
		archbishopsB: getSpriteCoords(8,2),
		amazonsW: getSpriteCoords(1,3),
		amazonsB: getSpriteCoords(2,3),
		// Guard texture for the guard
		guardsW: getSpriteCoords(3,3),
		guardsB: getSpriteCoords(4,3),
		// Commoner texture for the guard
		// guardsW: getSpriteCoords(5,3),
		// guardsB: getSpriteCoords(6,3),
		hawksW: getSpriteCoords(8,3),
		hawksB: getSpriteCoords(7,3),
		camelsW: getSpriteCoords(1,4),
		camelsB: getSpriteCoords(2,4),
		giraffesW: getSpriteCoords(3,4),
		giraffesB: getSpriteCoords(4,4),
		zebrasW: getSpriteCoords(5,4),
		zebrasB: getSpriteCoords(6,4),
		knightridersW: getSpriteCoords(7,4),
		knightridersB: getSpriteCoords(8,4),
		unicornsW: getSpriteCoords(1,5),
		unicornsB: getSpriteCoords(2,5),
		evolvedUnicornsW: getSpriteCoords(3,5),
		evolvedUnicornsB: getSpriteCoords(4,5),
		rosesW: getSpriteCoords(5,5),
		rosesB: getSpriteCoords(6,5),
		centaursW: getSpriteCoords(7,5),
		centaursB: getSpriteCoords(8,5),
		royalCentaursW: getSpriteCoords(1,6),
		royalCentaursB: getSpriteCoords(2,6),
		royalQueensW: getSpriteCoords(3,6),
		royalQueensB: getSpriteCoords(4,6),
		kelpiesW: getSpriteCoords(5,6),
		kelpiesB: getSpriteCoords(6,6),
		dragonsW: getSpriteCoords(7,6),
		dragonsB: getSpriteCoords(8,6),
		// 2nd dragon texture, also used in 5D chess.
		drakonsW: getSpriteCoords(1,7),
		drakonsB: getSpriteCoords(2,7),
		huygensW: getSpriteCoords(6,7),
		huygensB: getSpriteCoords(7,7),

		// Neutral pieces
		air: getSpriteCoords(3,7),
		obstaclesN: getSpriteCoords(4,7),

		// Miscellaneous
		yellow: getSpriteCoords(5,7) // COIN
	};

	// pieceWidth is how many textures in 1 row.  yColumn starts from the top. 
	function getSpriteCoords(xPos, yPos) {
		const texX = (xPos - 1) * pieceWidth;
		const texY = 1 - yPos * pieceWidth;
		return [texX, texY];
	}
}

function getSpritesheetDataPieceWidth() {
	return spritesheetData.pieceWidth;
}

function getSpritesheetDataTexLocation(type) {
	return spritesheetData[type];
}

export default {
	extraUndefineds,
	renderPiecesInGame,
	renderGhostPiece,
	initSpritesheet,
	getSpritesheet,
	initSpritesheetData,
	getSpritesheetDataPieceWidth,
	getSpritesheetDataTexLocation,
};