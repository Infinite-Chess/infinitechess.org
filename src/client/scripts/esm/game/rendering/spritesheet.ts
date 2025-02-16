
/**
 * This script stores the spritesheet FOR THE CURRENT GAME,
 * and all the piece's texture coordinates within it.
 * 
 * If no game is loaded, no spritesheet is loaded.
 */

import { fetchPieceSVGs } from '../../chess/api/fetchPieceSVGs.js';
import { generateSpritesheet } from '../../chess/rendering/spritesheetGenerator.js';
import { convertSVGsToImages } from '../../chess/rendering/svgtoimageconverter.js';
// @ts-ignore
import typeutil from '../../chess/util/typeutil.js';
import jsutil from '../../util/jsutil.js';
// @ts-ignore
import texture from './texture.js';
// @ts-ignore
import colorutil from '../../chess/util/colorutil.js';


// Type Definitions ----------------------------------------------------------


// @ts-ignore
import type gamefile from '../../chess/logic/gamefile.js';
import type { Coords } from '../../chess/logic/movesets.js';


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

function getSpritesheetDataTexLocation(type: string): Coords {
	if (!spritesheetData) throw new Error("Should not be getting texture locations when the spritesheet is not loaded!");
	return spritesheetData!.texLocs[type]!;
}

/** Loads the spritesheet texture we'll be using to render the provided gamefile's pieces */
async function initSpritesheetForGame(gl: WebGL2RenderingContext, gamefile: gamefile) {

	/** All piece types in the game. */
	let existingTypes: string[] = jsutil.deepCopyObject(gamefile.startSnapshot.existingTypes); // ['pawns','obstacles', ...]
	// Remove the pieces that don't need/have an SVG, such as VOIDS
	existingTypes = existingTypes.filter(type => !typesThatDontNeedAnSVG.includes(type)); // ['pawns','obstacles', ...]

	/** Makes all the types in the game singular instead of plural */
	const typesNeeded = existingTypes.map(type => type.slice(0, -1)); // Remove the "s" at the end => ['pawn','obstacle', ...]
	/** A list of svg IDs we need for the game @type {string[]} */
	const svgIDs: string[] = getSVG_IDsFromPieceTypes(typesNeeded);

	/**
	 * The SVG elements we will use in the game to construct our spritesheet
	 * This is what may take a while, waiting for the fetch requests to return.
	*/
	const svgElements = await getSVGElementsByIds(svgIDs);

	// console.log("Finished acquiring all piece SVGs!");

	// Convert each SVG element to an Image
	const readyImages: HTMLImageElement[] = await convertSVGsToImages(svgElements);

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
 * Retrieves the SVG elements for the given SVG IDs, fetching them if necessary.
 * 
 * USE TO GET THE SVGS IN CHECKMATE PRACTICE UI.
 * 
 * @param svgIDs Array of SVG IDs in the format ['pawnsW', 'chancellorsB', ...]
 * @returns Promise resolving to the requested SVG elements.
 */
async function getSVGElementsByIds(svgIDs: string[]): Promise<SVGElement[]> {
	// Check for missing SVG IDs
	const missingIDs = svgIDs.filter(id => !(id in cachedPieceSVGs));
	if (missingIDs.length === 0) return getCachedSVGElements(svgIDs);

	// Extract singular types from missing IDs
	const singularTypes = [...new Set(missingIDs.map(id => getSingularTypeFromSVGID(id)))]; // Need a Set because otherwise there would be 2 of everything

	// Fetch missing piece SVGs
	await fetchMissingPieceSVGs(singularTypes);

	// Verify all requested IDs are now cached
	const remainingMissing = svgIDs.filter(id => !cachedPieceSVGs[id]);
	if (remainingMissing.length > 0) throw new Error(`Failed to cache SVG IDs: ${remainingMissing.join(', ')}`);

	return getCachedSVGElements(svgIDs);
}

/**
 * Extracts singular piece type from SVG ID (e.g., 'chancellorsB' -> 'chancellor')
 */
function getSingularTypeFromSVGID(svgID: string): string {
	// Guard clauses=====================
	const colorSuffix = svgID.slice(-1); // 'W', 'B', or 'N'
	if (!['W', 'B', 'N'].includes(colorSuffix)) throw new Error(`Invalid color suffix in SVG ID: ${svgID}`);
	const plural = svgID.slice(0, -1); // 'chancellors', 'pawns', etc.
	if (!plural.endsWith('s')) throw new Error(`SVG ID ${svgID} does not follow plural format (ending with 's')`);
	// ==================================
	return plural.slice(0, -1); // Remove 's' to get singular => 'chancellor', 'pawn', etc.
}

function deleteSpritesheet() {
	spritesheet = undefined;
	spritesheetData = undefined;
}

/**
 * Tests what of the provided types we don't have yet,
 * fetches them, and appends them to our cache.
 * Singular form: ['pawn','obstacle', ...]
 */
async function fetchMissingPieceSVGs(typesNeeded: string[]) {
	// console.log("Fetching missing piece SVGs...");
	// console.log(typesNeeded);
	// Identify unique types that need fetching (excluding already cached and classical types)
	const typesMissing = typesNeeded.filter(type => 
		// Remove the classical pieces, are they are being fetched already by fetchAndCacheClassicalPieceSVGs()
		!cachedPieceTypes.includes(type) && !piecesInTheClassicalSVGGroup.includes(type)
	); // In the form ['pawn','obstacle', ...]

	if (typesMissing.length === 0) {
		// console.log("All piece SVGs for the game are present! No need to fetch more.");
		return;
	} else {
		// console.log(`Fetching missing piece types: ${JSON.stringify(typesMissing)}`);
	}

	return await fetchAllPieceSVGs(typesMissing);
}

/**
 * Fetches the SVGs of the provided piece types from the server.
 * @param types - ['archbishop','chancellor']
 */
async function fetchAllPieceSVGs(types: string[]) {
	// console.log("Fetching all piece SVGs of ids:");
	// console.log(types);
	// Map over the missing types and create promises for each fetch
	const fetchPromises = types.map(async pieceType => {
		const svgIDs = getSVG_IDs_From_PieceType(pieceType);
		return fetchPieceSVGs(`fairy/${pieceType}.svg`, svgIDs)
			.then(pieceSVGs => {
				console.log(`Fetched ${pieceType}!`);
				// cachedPieceTypes.push(pieceType);
				if (!cachedPieceTypes.includes(pieceType)) cachedPieceTypes.push(pieceType);
				pieceSVGs.forEach(svg => {
					if (cachedPieceSVGs[svg.id]) return console.error(`Skipping caching piece svg of id ${svg.id} because it was already cached. This fetch request was a duplicate.`);
					else cachedPieceSVGs[svg.id] = svg;
				});
			})
			.catch(error => {
				console.error(`Failed to fetch ${pieceType}:`, error); // Log specific error
				// Propagate the error so that Promise.all() can reject
				throw error;
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

// Do this by default whenever we load the page, as EVERY variant requires most of these pieces!
(async function fetchAndCacheClassicalPieceSVGs() {
	// console.log("Fetching all Classical SVGs...");
	const svgIDs = getSVG_IDsFromPieceTypes(piecesInTheClassicalSVGGroup);
	const classicalSVGElements = await fetchPieceSVGs('classical.svg', svgIDs);
	// cachedPieceTypes.push(...piecesInTheClassicalSVGGroup);
	piecesInTheClassicalSVGGroup.forEach(pieceInClassicalGroup => { if (!cachedPieceTypes.includes(pieceInClassicalGroup)) cachedPieceTypes.push(pieceInClassicalGroup); } );
	classicalSVGElements.forEach(svg => {
		if (cachedPieceSVGs[svg.id]) return console.error(`Skipping caching piece svg of id ${svg.id} because it was already cached. This fetch request was a duplicate.`);
		else cachedPieceSVGs[svg.id] = svg;
	});
	// console.log("Fetched all Classical SVGs!");
})();

/**
 * Retrieves cached SVG elements and returns cloned copies.
 * @param svgIDs - The IDs of the cached SVG elements: ['pawnsW','pawnsB']
 * @returns Cloned copies of the cached SVG elements.
 */
function getCachedSVGElements(svgIDs: string[]): SVGElement[] {
	return svgIDs.map(id => {
		const cachedSVG = cachedPieceSVGs[id];
		if (cachedSVG === undefined) throw new Error(`Piece SVG of ID "${id}" required for game wasn't cached!`);
		return cachedSVG.cloneNode(true) as SVGElement;
	});
}



export default {
	initSpritesheetForGame,
	getSpritesheet,
	getSpritesheetDataPieceWidth,
	getSpritesheetDataTexLocation,
	deleteSpritesheet,
	getCachedSVGElements,
	getSVGElementsByIds,
};