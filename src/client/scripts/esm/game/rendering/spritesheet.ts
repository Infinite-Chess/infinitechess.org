
/**
 * This script stores the texture coordinates
 * of each piece in our spritesheet
 * FOR THE CURRENT GAME.
 * 
 * If no game is loaded, no spritesheet is loaded.
 */


import { fetchPieceSVGs } from '../../chess/api/fetchPieceSVGs.js';
import { generateSpritesheet } from '../../chess/rendering/spritesheetGenerator.js';
import { svgToImage } from '../../chess/rendering/svgtoimageconverter.js';
// @ts-ignore
import typeutil from '../../chess/util/typeutil.js';
// @ts-ignore
import jsutil from '../../util/jsutil.js';
// @ts-ignore
import texture from './texture.js';


// Type Definitions ----------------------------------------------------------


// @ts-ignore
import type gamefile from '../../chess/logic/gamefile.js';
import type { Coords } from '../../chess/logic/movesets.js';
import colorutil from '../../chess/util/colorutil.js';


// Variables ---------------------------------------------------------------------------


/**
 * The spritesheet texture for rendering the pieces of the current game.
 * 
 * Using a spritesheet instead of 1 texture for each piece allows us to
 * render all the pieces with a single mesh, and a single texture.
 */
let spritesheet: WebGLTexture | undefined; // Texture. 8x8 containing every texture of every piece, black and white.
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
	texLocs: { [type: string]: Coords }
} | undefined;


/**
 * These SIX types are all grouped together into one server resource!
 * If we request one, we request them ALL!
 */
const piecesInTheClassicalSVGGroup = ['pawn','knight','bishop','rook','king','queen'];
/** Piece types that don't need, nor have, an SVG */
const typesThatDontNeedAnSVG = ['voids'];

/**
 * Piece types, in singular form, that we have cached their SVG up to this point.
 * In the form: ['pawn','obstacle']
 */
const cachedPieceTypes: string[] = [];
/**
 * Piece SVG Elements that we have fetch-requested from the server, up to this point.
 * In the form: { 'pawnsW': SVGElement }
 */
const cachedPieceSVGs: { [svgID: string]: SVGElement } = {};



// Functions ---------------------------------------------------------------------------


function getSpritesheet() {
	if (!spritesheet) throw new Error("Should not be getting the spritesheet when not loaded!");
	return spritesheet!;
}

function getSpritesheetDataPieceWidth() {
	if (!spritesheetData) throw new Error("Should not be getting piece width when the spritesheet is not loaded!");
	return spritesheetData!.pieceWidth;
}

function getSpritesheetDataTexLocation(type: number) {
	if (!spritesheetData) throw new Error("Should not be getting texture locations when the spritesheet is not loaded!");
	return spritesheetData!.texLocs[type]!;
}

/** Loads the spritesheet texture we'll be using to render the provided gamefile's pieces */
async function initSpritesheetForGame(gl: WebGL2RenderingContext, gamefile: gamefile) {

	/** All piece types in the game. */
	let existingTypes: string[] = jsutil.deepCopyObject(gamefile.startSnapshot.existingTypes);
	// Remove the pieces that don't need/have an SVG, such as VOIDS
	existingTypes = existingTypes.filter(type => !typesThatDontNeedAnSVG.includes(type));

	/** Makes all the types in the game singular instead of plural */
	const typesNeeded = existingTypes.map(type => type.slice(0, -1)); // Remove the "s" at the end
	/** A list of svg IDs we need for the game @type {string[]} */
	const svgIDs: string[] = getSVG_IDsFromPieceTypes(typesNeeded);

	// This is what may take a while, waiting for the fetch requests to return.
	await fetchMissingPieceSVGs(typesNeeded);

	console.log("Finished acquiring all piece SVGs!");

	/** The SVG elements we will use in the game to construct our spritesheet */
	const svgElements = svgIDs.map(id => {
		const cachedSVG = cachedPieceSVGs[id];
		if (cachedSVG === undefined) throw new Error(`Piece SVG of ID "${id}" required for game wasn't cached! We shouldn't have reached this part of the code if the fetch requests didn't succeed.`);
		return cachedSVG;
	});

	// Convert each SVG element to an Image
	const readyImages: HTMLImageElement[] = await convertSVGsToImages(svgElements);

	const spritesheetAndSpritesheetData = await generateSpritesheet(gl, readyImages);
	console.log(spritesheetAndSpritesheetData.spritesheetData);

	// Optional: Append the spritesheet to the document for debugging
	spritesheetAndSpritesheetData.spritesheet.style.display = 'none';
	document.body.appendChild(spritesheetAndSpritesheetData.spritesheet);

	// Load the texture into webgl and initiate our spritesheet
	// data that contains the texture coordinates of each piece!
	spritesheet = texture.loadTexture(gl, spritesheetAndSpritesheetData.spritesheet, { useMipmaps: true });
	spritesheetData = spritesheetAndSpritesheetData.spritesheetData;
}

function deleteSpritesheet() {
	spritesheet = undefined;
	spritesheetData = undefined;
}

/**
 * Tests what of the provided types we don't have yet,
 * fetches them, and appends them to our cache.
 */
async function fetchMissingPieceSVGs(typesNeeded: string[]) {
	const typesMissing = jsutil.getMissingStringsFromArray(cachedPieceTypes, typesNeeded);

	if (typesMissing.length === 0) return console.log("All piece SVGs for the game are present! No need to fetch more.");
	else console.log(`Fetching missing piece types: ${JSON.stringify(typesMissing)}`);

	return await fetchAllPieceSVGs(typesMissing);
}

/**
 * Fetches the SVGs of the provided piece types from the server.
 * @param types - ['archbishop','chancellor']
 */
async function fetchAllPieceSVGs(types: string[]) {
	// Map over the missing types and create promises for each fetch
	const fetchPromises = types.map(async pieceType => {
		const svgIDs = getSVG_IDs_From_PieceType(pieceType);
		return fetchPieceSVGs(`fairy/${pieceType}.svg`, svgIDs)
			.then(pieceSVGs => {
				console.log(`Fetched ${pieceType}!`);
				cachedPieceTypes.push(pieceType);
				pieceSVGs.forEach(svg => cachedPieceSVGs[svg.id] = svg);
			})
			.catch(error => {
				console.error(`Failed to fetch ${pieceType}:`, error); // Log specific error
			});
	});

	// Wait for all fetches to complete
	await Promise.all(fetchPromises);

	console.log("All fetched pieces have been cached!");
}

/**
 * Returns a string of the ids of the svgs of
 * each color that makes up all of the provided types.
 * `['pawn','obstacle'] => ['pawnsW','pawnsB','obstaclesN']
 */
function getSVG_IDsFromPieceTypes(pieceTypes: string[]) { // In singular form
	const svgIDs: string[] = [];
	pieceTypes.forEach(type => svgIDs.push(...getSVG_IDs_From_PieceType(type)) );
	return svgIDs;
}

/**
 * Returns a string of the ids of the
 * svgs of each color that makes up a type.
 * 'pawn' => ['pawnsW','pawnsB']
 */
function getSVG_IDs_From_PieceType(type: string): string[] {
	const svgIDs: string[] = [];

	const pieceInPluralForm = type + 's';
	const isNeutral = typeutil.neutralTypes.includes(pieceInPluralForm);

	if (isNeutral) {
		svgIDs.push(pieceInPluralForm + colorutil.getColorExtensionFromColor('neutral'));
	} else {
		svgIDs.push(pieceInPluralForm + colorutil.getColorExtensionFromColor('white'));
		svgIDs.push(pieceInPluralForm + colorutil.getColorExtensionFromColor('black'));
	}

	return svgIDs;
}

/** Converts a list of SVGs into a list of HTMLImageElements */
async function convertSVGsToImages(svgElements: SVGElement[]) {
	const readyImages: HTMLImageElement[] = [];
	try {
		for (const svgElement of svgElements) {
			const img = await svgToImage(svgElement); // You can adjust width and height as needed
			// document.body.appendChild(img);
			readyImages.push(img);
		}
	} catch (e) {
		console.log("Error caught while converting SVGs to Images:");
		console.log((e as Error).stack);
	}
	return readyImages;
}

// Do this by default whenever we load the page, as EVERY variant requires most of these pieces!
(async function fetchAndCacheClassicalPieceSVGs() {
	console.log("Fetching all Classical SVGs...");
	const svgIDs = getSVG_IDsFromPieceTypes(piecesInTheClassicalSVGGroup);
	const classicalSVGElements = await fetchPieceSVGs('classical.svg', svgIDs);
	cachedPieceTypes.push(...piecesInTheClassicalSVGGroup);
	classicalSVGElements.forEach(svg => cachedPieceSVGs[svg.id] = svg);
	console.log("Fetched all Classical SVGs!");
})();



export default {
	initSpritesheetForGame,
	getSpritesheet,
	getSpritesheetDataPieceWidth,
	getSpritesheetDataTexLocation,
	deleteSpritesheet,
};