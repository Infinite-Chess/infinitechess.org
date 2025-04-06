
/**
 * This script can create a 2x2 checkerboard texture of any color
 * light tiles and dark tiles, and if any width.
 */

/**
 * Creates a checkerboard pattern image of a given size with custom players.
 * @param {string} lightColor - The color for the light squares (CSS color format).
 * @param {string} darkColor - The color for the dark squares (CSS color format).
 * @param {number} imageSize - The size of the image (width and height). The final image will be imageSize x imageSize, split into 4 squares.
 * @returns {Promise<HTMLImageElement>} A promise that resolves to the checkerboard image.
 */
function createCheckerboardIMG(lightColor, darkColor, imageSize = 2) {
	const canvas = document.createElement('canvas');
	canvas.width = imageSize;
	canvas.height = imageSize;
	const ctx = canvas.getContext('2d');

	// Define the size of each square
	const squareSize = imageSize / 2;

	// Top-left (light square)
	ctx.fillStyle = lightColor;
	ctx.fillRect(0, 0, squareSize, squareSize);

	// Top-right (dark square)
	ctx.fillStyle = darkColor;
	ctx.fillRect(squareSize, 0, squareSize, squareSize);

	// Bottom-left (dark square)
	ctx.fillStyle = darkColor;
	ctx.fillRect(0, squareSize, squareSize, squareSize);

	// Bottom-right (light square)
	ctx.fillStyle = lightColor;
	ctx.fillRect(squareSize, squareSize, squareSize, squareSize);

	// Convert to an image element
	const img = new Image();
	img.src = canvas.toDataURL();

	// Return a promise that resolves when the image is loaded
	return new Promise((resolve, reject) => {
		img.onload = () => { resolve(img); };
		img.onerror = () => {
			console.error('Error loading the image!', img);
			reject(new Error('Error loading the checkerboard texture'));
		};
	});
}

export default {
	createCheckerboardIMG,
};