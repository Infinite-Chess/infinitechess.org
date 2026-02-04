// src/client/scripts/esm/game/rendering/highlights/highlights.ts

/**
 * This script renders all highlights:
 *
 * Last move
 * Check
 * Legal moves (of selected piece and hovered arrows)
 */

import type { Board } from '../../../../../../shared/chess/logic/gamefile.js';
import type { Color } from '../../../../../../shared/util/math/math.js';

import boardpos from '../boardpos.js';
import premoves from '../../chess/premoves.js';
import moveutil from '../../../../../../shared/chess/util/moveutil.js';
import enginegame from '../../misc/enginegame.js';
import annotations from './annotations/annotations.js';
import preferences from '../../../components/header/preferences.js';
import checkhighlight from './checkhighlight.js';
import squarerendering from './squarerendering.js';
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
	if (!boardpos.areZoomedOut()) {
		// Zoomed in
		highlightLastMove(boardsim);
		checkhighlight.render(boardsim);
		legalmovehighlights.render();
		specialrighthighlights.render(); // Should be after legalmovehighlights.render(), since that updates model_Offset
	}
	premoves.render(); // Premove highlights
	// Needs to render EVEN if zoomed out (different mode)
	annotations.render_belowPieces(); // The square highlights added by the user
	enginegame.render(); // Engine games can render a debug of engine generated moves
}

/** Highlights the start and end squares of the most recently played move. */
function highlightLastMove(boardsim: Board): void {
	const lastMove = moveutil.getCurrentMove(boardsim);
	if (!lastMove) return; // Don't render if last move is undefined.

	const color: Color = preferences.getLastMoveHighlightColor();
	const u_size: number = boardpos.getBoardScaleAsNumber();

	squarerendering
		.genModel([lastMove.startCoords, lastMove.endCoords], color)
		.render(undefined, undefined, { u_size });
}

export default {
	render,
};
