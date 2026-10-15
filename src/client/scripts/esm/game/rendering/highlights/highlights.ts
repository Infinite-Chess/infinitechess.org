// src/client/scripts/esm/game/rendering/highlights/highlights.ts

/**
 * This script renders all highlights:
 *
 * Last move
 * Check
 * Legal moves (of selected piece and hovered arrows)
 */

import type { Board } from '../../../../../../shared/chess/logic/boardinit.js';

import boardpos from '../../../board/rendering/boardpos.js';
import premoves from '../../chess/premoves.js';
import gamescene from '../gamescene.js';
import movehints from './movehints.js';
import annotations from './annotations/annotations.js';
import positionhighlights from '../../../board/rendering/positionhighlights.js';
import legalmovehighlights from './legalmovehighlights.js';
import specialrighthighlights from './specialrighthighlights.js';

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
	positionhighlights.render(gamescene.getGameContext(), boardsim);
	if (!boardpos.areZoomedOut()) {
		// Zoomed in
		legalmovehighlights.render();
		specialrighthighlights.render(); // Should be after legalmovehighlights.render(), since that updates model_Offset
	}
	premoves.render(); // Premove highlights
	// Needs to render EVEN if zoomed out (different mode)
	annotations.render_belowPieces(); // The square highlights added by the user
	movehints.render(); // Individual legal move hints when in check
}

export default {
	render,
};
