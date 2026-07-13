// src/client/scripts/esm/views/analysis/analysis.ts

/**
 * Client entry for the analysis page (/analysis/:id?).
 *
 * Runs the shared game core and wires the analysis-only loader, controls,
 * engine panel, and Game Review UI.
 */

import gameloop from '../../game/gameloop.js';
import icnpanel from './gui/guiicnpanel.js';
import enginepanel from './gui/guienginepanel.js';
import gamesession from '../../game/chess/gamesession.js';
import analysisview from './gui/guianalysisview.js';
import guigamereview from './gui/guigamereview.js';
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
	guigamereview.init();
	icnpanel.init();
	// The variant setup panel only exists on the plain /analysis page (not /analysis/:id).
	// Import it lazily so the variant-selector widget's DOM lookups never run without it.
	if (document.getElementById('variant-selector')) {
		void import('./analysissetup.js').then((m) => m.default.init());
	}

	const pendingImport = icnpanel.takePendingImport();
	if (pendingImport === null) void analysisloader.loadInitialGame();
	else {
		gamesession.setSessionGame({ type: 'analysis' });
		icnpanel.importIcnText(pendingImport);
	}

	// Poll each module's keyboard shortcuts every frame (via gamecore's document input listener).
	gameloop.start(() => {
		analysisview.updateShortcuts();
		enginepanel.updateShortcuts();
	});
}

start();
