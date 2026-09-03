// src/client/scripts/esm/views/game/game.ts

/**
 * Client entry for the game page (/game/:id).
 */

import gameloop from '../../game/gameloop.js';
import onlinegame from './onlinegame.js';
import gamesession from '../../game/chess/gamesession.js';
import deadgameloader from './deadgameloader.js';

import './gui/guichat.js';
import './onlinegamerouter.js';
import './gui/guigameactions.js';
import '../../game/gui/guigamemeta.js';
import '../../game/gui/guimaterial.js';
import '../../game/gui/guimoveslist.js';
import '../../game/gui/guiboardcontrols.js';

/** The game-page board canvas WebGL renders onto. */
const canvas = document.getElementById('board-canvas') as HTMLCanvasElement;

/** Starts the game page. Runs once the page is loaded. */
function start(): void {
	gameloop.init(canvas);

	// enginegame.initEngineGame() may override this with 'engine' if the game is an engine game.
	gamesession.setSessionGame({ type: 'online', role: window.gamePageData.role });

	// Prevent clicking buttons from focusing them, keyboard controls interacting with them.
	document.querySelectorAll<HTMLElement>('.btn-bare, .action-btn').forEach((btn) => {
		btn.setAttribute('tabindex', '-1');
		btn.addEventListener('click', () => btn.blur());
	});

	if (window.gamePageData.isLive) {
		onlinegame.subscribeToGame(); // Naturally requests the full game state which bootstraps the game
	} else {
		// Dead (memory-evicted) game: fetch its state over HTTP and render it — no socket opened.
		deadgameloader.load();
	}

	gameloop.start();
}

start();
