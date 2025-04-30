
/**
 * This module handles fetching and caching of chess piece SVGs.
 * It won't request the same SVG twice.
 */


import type { Color } from '../../util/math.js';
import type { RawType, Player } from '../util/typeutil.js';

import typeutil from '../util/typeutil.js';
import preferences from '../../components/header/preferences.js';
import pieceThemes from '../../components/header/pieceThemes.js';


// Variables -----------------------------------------------------------------

/** Stores fetched SVG elements, keyed by their unique svg id (e.g., 'pawn-white'). These ids are on the svg elements themselves. */
const cachedPieceSVGs: { [pieceType: string]: SVGElement } = {};

/** Tracks promises for ongoing SVG file fetch requests, using the file URL as the key, to prevent duplicates. */
const processingCache: { [key: string]: Promise<void> } = {};


// Initialization: Cache classical pieces on load. EVERY SINGLE GAME USES THESE.
fetchLocation("classical");


// Core functionality --------------------------------------------------------


/**
 * Fetches required SVG files if not cached, then returns the SVG elements for the requested piece types.
 * This is the main public function for retrieving piece SVGs.
 */
async function getSVGElements(ids: number[], width?: number, height?: number): Promise<SVGElement[]> {
	const locations = getNeededSVGLocations(ids);
	if (locations.size > 0) await fetchMissingTypes(locations);
	// At this point, all needed SVGs should be in the cache!
	return getSVGIDs(ids, width, height);
}

/**
 * Initiates fetch requests for all specified SVG file locations concurrently, preventing duplicate requests.
 * @param locations - A set of unique SVG location names (e.g., "classical", "fairy/rose") to fetch.
 */
async function fetchMissingTypes(locations: Set<string>) {
	await Promise.all([...locations].map(async location => fetchLocation(location)));
}
/**
 * Fetches an SVG file from a specific location, parses it, and caches the individual SVG elements found within.
 * It prevents duplicate fetch requests for the same URL while a request is already in progress.
 * @param location - The SVG file location on the server (e.g., "classical", "fairy/rose") relative to `svg/pieces/`.
 * @returns A promise that resolves when the fetch and caching are complete.
 */
async function fetchLocation(location: string): Promise<void> {
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
					// console.log(`Fetched piece svg at location ${location}`);
				});
			} catch (error) {
				// Remove the failed promise from the cache to allow retrying
				delete processingCache[url];
				throw error;
			}
		})();
	} else {
		// console.log(`Already fetching piece svg at location ${location}. Not sending duplicate request. Waiting..`);
	}

	await processingCache[url];
}

/**
 * Tints an SVG element by applying a multiplication filter using the specified color.
 * The tint is applied by multiplying the original colors with the provided [r, g, b, a] values.
 * For example, white (1,1,1) becomes the tint color and black (0,0,0) remains black.
 * @param svgElement
 * @param color
 */
function tintSVG(svgElement: SVGElement, color: Color): SVGElement {
	// Ensure a <defs> element exists in the SVG
	const defs = svgElement.querySelector('defs') ?? svgElement.insertBefore(document.createElementNS('http://www.w3.org/2000/svg', 'defs'), svgElement.firstChild);

	// Create a unique filter
	const filterId = `tint-${crypto.randomUUID()}`;
	const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
	filter.id = filterId;

	// Create feColorMatrix with the tinting effect to multiply color channels.
	const feColorMatrix = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
	feColorMatrix.setAttribute('type', 'matrix');
	// Construct the matrix values string, and multiply each color channel by them.
	const matrixValues = [
		color[0], 0, 0, 0, 0,
		0, color[1], 0, 0, 0,
		0, 0, color[2], 0, 0,
		0, 0, 0, color[3], 0
	].join(' ');
	feColorMatrix.setAttribute('values', matrixValues);

	// Append filter and apply it to the SVG
	filter.appendChild(feColorMatrix);
	defs.appendChild(filter);

	// Apply the filter to the SVG element.
	// svgElement.setAttribute('filter', `url(#${filterId})`);
	{ // FIREFOX PATCH. Without this block, in firefox when converting the svg to an image, the filter is not applied.
		// Create a <g> element to wrap all children (except <defs>)
		const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		group.setAttribute('filter', `url(#${filterId})`);

		// Move all children (except <defs>) into the <g> element
		const children = Array.from(svgElement.childNodes);
		for (const child of children) {
			if (child !== defs) {
				group.appendChild(child);
			}
		}

		// Append the <g> element to the SVG
		svgElement.appendChild(group);
	}

	return svgElement;
}

// Helper functions ---------------------------------------------------------

/**
 * Determines the priority of what player color gets what color of svg, depending on what's available.
 * For example, if player neutral needs a pawn svg, it will first look for a neutral svg,
 * but when it doesn't exist it will fallback to the white svg.
 * @param color - The player color code (0, 1, or 2).
 * @returns An array of SVG color variant suffixes, ordered by lookup priority.
 */
function getSVGColorPriority(color: Player): string[] {
	switch (color) {
		case 0: // Neutral: prioritize neutral svg over white
			return ['-neutral','-white'];
		case 1: // White: prioritize white svg over black
			return ['-white','-neutral'];
		case 2: // Black: prioritize black svg over neutral
			return ['-black','-neutral'];
		// All higher player numbers are treated as tinted white pieces...
		case 3: // Red: prioritize white svg over neutral
			return ['-white','-neutral'];
		case 4: // Blue: prioritize white svg over neutral
			return ['-white','-neutral'];
		case 5: // Yellow: prioritize white svg over neutral
			return ['-white','-neutral'];
		case 6: // Green: prioritize white svg over neutral
			return ['-white','-neutral'];
		default:
			throw new Error(`Invalid color code: ${color}`);
	}
}

/**
 * Identifies the unique SVG file locations (e.g., "classical", "fairy/rose") that need to be fetched.
 * It checks the cache first and only returns locations for types whose SVG variants are not yet cached.
 * @param types - An array of piece type numbers (combining raw type and color).
 * @returns A set of unique SVG file location names required for the given types.
 */
function getNeededSVGLocations(types: number[]): Set<string> {
	const locations: Set<RawType> = new Set();
	typeloop: for (const type of types) {
		const [raw, c] = typeutil.splitType(type);
		const baseId = `${typeutil.getRawTypeStr(raw)}`;
		const checks: string[] = getSVGColorPriority(c);
		for (const c of checks) {
			const id = baseId + c;
			if (id in cachedPieceSVGs) continue typeloop;
		}
		locations.add(raw);
	}

	return pieceThemes.getLocationsForTypes(locations);
} 

/**
 * Retrieves and prepares cloned SVG elements for the specified piece types from the cache.
 * It automatically applies our theme's tint as well.
 * @param types - An array of piece type numbers to get SVGs for.
 * @param [width] - Optional width to set on the SVG elements.
 * @param [height] - Optional height to set on the SVG elements.
 * @returns An array of cloned and prepared SVG elements.
 */
function getSVGIDs(types: number[], width?: number, height?: number): SVGElement[] {
	let failed: boolean = false;
	const svgs: SVGElement[] = [];
	l: for (const type of types) {
		const tint = preferences.getTintColorOfType(type);
		const [raw, c] = typeutil.splitType(type);
		const baseId = `${typeutil.getRawTypeStr(raw)}`;
		const checks: string[] = getSVGColorPriority(c);
		for (const c of checks) {
			const id = baseId + c;
			if (!(id in cachedPieceSVGs)) continue;
			// Clone the SVG element
			const cloned = cachedPieceSVGs[id]!.cloneNode(true) as SVGElement;

			cloned.id = String(type);

			// Set width and height if specified
			if (width !== undefined) cloned.setAttribute('width', width.toString());
			if (height !== undefined) cloned.setAttribute('height', height.toString());
			
			tintSVG(cloned, tint);

			svgs.push(cloned);
			continue l;
		}
		console.error(`SVG at path "${pieceThemes.getLocationForType(raw)}" does not contain an svg with extensions ${checks} for ${baseId}`);
		failed = true;
	}
	if (failed) throw Error("SVG theme is missing ids for pieces");
	return svgs;
}

/**
 * Appends all cached SVG elements directly to the document body for debugging purposes.
 * This allows visual inspection of the SVGs currently held in the cache.
 */
function showCache() {
	for (const svg of Object.values(cachedPieceSVGs)) {
		document.body.appendChild(svg);
	}
}

// Exports -------------------------------------------------------------------


export default {
	getSVGElements,
	showCache,
};