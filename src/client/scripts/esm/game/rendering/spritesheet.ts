
/**
 * This script stores the spritesheet FOR THE CURRENT GAME,
 * and all the piece's texture coordinates within it.
 * 
 * If no game is loaded, no spritesheet is loaded.
 */


// @ts-ignore
import type gamefile from '../../chess/logic/gamefile.js';
import type { Coords } from '../../chess/logic/movesets.js';



import { generateSpritesheet } from '../../chess/rendering/spritesheetGenerator.js';
import typeutil from '../../chess/util/typeutil.js';
import imagecache from '../../chess/rendering/imagecache.js';
// @ts-ignore
import texture from './texture.js';


// Variables ---------------------------------------------------------------------------


/**
 * The spritesheet texture for rendering the pieces of the current game.
 * 
 * Using a spritesheet instead of 1 texture for each piece allows us to
 * render all the pieces with a single mesh, and a single texture.
 */
let spritesheet: WebGLTexture | undefined; // Texture. Grid containing every texture of every piece, black and white.
/**
 * Contains where each piece is located in the spritesheet (texture coord).
 * Texture coords of a piece range from 0-1, where (0,0) is the bottom-left corner.
 */
let spritesheetData: {
	/** The width of each texture in the whole spritesheet, as a fraction. */
	pieceWidth: number,
	/**
	 * The texture locations of each piece type in the spritesheet,
	 * where (0,0) is the bottom-left corner of the spritesheet,
	 * and the coordinates provided are the bottom-left corner of the corresponding type.
	 */
	texLocs: { [type: number]: Coords
	 }
} | undefined;


// Functions ---------------------------------------------------------------------------


function getSpritesheet() {
	if (!spritesheet) throw new Error("Should not be getting the spritesheet when not loaded!");
	return spritesheet!;
}

function getSpritesheetDataPieceWidth() {
	if (!spritesheetData) throw new Error("Should not be getting piece width when the spritesheet is not loaded!");
	return spritesheetData!.pieceWidth;
}

function getSpritesheetDataTexLocation(type: number): Coords {
	if (!spritesheetData) throw new Error("Should not be getting texture locations when the spritesheet is not loaded!");
	if (!spritesheetData!.texLocs[type]) throw Error("No texture location for piece type: " + type);
	return spritesheetData!.texLocs[type]!;
}

/** Loads the spritesheet texture we'll be using to render the provided gamefile's pieces */
async function initSpritesheetForGame(gl: WebGL2RenderingContext, gamefile: gamefile) {

	// Filter our voids from all types in the game.
	// @ts-ignore
	const types: number[] = gamefile.existingTypes.filter(type => !typeutil.SVGLESS_TYPES.includes(typeutil.getRawType(type)));

	// Convert each SVG element to an Image
	const readyImages: HTMLImageElement[] = types.map(t => imagecache.getPieceImage(t));

	const spritesheetAndSpritesheetData = await generateSpritesheet(gl, readyImages);
	// console.log(spritesheetAndSpritesheetData.spritesheetData);

	// Optional: Append the spritesheet to the document for debugging
	// spritesheetAndSpritesheetData.spritesheet.style.display = 'none';
	// document.body.appendChild(spritesheetAndSpritesheetData.spritesheet);

	// Load the texture into webgl and initiate our spritesheet
	// data that contains the texture coordinates of each piece!
	spritesheet = texture.loadTexture(gl, spritesheetAndSpritesheetData.spritesheet, { useMipmaps: true });
	spritesheetData = spritesheetAndSpritesheetData.spritesheetData;
}

/**
 * Call when the gameslot unloads the gamefile.
 * The spritesheet and data is no longer needed.
 */
function deleteSpritesheet() {
	spritesheet = undefined;
	spritesheetData = undefined;
}



export default {
	initSpritesheetForGame,
	getSpritesheet,
	getSpritesheetDataPieceWidth,
	getSpritesheetDataTexLocation,
	deleteSpritesheet,
};