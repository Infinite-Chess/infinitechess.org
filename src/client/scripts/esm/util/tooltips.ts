// src/client/scripts/esm/util/tooltips.ts

/**
 * JS-based tooltip system using event delegation. A single fixed div is appended to document.body
 * when the user hovers a tooltip element, avoiding any clipping issues from parent containers.
 *
 * A single set of listeners on `document.body` handles all tooltip elements,
 * new elements with tooltips can be added to the document at any time.
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
/** CSS selector matching any element that is a tooltip target (has both a direction class and data-tooltip). */
const TOOLTIP_SELECTOR = tooltipClasses.map((cls) => `.${cls}[data-tooltip]`).join(', ');

/** Pixels between the target element edge and the tooltip box. */
const TOOLTIP_GAP = 8;
/**
 * Half the CSS border-width used for the arrow (px). Full arrow size = 2 × ARROW_HALF.
 * MUST match the `border-width` value on `#tooltip-arrow` in header.css.
 */
const ARROW_HALF = 5;
/** Duration (ms) to wait after fading out before removing the tooltip from the DOM.
 * Should be slightly longer than the CSS opacity transition (0.1 s = 100 ms). */
const FADE_OUT_REMOVE_DELAY_MS = 150;

/** The delay before a tooltip appears on hover. */
const TOOLTIP_DELAY_MILLIS: number = 500;
/** Time after a click before the tooltip can reappear while still hovering. */
const SUPPRESS_COOLDOWN_MILLIS: number = 2000;
/** If no new tooltip is viewed within this window, fast-transition mode turns off. */
const FAST_TRANSITION_COOLDOWN_MILLIS: number = 750;

// State ---------------------------------------------------------------------------------

/** Per-element hover/click state, lazily created on first interaction. */
interface TooltipState {
	isHovering: boolean;
	isHolding: boolean;
	tooltipVisible: boolean;
	/** Timer to show the tooltip after the hover delay. */
	hoveringTimer: number | undefined;
	/** Timer after which tooltip suppression (from a click) is cleared. */
	suppressTimer: number | undefined;
	/** True while the tooltip is temporarily suppressed due to a click. */
	suppressed: boolean;
}

/** Per-element state map. WeakMap ensures GC when elements are removed from the DOM. */
const elementStates = new WeakMap<Element, TooltipState>();

/** If true, tooltips appear immediately without the hover delay. */
let fastTransitionMode = false;
/** Timer ID for turning off fast-transition mode after the cooldown. */
let fastTransitionTimeoutID: number | undefined;

/** The shared tooltip box element, created once and reused. */
let tooltipDiv: HTMLDivElement | null = null;
/** The shared arrow element, created once and reused. */
let arrowDiv: HTMLDivElement | null = null;
/** Timer to remove the tooltip elements from the DOM after they fade out. */
let hideTimer: number | undefined;

// Functions ----------------------------------------------------------------------------

/** Returns or creates the per-element state for a tooltip target. */
function getOrCreateState(el: Element): TooltipState {
	let state = elementStates.get(el);
	if (!state) {
		state = {
			isHovering: false,
			isHolding: false,
			tooltipVisible: false,
			hoveringTimer: undefined,
			suppressTimer: undefined,
			suppressed: false,
		};
		elementStates.set(el, state);
	}
	return state;
}

/**
 * Returns the nearest ancestor (or self) of `el` that is a tooltip target,
 * or null if none exists. Uses the browser-optimized `Element.closest()`.
 */
function findTooltipAncestor(el: Element | null): HTMLElement | null {
	return el?.closest<HTMLElement>(TOOLTIP_SELECTOR) ?? null;
}

/**
 * Returns the tooltip direction class of an element (e.g. 'tooltip-d'),
 * or null if the element has none.
 */
function getTooltipClass(element: Element): string | null {
	return tooltipClasses.find((cls) => element.classList.contains(cls)) ?? null;
}

/** Creates the singleton tooltip box and arrow elements (called once on first use). */
function createTooltipElements(): void {
	tooltipDiv = document.createElement('div');
	tooltipDiv.id = 'tooltip-popup';

	arrowDiv = document.createElement('div');
	arrowDiv.id = 'tooltip-arrow';
}

/** Enables fast-transition mode so the next tooltip appears without delay. */
function enableFastTransition(): void {
	if (fastTransitionMode) return; // Already on!

	// console.log("Enabled fast transition");
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

	// console.log("Disabled fast transition");
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
		// Arrow bottom aligns exactly with tooltip box top, filling the gap cleanly.
		arrowTop = targetRect.bottom + TOOLTIP_GAP - ARROW_HALF * 2;
		arrow.className = 'tooltip-arrow-down';
	} else {
		tipTop = targetRect.top - TOOLTIP_GAP - tipHeight;
		// Arrow top aligns exactly with tooltip box bottom, filling the gap cleanly.
		arrowTop = targetRect.top - TOOLTIP_GAP;
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
	hideTimer = window.setTimeout(() => {
		tooltipDiv?.remove();
		arrowDiv?.remove();
	}, FADE_OUT_REMOVE_DELAY_MS);
}

/** Shows the tooltip if conditions allow. */
function tryShow(target: HTMLElement, state: TooltipState, direction: string): void {
	if (!state.isHovering || state.isHolding || state.suppressed) return;
	state.tooltipVisible = true;
	showTooltipFor(target, direction);
}

/** Schedules (or immediately triggers) showing the tooltip. */
function scheduleShow(target: HTMLElement, state: TooltipState, direction: string): void {
	clearTimeout(state.hoveringTimer);
	if (fastTransitionMode) {
		tryShow(target, state, direction);
	} else {
		state.hoveringTimer = window.setTimeout(
			() => tryShow(target, state, direction),
			TOOLTIP_DELAY_MILLIS,
		);
	}
}

/** Hides the tooltip and suppresses it temporarily (used on click). */
function suppress(state: TooltipState): void {
	state.suppressed = true;
	state.tooltipVisible = false;
	clearTimeout(state.hoveringTimer);
	state.hoveringTimer = undefined;
	hideTooltipDiv();
	disableFastTransition();
}

/** Schedules the end of the click-suppression window. */
function resetSuppressTimer(target: HTMLElement, state: TooltipState, direction: string): void {
	clearTimeout(state.suppressTimer);
	state.suppressTimer = window.setTimeout(() => {
		state.suppressed = false;
		if (state.isHovering && !state.isHolding) tryShow(target, state, direction);
	}, SUPPRESS_COOLDOWN_MILLIS);
}

// Delegated event listeners ------------------------------------------------------------

if (docutil.isMouseSupported()) {
	// mouseover/mouseout bubble, letting us simulate mouseenter/mouseleave via delegation.
	document.body.addEventListener('mouseover', (e: MouseEvent) => {
		const target = findTooltipAncestor(e.target as Element | null);
		if (!target) return;

		// Only fire "enter" when arriving from outside the tooltip element.
		const from = e.relatedTarget as Element | null;
		if (from && target.contains(from)) return;

		const state = getOrCreateState(target);
		const direction = getTooltipClass(target)!;
		state.isHovering = true;
		cancelFastTransitionExpiryTimer();
		scheduleShow(target, state, direction);
	});

	document.body.addEventListener('mouseout', (e: MouseEvent) => {
		const target = findTooltipAncestor(e.target as Element | null);
		if (!target) return;

		// Only fire "leave" when moving to outside the tooltip element.
		const to = e.relatedTarget as Element | null;
		if (to && target.contains(to)) return;

		const state = getOrCreateState(target);
		state.isHovering = false;
		state.isHolding = false;
		clearTimeout(state.hoveringTimer);

		// Immediately clear suppression so re-hovering works normally.
		state.suppressed = false;
		clearTimeout(state.suppressTimer);
		state.suppressTimer = undefined;

		if (state.tooltipVisible) {
			enableFastTransition();
			fastTransitionTimeoutID = window.setTimeout(
				() => disableFastTransition(),
				FAST_TRANSITION_COOLDOWN_MILLIS,
			);
		}

		state.tooltipVisible = false;
		hideTooltipDiv();
	});

	document.body.addEventListener('mousedown', (e: MouseEvent) => {
		const target = findTooltipAncestor(e.target as Element | null);
		if (!target) return;
		const state = getOrCreateState(target);
		const direction = getTooltipClass(target)!;
		state.isHolding = true;
		suppress(state);
		resetSuppressTimer(target, state, direction);
	});

	document.body.addEventListener('mouseup', (e: MouseEvent) => {
		const target = findTooltipAncestor(e.target as Element | null);
		if (!target) return;
		const state = getOrCreateState(target);
		const direction = getTooltipClass(target)!;
		state.isHolding = false;
		suppress(state);
		resetSuppressTimer(target, state, direction);
	});
} else {
	// Touch devices: show tooltip on press, hide on release/cancel.
	document.body.addEventListener('touchstart', (e: TouchEvent) => {
		const target = findTooltipAncestor(e.target as Element | null);
		if (!target) return;
		const state = getOrCreateState(target);
		const direction = getTooltipClass(target)!;
		state.isHovering = true;
		state.hoveringTimer = window.setTimeout(
			() => tryShow(target, state, direction),
			TOOLTIP_DELAY_MILLIS,
		);
	});

	const onTouchEnd = (e: TouchEvent): void => {
		const target = findTooltipAncestor(e.target as Element | null);
		if (!target) return;
		const state = getOrCreateState(target);
		state.isHovering = false;
		clearTimeout(state.hoveringTimer);
		state.tooltipVisible = false;
		hideTooltipDiv();
	};

	document.body.addEventListener('touchend', onTouchEnd);
	document.body.addEventListener('touchcancel', onTouchEnd);
}

// -------------------------------------------------------------------------------------------

// This module registers its event listeners as a side effect of being imported.
// It must be imported on every page; without an export, esbuild would tree-shake it out.
export default {};
