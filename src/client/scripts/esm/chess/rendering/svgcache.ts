/**
 * This module handles fetching and caching of chess piece SVGs.
 * It won't request the same SVG twice.
 */


import colorutil from '../util/colorutil.js';
// @ts-ignore
import typeutil from '../util/typeutil.js';


// Variables -----------------------------------------------------------------


// Cache for SVG elements
const cachedPieceSVGs: { [pieceType: string]: SVGElement } = {};

/** Classical chess pieces are grouped in one SVG */
const CLASSICAL_PIECES: string[] = ['pawn', 'knight', 'bishop', 'rook', 'king', 'queen'];

// Track ongoing fetch requests
const processingCache: { [key: string]: Promise<void> } = {};



// Initialization: Cache classical pieces on load
fetchMissingTypes(['classical']);



// Helper functions ---------------------------------------------------------


/**
 * Calculates the SVG IDs for a given piece type.
 * 
 * If the type is provided as 'classical', it returns the SVG IDs for all classical pieces.
 */
function getSVGIDsOfType(type: 'classical' | string): string[] {
	if (type === 'classical') return CLASSICAL_PIECES.flatMap(piece => getSVGIDs(piece));
	return getSVGIDs(type);
}
/**
 * Returns the SVG IDs for a given piece type.
 * @param type - The piece type in singular form
 */
function getSVGIDs(type: string): string[] { 
	return getColorSuffixes(type).map(suffix => `${type}s${suffix}`);
}

/**
 * Returns the color suffixes for a given piece type could have.
 * 
 * 'pawn' -> ['W','B']
 * 'obstacle' -> ['N']
 * @param type - The piece type in singular form
 */
function getColorSuffixes(type: string): string[] {
	const plural = `${type}s`;
	return typeutil.neutralTypes.includes(plural) ? [colorutil.colorExtensionOfNeutrals] : colorutil.validColorExtensions_NoNeutral;
};

/**
 * Returns the singular form of a piece type from an SVG ID.
 * 'pawnsW' -> 'pawn'
 * @param id - The SVG ID of the piece. This includes its color information: 'pawnsW'
 */
function getTypeFromSVGID(id: string): string {
	const plural = colorutil.trimColorExtensionFromType(id); // 'pawns'
	return plural.slice(0, -1); // 'pawn'
}


// Core functionality --------------------------------------------------------


async function getSVGElementsFromSingularTypes(types: string[]): Promise<SVGElement[]> {
	const ids = types.flatMap(type => getSVGIDs(type));
	return await getSVGElements(ids);
}

/**
 * Returns all the SVG elements for the given piece IDs.
 * Piece IDs are in plural form.
 * @param ids - ['pawnsW', 'queensB']
 */
async function getSVGElements(ids: string[]): Promise<SVGElement[]> {
	const missing = ids.filter(id => !(id in cachedPieceSVGs));
  
	if (missing.length > 0) {
		const typesToFetch = [...new Set(missing.map(getTypeFromSVGID))];
		await fetchMissingTypes(typesToFetch);
	}

	return ids.map(id => {
		if (!cachedPieceSVGs[id]) throw Error(`Missing SVG for ${id}`);
		return cachedPieceSVGs[id].cloneNode(true) as SVGElement;
	});
}

/**
 * Fetches the SVG for missing piece types using a regular fetch while using the processingCache
 * to prevent duplicate fetch requests.
 * If the type is included in the classical group, it fetches the classical group instead of the individual type.
 * @param typesSingular - Array of singular piece types that need to be fetched.
 */
async function fetchMissingTypes(typesSingular: string[]) {
	// If the type is included in the classical group, fetch the classical group instead of the individual type
	const typesToFetch = [...new Set(typesSingular.map(type => CLASSICAL_PIECES.includes(type) ? 'classical' : type))];

	await Promise.all(typesToFetch.map(async type => {
		const url = `svg/pieces/${type === 'classical' ? 'classical' : `fairy/${type}`}.svg`;
    
		if (!processingCache[url]) {
			processingCache[url] = (async() => {
				try {
					const response = await fetch(url);
					if (!response.ok) throw new Error(`HTTP error when fetching piece svg of type "${type}"! status: ${response.status}`);
					const svgText = await response.text();
					const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
        
					getSVGIDsOfType(type).forEach(id => {
						const el = doc.querySelector(`#${id}`);
						if (el) cachedPieceSVGs[id] = el as SVGElement;
						// console.log("Cached", id);
					});
				} catch (error) {
					// Remove the failed promise from the cache to allow retrying
					delete processingCache[url];
					throw error;
				}
			})();
		} else {
			console.log(`Already fetching piece svg of type ${type}. Not sending duplicate request. Waiting..`);
		}
    
		await processingCache[url];
	}));
}


// Exports -------------------------------------------------------------------


export default {
	getSVGElementsFromSingularTypes,
	getSVGElements
};