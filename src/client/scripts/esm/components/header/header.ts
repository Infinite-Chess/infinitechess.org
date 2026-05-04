// src/client/scripts/esm/components/header/header.ts

/**
 * Site header runtime. Imported on every page via the layout.
 *
 * Manages the Learn/Tools dropdowns, and the hamburger menu on mobile,
 * and updating the --vh CSS variable for mobile devices.
 */

import './settings.js';
import '../../util/tooltips.js'; // Should be imported on EVERY page

const button = document.querySelector<HTMLButtonElement>('.header-hamburger')!;
const panel = document.getElementById('header-mobile-panel')!;
const overlay = document.querySelector<HTMLElement>('.header-mobile-overlay')!;

(function init() {
	initHamburger();
	initNavDropdowns();
})();

function initHamburger(): void {
	const setOpen = (open: boolean): void => {
		panel.classList.toggle('open', open);
		overlay.classList.toggle('open', open);
		panel.setAttribute('aria-hidden', open ? 'false' : 'true');
		button.setAttribute('aria-expanded', open ? 'true' : 'false');
	};

	button.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
	overlay.addEventListener('click', () => setOpen(false));

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') setOpen(false);
	});
}

/** Makes it so clicking nav links with dropdowns doesn't leave them open when the mouse leaves. */
function initNavDropdowns(): void {
	const btns = Array.from(
		document.querySelectorAll<HTMLElement>('.header-dropdown-parent .header-nav-link'),
	);
	btns.forEach((btn) => {
		btn.addEventListener('pointerdown', (e: PointerEvent) => {
			e.preventDefault();
		});
	});
}

// OVERRIDE the viewport height variable in CSS based on how much screen space
// the home button bar takes up on mobile devices — 100vh alone is incorrect.
updateViewportHeight();
window.addEventListener('resize', updateViewportHeight);
function updateViewportHeight(): void {
	document.documentElement.style.setProperty('--vh', `${window.innerHeight}px`);
}
