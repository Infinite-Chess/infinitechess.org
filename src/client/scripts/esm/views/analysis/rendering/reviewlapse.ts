// src/client/scripts/esm/views/analysis/rendering/reviewlapse.ts

/**
 * Renders the Game Review's verdict on the viewed move while it's a lapse (an inaccuracy, mistake
 * or blunder), like lichess' analysis: a green arrow of the move that should have been played
 * instead, and the classification badge ("?!", "?", "??") on the move's destination square.
 */

import type { Color } from '../../../../../../shared/types/color.js';

import icnmoves from '../../../../../../shared/chess/logic/icn/icnmoves.js';

import gameslot from '../../../game/chess/gameslot.js';
import movetree from '../movetree.js';
import gamereview from '../gamereview.js';
import drawarrows from '../../../game/rendering/highlights/annotations/drawarrows.js';
import boardglyphs from '../../../game/rendering/glyphs/boardglyphs.js';
import { createRenderable } from '../../../board/rendering/renderable.js';

// Constants -------------------------------------------------------------------

/** Best-move arrow color: chessground's paleGreen brush (#15781B at 40% opacity), as lichess uses. */
const COLOR: Color = [0.08, 0.47, 0.11, 0.4];

// Functions -------------------------------------------------------------------

/** Renders the best-move arrow, then the badge over it, if the currently-viewed move is a lapse. */
function render(): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;

	const node = movetree.getCurrentNode(gamefile);
	if (!node?.move) return; // Root (starting position) has no move to review.

	const review = gamereview.getReviewForNode(node.id);
	if (!review || !gamereview.isLapseKey(review.classification)) return;

	if (review.bestMove !== undefined) renderBestMoveArrow(review.bestMove);
	boardglyphs.render(review.classification, [node.move.endCoords]);
}

/** Renders the arrow of the move that should have been played, given as a move token. */
function renderBestMoveArrow(bestMove: string): void {
	const { startCoords, endCoords } = icnmoves.parseTokenMove(bestMove);
	const data = drawarrows.getDataArrow(drawarrows.createArrow(startCoords, endCoords), COLOR);
	createRenderable(data, 2, 'TRIANGLES', 'color', true).render();
}

// Exports ---------------------------------------------------------------------

export default {
	render,
};
