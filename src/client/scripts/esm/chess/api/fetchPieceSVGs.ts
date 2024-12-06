
/**
 * Fetches SVG elements from a specified SVG file based on an array of element IDs.
 * Returns an array of matching SVG elements.
 */



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
	const response = await fetch(`svg/pieces/${relativeURL}`);
	const svgText = await response.text();
	const parser = new DOMParser();
	const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');

	// Array to store the SVG elements found by their IDs
	const svgElements: SVGElement[] = [];

	// Loop through the array of svgIds and fetch each corresponding SVG element
	for (const svgId of svgIds) {
		const svgElement = svgDoc.querySelector(`#${svgId}`) as SVGElement;
		if (!svgElement) {
			throw new Error(`SVG with ID ${svgId} not found`);
		}
		// Push the found SVG element into the array
		svgElements.push(svgElement);
	}

	// Return the array of SVG elements
	return svgElements;
}



export { fetchPieceSVGs };
