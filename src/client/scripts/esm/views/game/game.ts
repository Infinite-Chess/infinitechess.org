// src/client/scripts/esm/views/game/game.ts

/**
 * Client entry for the game page (/game/:id).
 */

import gameloop from '../../game/gameloop.js';
import onlinegame from '../../game/misc/onlinegame/onlinegame.js';
import deadgameloader from '../../game/misc/onlinegame/deadgameloader.js';

import '../../game/gui/guisidebar.js';
import '../../game/misc/onlinegame/onlinegamerouter.js';

/** The game-page board canvas WebGL renders onto. */
const canvas = document.getElementById('board-canvas') as HTMLCanvasElement;

/** Starts the game page. Runs once the page is loaded. */
function start(): void {
	gameloop.init(canvas);

	if (window.gamePageData.isLive) {
		onlinegame.subscribeToGame(); // Naturally requests the full game state which bootstraps the game
	} else {
		// Dead (memory-evicted) game: fetch its state over HTTP and render it — no socket opened.
		deadgameloader.loadDeadGame();
	}

	gameloop.start();
}

start();
