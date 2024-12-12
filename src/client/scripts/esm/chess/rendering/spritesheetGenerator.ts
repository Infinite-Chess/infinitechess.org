
/**
 * This script takes a list of images, and converts it into a renderable
 * spritesheet, also returning the textue locations of each image.
 */

// @ts-ignore
import math from "../../util/math.js";


import type { Coords } from "../logic/movesets.js";


/**
 * The preferred image width each pieces image in a spreadsheet should be.
 * This may be a little higher, in order to make the spritesheet's total width a POWER OF 2.
 * BUT, the spritesheet's width will NEVER exceed WebGL's capacity!
 */
const preferredImgSize = 512;

/**
 * Generates a spritesheet from an array of HTMLImageElement objects.
 * The spritesheet is created by arranging the images in the smallest square grid.
 * Each image is placed in a grid of 512x512px.
 * @param gl - The webgl rendering context that will be rendering this spritesheet. We need this to determine the maximum-supported size.
 * @param images - An array of HTMLImageElement objects to be merged into a spritesheet.
 * @returns A promise that resolves with the generated spritesheet as an HTMLImageElement.
 */
async function generateSpritesheet(gl: WebGL2RenderingContext, images: HTMLImageElement[]) {
	// Ensure there are images provided
	if (images.length === 0) throw new Error('No images provided when generating spritesheet.');
  
	// Calculate the grid size: Find the smallest square grid to fit all images
	const numImages = images.length;
	const gridSize = Math.ceil(Math.sqrt(numImages));  // Square root of number of images, rounded up

	const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE); // Naviary's is 16,384

	/**
	 * The actual maximum size each image could be before exceeding web GL's boundaries.
	 * This is not how big we actually want to render the textures because we prefer they be 512x512.
	 */
	const maxImgSizePerMaxTextureSize = maxTextureSize / gridSize;

	const spritesheetSizeIfPreferredImgSizeUsed = math.roundUpToPowerOf2(preferredImgSize * gridSize); // Round up to nearest power of 2
	const actualImgSizeIfUsingPreferredImgSize = spritesheetSizeIfPreferredImgSizeUsed / gridSize; 

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
	if (ctx === null) throw new Error('2D context null.')

	// Positioning variables
	let xIndex = 0;
	let yIndex = 0;
  
	// Draw all the images onto the canvas
	for (let i = 0; i < numImages; i++) {
		const x = xIndex * actualImgSize;
		const y = yIndex * actualImgSize;

		// Draw the image at the current position
		ctx.drawImage(images[i]!, x, y, actualImgSize, actualImgSize);
	
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
 * Generates the sprite sheet data (texture coordinates and width) for each image.
 * @param images - An array of HTMLImageElement objects to be merged into a spritesheet.
 * @param gridSize - How many images fit one-way.
 * @returns A sprite data object with texture coordinates for each image.
 */
function generateSpriteSheetData(images: HTMLImageElement[], gridSize: number) {  
	const pieceWidth = 1 / gridSize;
	const texLocs: { [key: string]: Coords } = {};

	// Positioning variables
	let x = 0;
	let y = 0;
  
	// Loop through the images to create the sprite data
	images.forEach(image => { 
		const texX = (x / gridSize);
		const texY = 1 - (y + 1) / gridSize;

		// Store the texture coordinates
		// Use the image id as the key for the data object
		texLocs[image.id] = [texX, texY];
    
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



export { generateSpritesheet };
