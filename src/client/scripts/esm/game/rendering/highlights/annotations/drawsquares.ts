
/**
 * This script allows the user to highlight squares on the board.
 * 
 * Helpful for analysis, and requested by many.
 */

import coordutil from "../../../../chess/util/coordutil.js";
import math, { Color } from "../../../../util/math.js";
import space from "../../../misc/space.js";
import { BufferModelInstanced, createModel_Instanced } from "../../buffermodel.js";
import instancedshapes from "../../instancedshapes.js";
import gameslot from "../../../chess/gameslot.js";
import miniimage from "../../miniimage.js";
// @ts-ignore
import movement from "../../movement.js";
// @ts-ignore
import input from "../../../input.js";
// @ts-ignore
import transition from "../../transition.js";


import type { Coords } from "../../../../chess/util/coordutil.js";


// Variables -----------------------------------------------------------------

/** ADDITONAL (not overriding) opacity when hovering over highlights. */
const hover_opacity = 0.5;


/** All highlights currently on the board. */
const highlights: Coords[] = [];
/** All highlights currently being hovered over, if zoomed out. */
const highlightsHovered: Coords[] = [];

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

		const color = preferences.getAnnoteSquareColor();
		model = genModel(highlights, color);
	}

	// Test if any one highlight is being hovered over
	highlightsHovered.length = 0;
	if (movement.isScaleLess1Pixel_Virtual() && highlights.length > 0) {
		// Calculate the mouse's world space
		const mouseWorld: Coords = input.getPointerWorldLocation() as Coords;
		// Iterate through each highlight to see if the mouse world is within MINI_IMAGE_WIDTH_VPIXELS of it
		highlights.forEach(coords => {
			const coordsWorld = space.convertCoordToWorldSpace_IgnoreSquareCenter(coords);
			// const coordsWorld = space.convertCoordToWorldSpace(coords);
			const dist = math.chebyshevDistance(coordsWorld, mouseWorld);
			if (dist < miniimage.MINI_IMAGE_WIDTH_VPIXELS) highlightsHovered.push(coords);
		});

		// If the pointer clicked, initiate a teleport to all highlights hovered
		if (highlightsHovered.length > 0 && input.getPointerClicked()) transition.initTransitionToCoordsList(highlightsHovered);
	}
}

function clearSquares() {
	highlights.length = 0;
	model = undefined;
}


// Rendering -----------------------------------------------------------------


function regenModel() {
	model = genModel(highlights, color);
}

function genModel(highlights: Coords[], color: Color): BufferModelInstanced {
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


	// Render main highlights
	model!.render(position, scale, { size });

	// Render hovered highlights
	if (highlightsHovered.length > 0) {
		const color = preferences.getAnnoteSquareColor();
		const hoverColor = [
			color[0],
			color[1],
			color[2],
			hover_opacity
		] as Color;
		const model = genModel(highlightsHovered, hoverColor);
		model.render(position, scale, { size });
	}
}


// Exports -------------------------------------------------------------------


export default {
	update,
	clearSquares,
	regenModel,
	render,
};