// src/client/scripts/esm/util/tooltips.ts

/**
 * JS-based tooltip system. A single fixed div is appended to document.body
 * when the user hovers a tooltip element, avoiding clip issues caused by
 * parent containers with overflow:hidden.
 *
 * Tooltip direction is determined by the element's class:
 *   tooltip-d   – below, centered
 *   tooltip-dl  – below, right-aligned to element
 *   tooltip-dr  – below, left-aligned to element
 *   tooltip-u   – above, centered
 *   tooltip-ul  – above, right-aligned to element
 *
 * Tooltip text comes from the element's data-tooltip attribute.
 */

import docutil from './docutil.js';

// Variables ----------------------------------------------------------------------------

const tooltipClasses: string[] = [
	'tooltip-dl',
	'tooltip-d',
	'tooltip-dr',
	'tooltip-u',
	'tooltip-ul',
];
const tooltipClasses_Dotted = tooltipClasses.map((cls) => '.' + cls);

/** Pixels between the target element edge and the tooltip box. */
const TOOLTIP_GAP = 8;
/** Half the CSS border-width used for the arrow (px). Full arrow size = 2 × ARROW_HALF. */
const ARROW_HALF = 5;
/**
 * Vertical offset (px) that places the arrow tip slightly inside the target element edge,
 * creating a seamless visual connection between the target and the tooltip box.
 * Matches the original CSS: arrow top was at targetRect.bottom - 1.5 for down-arrows.
 */
const ARROW_OVERLAP_DOWN = 1.5;
/**
 * Vertical offset (px) for up-arrows so the arrow tip overlaps the tooltip bottom edge
 * by half a pixel, mirroring the ARROW_OVERLAP_DOWN relationship symmetrically.
 */
const ARROW_OVERLAP_UP = 0.5;
/** Duration (ms) to wait after fading out before removing the tooltip from the DOM.
 * Should be slightly longer than the CSS opacity transition (0.1 s = 100 ms). */
const FADE_OUT_REMOVE_DELAY_MS = 150;

/** The delay before a tooltip appears on hover. */
const tooltipDelayMillis: number = 500;
/** Time after a click before the tooltip can reappear while still hovering. */
const timeToReAddTooltipAfterClickMillis: number = 2000;

/** If true, tooltips appear immediately without the hover delay. */
let fastTransitionMode = false;
/** Timer ID for turning off fast-transition mode after the cooldown. */
let fastTransitionTimeoutID: ReturnType<typeof setTimeout> | undefined;
/** If no new tooltip is viewed within this window, fast-transition mode turns off. */
const fastTransitionCooldownMillis: number = 750;

/** The shared tooltip box element, created once and reused. */
let tooltipDiv: HTMLDivElement | null = null;
/** The shared arrow element, created once and reused. */
let arrowDiv: HTMLDivElement | null = null;
/** Timer to remove the tooltip elements from the DOM after they fade out. */
let hideTimer: ReturnType<typeof setTimeout> | undefined;

// Functions ----------------------------------------------------------------------------

/** Creates the singleton tooltip box and arrow elements (called once on first use). */
function createTooltipElements(): void {
	tooltipDiv = document.createElement('div');
	tooltipDiv.id = 'tooltip-popup';

	arrowDiv = document.createElement('div');
	arrowDiv.id = 'tooltip-arrow';
}

/**
 * Returns the tooltip direction class of an element (e.g. 'tooltip-d'),
 * or null if the element has none.
 */
function getTooltipClass(element: Element): string | null {
	return tooltipClasses.find((cls) => element.classList.contains(cls)) ?? null;
}

/** Enables fast-transition mode so the next tooltip appears without delay. */
function enableFastTransition(): void {
	if (fastTransitionMode) return;
	fastTransitionMode = true;
}

/** Cancels the timer that would exit fast-transition mode. */
function cancelFastTransitionExpiryTimer(): void {
	clearTimeout(fastTransitionTimeoutID);
	fastTransitionTimeoutID = undefined;
}

/** Disables fast-transition mode. */
function disableFastTransition(): void {
	if (!fastTransitionMode) return;
	fastTransitionTimeoutID = undefined;
	fastTransitionMode = false;
}

/**
 * Positions and shows the tooltip for the given target element.
 * @param target - The element with the tooltip class and data-tooltip attribute.
 * @param direction - The tooltip direction class (e.g. 'tooltip-d').
 */
function showTooltipFor(target: HTMLElement, direction: string): void {
	const text = target.dataset['tooltip'];
	if (!text) return;

	if (!tooltipDiv || !arrowDiv) createTooltipElements();
	const tip = tooltipDiv!;
	const arrow = arrowDiv!;

	// Cancel any pending DOM removal so we can reuse the elements.
	clearTimeout(hideTimer);
	hideTimer = undefined;

	// Set text and make invisible for measurement.
	tip.textContent = text;
	tip.style.opacity = '0';

	// Ensure elements are in the DOM so we can measure them.
	if (!tip.isConnected) document.body.appendChild(tip);
	if (!arrow.isConnected) document.body.appendChild(arrow);

	// Force a layout reflow to get accurate dimensions.
	const targetRect = target.getBoundingClientRect();
	const tipWidth = tip.offsetWidth;
	const tipHeight = tip.offsetHeight;

	const isDown =
		direction === 'tooltip-d' || direction === 'tooltip-dl' || direction === 'tooltip-dr';

	// Vertical positioning.
	let tipTop: number;
	let arrowTop: number;
	if (isDown) {
		tipTop = targetRect.bottom + TOOLTIP_GAP;
		// Arrow sits in the gap; its top edge overlaps the target bottom slightly.
		arrowTop = targetRect.bottom - ARROW_HALF * 2 + ARROW_OVERLAP_DOWN;
		arrow.className = 'tooltip-arrow-down';
	} else {
		tipTop = targetRect.top - TOOLTIP_GAP - tipHeight;
		// Arrow tip overlaps tooltip bottom slightly, mirroring the down-arrow relationship.
		arrowTop = targetRect.top - TOOLTIP_GAP - ARROW_HALF * 2 + ARROW_OVERLAP_UP;
		arrow.className = 'tooltip-arrow-up';
	}

	// Horizontal positioning of the tooltip box.
	let tipLeft: number;
	if (direction === 'tooltip-d' || direction === 'tooltip-u') {
		// Centered on the target.
		tipLeft = targetRect.left + targetRect.width / 2 - tipWidth / 2;
	} else if (direction === 'tooltip-dl' || direction === 'tooltip-ul') {
		// Right edge of tooltip aligns with right edge of target.
		tipLeft = targetRect.right - tipWidth;
	} else {
		// tooltip-dr: left edge of tooltip aligns with left edge of target.
		tipLeft = targetRect.left;
	}

	// Arrow always centered horizontally on the target.
	const arrowLeft = targetRect.left + targetRect.width / 2 - ARROW_HALF;

	// Apply computed positions.
	tip.style.top = `${tipTop}px`;
	tip.style.left = `${tipLeft}px`;
	arrow.style.top = `${arrowTop}px`;
	arrow.style.left = `${arrowLeft}px`;
	arrow.style.opacity = '0';

	// Two rAF frames ensure the browser has committed the opacity:0 paint before
	// animating to opacity:1, so the CSS transition fires correctly from 0 → 1.
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			tip.style.opacity = '1';
			arrow.style.opacity = '1';
		});
	});
}

/** Fades out the tooltip and removes it from the DOM once the transition ends. */
function hideTooltipDiv(): void {
	if (!tooltipDiv || !arrowDiv) return;
	tooltipDiv.style.opacity = '0';
	arrowDiv.style.opacity = '0';
	clearTimeout(hideTimer);
	hideTimer = setTimeout(() => {
		tooltipDiv?.remove();
		arrowDiv?.remove();
	}, FADE_OUT_REMOVE_DELAY_MS);
}

/** Discovers new tooltip elements and attaches event listeners to them. */
function addListeners(): void {
	const allTooltips = document.querySelectorAll<HTMLElement>(tooltipClasses_Dotted.join(', '));

	allTooltips.forEach((target) => {
		if (target.dataset['tooltip_initialized'] === 'true') return;
		target.dataset['tooltip_initialized'] = 'true';

		const direction = getTooltipClass(target)!;

		let isHovering = false;
		let isHolding = false;
		let tooltipVisible = false;

		/** Timer to show the tooltip after the hover delay. */
		let hoveringTimer: ReturnType<typeof setTimeout> | undefined;
		/** Timer after which tooltip suppression (from a click) is cleared. */
		let suppressTimer: ReturnType<typeof setTimeout> | undefined;
		/** True while the tooltip is temporarily suppressed due to a click. */
		let suppressed = false;

		/** Shows the tooltip if conditions allow. */
		function tryShow(): void {
			if (!isHovering || isHolding || suppressed) return;
			tooltipVisible = true;
			showTooltipFor(target, direction);
		}

		/** Schedules (or immediately triggers) showing the tooltip. */
		function scheduleShow(): void {
			clearTimeout(hoveringTimer);
			if (fastTransitionMode) {
				tryShow();
			} else {
				hoveringTimer = setTimeout(tryShow, tooltipDelayMillis);
			}
		}

		/** Hides the tooltip and suppresses it temporarily (used on click). */
		function suppress(): void {
			suppressed = true;
			tooltipVisible = false;
			clearTimeout(hoveringTimer);
			hoveringTimer = undefined;
			hideTooltipDiv();
			disableFastTransition();
		}

		/** Schedules the end of the click-suppression window. */
		function resetSuppressTimer(): void {
			clearTimeout(suppressTimer);
			suppressTimer = setTimeout(() => {
				suppressed = false;
				if (isHovering && !isHolding) tryShow();
			}, timeToReAddTooltipAfterClickMillis);
		}

		if (docutil.isMouseSupported()) {
			target.addEventListener('mouseenter', () => {
				isHovering = true;
				cancelFastTransitionExpiryTimer();
				scheduleShow();
			});

			target.addEventListener('mouseleave', () => {
				isHovering = false;
				isHolding = false;
				clearTimeout(hoveringTimer);

				// Immediately clear suppression so re-hovering works normally.
				suppressed = false;
				clearTimeout(suppressTimer);
				suppressTimer = undefined;

				if (tooltipVisible) {
					enableFastTransition();
					fastTransitionTimeoutID = setTimeout(
						disableFastTransition,
						fastTransitionCooldownMillis,
					);
				}

				tooltipVisible = false;
				hideTooltipDiv();
			});

			target.addEventListener('mousedown', () => {
				isHolding = true;
				suppress();
				resetSuppressTimer();
			});

			target.addEventListener('mouseup', () => {
				isHolding = false;
				suppress();
				resetSuppressTimer();
			});
		} else {
			// Touch devices: show tooltip on press, hide on release.
			target.addEventListener('touchstart', () => {
				isHovering = true;
				hoveringTimer = setTimeout(tryShow, tooltipDelayMillis);
			});

			target.addEventListener('touchend', () => {
				isHovering = false;
				clearTimeout(hoveringTimer);
				tooltipVisible = false;
				hideTooltipDiv();
			});

			target.addEventListener('touchcancel', () => {
				isHovering = false;
				clearTimeout(hoveringTimer);
				tooltipVisible = false;
				hideTooltipDiv();
			});
		}
	});
}

/** Initializes listeners for all un-initialized tooltip elements on the page. */
function initTooltips(): void {
	addListeners();
}

initTooltips();

// -------------------------------------------------------------------------------------------

// Export so that it can be imported on every page. Otherwise esbuild won't include it.
export default {
	initTooltips,
};
