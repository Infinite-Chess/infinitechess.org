// src/client/scripts/esm/components/header/header.ts

/**
 * Site header runtime. Imported on every page via the layout.
 *
 * Manages the Learn/Tools dropdowns, and the hamburger menu on mobile,
 * and updating the --vh CSS variable for mobile devices, and the logo
 * pulse aura animation on hover.
 */

import { serverFetch } from '../../util/serverFetch.js';

import './settings.js';
import '../../util/tooltips.js'; // Should be imported on EVERY page

// Elements ---------------------------------------------------------------------

const button = document.querySelector<HTMLButtonElement>('.header-hamburger')!;
const panel = document.getElementById('header-mobile-panel')!;

const dimContent = document.querySelector<HTMLElement>('.header-mobile-dim-content')!;
const dimHeader = document.querySelector<HTMLElement>('.header-mobile-dim-header')!;

const home = document.querySelector<HTMLElement>('.header-home')!;
const aura = document.querySelector<SVGElement>('.header-logo-aura')!;

// Constants --------------------------------------------------------------------

/** Settings for the logo aura pulse animation triggered on hover. */
const LOGO_PULSE = {
	/** Duration of one full oscillation cycle, in milliseconds. */
	PERIOD_MS: 1300,
	/** Minimum scale of the aura (bottom of oscillation). */
	MIN_SCALE: 0.7,
	/** Maximum scale of the aura (top of oscillation). */
	MAX_SCALE: 1.2,
} as const;

const LOGO_PULSE_START_PHASE = Math.acos(1 - 2 * (1 - LOGO_PULSE.MIN_SCALE) / (LOGO_PULSE.MAX_SCALE - LOGO_PULSE.MIN_SCALE)) / (2 * Math.PI); // prettier-ignore

// Functions ----------------------------------------------------------------------

function initHamburger(): void {
	const setOpen = (open: boolean): void => {
		panel.classList.toggle('open', open);
		dimContent.classList.toggle('open', open);
		dimHeader.classList.toggle('open', open);
		panel.setAttribute('aria-hidden', open ? 'false' : 'true');
		button.setAttribute('aria-expanded', open ? 'true' : 'false');
	};

	button.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
	dimContent.addEventListener('click', () => setOpen(false));
	dimHeader.addEventListener('click', () => setOpen(false));

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') setOpen(false);
	});
}
initHamburger();

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
initNavDropdowns();

/**
 * Wires up the logout button (only present when signed in). Logout mutates
 * server state (revokes the session) — then we redirect home client-side.
 */
function initLogout(): void {
	const logoutButton = document.querySelector<HTMLButtonElement>('#logout-button');
	if (!logoutButton) return; // Logged out: no button rendered.

	logoutButton.addEventListener('click', () => {
		void (async (): Promise<void> => {
			logoutButton.disabled = true;
			try {
				await serverFetch('/api/logout', { method: 'POST' });
				// Any server response clears the session cookies, so land them home logged out.
				window.location.assign('/');
			} catch (e: unknown) {
				// Network error: nothing changed server-side, so re-enable for a retry.
				console.error('Logout request failed:', e);
				logoutButton.disabled = false;
			}
		})();
	});
}
initLogout();

function initLogoAnimation(): void {
	let rafId: number | null = null;
	let startTime: number | null = null;
	let hovering = false;

	function sineScale(t: number): number {
		const phase = (t + LOGO_PULSE_START_PHASE) % 1;
		return (LOGO_PULSE.MIN_SCALE + ((LOGO_PULSE.MAX_SCALE - LOGO_PULSE.MIN_SCALE) * (1 - Math.cos(2 * Math.PI * phase))) / 2); // prettier-ignore
	}

	function tick(now: number): void {
		if (!hovering) {
			aura.style.transform = '';
			rafId = null;
			return;
		}
		if (startTime === null) startTime = now;
		const t = ((now - startTime) / LOGO_PULSE.PERIOD_MS) % 1;
		aura.style.transform = `scale(${sineScale(t).toFixed(4)})`;
		rafId = requestAnimationFrame(tick);
	}

	home.addEventListener('mouseenter', () => {
		hovering = true;
		if (rafId !== null) return;
		startTime = null;
		rafId = requestAnimationFrame(tick);
	});

	home.addEventListener('mouseleave', () => {
		hovering = false;
	});
}
initLogoAnimation();

// OVERRIDE the viewport height variable in CSS based on how much screen space
// the home button bar takes up on mobile devices — 100vh alone is incorrect.
updateViewportHeight();
window.addEventListener('resize', updateViewportHeight);
function updateViewportHeight(): void {
	document.documentElement.style.setProperty('--vh', `${window.innerHeight}px`);
}
