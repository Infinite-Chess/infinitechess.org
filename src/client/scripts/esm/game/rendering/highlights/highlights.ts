
/**
 * This script renders all highlights:
 * 
 * Last move
 * Check
 * Legal moves (of selected piece and hovered arrows)
 */

import checkhighlight from "./checkhighlight.js";
import legalmovehighlights from "./legalmovehighlights.js";
import specialrighthighlights from "./specialrighthighlights.js";
import boardpos from "../boardpos.js";
import annotations from "./annotations/annotations.js";
import premoves from "../../chess/premoves.js";
import preferences from "../../../components/header/preferences.js";
import moveutil from "../../../chess/util/moveutil.js";
import squarerendering from "./squarerendering.js";


import type { Board } from "../../../chess/logic/gamefile.js";
import type { Color } from "../../../util/math/math.js";


/**
 * Renders all highlights, including:
 * 
 * Last move highlight
 * Red Check highlight
 * Legal move highlights
 * Hovered arrows legal move highlights
 * Outline of highlights render box
 */
function render(boardsim: Board): void {
	if (!boardpos.areZoomedOut()) { // Zoomed in
		highlightLastMove(boardsim);
		checkhighlight.render(boardsim);
		legalmovehighlights.render();
		specialrighthighlights.render(); // Should be after legalmovehighlights.render(), since that updates model_Offset
	}
	premoves.render(); // Premove highlights
	// Needs to render EVEN if zoomed out (different mode)
	annotations.render_belowPieces(); // The square highlights added by the user
}

/** Highlights the start and end squares of the most recently played move. */
function highlightLastMove(boardsim: Board): void {
	const lastMove = moveutil.getCurrentMove(boardsim);
	if (!lastMove) return; // Don't render if last move is undefined.

	const color: Color = preferences.getLastMoveHighlightColor();
	const size: number = boardpos.getBoardScaleAsNumber();

	squarerendering.genModel([lastMove.startCoords, lastMove.endCoords], color).render(undefined, undefined, { size });
}


export default {
	render,
};