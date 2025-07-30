
/**
 * This script renders all highlights:
 * 
 * Last move
 * Check
 * Legal moves (of selected piece and hovered arrows)
 */

import checkhighlight from "./checkhighlight.js";
import { highlightLastMove } from "./lastmovehighlight.js";
import legalmovehighlights from "./legalmovehighlights.js";
import specialrighthighlights from "./specialrighthighlights.js";
import boardpos from "../boardpos.js";
import annotations from "./annotations/annotations.js";
import premoves from "../../chess/premoves.js";

import type { Board } from "../../../chess/logic/gamefile.js";


/**
 * Renders all highlights, including:
 * 
 * Last move highlight
 * Red Check highlight
 * Legal move highlights
 * Hovered arrows legal move highlights
 * Outline of highlights render box
 */
function render(boardsim: Board) {
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

export default {
	render,
};