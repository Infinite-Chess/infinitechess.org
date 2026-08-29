// src/client/scripts/esm/game/debug/toggles.ts

/**
 * The developer hotkey table for the interactive board: the number-row and letter keys
 * that flip debug rendering on and off, or dump state to the console.
 *
 * Split by whether a game has to be loaded for the toggle to mean anything.
 */

import type { Mesh } from '../../board/rendering/piecemodels.js';
import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';

import jsutil from '../../../../../shared/util/jsutil.js';

import camera from '../../board/rendering/camera.js';
import animation from '../rendering/animation.js';
import miniimage from '../rendering/miniimage.js';
import gamescene from '../rendering/gamescene.js';
import piecemodels from '../../board/rendering/piecemodels.js';
import { GameBus } from '../../board/GameBus.js';
import socketlogger from '../../socket/socketlogger.js';
import guiboardcontrols from '../gui/guiboardcontrols.js';
import { listener_document } from '../listeners.js';
import specialrighthighlights from '../rendering/highlights/specialrighthighlights.js';
import { estimateMemorySizeOf } from '../../util/memoryestimator.js';

// Functions -------------------------------------------------------------------

/** Debug toggles that are not only for in a game, but outside. */
function testOutGame(): void {
	if (listener_document.isKeyDown('Backquote')) camera.toggleDebug();
	if (listener_document.isKeyDown('Digit3')) socketlogger.toggleDebug(); // Adds simulated websocket latency with high ping
	if (listener_document.isKeyDown('Digit5')) GameBus.dispatch('engine-debug'); // Render engine generated legal moves & engine border
}

/** Debug toggles that are only for in a game. */
function testInGame(gamefile: GameFile, mesh: Mesh | undefined): void {
	if (listener_document.isKeyDown('Digit1')) {
		console.log(jsutil.deepCopyObject(gamefile));
		console.log('Estimated gamefile memory usage: ' + estimateMemorySizeOf(gamefile));
	}
	if (listener_document.isKeyDown('Digit2')) animation.toggleDebug(); // Each animation slows down and renders continuous ribbon
	if (listener_document.isKeyDown('Digit4')) specialrighthighlights.toggle(); // Highlights special rights and en passant

	if (listener_document.isKeyDown('Tab')) guiboardcontrols.callback_Arrows();
	if (mesh && listener_document.isKeyDown('KeyR')) {
		piecemodels.regenAll(gamescene.getGameContext(), gamefile, mesh);
		console.log('Regenerated piece models.');
	}
	if (listener_document.isKeyDown('KeyP')) miniimage.toggle();
}

// Exports ---------------------------------------------------------------------

export default {
	testOutGame,
	testInGame,
};
