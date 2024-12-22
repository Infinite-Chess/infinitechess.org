
/**
 * Fetches piece SVGs from the server.
 */

import { fetchWithDeduplication } from "../../util/fetchDeduplicator.js";


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



export { fetchPieceSVGs };
