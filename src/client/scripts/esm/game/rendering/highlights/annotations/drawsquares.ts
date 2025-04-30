
/**
 * This script allows the user to highlight squares on the board.
 * 
 * Helpful for analysis, and requested by many.
 */

import coordutil from "../../../../chess/util/coordutil.js";
import { Color } from "../../../../util/math.js";
import space from "../../../misc/space.js";
import { BufferModelInstanced, createModel_Instanced } from "../../buffermodel.js";
import instancedshapes from "../../instancedshapes.js";
import gameslot from "../../../chess/gameslot.js";
// @ts-ignore
import movement from "../../movement.js";
// @ts-ignore
import input from "../../../input.js";


import type { Coords } from "../../../../chess/util/coordutil.js";
import miniimage from "../../miniimage.js";


// Variables -----------------------------------------------------------------


/** All highlights currently on the board. */
const highlights: Coords[] = [];

/** The current model of the highlights */
let model: BufferModelInstanced | undefined;


// Updating -----------------------------------------------------------------


/**
 * Tests if the user has added any new square highlights,
 * or deleted any existing ones.
 */
function update() {
	// If the pointer simulated a right click, add a highlight!
	if (input.getPointerClicked_Right()) {
		const pointerWorld: Coords = input.getPointerWorldLocation() as Coords;
		const pointerSquare: Coords = space.convertWorldSpaceToCoords_Rounded(pointerWorld);

		// Check if the square is already highlighted
		const index = highlights.findIndex(coords => coordutil.areCoordsEqual_noValidate(coords, pointerSquare));

		if (index !== -1) highlights.splice(index, 1); // Remove
		else highlights.push(pointerSquare); // Add

		model = regenModel();
	}
}

function clearSquares() {
	highlights.length = 0;
	model = undefined;
}


// Rendering -----------------------------------------------------------------


function regenModel(): BufferModelInstanced | undefined {
	const color = [1, 0, 0, 0.5] as Color; // Red. Should be opaque enough to be very noticeable at slightly high zoom levels.

	const vertexData: number[] = instancedshapes.getDataLegalMoveSquare(color);
	const instanceData: number[] = [];

	const offset = gameslot.getGamefile()!.mesh.offset;

	highlights.forEach(coords => {
		instanceData.push(...coordutil.subtractCoordinates(coords, offset));
	});

	return createModel_Instanced(vertexData, instanceData, 'TRIANGLES', true);
}


function render() {
	if (!model) return;

	const offset = gameslot.getGamefile()!.mesh.offset;

	const boardPos = movement.getBoardPos();
	const position: [number,number,number] = [
        -boardPos[0] + offset[0], // Add the model's offset. 
        -boardPos[1] + offset[1],
		0
	];
	// const boardScale = movement.getBoardScale();
	// const scale: [number,number,number] = [boardScale, boardScale, 1];
	const scale: [number,number,number] = [1, 1, 1]; // Don't scale by the zoom, because we specify a custom "size" uniform below.

	// If we're zoomed out, then the size of the highlights is constant.
	const size = movement.isScaleLess1Pixel_Virtual() ? space.convertPixelsToWorldSpace_Virtual(miniimage.MINI_IMAGE_WIDTH_VPIXELS) : movement.getBoardScale();
	// const size = movement.isScaleLess1Pixel_Virtual() ? miniimage.MINI_IMAGE_WIDTH_VPIXELS : movement.getBoardScale();

	model.render(position, scale, { size });
}


// Exports -------------------------------------------------------------------


export default {
	update,
	clearSquares,
	regenModel,
	render,
};