// src/client/scripts/esm/views/analysis/analysis.ts

/**
 * Client entry for the analysis page (/analysis/:id?).
 *
 * Runs the shared game core (board, moves list, annotations...) in an 'analysis'
 * session, auto-loads the game named by the URL if any, and wires the
 * analysis-specific modules: game loader, actions/ICN panels, and the engine panel.
 */

import gameloop from '../../game/gameloop.js';
import enginepanel from './gui/guienginepanel.js';
import analysisview from './gui/guianalysisview.js';
import analysisloader from './analysisloader.js';
import analysisactions from './gui/guianalysisactions.js';

import './gui/guimovetree.js';
import './analysisworldborder.js';
import '../../game/gui/guimaterial.js';

/** The analysis-page board canvas WebGL renders onto. */
const canvas = document.getElementById('board-canvas') as HTMLCanvasElement;

/** Starts the analysis page. Runs once the page is loaded. */
function start(): void {
	gameloop.init(canvas);

	// Prevent clicking buttons from focusing them, so keyboard controls don't interact with them.
	document.querySelectorAll<HTMLElement>('.btn-bare, .action-btn').forEach((btn) => {
		btn.setAttribute('tabindex', '-1');
		btn.addEventListener('click', () => btn.blur());
	});

	enginepanel.init();
	analysisactions.init();
	// The variant setup panel only exists on the plain /analysis page (not /analysis/:id).
	// Import it lazily so the variant-selector widget's DOM lookups never run without it.
	if (document.getElementById('variant-selector')) {
		void import('./analysissetup.js').then((m) => m.default.init());
	}

	void analysisloader.loadInitialGame();

	// Poll each module's keyboard shortcuts every frame (via gamecore's document input listener).
	gameloop.start(() => {
		analysisview.updateShortcuts();
		enginepanel.updateShortcuts();
	});
}

start();
