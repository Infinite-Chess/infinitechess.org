
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
// @ts-ignore
import input from "../../../input.js";


import type { Coords } from "../../../../chess/util/coordutil.js";
import type { Vec2 } from "../../../../util/math.js";
import gameloader from "../../../chess/gameloader.js";


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

/**
 * Third type of annotation: A ray of infinite square highlights,
 * starting from a square and going to infinity.
 */
interface Ray {
	start: Coords
	vector: Vec2
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
		const moveIndex = gameslot.getGamefile()!.state.local.moveIndex;
		// Ensure its initialized
		if (!annotes_plies[moveIndex]) annotes_plies[moveIndex] = getEmptyAnnotes();
		return annotes_plies[moveIndex];
	}
}

/** Event listener for when we change the Lingering Annotations mode */
document.addEventListener('lingering-annotations-toggle', (e: CustomEvent) => {
	if (!gameloader.areInAGame()) return;
	const enabled: boolean = e.detail;
	const ply = gameslot.getGamefile()!.state.local.moveIndex;
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

	drawsquares.update(annotes.Squares);
	drawarrows.update(annotes.Arrows);

	// If middle mouse button is clicked, remove all highlights
	// TODO: Change this to left clicking an empty region of the board
	if (input.isMouseDown_Middle()) Collapse();
}

/**
 * CURRENT:
 * Erases all highlights.
 * 
 * PLANNED:
 * If there are any rays, we collapse their intersections into single highlights.
 */
function Collapse() {
	const annotes = getRelevantAnnotes();
	clearAnnotes(annotes);
}

/** Renders the annotations that should be rendered below the pieces */
function render_belowPieces() {
	const annotes = getRelevantAnnotes();
	drawsquares.render(annotes.Squares);

}

function render_abovePieces() {
	const annotes = getRelevantAnnotes();
	drawarrows.render(annotes.Arrows);

}

function onGameUnload() {
	annotes_plies.length = 0;
	clearAnnotes(annotes_linger);
	drawarrows.stopDrawing();
}


// Exports ----------------------------------------------------------


export default {
	getSquares,
	getArrows,
	getRays,

	update,
	render_belowPieces,
	render_abovePieces,
	onGameUnload,
};

export type {
	Square,
	Arrow,
	Ray,
};