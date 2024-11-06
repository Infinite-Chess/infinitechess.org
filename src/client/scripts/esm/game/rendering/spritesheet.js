
import texture from './texture.js';


/**
 * This script stores the texture coordinates
 * of each piece in our spritesheet.
 * 
 * It should have ZERO dependancies!
 */


let spritesheet; // Texture. 8x8 containing every texture of every piece, black and white.
/**
 * Contains where each piece is located in the spritesheet (texture coord).
 * Texture coords of a piece range from 0-1
 */
const spritesheetData = (() => {

	const pieceWidth = 1 / 8; // In texture coords. Our spritesheet is 8x8

	return {
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
})(); 


/**
 * Loads the spritesheet texture
 * @param {WebGL2RenderingContext} gl - The webgl context being used} gl 
 */
function initSpritesheet(gl) {
	spritesheet = texture.loadTexture('spritesheet', { useMipmaps: true });
}

function getSpritesheet() {
	return spritesheet;
}

function getSpritesheetDataPieceWidth() {
	return spritesheetData.pieceWidth;
}

function getSpritesheetDataTexLocation(type) {
	return spritesheetData[type];
}

export default {
	initSpritesheet,
	getSpritesheet,
	getSpritesheetDataPieceWidth,
	getSpritesheetDataTexLocation,
};