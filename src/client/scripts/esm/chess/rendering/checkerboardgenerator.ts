// src/client/scripts/esm/chess/rendering/checkerboardgenerator.js

/**
 * This script can create a 2x2 checkerboard texture of any color for
 * light and dark tiles, and of any width.
 */

/**
 * Creates a checkerboard pattern image of a given size with custom colors.
 * @param lightColor - The color for the light squares (CSS color format).
 * @param darkColor - The color for the dark squares (CSS color format).
 * @param imageSize - The size of the image (width and height). The final image will be imageSize x imageSize, split into 4 squares.
 * @returns A promise that resolves to the checkerboard image.
 */
function createCheckerboardIMG(
	lightColor: string,
	darkColor: string,
	imageSize: number = 2,
): Promise<HTMLImageElement> {
	const canvas = document.createElement('canvas');
	canvas.width = imageSize;
	canvas.height = imageSize;
	const ctx = canvas.getContext('2d')!;

	// Define the size of each square
	const squareSize: number = imageSize / 2;

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
	return new Promise<HTMLImageElement>((resolve, reject): void => {
		img.onload = (): void => resolve(img);
		img.onerror = (): void => {
			const errorMessage = 'Error loading the checkerboard texture';
			console.error(errorMessage, img);
			reject(new Error(errorMessage));
		};
	});
}

export default {
	createCheckerboardIMG,
};
