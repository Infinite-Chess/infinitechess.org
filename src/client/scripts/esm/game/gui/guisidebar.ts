// src/client/scripts/esm/game/gui/guisidebar.ts

/**
 * Handles the game side bar.
 */

import '../../game/gui/guigamemeta.js';
import '../../game/gui/guimaterial.js';
import '../../game/gui/guimoveslist.js';
import '../../game/gui/guigameactions.js';
import '../../game/gui/guiboardcontrols.js';

// Prevent clicking buttons from focusing them, keyboard controls interacting with them.
document.querySelectorAll<HTMLElement>('.btn-bare, .action-btn').forEach((btn) => {
	btn.setAttribute('tabindex', '-1');
	btn.addEventListener('click', () => btn.blur());
});
