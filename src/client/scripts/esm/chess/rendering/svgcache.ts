/**
 * This module handles fetching and caching of chess piece SVGs.
 * It won't request the same SVG twice.
 */


import type { Color } from '../util/colorutil.js';

import typeutil from '../util/typeutil.js';
import preferences from '../../components/header/preferences.js';

import type { RawType, Player } from '../util/typeutil.js';
import pieceThemes from '../../components/header/pieceThemes.js';

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
		const baseId = `${typeutil.getRawTypeStr(raw)}`;
		const checks: string[] = getPossibleExtensionsOfColor(c);
		for (const c of checks) {
			const id = baseId + c;
			if (id in cachedPieceSVGs) {
				continue typeloop;
			}
		}
		locations.add(raw);
	}

	return pieceThemes.getLocationsForTypes(locations);
} 

function getSVGIDs(types: number[], width?: number, height?: number): SVGElement[] {
	let failed: boolean = false;
	const svgs: SVGElement[] = [];
	l: for (const type of types) {
		const tint = preferences.getTintColorOfType(type);
		const [raw, c] = typeutil.splitType(type);
		const baseId = `${typeutil.getRawTypeStr(raw)}`;
		const checks: string[] = getPossibleExtensionsOfColor(c);
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

// Core functionality --------------------------------------------------------

/**
 * Returns all the SVG elements for the given piece IDs.
 * Piece IDs are in plural form.
 * @param ids - ['pawnsW', 'queensB']
 * @param [width] Optional width to set for each SVG.
 * @param [height] Optional height to set for each SVG.
 */
async function getSVGElements(ids: number[], width?: number, height?: number): Promise<SVGElement[]> {
	const locations = getNeededSVGLocations(ids);
  
	if (locations.size > 0) {
		await fetchMissingTypes(locations);
	}

	return getSVGIDs(ids, width, height);
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