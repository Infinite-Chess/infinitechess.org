// src/client/scripts/esm/util/holdrepeat.ts

/**
 * Wires a button so a single click fires its action once, while pressing and
 * holding it (mouse or touch) auto-repeats the action. Reusable for any
 * "hold to repeat" control (move navigation, editor undo/redo, etc.).
 *
 * Throttling and legality of the action are the caller's responsibility.
 */

interface HoldRepeatOptions {
	/** Milliseconds to hold before auto-repeat begins. */
	holdDelay?: number;
	/** Milliseconds between auto-repeat fires once started. */
	repeatInterval?: number;
}

const DEFAULT_HOLD_DELAY = 250;
const DEFAULT_REPEAT_INTERVAL = 50;

/** Makes `element` fire `onFire` on click, and auto-repeat `onFire` while held. */
function makeHoldRepeatable(
	element: HTMLElement,
	onFire: () => void,
	{
		holdDelay = DEFAULT_HOLD_DELAY,
		repeatInterval = DEFAULT_REPEAT_INTERVAL,
	}: HoldRepeatOptions = {},
): void {
	let timeoutID: number; // Delay before repeating begins
	let intervalID: number; // Repeats the fire
	let touchInside = false; // Whether the active touch is still over the element

	/** Starts the hold-delay → repeat-interval chain, gated by `stillHeld`. */
	function beginRepeat(stillHeld: () => boolean): void {
		timeoutID = window.setTimeout(() => {
			if (!stillHeld()) return;
			intervalID = window.setInterval(() => {
				// A button disabled mid-hold swallows its own mouseup/touchend, so
				// the disabled state is our only reliable signal the hold should end.
				if (element.matches(':disabled')) stopRepeat();
				else onFire();
			}, repeatInterval);
		}, holdDelay);
	}

	function stopRepeat(): void {
		clearTimeout(timeoutID);
		clearInterval(intervalID);
	}

	// Mouse
	element.addEventListener('click', onFire);
	element.addEventListener('mousedown', () => beginRepeat(() => true));
	element.addEventListener('mouseleave', stopRepeat);
	element.addEventListener('mouseup', stopRepeat);

	// Touch
	element.addEventListener('touchstart', () => {
		touchInside = true;
		beginRepeat(() => touchInside);
	});
	element.addEventListener('touchmove', (event: TouchEvent) => {
		if (!touchInside) return;
		const touch = event.touches[0]!;
		const rect = element.getBoundingClientRect();
		if (
			touch.clientX > rect.left &&
			touch.clientX < rect.right &&
			touch.clientY > rect.top &&
			touch.clientY < rect.bottom
		)
			return; // Still over the element

		touchInside = false;
		stopRepeat();
	});
	element.addEventListener('touchend', () => {
		touchInside = false;
		stopRepeat();
	});
	element.addEventListener('touchcancel', () => {
		touchInside = false;
		stopRepeat();
	});
}

export default { makeHoldRepeatable };
