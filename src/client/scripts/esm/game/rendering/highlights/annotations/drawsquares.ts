// src/client/scripts/esm/game/rendering/highlights/annotations/drawsquares.ts

/**
 * This script allows the user to highlight squares on the board.
 *
 * Helpful for analysis, and requested by many.
 */

import type { Color } from '../../../../../../../shared/types/color.js';
import type { Coords, DoubleCoords } from '../../../../../../../shared/util/coordutil.js';

import vectors from '../../../../../../../shared/util/math/vectors.js';
import bdcoords from '../../../../../../../shared/util/bdcoords.js';
import coordutil from '../../../../../../../shared/util/coordutil.js';
import variantrules from '../../../../../../../shared/chess/logic/variantrules.js';

import space from '../../../../board/rendering/space.js';
import mouse from '../../../mouse.js';
import snapping from '../snapping.js';
import boardpos from '../../../../board/rendering/boardpos.js';
import gameslot from '../../../chess/gameslot.js';
import gamescene from '../../gamescene.js';
import { Mouse } from '../../../input.js';
import preferences from '../../../../util/preferences.js';
import squarerendering from '../../../../board/rendering/squarerendering.js';

// Constants -------------------------------------------------------------------

/** The color of preset squares for the variant. */
const PRESET_SQUARE_COLOR: Color = [1, 0.2, 0, 0.24]; // Transparent orange (makes preset squares less noticeable/distracting)

/**
 * To make single Square highlight more visible than rays (which
 * include a LOT of squares), lone squares get an opacity offset.
 */
const OPACITY_OFFSET = 0.08;

// State -----------------------------------------------------------------------

/**
 * The preset square overrides if provided from the ICN.
 * These override the variant's preset squares.
 */
let preset_squares: Coords[] | undefined;

// Updating --------------------------------------------------------------------

/** Returns a list of all square highlights being hovered over by any pointer. */
function getAllSquaresHovered(highlights: Coords[]): Coords[] {
	const allHovered: Coords[] = [];

	for (const pointerWorld of mouse.getAllPointerWorlds()) {
		const hovered = getSquaresBelowWorld(highlights, pointerWorld, false).squares;
		hovered.forEach((coords) => {
			// Prevent duplicates
			if (!allHovered.some((c) => coordutil.areCoordsEqual(c, coords)))
				allHovered.push(coords);
		});
	}
	return allHovered;
}

/** Returns a list of Square highlight coordinates that are all being hovered over by the provided world coords. */
function getSquaresBelowWorld(
	highlights: Coords[],
	world: DoubleCoords,
	trackDists: boolean,
): { squares: Coords[]; dists?: number[] } {
	const squares: Coords[] = [];
	const dists: number[] = [];

	const entityHalfWidthWorld = snapping.getEntityWidthWorld() / 2;
	const boardPos = boardpos.getBoardPos();
	const boardScale = boardpos.getBoardScale();

	// Iterate through each highlight to see if the mouse world is within ENTITY_WIDTH_VPIXELS of it
	highlights.forEach((coords) => {
		const coordsWorld = space.convertCoordToWorldSpace(
			bdcoords.fromCoords(coords),
			boardPos,
			boardScale,
		);
		const dist_cheby = vectors.chebyshevDistanceDoubles(coordsWorld, world);
		if (dist_cheby < entityHalfWidthWorld) {
			squares.push(coords);
			// Upgrade the distance to euclidean
			if (trackDists) dists.push(vectors.euclideanDistanceDoubles(coordsWorld, world));
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
function update(highlights: Coords[]): void {
	// If the pointer simulated a right click, add a highlight!
	if (mouse.isMouseClicked(Mouse.RIGHT)) {
		mouse.claimMouseClick(Mouse.RIGHT); // Claim the click so other scripts don't also use it
		const pointerWorld = mouse.getMouseWorld(Mouse.RIGHT);
		if (!pointerWorld) return; // Maybe we're looking into sky?

		// Toggle the highlight on the square
		const square = snapping.getSnappedSquare(pointerWorld);
		const index = highlights.findIndex((coords) => coordutil.areCoordsEqual(coords, square));
		if (index !== -1) highlights.splice(index, 1);
		else highlights.push(square);
	}
}

/**
 * Sets the preset squares, if they were specified in the ICN.
 * These override the variant's preset squares.
 */
function setPresetOverrides(pss: Coords[]): void {
	if (preset_squares)
		throw Error('Preset squares already initialized. Did you forget to clearPresetOverrides()?'); // prettier-ignore
	preset_squares = pss;
}

/** Returns the preset square overrides from the ICN. */
function getPresetOverrides(): Coords[] | undefined {
	return preset_squares;
}

/** Clears the preset square overrides from the ICN. */
function clearPresetOverrides(): void {
	preset_squares = undefined;
}

// Rendering -------------------------------------------------------------------

/** Renders the preset squares, the square highlights, and the hovered ones brighter. */
function render(highlights: Coords[]): void {
	const presetSquares =
		preset_squares ?? variantrules.getSquarePresets(gameslot.getGamefile()!.variant?.mod);

	// If we're zoomed out, then the size of the highlights is constant.
	const u_size = boardpos.areZoomedOut()
		? snapping.getEntityWidthWorld()
		: boardpos.getBoardScaleAsNumber();

	const ctx = gamescene.getGameContext();

	// Render preset squares (only if zoomed in)
	if (!boardpos.areZoomedOut() && presetSquares.length > 0)
		squarerendering
			.genModel(ctx, presetSquares, PRESET_SQUARE_COLOR)
			.render(undefined, undefined, { u_size });

	// Early exit if no drawn-squares to draw
	if (highlights.length === 0) return;

	// Render main highlights
	const color = preferences.getAnnoteSquareColor();
	color[3] += OPACITY_OFFSET; // Add opacity offset to make it more visible than rays

	squarerendering.genModel(ctx, highlights, color).render(undefined, undefined, { u_size });

	// Render hovered highlights

	if (!boardpos.areZoomedOut()) return; // Don't increase opacity of highlights when zoomed in

	const allHovered = getAllSquaresHovered(highlights);
	if (allHovered.length > 0) {
		const hoverColor = preferences.getAnnoteSquareColor();
		hoverColor[3] = squarerendering.HOVER_OPACITY;
		squarerendering
			.genModel(ctx, allHovered, hoverColor)
			.render(undefined, undefined, { u_size });
	}
}

// Exports ---------------------------------------------------------------------

export default {
	PRESET_SQUARE_COLOR,
	update,
	getAllSquaresHovered,
	getSquaresBelowWorld,
	setPresetOverrides,
	getPresetOverrides,
	clearPresetOverrides,
	render,
};
