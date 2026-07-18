// src/client/scripts/esm/views/analysis/analysis.ts

/**
 * Client entry for the analysis page (/analysis/:id?).
 *
 * Runs the shared game core and wires the analysis-only loader,
 * controls, engine panel, and Game Review UI.
 */

import gameloop from '../../game/gameloop.js';
import guigamereview from './gui/guigamereview.js';
import analysisloader from './analysisloader.js';
import guienginepanel from './gui/guienginepanel.js';
import guianalysisview from './gui/guianalysisview.js';
import guianalysisactions from './gui/guianalysisactions.js';

import './gui/guimovetree.js';
import './rendering/reviewbadge.js';
import '../../game/gui/guimaterial.js';
import './rendering/analysisborderdebug.js';

/** The analysis-page board canvas WebGL renders onto. */
const canvas = document.getElementById('board-canvas') as HTMLCanvasElement;

/** Starts the analysis page. Runs once the page is loaded. */
function start(): void {
	gameloop.init(canvas);

	// Keep the buttons out of the keyboard tab order entirely.
	document.querySelectorAll<HTMLElement>('.btn-bare, .action-btn').forEach((btn) => {
		btn.setAttribute('tabindex', '-1');
	});
	// Prevent clicking these controls from focusing them, so keyboard controls don't interact
	// with them (e.g. the stat actions would otherwise capture Space as a repeated click). The
	// stat actions are created dynamically, hence a delegated listener. Tab + Space still works.
	document.addEventListener('mousedown', (e) => {
		if ((e.target as HTMLElement).closest('.btn-bare, .action-btn, .review-stat-action'))
			e.preventDefault();
	});

	guienginepanel.init();
	guianalysisactions.init();
	guigamereview.init();
	// The variant setup panel only exists on the plain /analysis page (not /analysis/:id).
	// Import it lazily so the variant-selector widget's DOM lookups never run without it.
	if (document.getElementById('variant-selector')) {
		void import('./analysissetup.js').then((m) => m.default.init());
	}

	void analysisloader.loadInitialGame();

	// Poll each module's keyboard shortcuts every frame (via gamecore's document input listener).
	gameloop.start(() => {
		guianalysisview.updateShortcuts();
		guienginepanel.updateShortcuts();
	});
}

start();
