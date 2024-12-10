
// @ts-ignore
import math from "../../util/math.js";
// @ts-ignore
import colorutil from "../util/colorutil.js";


import type { Coords } from "../logic/movesets.js";


/**
 * The preferred image width each pieces image in a spreadsheet should be.
 * This may round UP in order to make the spritesheet's total width a POWER OF 2.
 * 
 * BUT, the image width will never cause the spritesheet's width to exceed WebGL's capacity!
*/
const preferredImgSize = 512;  // Each image is 512x512px

/**
 * Generates a spritesheet from an array of HTMLImageElement objects.
 * The spritesheet is created by arranging the images in the smallest square grid.
 * Each image is placed in a grid of 512x512px.
 *
 * @param gl
 * @param images - An array of HTMLImageElement objects to be merged into a spritesheet.
 * @returns A promise that resolves with the generated spritesheet as an HTMLImageElement.
 */
async function generateSpritesheet(gl: WebGL2RenderingContext, images: HTMLImageElement[]) {
	// Ensure there are images provided
	if (images.length === 0) throw new Error('No images provided.');
  
	// Calculate the grid size: Find the smallest square grid to fit all images
	const numImages = images.length;
	const gridSize = Math.ceil(Math.sqrt(numImages));  // Square root of number of images, rounded up

	const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE); // Naviary's is 16,384

	/**
	 * The actual maximum size each image could be before exceeding web GL's boundaries.
	 * This is not how big we actually want to render the textures because we want to still cap them at 512.
	 */
	const maxImgSizePerMaxTextureSize = maxTextureSize / gridSize;

	const spritesheetSizeIfPreferredImgSizeUsed = math.roundUpToPowerOf2(preferredImgSize * gridSize); // NOT a power of 2 !!!!
	const actualImgSizeIfUsingPreferredImgSize = spritesheetSizeIfPreferredImgSizeUsed / gridSize; // IS a power of 2 :)

	/** Whichever is smaller of the two */
	const actualImgSize = Math.min(actualImgSizeIfUsingPreferredImgSize, maxImgSizePerMaxTextureSize);
  
  
	// Calculate the total width and height of the canvas (spritesheet)
	const canvasWidth = gridSize * actualImgSize;
	const canvasHeight = gridSize * actualImgSize;
  
	// Create a canvas element for the spritesheet
	const canvas = document.createElement('canvas');
	canvas.width = canvasWidth;
	canvas.height = canvasHeight;
	const ctx = canvas.getContext('2d');

	// Positioning variables
	let xIndex = 0;
	let yIndex = 0;
  
	// Draw all the images onto the canvas
	for (let i = 0; i < numImages; i++) {

		const x = xIndex * actualImgSize;
		const y = yIndex * actualImgSize;

		// Draw the image at the current position
		ctx?.drawImage(images[i]!, x, y, actualImgSize, actualImgSize);
	
		// Update the position for the next image
		xIndex++;
		if (xIndex === gridSize) {
			xIndex = 0;
			yIndex++;
		}
	}
  
	// Create an HTMLImageElement from the canvas
	const spritesheetImage = new Image();
	spritesheetImage.src = canvas.toDataURL();
  
	// Return a promise that resolves when the image is loaded
	await spritesheetImage.decode();

	const spritesheetData = generateSpriteSheetData(images, gridSize);

	return { spritesheet: spritesheetImage, spritesheetData };
}

/**
 * Generates the sprite sheet data (texture coordinates) for each image.
 * 
 * @param images - An array of HTMLImageElement objects to be merged into a spritesheet.
 * @returns A sprite data object with texture coordinates for each image.
 */
function generateSpriteSheetData(images: HTMLImageElement[], gridSize: number) {  
	// Create the sprite data object
	const texLocs: { [key: string]: Coords } = {};
	const pieceWidth = 1 / gridSize;

	// Positioning variables
	let x = 0;
	let y = 0;
  
	// Loop through the images to create the sprite data
	images.forEach(image => { 
		const texX = (x / gridSize);  // Normalize the x texture coordinate
		const texY = 1 - (y + 1) / gridSize;  // Normalize the y texture coordinate

		// Assuming the image has an ID, use it as the key for the data object
		const imageId = image.id;
		const mappedKey = mapIdToKey(imageId);

		// Store the texture coordinates in the spriteData object
		texLocs[mappedKey] = [texX, texY];
    
		// Update the position for the next image
		x++;
		if (x === gridSize) {
			x = 0;
			y++;
		}
	});
  
	return {
		pieceWidth,
		texLocs
	};
}

/**
 * Maps IDs like "pawn-white" to "pawnsW" and "pawn-black" to "pawnsB".
 */
function mapIdToKey(id: string): string {
	const [pieceSingular, color] = id.split('-'); // ['pawn','white']
	const colorSuffix = colorutil.getColorExtensionFromColor(color);
	if (colorSuffix === null) throw new Error(`Color not valid: "${color}"`);
	return `${pieceSingular}s${colorSuffix}`;
}



export { generateSpritesheet };
  