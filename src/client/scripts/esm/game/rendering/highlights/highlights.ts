
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
import annotations from "./annotations/annotations.js";
import selectedpiecehighlightline from "./selectedpiecehighlightline.js";
// @ts-ignore
import movement from "../movement.js";


// @ts-ignore
import type gamefile from "../../../chess/logic/gamefile";


/**
 * Renders all highlights, including:
 * 
 * Last move highlight
 * Red Check highlight
 * Legal move highlights
 * Hovered arrows legal move highlights
 * Outline of highlights render box
 */
function render(gamefile: gamefile) {
	selectedpiecehighlightline.render();

	if (!movement.isScaleLess1Pixel_Virtual()) { // Zoomed in
		highlightLastMove(gamefile);
		checkhighlight.render(gamefile);
		legalmovehighlights.render();
		specialrighthighlights.render(); // Should be after legalmovehighlights.render(), since that updates model_Offset
	} 
	annotations.render_belowPieces(); // The square highlights added by the user
}

export default {
	render,
};