/**
 * This module handles fetching and caching of chess piece SVGs.
 * It won't request the same SVG twice.
 */

import typeutil from '../util/typeutil.js';
import preferences from '../../components/header/preferences.js';

import type { RawType, Player } from '../util/typeutil.js';

// Variables -----------------------------------------------------------------


// Cache for SVG elements
const cachedPieceSVGs: { [pieceType: string]: SVGElement } = {};

// Track ongoing fetch requests
const processingCache: { [key: string]: Promise<void> } = {};



// Initialization: Cache classical pieces on load
fetchLocation("classical").then();

// Helper functions ---------------------------------------------------------

function getPossibleExtensionsOfColor(color: Player) {
	switch (color) {
		case 0:
			return ["N", "W"];
		case 1:
			return ["W", "N"];
		case 2:
			return ["B", "N"];
	}
}

function getNeededSVGLocations(types: number[]): Set<string> {
	const locations: Set<RawType> = new Set();
	typeloop: for (const type of types) {
		const [raw, c] = typeutil.splitType(type);
		const baseId = `${typeutil.getRawTypeStr(raw)}s`;
		const checks: string[] = getPossibleExtensionsOfColor(c);
		for (const c of checks) {
			const id = baseId + c;
			if (id in cachedPieceSVGs) {
				continue typeloop;
			}
		}
		locations.add(raw);
	}

	return preferences.getSVGLocations(locations);
} 

function getSVGIDs(types: number[]): [Map<string, number[]>, SVGElement[]] {
	let failed: boolean = false;
	const typeIdMap: Map<string, number[]> = new Map();
	const svgs: SVGElement[] = [];
	l: for (const type of types) {
		const [raw, c] = typeutil.splitType(type);
		const baseId = `${typeutil.getRawTypeStr(raw)}s`;
		const checks: string[] = getPossibleExtensionsOfColor(c);
		for (const c of checks) {
			const id = baseId + c;
			if (id in cachedPieceSVGs) {
				if (!typeIdMap.has(id)) {
					typeIdMap.set(id, []);
					svgs.push(cachedPieceSVGs[id].cloneNode(true) as SVGElement);
				}

				typeIdMap.get(id)!.push(type);
				continue l;
			}
		}
		console.error(`${preferences.getLocationForType(raw)} does not contain an svg with extensions ${checks} for ${baseId}`);
		failed = true;
	}
	if (failed) throw Error("SVG theme is missing ids for pieces");
	return [typeIdMap, svgs];
}

// Core functionality --------------------------------------------------------

/**
 * Returns all the SVG elements for the given piece IDs.
 * Piece IDs are in plural form.
 * @param ids - ['pawnsW', 'queensB']
 */
async function getSVGElements(ids: number[]): Promise<[Map<string, number[]>, SVGElement[]]> {
	const locations = getNeededSVGLocations(ids);
  
	if (locations.size > 0) {
		await fetchMissingTypes(locations);
	}

	return getSVGIDs(ids);
}

/**
 * Fetches the SVG for missing piece types using a regular fetch while using the processingCache
 * to prevent duplicate fetch requests.
 * If the type is included in the classical group, it fetches the classical group instead of the individual type.
 * @param typesSingular - Array of singular piece types that need to be fetched.
 */
async function fetchMissingTypes(locations: Set<string>) {
	// If the type is included in the classical group, fetch the classical group instead of the individual type

	await Promise.all([...locations].map(async location => fetchLocation(location)));
}

async function fetchLocation(location: string) {
	const url = `svg/pieces/${location}.svg`;

	if (!processingCache[url]) {
		processingCache[url] = (async() => {
			try {
				const response = await fetch(url);
				if (!response.ok) throw new Error(`HTTP error when fetching piece svgs from location "${location}"! status: ${response.status}`);
				const svgText = await response.text();
				const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
	
				Array.from(doc.getElementsByTagName("svg")).forEach(svg => {
					cachedPieceSVGs[svg.id] = svg;
				});
			} catch (error) {
				// Remove the failed promise from the cache to allow retrying
				delete processingCache[url];
				throw error;
			}
		})();
	} else {
		console.log(`Already fetching piece svg at location ${location}. Not sending duplicate request. Waiting..`);
	}

	await processingCache[url];
}

// Exports -------------------------------------------------------------------


export default {
	getSVGElements
};