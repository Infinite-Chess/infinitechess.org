// src/client/scripts/esm/views/analysis/rendering/reviewbadge.ts

/**
 * Renders the Game Review classification badge (e.g. "?!", "?", "??") on the
 * board, overhanging the top-right corner of the currently-viewed move's
 * destination square — matching lichess exactly.
 */

import gameslot from '../../../game/chess/gameslot.js';
import movetree from '../movetree.js';
import gamereview from '../gamereview.js';
import boardglyphs from '../../../game/rendering/glyphs/boardglyphs.js';

// Functions -------------------------------------------------------------------

/** Renders the classification badge on the currently-viewed move, if it has one. */
function render(): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;

	const node = movetree.getCurrentNode(gamefile);
	if (!node?.move) return; // Root (starting position) has no move to badge.

	const review = gamereview.getReviewForNode(node.id);
	if (!review?.classification || !gamereview.isLapseKey(review.classification)) return;

	boardglyphs.render(review.classification, [node.move.endCoords]);
}

// Exports ---------------------------------------------------------------------

export default {
	render,
};
