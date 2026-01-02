/**
 * This script manages all annotations
 * * Squares
 * * Arrows
 * * Rays
 */

import type { BDCoords, Coords } from '../../../../../../../shared/chess/util/coordutil.js';
import type { Ray } from '../../../../../../../shared/util/math/vectors.js';

import drawsquares from './drawsquares.js';
import preferences from '../../../../components/header/preferences.js';
import gameslot from '../../../chess/gameslot.js';
import jsutil from '../../../../../../../shared/util/jsutil.js';
import drawarrows from './drawarrows.js';
import gameloader from '../../../chess/gameloader.js';
import drawrays from './drawrays.js';
import coordutil from '../../../../../../../shared/chess/util/coordutil.js';
import keybinds from '../../../misc/keybinds.js';
import bdcoords from '../../../../../../../shared/chess/util/bdcoords.js';
import { Mouse } from '../../../input.js';
import { GameBus } from '../../../chess/GameBus.js';

// Type Definitions ------------------------------------------------------------

/** An object storing all visible annotations for a specific ply. */
interface Annotes {
	/** First type of annotation: A square highlight. */
	Squares: Coords[];
	/** Second type of annoation: An arrow draw from one square to another. */
	Arrows: Arrow[];
	/**
	 * Third type of annotation: A ray of infinite square highlights,
	 * starting from a square and going to infinity.
	 */
	Rays: Ray[];
}

type Square = Coords;

/** Second type of annoation: An arrow draw from one square to another. */
interface Arrow {
	start: Coords;
	end: Coords;

	/** The bigint vector pointing from the start coords to the end coords. NOT normalized. */
	vector: Coords;
	/** The precalculated difference going from start to the end. Same as the vector, but as a BigDecimal. */
	difference: BDCoords;
	/** The precalculated ratio of the x difference to the distance (hypotenuse, total length). Doesn't need extreme precision. */
	xRatio: number;
	/** The precalculated ratio of the y difference to the distance (hypotenuse, total length). Doesn't need extreme precision. */
	yRatio: number;
}

// Variables -------------------------------------------------------------------

/** The annotations tied to specific move plies, when lingering annotations is OFF. */
const annotes_plies: Annotes[] = [];
/** The main list of annotations, when lingering annotations is ON. */
let annotes_linger: Annotes = getEmptyAnnotes();

// Events ---------------------------------------------------------------------

GameBus.addEventListener('piece-selected', () => {
	// Erase all the annotations of the current ply, if lingering annotations is OFF.
	if (preferences.getLingeringAnnotationsMode()) return; // Don't clear annotations on piece selection in this mode
	// Clear the annotations of the current ply
	const annotes = getRelevantAnnotes();
	clearAnnotes(annotes);
});
GameBus.addEventListener('game-unloaded', () => {
	// Clear all user-drawn highlights
	resetState();
});

// Getters ---------------------------------------------------------------------

/** Returns the list of all Square highlights currently visible. */
function getSquares(): Coords[] {
	return getRelevantAnnotes().Squares;
}

/** Returns the list of all Arrow highlights currently visible. */
function getArrows(): Arrow[] {
	return getRelevantAnnotes().Arrows;
}

/** Returns the list of all Ray highlights currently visible. */
function getRays(): Ray[] {
	return getRelevantAnnotes().Rays;
}

// Helpers ---------------------------------------------------------------------

/**
 * Returns the visible annotations according to the current Lingering Annotations mode:
 * 1. OFF => Returns current ply's annotes
 * 2. ON => Returns main annotes
 */
function getRelevantAnnotes(): Annotes {
	const enabled = preferences.getLingeringAnnotationsMode();
	if (enabled) return annotes_linger;
	else {
		const index = gameslot.getGamefile()!.boardsim.state.local.moveIndex + 1; // Change -1 based to 0 based index
		// Ensure its initialized
		if (!annotes_plies[index]) annotes_plies[index] = getEmptyAnnotes();
		return annotes_plies[index];
	}
}

/** Event listener for when we change the Lingering Annotations mode */
document.addEventListener('lingering-annotations-toggle', (e) => {
	if (!gameloader.areInAGame()) return;
	const enabled: boolean = e.detail;
	const ply = gameslot.getGamefile()!.boardsim.state.local.moveIndex + 1; // Change -1 based to 0 based index
	if (enabled) {
		/** Transfer annotes from the ply to {@link annotes_linger} */
		annotes_linger = jsutil.deepCopyObject(annotes_plies[ply]!);
	} else {
		/** Transfer annotes from {@link annotes_linger} to the current ply */
		annotes_plies[ply] = jsutil.deepCopyObject(annotes_linger);
		// Clear these
		clearAnnotes(annotes_linger);
	}
});

/** Returns an empty Annotes object. */
function getEmptyAnnotes(): Annotes {
	return { Squares: [], Arrows: [], Rays: [] };
}

/** Erases all the annotes of the provided annotations. */
function clearAnnotes(annotes: Annotes): void {
	annotes.Squares.length = 0;
	annotes.Arrows.length = 0;
	annotes.Rays.length = 0;
}

// Functions -------------------------------------------------------------------

/** Main Adds/deletes annotations */
function update(): void {
	const mouseKeybind = keybinds.getAnnotationMouseButton();
	if (mouseKeybind === undefined) return; // No button is assigned to drawing annotations currently
	// When this throws, we need to go into drawarrows, drawsquares, and drawrays update methods
	// and make it so the mouse button is accepted as an argument.
	if (mouseKeybind !== Mouse.RIGHT)
		throw Error('Annote drawing only supports right mouse button.');

	const annotes = getRelevantAnnotes();

	// Arrows first since it reads if there was a click, but Squares will claim the click.
	drawarrows.update(annotes.Arrows);
	drawsquares.update(annotes.Squares);
	drawrays.update(annotes.Rays);
}

/**
 * Collapses all annotations. The behavior is:
 * A. Atleast 1 ray => Erase all rays and add more Squares at all their intersections.
 * B. Else => Erase all annotes.
 */
function Collapse(): void {
	const annotes = getRelevantAnnotes();

	if (annotes.Rays.length > 0) {
		// Collapse rays instead of erasing all annotations.
		// Can map to integer Coords since the argument we pass in ensures we only get back integer intersections.
		const additionalSquares = drawrays
			.collapseRays(annotes.Rays, true)
			.map((i) => bdcoords.coordsToBigInt(i));
		for (const newSquare of additionalSquares) {
			// Avoid adding duplicates
			if (annotes.Squares.every((s) => !coordutil.areCoordsEqual(s, newSquare)))
				annotes.Squares.push(newSquare);
		}
		annotes.Rays.length = 0; // Erase all rays
		drawrays.dispatchRayCountEvent(annotes.Rays);
	} else clearAnnotes(annotes);
}

function resetState(): void {
	annotes_plies.length = 0;
	clearAnnotes(annotes_linger);
	drawarrows.stopDrawing();
	drawrays.stopDrawing();
	drawsquares.clearPresetOverrides();
	drawrays.clearPresetOverrides();
}

// Rendering ----------------------------------------------------------

/** Renders the annotations that should be rendered below the pieces */
function render_belowPieces(): void {
	const annotes = getRelevantAnnotes();
	drawsquares.render(annotes.Squares);
	drawrays.render(annotes.Rays);
}

function render_abovePieces(): void {
	const annotes = getRelevantAnnotes();
	drawarrows.render(annotes.Arrows);
}

// Exports ----------------------------------------------------------

export default {
	getSquares,
	getArrows,
	getRays,

	update,
	Collapse,
	resetState,
	render_belowPieces,
	render_abovePieces,
};

export type { Square, Arrow, Ray };
