// src/client/scripts/esm/util/svgtoimageconverter.ts

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
		const conversionPromises = svgElements.map((svgElement) => svgToImage(svgElement));

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
		console.error('Error caught during conversion of SVGs to Images:', e);
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
	return svgStringToImage(new XMLSerializer().serializeToString(svgElement), svgElement.id);
}

/**
 * Converts a serialized SVG string to an Image element via a data URL.
 * The image does NOT have a specified width or height.
 * @param svgString - The SVG markup to convert into an image.
 * @param [id] - Optional id to tag the image with, for finding it in the document later.
 * @returns A promise that resolves with the created image element.
 */
function svgStringToImage(svgString: string, id: string = ''): Promise<HTMLImageElement> {
	const img = new Image();
	// Convert SVG string to a data URL using encodeURIComponent for better encoding
	img.src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgString)}`;
	img.id = id;

	return new Promise((resolve, reject): void => {
		img.onload = (): void => resolve(img);
		img.onerror = (err): void => {
			console.error(`Error loading image with ID "${id}"`, err);
			reject(new Error(`Failed to load image with ID "${id}"`));
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
async function normalizeImagePixelData(
	img: HTMLImageElement,
	size: number = 512, // High default to retain resolution during the drawing and re-serialization.
): Promise<HTMLImageElement> {
	// Proceed with canvas creation
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
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
	svgStringToImage,
	normalizeImagePixelData,
};
