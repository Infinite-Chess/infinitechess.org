// src/client/scripts/esm/views/analysis/rendering/analysisoverlays.ts

/**
 * The analysis page's overlays on the shared game scene, either side of the pieces, drawn in the
 * correct order. Adding a new analysis visual means calling it from here in the right place.
 */

import gameslot from '../../../game/chess/gameslot.js';
import movetree from '../movetree.js';
import gamereview from '../gamereview.js';
import reviewarrow from './reviewarrow.js';
import reviewbadge from './reviewbadge.js';
import { GameBus } from '../../../board/GameBus.js';
import enginearrows from './enginearrows.js';
import frametracker from '../../../board/rendering/frametracker.js';
import analysisborderdebug from './analysisborderdebug.js';

// Init ------------------------------------------------------------------------

GameBus.addEventListener('render-below-pieces', renderBelowPieces);
GameBus.addEventListener('render-above-pieces', renderAbovePieces);

// The engine classifies moves asynchronously; if it lands on the move the user is
// currently viewing, force a redraw so its visuals don't wait for an unrelated one.
gamereview.onClassified((review) => {
	const gamefile = gameslot.getGamefile();
	if (gamefile && movetree.getCurrentNode(gamefile)?.id === review.nodeId)
		frametracker.onVisualChange();
});

// Functions -------------------------------------------------------------------

/** Renders the analysis visuals below the pieces. */
function renderBelowPieces(): void {
	analysisborderdebug.render();
}

/** Renders the analysis visuals above the pieces, later ones on top. */
function renderAbovePieces(): void {
	enginearrows.render();
	reviewarrow.render();
	reviewbadge.render();
}
