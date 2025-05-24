
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
import preferences from "../../../../components/header/preferences.js";
import snapping from "../snapping.js";
import boardpos from "../../boardpos.js";
import mouse from "../../../../util/mouse.js";
import { Mouse } from "../../../input.js";
// @ts-ignore
import guipause from "../../../gui/guipause.js";


import type { Coords } from "../../../../chess/util/coordutil.js";
import type { Square } from "./annotations.js";
import variant from "../../../../chess/variants/variant.js";
import gameslot from "../../../chess/gameslot.js";


// Variables -----------------------------------------------------------------


/** The color of preset squares for the variant. */
const PRESET_SQUARE_COLOR: Color = [1, 0.2, 0, 0.17]; // Transparent orange (makes preset squares less noticeable/distracting)

/**
 * The preset square overrides if provided from the ICN.
 * These override the variant's preset squares.
 */
let preset_squares: Square[] | undefined;

/**
 * To make single Square highlight more visible than rays (which
 * include a LOT of squares), lone squares get an opacity offset.
 */
const OPACITY_OFFSET = 0.08;

/** ADDITONAL (not overriding) opacity when hovering over highlights. */
const hover_opacity = 0.5;


// Updating -----------------------------------------------------------------


/** Returns a list of all drawn-square highlights being hovered over by any pointer. */
function getAllSquaresHovered(highlights: Square[]): Coords[] {
	const allHovered: Square[] = [];
	for (const pointerId of mouse.getRelevantListener().getAllPointerIds()) {
		const pointerWorld: Coords = mouse.getPointerWorld(pointerId)!;
		const hovered = getSquaresBelowWorld(highlights, pointerWorld, false).squares;
		hovered.forEach(coords => {
			// Prevent duplicates
			if (!allHovered.some(c => coordutil.areCoordsEqual(c, coords))) allHovered.push(coords);
		});
	}
	return allHovered;
}

/** Returns a list of Square highlight coordinates that are all being hovered over by the provided world coords. */
function getSquaresBelowWorld(highlights: Square[], world: Coords, trackDists: boolean): { squares: Coords[], dists?: number[] } {
	const squares: Square[] = [];
	const dists: number[] = [];

	const entityHalfWidthWorld = snapping.getEntityWidthWorld() / 2;

	// Iterate through each highlight to see if the mouse world is within ENTITY_WIDTH_VPIXELS of it
	highlights.forEach(coords => {
		const coordsWorld = space.convertCoordToWorldSpace(coords);
		const dist_cheby = math.chebyshevDistance(coordsWorld, world);
		if (dist_cheby < entityHalfWidthWorld) {
			squares.push(coords);
			// Upgrade the distance to euclidean
			if (trackDists) dists.push(math.euclideanDistance(coordsWorld, world));
		}
	});

	if (trackDists) return { squares, dists };
	else return { squares };
}

/**
 * Tests if the user has added any new square highlights,
 * or deleted any existing ones.
 * REQUIRES THE HOVERED HIGHLIGHTS to be updated prior to calling this!
 * @param highlights - All square highlights currently on the board.
 */
function update(highlights: Square[]) {
	// If the pointer simulated a right click, add a highlight!
	if (mouse.isMouseClicked(Mouse.RIGHT)) {
		mouse.claimMouseClick(Mouse.RIGHT); // Claim the click so other scripts don't also use it
		const pointerWorld: Coords = mouse.getMouseWorld(Mouse.RIGHT)!;
		const pointerSquare: Coords = space.convertWorldSpaceToCoords_Rounded(pointerWorld);

		const closestEntityToWorld = snapping.getClosestEntityToWorld(pointerWorld);
		const snapCoords = snapping.getWorldSnapCoords(pointerWorld);

		if (boardpos.areZoomedOut() && (closestEntityToWorld || snapCoords)) { // Zoomed out & snapping one thing => Snapping behavior
			if (closestEntityToWorld) {
				// Now that we have the closest hovered entity, toggle the highlight on its coords.
				const index = highlights.findIndex(coords => coordutil.areCoordsEqual(coords, closestEntityToWorld.coords));
				if (index !== -1) highlights.splice(index, 1); // Already highlighted, Remove
				else highlights.push(closestEntityToWorld.coords); // Add
			} else if (snapCoords) {
				// Toggle the highlight on its coords.
				const index = highlights.findIndex(coords => coordutil.areCoordsEqual(coords, snapCoords));
				if (index !== -1) throw Error("Snap is present, but the highlight already exists. If it exists than it should have been snapped to.");
				highlights.push(snapCoords); // Add
			} else throw Error("Snapping behavior but no snapCoords or hovered entity found.");

		} else { // Zoomed in OR zoomed out with no snap => Normal behavior
			// Check if the square is already highlighted
			const index = highlights.findIndex(coords => coordutil.areCoordsEqual(coords, pointerSquare));
	
			if (index !== -1) highlights.splice(index, 1); // Remove
			else highlights.push(pointerSquare); // Add
		}
	}
}

/**
 * Sets the preset squares, if they were specified in the ICN.
 * These override the variant's preset squares.
 */
function setPresetOverrides(pss: Coords[]) {
	if (preset_squares) throw Error("Preset squares already initialized. Did you forget to clearPresetOverrides()?");
	preset_squares = pss;
}

/** Returns the preset square overrides from the ICN. */
function getPresetOverrides() {
	return preset_squares;
}

/** Clears the preset ray overrides from the ICN. */
function clearPresetOverrides() {
	preset_squares = undefined;
}


// Rendering -----------------------------------------------------------------


function genModel(highlights: Square[], color: Color): BufferModelInstanced {
	const vertexData: number[] = instancedshapes.getDataLegalMoveSquare(color);
	const instanceData: number[] = [];

	highlights.forEach(coords => {
		// const worldLoc = space.convertCoordToWorldSpace_IgnoreSquareCenter(coords);
		const worldLoc = space.convertCoordToWorldSpace(coords);
		instanceData.push(...worldLoc);
	});

	return createModel_Instanced(vertexData, instanceData, 'TRIANGLES', true);
}


function render(highlights: Square[]) {
	const presetSquares = preset_squares ?? variant.getSquarePresets(gameslot.getGamefile()!.metadata.Variant);

	// If we're zoomed out, then the size of the highlights is constant.
	const size = boardpos.areZoomedOut() ? snapping.getEntityWidthWorld() : boardpos.getBoardScale();

	// Render preset squares (only if zoomed in)
	if (!boardpos.areZoomedOut()) genModel(presetSquares, PRESET_SQUARE_COLOR).render(undefined, undefined, { size });

	// Early exit if no drawn-squares to draw
	if (highlights.length === 0) return;

	// Render main highlights
	const color = preferences.getAnnoteSquareColor();
	color[3] += OPACITY_OFFSET; // Add opacity offset to make it more visible than rays

	genModel(highlights, color).render(undefined, undefined, { size });

	// Render hovered highlights

	if (!boardpos.areZoomedOut() || guipause.areWePaused()) return; // Don't increase opacity of highlighgts when zoomed in

	const allHovered = getAllSquaresHovered(highlights);
	if (allHovered.length > 0) {
		const hoverColor = preferences.getAnnoteSquareColor();
		hoverColor[3] = hover_opacity;
		genModel(allHovered, hoverColor).render(undefined, undefined, { size });
	}
}


// Exports -------------------------------------------------------------------


export default {
	update,
	getSquaresBelowWorld,
	setPresetOverrides,
	getPresetOverrides,
	clearPresetOverrides,
	render,
};