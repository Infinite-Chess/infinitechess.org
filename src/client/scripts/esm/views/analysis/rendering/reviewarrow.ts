// src/client/scripts/esm/views/analysis/rendering/reviewarrow.ts

/**
 * Renders the Game Review's best move as a green arrow on the board while viewing a lapse
 * (an inaccuracy, mistake or blunder) — the move that should have been played instead, like
 * lichess' analysis arrow.
 */

import type { Color } from '../../../../../../shared/types/color.js';

import icnmoves from '../../../../../../shared/chess/logic/icn/icnmoves.js';

import gameslot from '../../../game/chess/gameslot.js';
import movetree from '../movetree.js';
import gamereview from '../gamereview.js';
import drawarrows from '../../../game/rendering/highlights/annotations/drawarrows.js';
import { createRenderable } from '../../../board/rendering/renderable.js';

// Constants -------------------------------------------------------------------

/** Best-move arrow color: chessground's paleGreen brush (#15781B at 40% opacity), as lichess uses. */
const COLOR: Color = [0.08, 0.47, 0.11, 0.4];

// Functions -------------------------------------------------------------------

/** Renders the best-move arrow for the currently-viewed move, if it's a lapse. */
function render(): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;

	const node = movetree.getCurrentNode(gamefile);
	if (!node?.move) return; // Root (starting position) has no move to correct.

	const review = gamereview.getReviewForNode(node.id);
	if (!review?.classification || !gamereview.isLapseKey(review.classification)) return;
	if (review.bestMove === undefined) return;

	const { startCoords, endCoords } = icnmoves.parseTokenMove(review.bestMove);
	const data = drawarrows.getDataArrow(drawarrows.createArrow(startCoords, endCoords), COLOR);
	createRenderable(data, 2, 'TRIANGLES', 'color', true).render();
}

// Exports ---------------------------------------------------------------------

export default {
	render,
};
