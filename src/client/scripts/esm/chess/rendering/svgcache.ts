/**
 * This module handles caching and fetching of chess piece SVGs.
 * It retrieves, caches, and returns SVG elements for the chess pieces.
 */

import colorutil from '../util/colorutil.js';
// @ts-ignore
import typeutil from '../util/typeutil.js';
import { fetchWithDeduplication } from '../../util/fetchDeduplicator.js';


// Variables ---------------------------------------------------------------------------


/**
 * Piece types, in singular form, that we have cached their SVG up to this point.
 * In the form: ['pawn','obstacle']
 */
const cachedPieceTypes: string[] = [];

/**
 * Piece SVG Elements that we have fetch-requested from the server, up to this point.
 * In the form: { 'pawnsW': SVGElement }
 */
const cachedPieceSVGs: { [pieceType: string]: SVGElement } = {};

/**
 * These SIX types are all grouped together into one server resource!
 * If we request one, we request them ALL!
 */
const piecesInTheClassicalSVGGroup: string[] = ['pawn','knight','bishop','rook','king','queen'];


// Functions ---------------------------------------------------------------------------


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

	// console.log("All fetched pieces have been cached!");
}

/**
 * Fetches SVG elements from an SVG file located at the provided relative URL and
 * returns an array of SVG elements matching the provided IDs.
 * 
 * @param relativeURL - The relative path to the SVG file.
 * @param svgIds - An array of SVG element IDs to be fetched from the SVG document.
 * @returns A promise that resolves to an array of matching SVG elements.
 * @throws An error if any of the SVG elements with the given IDs are not found.
 */
async function fetchPieceSVGs(relativeURL: string, svgIds: string[]): Promise<SVGElement[]> {
	// console.error("Fetching all piece SVGs of ids:");
	// console.log(svgIds);

	// Fetch and parse the SVG document
	const response = await fetchWithDeduplication(`svg/pieces/${relativeURL}`);

	// Check if the SVG was not found (name or path is probably incorrect)
	if (!response.ok) throw new Error(`Failed to fetch SVG file. Server responded with status: ${response.status} ${response.statusText}`);

	const svgText = await response.text();
	const parser = new DOMParser();
	const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');

	// Array to store the SVG elements found by their IDs
	const svgElements: SVGElement[] = [];

	// Loop through the array of svgIds and fetch each corresponding SVG element
	svgIds.forEach(svgId => {
		const svgElement = svgDoc.querySelector(`#${svgId}`) as SVGElement;
		if (!svgElement) throw new Error(`SVG with ID ${svgId} not found from server-sent svg data.`);
		// Push the found SVG element into the array
		svgElements.push(svgElement);
	});

	// Return the array of SVG elements
	return svgElements;
}

// Do this by default whenever we load the page, as EVERY variant requires most of these pieces!
(async function fetchAndCacheClassicalPieceSVGs() {
	// console.log("Fetching all Classical SVGs...");
	const svgIDs = getSVG_IDsFromPieceTypes(piecesInTheClassicalSVGGroup);
	const classicalSVGElements = await fetchPieceSVGs('classical.svg', svgIDs);
	piecesInTheClassicalSVGGroup.forEach(pieceInClassicalGroup => { 
		if (!cachedPieceTypes.includes(pieceInClassicalGroup)) cachedPieceTypes.push(pieceInClassicalGroup); 
	});
	classicalSVGElements.forEach(svg => {
		if (cachedPieceSVGs[svg.id]) return console.error(`Skipping caching piece svg of id ${svg.id} because it was already cached. This fetch request was a duplicate.`);
		else cachedPieceSVGs[svg.id] = svg;
	});
	// console.log("Fetched all Classical SVGs!");
})();


// Exports ----------------------------------------------------------------------------


export default {
	getSVGElementsByIds,
	getCachedSVGElements,
	getSVG_IDsFromPieceTypes,
};