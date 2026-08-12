// src/client/scripts/esm/views/analysis/gui/guianalysisview.ts

/**
 * Keeps the analysis page's peripheral UI in sync with the board's orientation and
 * viewed move: flips the board, orients the eval gauge, swaps the player-bar names,
 * and re-stamps the clocks. Also owns the 'f' flip keyboard shortcut.
 */

import gameslot from '../../../game/chess/gameslot.js';
import guiclock from '../../../game/gui/guiclock.js';
import gamesession from '../../../game/chess/gamesession.js';
import { GameBus } from '../../../game/GameBus.js';
import { listener_document } from '../../../game/chess/gamecore.js';

// Wire the orientation/view GameBus listeners.

// Reflect the board orientation on the eval gauge, both on initial load and on every flip.
GameBus.addEventListener('game-loaded', syncEvalGaugeOrientation);
GameBus.addEventListener('board-flipped', () => {
	syncEvalGaugeOrientation();
	swapPlayerBarNames();
	syncClockDisplayToViewedMove(true);
});
GameBus.addEventListener('view-move', () => syncClockDisplayToViewedMove());

/**
 * Syncs the clock display to the currently viewed move.
 * @param remapBars - If true, also re-maps which bar each player's clock occupies.
 */
function syncClockDisplayToViewedMove(remapBars = false): void {
	const gamefile = gameslot.getGamefile()!;
	if (remapBars) guiclock.set(gamefile);
	guiclock.showClocksAtViewedMove(gamefile);
}

/** Polls this module's keyboard shortcuts. Called once per frame by the page loop. */
function updateShortcuts(): void {
	// f = flip board (the input listener already ignores keys pressed while typing).
	if (listener_document.isKeyDown('KeyF')) flipBoard();
}

/** Flips the board orientation in place. */
function flipBoard(): void {
	if (!gameslot.getGamefile() || gamesession.isLoading()) return;
	gameslot.flipView();
}

/** Orients the eval gauge to match the current board perspective. */
function syncEvalGaugeOrientation(): void {
	document.getElementById('eval-gauge')!.classList.toggle('flipped', !gameslot.areViewingWhite());
}

/** Swaps the two player bars' name nodes (leaving their clocks) to match a flipped board. */
function swapPlayerBarNames(): void {
	const top = document.getElementById('player-bar-top');
	const bottom = document.getElementById('player-bar-bottom');
	if (!top || !bottom || top.classList.contains('hidden') || bottom.classList.contains('hidden'))
		return;

	const topNodes = detachPlayerBarNameNodes(top);
	const bottomNodes = detachPlayerBarNameNodes(bottom);
	insertPlayerBarNameNodes(top, bottomNodes);
	insertPlayerBarNameNodes(bottom, topNodes);
}

/** Removes and returns a player bar's non-clock (name) child nodes. */
function detachPlayerBarNameNodes(bar: HTMLElement): Node[] {
	const nodes = [...bar.childNodes].filter((node) => {
		return !(node instanceof HTMLElement && node.classList.contains('clock'));
	});
	nodes.forEach((node) => node.remove());
	return nodes;
}

/** Inserts name nodes into a player bar, before its clock. */
function insertPlayerBarNameNodes(bar: HTMLElement, nodes: Node[]): void {
	const clock = bar.querySelector('.clock');
	nodes.forEach((node) => bar.insertBefore(node, clock));
}

export default { syncClockDisplayToViewedMove, updateShortcuts, flipBoard };
