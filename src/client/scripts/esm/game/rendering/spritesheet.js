
/**
 * This script stores the texture coordinates
 * of each piece in our spritesheet.
 * 
 * It should have ZERO dependancies!
 */



import { fetchPieceSVGs } from '../../chess/api/fetchPieceSVGs.js';
import { generateSpritesheet } from '../../chess/rendering/spritesheetGenerator.js';
import { svgToImage } from '../../chess/rendering/svgtoimageconverter.js';
import jsutil from '../../util/jsutil.js';
import texture from './texture.js';

/** @typedef {import('../../chess/logic/gamefile.js').gamefile} gamefile */


let spritesheet; // Texture. 8x8 containing every texture of every piece, black and white.
/**
 * Contains where each piece is located in the spritesheet (texture coord).
 * Texture coords of a piece range from 0-1
 */
let spritesheetData;

/**
 * These SIX types are all grouped together into one server resource!
 * If we request one, we request them ALL!
 */
const piecesInTheClassicalSVGGroup = ['pawn','knight','bishop','rook','king','queen'];

/** Piece types, in singular form, that we have cached their SVG up to this point. @type {string[]} */
const cachedPieceTypes = [];
/**
 * Piece SVG Elements that we have fetched-requested from the server, up to this point.
 * In the form: 'pawn-white': SVGElement
 * @type {{ [svgID: string]: SVGElement }}
 */
const cachedPieceSVGs = [];

/** Piece types that don't need, nor have, an SVG */
const typesThatDontNeedAnSVG = ['voids'];

/**
 * Loads the spritesheet texture
 * @param {WebGL2RenderingContext} gl - The webgl context being used} gl 
 * @param {gamefile} gamefile 
 */
async function initSpritesheetForGame(gl, gamefile) {

	const existingTypes = jsutil.deepCopyObject(gamefile.startSnapshot.existingTypes);  // ['pawns','voids']
	removeTypesThatDontNeedAnSVG(existingTypes); // ['pawns']

	/** Makes all the types in the game singular instead of plural */
	const typesNeeded = existingTypes.map(type => type.slice(0, -1)); // Remove the "s" at the end

	/** A list of svg IDs we need for the game @type {string[]} */
	const svgIDs = getSVG_IDsFromPieceTypes(typesNeeded);

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
	const readyImages = await convertSVGsToImages(svgElements);
	if (readyImages === undefined) throw new Error("Images are undefined!");

	// { spritesheet: HTMLImageElement, spritesheetData: Object }
	const spritesheetAndSpritesheetData = await generateSpritesheet(gl, readyImages);

	// Optional: Append the spritesheet to the document for debugging
	spritesheetAndSpritesheetData.spritesheet.style = 'display: none';
	document.body.appendChild(spritesheetAndSpritesheetData.spritesheet);

	// Load the texture into webgl and initiate our spritesheet
	// data that contains the texture coordinates of each piece!
	spritesheet = texture.loadTexture(gl, spritesheetAndSpritesheetData.spritesheet, { useMipmaps: true });
	spritesheetData = spritesheetAndSpritesheetData.spritesheetData;
}

/**
 * Removes piece types from the provided types that don't need nor have an SVG.
 * DESTRUCTIVE, modifies the original array.
 * @param {string[]} types - ['pawns','voids']
 */
function removeTypesThatDontNeedAnSVG(types) {
	typesThatDontNeedAnSVG.forEach(typeThatDoesntNeedAnSVG => {
		const indexOfType = types.indexOf(typeThatDoesntNeedAnSVG);
		if (indexOfType !== -1) {
			types.splice(indexOfType, 1); // Remove this type from the list.
			// console.log(`Piece type "${typeThatDoesntNeedAnSVG}" in new game doesn't need an SVG, skipping.`);
		}
	});
}

async function fetchMissingPieceSVGs(typesNeeded) {
	const typesMissing = jsutil.getMissingStringsFromArray(cachedPieceTypes, typesNeeded);

	if (typesMissing.length === 0) return console.log("All piece SVGs for the game are present! No need to fetch more.");
	else console.log(`Fetching missing piece types: ${JSON.stringify(typesMissing)}`);

	return await fetchAllPieceSVGs(typesMissing);
}

/**
 * Fetches the SVGs of the provided piece types from the server.
 * @param {string[]} types - ['archbishop','chancellor']
 */
async function fetchAllPieceSVGs(types) {
	// Map over the missing types and create promises for each fetch
	const fetchPromises = types.map(pieceType => {
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

function getSVG_IDsFromPieceTypes(pieceTypes) { // In singular form
	const svgIDs = [];
	pieceTypes.forEach(type => { // 'pawn'
		svgIDs.push(...getSVG_IDs_From_PieceType(type));
	});
	return svgIDs;
}

function getSVG_IDs_From_PieceType(type) {
	const svgIDs = [];
	svgIDs.push(type + '-white');
	svgIDs.push(type + '-black');
	return svgIDs;
}

async function convertSVGsToImages(svgElements) {
	try {
		const readyImages = [];
		for (const svgElement of svgElements) {
			const img = await svgToImage(svgElement); // You can adjust width and height as needed
			// document.body.appendChild(img);
			readyImages.push(img);
		}
		return readyImages;
	} catch (e) {
		console.log("Error caught while converting SVGs to Images:");
		console.log(e.stack);
	}
}

(async function fetchAndCacheClassicalPieceSVGs() {
	console.log("Fetching all Classical SVGs...");
	const svgIDs = getSVG_IDsFromPieceTypes(piecesInTheClassicalSVGGroup);
	const classicalSVGElements = await fetchPieceSVGs('classical.svg', svgIDs);
	cachedPieceTypes.push(...piecesInTheClassicalSVGGroup);
	classicalSVGElements.forEach(svg => cachedPieceSVGs[svg.id] = svg);
	console.log("Fetched all Classical SVGs!");
})();

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
	initSpritesheetForGame,
	getSpritesheet,
	getSpritesheetDataPieceWidth,
	getSpritesheetDataTexLocation,
};