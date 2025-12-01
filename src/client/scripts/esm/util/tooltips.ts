/**
 * This script creates event listeners for managing the current classes
 * of all elements with a tooltip available.
 * If you hover for a tooltip, following tooltips pop up instantly,
 * until you go a little but without viewing another tooltip.
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
const tooltipClasses_Dotted = tooltipClasses.map((classname) => '.' + classname);

/** A list (set) of all tooltip elements that have had fast-transition listeners attached already. */
const initializedTooltips: Set<HTMLElement> = new Set();

/** The time, in the css, it takes for a tooltip to appear. KEEP THE SAME AS IN PLAY.CSS */
const tooltipDelayMillis: number = 500;
/** The time, after the tooltip class is deleted (clicked button),
 * in which it will be added again if we're still hovering over. */
const timeToReAddTooltipClassAfterDeletionMillis: number = 2000;

/** If true, tooltips IMMEDIATELY appear without delay. */
let fastTransitionMode = false;
/** The ID of the timer at the end of which to turn off fast transition mode.
 * If we view another tooltip before the timer is over, this gets canceled. */
let fastTransitionTimeoutID: ReturnType<typeof setTimeout> | undefined;
/** The time after which fast tooltip transitions will be disabled,
 * if no tooltipped has been viewed for a bit. */
const fastTransitionCooldownMillis: number = 750;

// Functions ----------------------------------------------------------------------------

/** Enables fast transition mode for tooltips. */
function enableFastTransition(): void {
	if (fastTransitionMode) return; // Already on!

	// console.log("Enabled fast transition");
	fastTransitionMode = true;
	initializedTooltips.forEach((tooltip) => tooltip.classList.add('fast-transition'));
}

/** Cancels the timer to exit fast transition mode. */
function cancelFastTransitionExpiryTimer(): void {
	// if (fastTransitionTimeoutID == null) return;
	clearTimeout(fastTransitionTimeoutID);
	fastTransitionTimeoutID = undefined;
}

/** Disables fast transition mode for tooltips. */
function disableFastTransition(): void {
	if (!fastTransitionMode) return;

	// console.log("Disabled fast transition");
	fastTransitionTimeoutID = undefined;
	fastTransitionMode = false;
	initializedTooltips.forEach((tooltip) => tooltip.classList.remove('fast-transition'));
}

/**
 * Gets the specific tooltip class of an element, whether that's
 * 'tooltip-d', 'tooltip-dl', or 'tooltip-dr'.
 */
function getTooltipClass(element: Element): string | null {
	return tooltipClasses.find((cls) => element.classList.contains(cls)) ?? null;
}

/** Discovers new tooltip elements, attaches fast-transition listeners, and adds them to the tooltips list. */
function addFastTransitionListeners(): void {
	if (!docutil.isMouseSupported()) return;

	const allTooltipsOnPage = document.querySelectorAll<HTMLElement>(
		tooltipClasses_Dotted.join(', '),
	);

	allTooltipsOnPage.forEach((tooltip) => {
		if (tooltip.dataset['tooltip_initialized'] === 'true') return; // If already initialized, skip this element.
		tooltip.dataset['tooltip_initialized'] = 'true'; // Mark THIS element as initialized.
		initializedTooltips.add(tooltip); // Add to the list

		const tooltipThisHas = getTooltipClass(tooltip)!; // What kind of tooltip class?

		let isHovering: boolean = false;
		let isHolding: boolean = false;
		let tooltipVisible: boolean = false;

		/** The timeout of the timer at the end of which the tooltip will be visible. */
		let hoveringTimer: ReturnType<typeof setTimeout> | undefined;
		/** True if we have temporarily removed the tooltip class (element clicked) */
		let removedClass: boolean = false;
		let addBackClassTimeoutID: ReturnType<typeof setTimeout> | undefined;

		function onTooltipVisible(): void {
			tooltipVisible = true;
		}

		function cancelHoveringTimer(): void {
			clearTimeout(hoveringTimer);
			hoveringTimer = undefined;
		}

		function removeClass(): void {
			if (removedClass) return;

			// console.log("Removed tooltip class");
			tooltip.classList.remove(tooltipThisHas);
			removedClass = true;
			tooltipVisible = false;
			disableFastTransition();
			cancelHoveringTimer();
		}

		function cancelTimerToAddClass(): void {
			clearTimeout(addBackClassTimeoutID);
			addBackClassTimeoutID = undefined;
		}

		function resetTimerToAddClass(): void {
			cancelTimerToAddClass();
			addBackClassTimeoutID = setTimeout(
				addBackClass,
				timeToReAddTooltipClassAfterDeletionMillis,
			);
		}

		function addBackClass(): void {
			if (!removedClass || isHolding) return;

			// console.log("Added tooltip class");
			cancelTimerToAddClass();
			tooltip.classList.add(tooltipThisHas);
			removedClass = false;
			if (isHovering) onTooltipVisible();
		}

		tooltip.addEventListener('mouseenter', () => {
			isHovering = true;
			cancelFastTransitionExpiryTimer();

			if (fastTransitionMode) onTooltipVisible();
			else hoveringTimer = setTimeout(onTooltipVisible, tooltipDelayMillis);
		});

		tooltip.addEventListener('mouseleave', () => {
			isHovering = false;
			isHolding = false;
			cancelHoveringTimer();
			addBackClass();

			if (tooltipVisible) {
				enableFastTransition();
				fastTransitionTimeoutID = setTimeout(
					() => disableFastTransition(),
					fastTransitionCooldownMillis,
				);
			}

			tooltipVisible = false;
		});

		tooltip.addEventListener('mousedown', () => {
			isHolding = true;
			removeClass();
			resetTimerToAddClass();
		});

		tooltip.addEventListener('mouseup', () => {
			isHolding = false;
			removeClass();
			resetTimerToAddClass();
		});
	});
}

/** Initializes listeners for all un-initialized tooltip elements on the page. */
function initTooltips(): void {
	addFastTransitionListeners();
}

initTooltips();

// -------------------------------------------------------------------------------------------

// Export so that it can be imported on every page. Otherwise esbuild won't include it.
export default {
	initTooltips,
};
