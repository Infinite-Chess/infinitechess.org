// src/client/scripts/esm/chess/rendering/svgcache.ts

/**
 * This module handles fetching and caching of chess piece SVGs.
 * It won't request the same SVG twice.
 *
 * Pieces are grouped into files under `/svg/pieces/` (`classical`, `fairy/rose`, ...), each
 * holding one `<svg>` per color variant, identified by an id like `pawn-black`. A fetched
 * file is cached whole, and callers are handed clones — tinted to a player's color for the
 * board, or recolored into a monochrome silhouette. The classical file is preloaded on
 * import, since every single game uses it.
 *
 * `server/config/pieceSvgCache.ts` is the server's counterpart, reading these same
 * files off disk as markup for SSR'd piece icons.
 */

import type { Color } from '../../../../../shared/types/color.js';
import type { Player, RawType } from '../../../../../shared/chess/util/typeutil.js';

import piecethemes from '../../../../../shared/chess/util/piecethemes.js';
import typeutil, { players } from '../../../../../shared/chess/util/typeutil.js';

// State -----------------------------------------------------------------------

/** Stores fetched SVG elements, keyed by their unique svg id (e.g., 'pawn-white'). These ids are on the svg elements themselves. */
const cachedPieceSVGs: { [svgId: string]: SVGElement } = {};

/** Tracks promises for ongoing SVG file fetch requests, using the file URL as the key, to prevent duplicates. */
const processingCache: { [key: string]: Promise<void> } = {};

// Initialization: Cache classical pieces on load. EVERY SINGLE GAME USES THESE.
fetchLocation('classical');

// Core functionality ----------------------------------------------------------

/**
 * Fetches required SVG files if not cached, then returns the SVG elements for the requested piece types.
 * This is the main public function for retrieving piece SVGs.
 */
async function getSVGElements(
	ids: number[],
	width?: number,
	height?: number,
): Promise<SVGElement[]> {
	const locations = getNeededSVGLocations(ids);
	if (locations.size > 0) await fetchMissingTypes(locations);
	// At this point, all needed SVGs should be in the cache!
	return getSVGIDs(ids, width, height);
}

/**
 * Initiates fetch requests for all specified SVG file locations concurrently, preventing duplicate requests.
 * @param locations - A set of unique SVG location names (e.g., "classical", "fairy/rose") to fetch.
 */
async function fetchMissingTypes(locations: Set<string>): Promise<void> {
	await Promise.all([...locations].map(async (location) => fetchLocation(location)));
}
/**
 * Fetches an SVG file from a specific location, parses it, and caches the individual SVG elements found within.
 * It prevents duplicate fetch requests for the same URL while a request is already in progress.
 * @param location - The SVG file location on the server (e.g., "classical", "fairy/rose") relative to `svg/pieces/`.
 * @returns A promise that resolves when the fetch and caching are complete.
 */
async function fetchLocation(location: string): Promise<void> {
	const url = `/svg/pieces/${location}.svg`;

	if (!processingCache[url]) {
		processingCache[url] = (async (): Promise<void> => {
			try {
				const response = await fetch(url);
				if (!response.ok)
					throw new Error(`HTTP error when fetching piece svgs from location "${location}"! status: ${response.status}`); // prettier-ignore
				const svgText = await response.text();
				const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');

				Array.from(doc.getElementsByTagName('svg')).forEach((svg) => {
					cachedPieceSVGs[svg.id] = svg;
				});
			} catch (error) {
				// Remove the failed promise from the cache to allow retrying
				delete processingCache[url];
				throw error;
			}
		})();
	}

	await processingCache[url];
}

/**
 * Tints an SVG element by applying a multiplication filter using the specified color.
 * The tint is applied by multiplying the original colors with the provided [r, g, b, a] values.
 * For example, white (1,1,1) becomes the tint color and black (0,0,0) remains black.
 */
function tintSVG(svgElement: SVGElement, color: Color): SVGElement {
	// Ensure a <defs> element exists in the SVG
	const defs =
		svgElement.querySelector('defs') ??
		svgElement.insertBefore(
			document.createElementNS('http://www.w3.org/2000/svg', 'defs'),
			svgElement.firstChild,
		);

	// Create a unique filter
	const filterId = `tint-${crypto.randomUUID()}`;
	const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
	filter.id = filterId;

	// Create feColorMatrix with the tinting effect to multiply color channels.
	const feColorMatrix = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
	feColorMatrix.setAttribute('type', 'matrix');
	// Construct the matrix values string, and multiply each color channel by them.
	// prettier-ignore
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
	{
		// FIREFOX PATCH. Setting the filter on the <svg> itself isn't applied when firefox converts it to an image.
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

// Helper functions ------------------------------------------------------------

/**
 * Identifies the unique SVG file locations (e.g., "classical", "fairy/rose") that need to be fetched.
 * It checks the cache first and only returns locations for types whose SVG variants are not yet cached.
 * @param types - An array of piece type numbers (combining raw type and color).
 * @returns A set of unique SVG file location names required for the given types.
 */
function getNeededSVGLocations(types: number[]): Set<string> {
	const locations: Set<RawType> = new Set();
	for (const type of types) {
		const [raw, c] = typeutil.splitType(type);
		if (findCachedSVG(raw, c) === undefined) locations.add(raw);
	}

	return piecethemes.getLocationsForTypes(locations);
}

/** Returns a raw type's cached svg, in its color's priority order, if any is cached. */
function findCachedSVG(raw: RawType, color: Player): SVGElement | undefined {
	const baseId = typeutil.getRawTypeStr(raw);
	for (const ext of piecethemes.getSVGColorPriority(color)) {
		const svg = cachedPieceSVGs[baseId + ext];
		if (svg !== undefined) return svg;
	}
	return undefined;
}

/**
 * Retrieves and prepares cloned SVG elements for the specified piece types from the cache.
 * It automatically applies the player's tint as well.
 * @param types - An array of piece type numbers to get SVGs for.
 * @param [width] - Optional width to set on the SVG elements.
 * @param [height] - Optional height to set on the SVG elements.
 * @returns An array of cloned and prepared SVG elements. Their id is now the integer id of the piece.
 */
function getSVGIDs(types: number[], width?: number, height?: number): SVGElement[] {
	let failed: boolean = false;
	const svgs: SVGElement[] = [];
	for (const type of types) {
		const [raw, c] = typeutil.splitType(type);
		const source = findCachedSVG(raw, c);
		if (source === undefined) {
			console.error(`SVG at path "${piecethemes.getLocationForType(raw)}" does not contain an svg with extensions ${piecethemes.getSVGColorPriority(c)} for ${typeutil.getRawTypeStr(raw)}`); // prettier-ignore
			failed = true;
			continue;
		}

		const cloned = source.cloneNode(true) as SVGElement;
		cloned.id = String(type); // Override 'pawn-white' with the integer piece type

		// Set width and height if specified
		if (width !== undefined) cloned.setAttribute('width', width.toString());
		if (height !== undefined) cloned.setAttribute('height', height.toString());

		// Tint if non-white
		const tint = piecethemes.getBaseColorForType(raw, c);
		if (tint.some((channel) => channel !== 1)) tintSVG(cloned, tint);

		svgs.push(cloned);
	}
	if (failed) throw Error('SVG theme is missing ids for pieces');
	return svgs;
}

/**
 * Returns a cloned SVG element for the given raw piece type, tagged `piece-silhouette` — a
 * global rule painting it in the CSS `color` it inherits. The server SSRs silhouettes off
 * the same rule, which is why it's CSS.
 * @param rawType - The raw piece type (without color extension).
 */
async function getSilhouetteSVG(rawType: RawType): Promise<SVGElement> {
	const type = typeutil.buildType(rawType, players.BLACK);
	const locations = getNeededSVGLocations([type]);
	if (locations.size > 0) await fetchMissingTypes(locations);
	return getCachedSilhouetteSVG(rawType);
}

/**
 * Synchronous variant of {@link getSilhouetteSVG}: clones the silhouette straight from cache.
 * Call only when you're sure the type has already been fetched and cached.
 * @param rawType - The raw piece type (without color extension).
 * @throws If the piece hasn't been fetched yet.
 */
function getCachedSilhouetteSVG(rawType: RawType): SVGElement {
	const source = findCachedSVG(rawType, players.BLACK);
	if (source === undefined) throw new Error(`No cached SVG found for raw piece type ${rawType}`);

	const clone = source.cloneNode(true) as SVGElement;
	clone.removeAttribute('id');
	clone.classList.add('piece-silhouette');
	return clone;
}

// Exports ---------------------------------------------------------------------

export default {
	getSVGElements,
	getSilhouetteSVG,
	getCachedSilhouetteSVG,
};
