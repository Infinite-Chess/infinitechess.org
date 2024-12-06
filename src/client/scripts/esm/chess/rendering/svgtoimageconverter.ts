
/**
 * Converts an SVG element to an Image element by serializing the SVG and creating a data URL.
 * The image is resized to the specified width and height after it loads.
 *
 * @param svgElement - The SVG element to convert into an image.
 * @returns A promise that resolves with the created image element.
 */
async function svgToImage(svgElement: SVGElement): Promise<HTMLImageElement> {
	const svgID = svgElement.id; // 'pawn-white'

	// Serialize the SVG element back to a string
	const svgString = new XMLSerializer().serializeToString(svgElement);

	// Log the SVG string for debugging purposes
	// console.log("SVG String: ", svgString);

	// Create a new image element
	const img = new Image();

	// Convert SVG string to a data URL using encodeURIComponent for better encoding
	const svgData = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgString)}`;
	img.src = svgData;
	img.id = svgID;

	return new Promise((resolve, reject) => {
		img.onload = () => {
			// Resize the image after it loads (optional)
			// img.width = width;
			// img.height = height;
			// console.log(`Image ${svgID} converted successfully from a provided SVG.`);
			resolve(img);
		};

		img.onerror = (err) => {
			console.error(`Error loading image with ID "${svgID}"`, err);
			reject(new Error(`Failed to load image with ID "${svgID}"`));
		};
	});
}



export {
	svgToImage
};
