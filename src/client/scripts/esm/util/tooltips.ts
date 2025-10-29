
/**
 * This script creates event listeners for managing the current classes
 * of all elements with a tooltip available.
 * If you hover for a tooltip, following tooltips pop up instantly,
 * until you go a little but without viewing another tooltip.
 */

import docutil from "./docutil.js";


// Variables ----------------------------------------------------------------------------


const tooltipClasses: string[] = ['tooltip-dl', 'tooltip-d', 'tooltip-dr','tooltip-u', 'tooltip-ul'];
const tooltipClasses_Dotted = tooltipClasses.map(classname => '.' + classname );

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
function enableFastTransition(tooltips: NodeListOf<Element>): void {
	if (fastTransitionMode) return; // Already on!

	// console.log("Enabled fast transition");
	fastTransitionMode = true;
	tooltips.forEach(tooltip => tooltip.classList.add('fast-transition') );
}

/** Cancels the timer to exit fast transition mode. */
function cancelFastTransitionExpiryTimer(): void {
	// if (fastTransitionTimeoutID == null) return;
	clearTimeout(fastTransitionTimeoutID);
	fastTransitionTimeoutID = undefined;
}

/** Disables fast transition mode for tooltips.  */
function disableFastTransition(tooltips: NodeListOf<Element>): void {
	if (!fastTransitionMode) return;

	// console.log("Disabled fast transition");
	fastTransitionTimeoutID = undefined;
	fastTransitionMode = false;
	tooltips.forEach(tooltip => tooltip.classList.remove('fast-transition') );
}

/**
 * Gets the specific tooltip class of an element, whether that's
 * 'tooltip-d', 'tooltip-dl', or 'tooltip-dr'.
 */
function getTooltipClass(element: Element): string | null {
	return tooltipClasses.find(cls => element.classList.contains(cls)) ?? null;
}

/** Adds event listeners for entering fast transition mode in desktop mode (tooltips appear immediately) */
function addFastTransitionListeners(): void {
	if (!docutil.isMouseSupported()) return;
	
	const tooltips = document.querySelectorAll(tooltipClasses_Dotted.join(', '));

	tooltips.forEach(tooltip => {
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
			disableFastTransition(tooltips);
			cancelHoveringTimer();
		}

		function cancelTimerToAddClass(): void {
			clearTimeout(addBackClassTimeoutID);
			addBackClassTimeoutID = undefined;
		}

		function resetTimerToAddClass(): void {
			cancelTimerToAddClass();
			addBackClassTimeoutID = setTimeout(addBackClass, timeToReAddTooltipClassAfterDeletionMillis);
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
				enableFastTransition(tooltips);
				fastTransitionTimeoutID = setTimeout(() => disableFastTransition(tooltips), fastTransitionCooldownMillis);
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

function initTooltips(): void {
	addFastTransitionListeners();
}

initTooltips();


// -------------------------------------------------------------------------------------------


// Export so that it can be imported on every page. Otherwise esbuild won't include it.
export default {
	initTooltips,
};