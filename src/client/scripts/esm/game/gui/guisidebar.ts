// src/client/scripts/esm/game/gui/guisidebar.ts

/**
 * Handles the game side bar
 */

// Prevent clicking buttons from them taking focus off the canvas, breaking keyboard controls.
document.querySelectorAll<HTMLElement>('.btn-bare, .action-btn').forEach((btn) => {
	btn.setAttribute('tabindex', '-1');
	btn.addEventListener('click', () => btn.blur());
});
