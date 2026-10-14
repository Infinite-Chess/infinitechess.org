// src/client/scripts/esm/views/analysis/rendering/analysisoverlays.ts

/**
 * The analysis page's overlays on the shared game scene, drawn above the pieces in the correct
 * order. Adding a new analysis visual means calling it from here in the right place.
 */

import type { Condition } from '../../../../../../shared/chess/util/winconutil.js';

import gameslot from '../../../game/chess/gameslot.js';
import movetree from '../movetree.js';
import gamereview from '../gamereview.js';
import reviewlapse from './reviewlapse.js';
import { GameBus } from '../../../board/GameBus.js';
import enginearrows from './enginearrows.js';
import frametracker from '../../../board/rendering/frametracker.js';
import conclusionglyphs from '../../../game/rendering/glyphs/conclusionglyphs.js';

// Constants -------------------------------------------------------------------

/** Draws decided by how a position was reached, which analysis can manufacture. */
const HISTORY_CONDITIONS: Condition[] = ['repetition', 'moverule'];

// Init ------------------------------------------------------------------------

GameBus.addEventListener('render-above-pieces', renderAbovePieces);

// The engine classifies moves asynchronously; if it lands on the move the user is
// currently viewing, force a redraw so its visuals don't wait for an unrelated one.
gamereview.onClassified((review) => {
	const gamefile = gameslot.getGamefile();
	if (gamefile && movetree.getCurrentNode(gamefile)?.id === review.nodeId)
		frametracker.onVisualChange();
});

// Functions -------------------------------------------------------------------

/** Renders the analysis visuals above the pieces, later ones on top. */
function renderAbovePieces(): void {
	enginearrows.render();
	reviewlapse.render();
	renderConclusion();
}

/**
 * Renders the glyph of the viewed position's conclusion. History draws only
 * show on the loaded game's final node.
 */
function renderConclusion(): void {
	const gamefile = gameslot.getGamefile()!;
	const node = movetree.getCurrentNode(gamefile);
	const conclusion = node?.gameConclusion;
	if (!conclusion) return;
	if (HISTORY_CONDITIONS.includes(conclusion.condition) && node !== movetree.getLoadedGameEnd())
		return;
	conclusionglyphs.render(gamefile, conclusion);
}
