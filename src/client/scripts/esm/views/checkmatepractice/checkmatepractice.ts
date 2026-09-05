// src/client/scripts/esm/views/checkmatepractice/checkmatepractice.ts

/**
 * Client entry for the checkmate practice page (/checkmatepractice).
 */

import { players as p } from '../../../../../shared/chess/util/typeutil.js';

import gameloop from '../../game/gameloop.js';
import gamesession from '../../game/chess/gamesession.js';
import guipractice from './gui/guipractice.js';

import './gui/guipracticeactions.js';
import '../../game/gui/guimaterial.js';

/** The practice-page board canvas WebGL renders onto. */
const canvas = document.getElementById('board-canvas') as HTMLCanvasElement;

/** Starts the practice page. Runs once the page is loaded. */
function start(): void {
	gameloop.init(canvas);

	// Placeholder until a checkmate is picked — every game re-establishes it on start.
	gamesession.setSessionGame({ type: 'practice', role: p.WHITE });

	// Prevent clicking buttons from focusing them, keyboard controls interacting with them.
	document.querySelectorAll<HTMLElement>('.btn-bare, .action-btn').forEach((btn) => {
		btn.setAttribute('tabindex', '-1');
		btn.addEventListener('click', () => btn.blur());
	});

	guipractice.init();

	gameloop.start();
}

start();
