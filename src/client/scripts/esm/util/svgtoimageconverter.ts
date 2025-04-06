
/**
 * This script can convert SVG elements into HTMLImageElements.
 * 
 * It also can normalize the pixel data of an image by drawing it onto a canvas and re-serializing it.
 */


// Functions --------------------------------------------------------------------------


/** Converts a list of SVGs into a list of HTMLImageElements. Does this in parallel. */
async function convertSVGsToImages(svgElements: SVGElement[]): Promise<HTMLImageElement[]> {
	try {
		// Create an array of promises, where each promise resolves to an HTMLImageElement
		const conversionPromises = svgElements.map(svgElement => svgToImage(svgElement));
		
		// Wait for all the conversion promises to resolve concurrently
		const readyImages = await Promise.all(conversionPromises);
		
		// Optional: Append the images to the doc for debugging
		// for (const img of readyImages) {
		//     document.body.appendChild(img); 
		// }

		return readyImages;
	} catch (e) {
		// Although we assume individual svgToImage calls resolve, Promise.all itself
		// could theoretically encounter an issue, or svgToImage might throw a sync error.
		console.error("Error caught during conversion of SVGs to Images:", e);
		return []; // Return an empty array in case of unexpected errors
	}
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
		img.onload = () => {
			// Append the image to the document for debugging
			// document.body.appendChild(img);
			resolve(img);
		};
		img.onerror = (err) => {
			console.error(`Error loading image with ID "${svgID}"`, err);
			reject(new Error(`Failed to load image with ID "${svgID}"`));
		};
	});
}

/**
 * Normalizes the pixel data of an image by drawing it onto a canvas and re-serializing it.
 * This used for patching a Firefox bug where it unintentionally darkens the image by double-multiplying the RGB channels by the alpha channel.
 * 
 * We don't have to do this for the spritesheet images, because the spritesheet generator ALREADY
 * draws the images onto a large canvas and re-serializes them.
 * @param img - The image to normalize.
 * @returns A promise that resolves with the normalized image.
 */
async function normalizeImagePixelData(img: HTMLImageElement): Promise<HTMLImageElement> {
	/** The image width each piece type's image should be. */
	const IMG_SIZE = 512; // High to retain as much resolution as possible during the drawing and re-serialization.

	// Proceed with canvas creation
	const canvas = document.createElement('canvas');
	canvas.width = IMG_SIZE;
	canvas.height = IMG_SIZE;
	const ctx = canvas.getContext('2d');
	if (ctx === null) throw new Error('2D context null.');
	
	// Draw original image
	ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
	// Return as standardized image
	const processedImg = new Image();
	processedImg.src = canvas.toDataURL();
	processedImg.id = img.id; // Give it the same ID as the original

	// Wait for the image to load
	await processedImg.decode();

	// Append the image to the document for debugging
	// document.body.appendChild(img);

	return processedImg;
}


// Exports -------------------------------------------------------------------------


export default {
	convertSVGsToImages,
	svgToImage,
	normalizeImagePixelData,
};
