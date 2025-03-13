

/** Converts a list of SVGs into a list of HTMLImageElements */
async function convertSVGsToImages(svgElements: SVGElement[]) {
	const readyImages: HTMLImageElement[] = [];
	try {
		for (const svgElement of svgElements) {
			const img = await svgToImage(svgElement); // You can adjust width and height as needed
			// document.body.appendChild(img);
			readyImages.push(img);
		}
	} catch (e) {
		console.log("Error caught while converting SVGs to Images:");
		console.log((e as Error).stack);
	}
	return readyImages;
}


/**
 * Converts an SVG element to an Image element by serializing the SVG and creating a data URL.
 * The image does NOT have a specified width or height.
 * @param svgElement - The SVG element to convert into an image.
 * @returns A promise that resolves with the created image element.
 */
function svgToImage(svgElement: SVGElement): Promise<HTMLImageElement> {
	const svgID = svgElement.id; // 'pawnsW'

	// Serialize the SVG element back to a string
	const svgString = new XMLSerializer().serializeToString(svgElement);

	// Log the SVG string for debugging purposes
	// console.log("SVG String: ", svgString);

	// Create a new image element
	const img = new Image();

	// Convert SVG string to a data URL using encodeURIComponent for better encoding
	const svgData = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgString)}`;
	img.src = svgData;
	img.id = svgID; // Set its ID here so its easy to find it in the document later

	return new Promise((resolve, reject) => {
		img.onload = () => resolve(img);
		img.onerror = (err) => {
			console.error(`Error loading image with ID "${svgID}"`, err);
			reject(new Error(`Failed to load image with ID "${svgID}"`));
		};
	});
}



export {
	convertSVGsToImages,
	svgToImage,
};
