
/**
 * This script manages all annotations
 * * Squares
 * * Arrows
 * * Rays
 */

import drawsquares from "./drawsquares.js";
import preferences from "../../../../components/header/preferences.js";
import gameslot from "../../../chess/gameslot.js";
import jsutil from "../../../../util/jsutil.js";
import drawarrows from "./drawarrows.js";
import gameloader from "../../../chess/gameloader.js";
import drawrays from "./drawrays.js";
import coordutil from "../../../../chess/util/coordutil.js";
import { Mouse } from "../../../input.js";
import mouse from "../../../../util/mouse.js";


import type { Coords } from "../../../../chess/util/coordutil.js";
import type { Ray } from "../../../../util/math.js";


// Type Definitions ------------------------------------------------------------


/** An object storing all visible annotations for a specific ply. */
interface Annotes {
	/** First type of annotation: A square highlight. */
	Squares: Coords[]
	/** Second type of annoation: An arrow draw from one square to another. */
	Arrows: Arrow[]
	/**
	 * Third type of annotation: A ray of infinite square highlights,
	 * starting from a square and going to infinity.
	 */
	Rays: Ray[]
}

type Square = Coords;

/** Second type of annoation: An arrow draw from one square to another. */
interface Arrow {
	start: Coords
	end: Coords
}


// Variables -------------------------------------------------------------------


/** The annotations tied to specific move plies, when lingering annotations is OFF. */
const annotes_plies: Annotes[] = [];
/** The main list of annotations, when lingering annotations is ON. */
let annotes_linger: Annotes = getEmptyAnnotes();


// Getters ---------------------------------------------------------------------


/** Returns the list of all Square highlights currently visible. */
function getSquares() {
	return getRelevantAnnotes().Squares;
}

/** Returns the list of all Arrow highlights currently visible. */
function getArrows() {
	return getRelevantAnnotes().Arrows;
}

/** Returns the list of all Ray highlights currently visible. */
function getRays() {
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
		const index = gameslot.getGamefile()!.state.local.moveIndex + 1; // Change -1 based to 0 based index
		// Ensure its initialized
		if (!annotes_plies[index]) annotes_plies[index] = getEmptyAnnotes();
		return annotes_plies[index];
	}
}

/** Event listener for when we change the Lingering Annotations mode */
document.addEventListener('lingering-annotations-toggle', (e: CustomEvent) => {
	if (!gameloader.areInAGame()) return;
	const enabled: boolean = e.detail;
	const ply = gameslot.getGamefile()!.state.local.moveIndex + 1; // Change -1 based to 0 based index
	if (enabled) { /** Transfer annotes from the ply to {@link annotes_linger} */ 
		annotes_linger = jsutil.deepCopyObject(annotes_plies[ply]!);
	} else { /** Transfer annotes from {@link annotes_linger} to the current ply */ 
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
function clearAnnotes(annotes: Annotes) {
	annotes.Squares.length = 0;
	annotes.Arrows.length = 0;
	annotes.Rays.length = 0;
}


// Functions -------------------------------------------------------------------


/** Main Adds/deletes annotations */
function update() {
	const annotes = getRelevantAnnotes();

	// Arrows first since it reads if there was a click, but Squares will claim the click.
	drawarrows.update(annotes.Arrows);
	drawsquares.update(annotes.Squares);
	drawrays.update(annotes.Rays);
}

/** Collapses all annotations if we clicked the board. */
function testIfCollapsed() {
	if (mouse.isMouseClicked(Mouse.LEFT)) Collapse();
}

/**
 * Collapses all annotations. The behavior is:
 * A. Atleast 2 rays => Erase all rays and add more Squares at all their intersections.
 * B. Else => Erase all annotes.
 */
function Collapse() {
	const annotes = getRelevantAnnotes();

	if (annotes.Rays.length > 0) {
		// Collapse rays instead of erasing all annotations.
		const additionalSquares = drawrays.collapseRays(annotes.Rays);
		for (const newSquare of additionalSquares) {
			// Avoid adding duplicates
			if (annotes.Squares.some(s => coordutil.areCoordsEqual_noValidate(s, newSquare))) continue; // Duplicate
			annotes.Squares.push(newSquare);
		}
		annotes.Rays.length = 0; // Erase all rays
	} else clearAnnotes(annotes);
}

/**
 * Erases all the annotations of the current ply,
 * if lingering annotations is OFF.
 */
function onPieceSelection() {
	if (preferences.getLingeringAnnotationsMode()) return; // Don't clear annotations on piece selection in this mode
	// Clear the annotations of the current ply
	const annotes = getRelevantAnnotes();
	clearAnnotes(annotes);
}

function onGameUnload() {
	annotes_plies.length = 0;
	clearAnnotes(annotes_linger);
	drawarrows.stopDrawing();
}


// Rendering ----------------------------------------------------------


/** Renders the annotations that should be rendered below the pieces */
function render_belowPieces() {
	const annotes = getRelevantAnnotes();
	drawsquares.render(annotes.Squares);
	drawrays.render(annotes.Rays);
}

function render_abovePieces() {
	const annotes = getRelevantAnnotes();
	drawarrows.render(annotes.Arrows);

}


// Exports ----------------------------------------------------------


export default {
	getSquares,
	getArrows,
	getRays,

	update,
	testIfCollapsed,
	onPieceSelection,
	onGameUnload,
	render_belowPieces,
	render_abovePieces,
};

export type {
	Square,
	Arrow,
	Ray,
};