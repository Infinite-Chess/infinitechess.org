// src/client/scripts/components/longpress.ts

/**
 * Wires an element so a touch held still fires an action once, in place of the click it
 * would end in — the touch counterpart of a right-click, which iOS Safari never sends as
 * `contextmenu`. Delegation-friendly: the action receives the press's pointerdown, whose
 * target is the descendant pressed. Mouse input is left alone.
 */

// Constants -------------------------------------------------------------------

/** Milliseconds a touch must be held to count as a long press. */
const HOLD_DURATION = 500;

// Wiring ----------------------------------------------------------------------

/** Makes a touch held still on `element` fire `onLongPress`, swallowing the click it ends in. */
function make(element: HTMLElement, onLongPress: (e: PointerEvent) => void): void {
	/** The held touch's pending timeout, or 'fired' once it has, until the next press. */
	let press: number | 'fired' | undefined;

	/** Drops a touch still being held, before it fires. */
	function release(): void {
		if (typeof press !== 'number') return;
		clearTimeout(press);
		press = undefined;
	}

	element.addEventListener('pointerdown', (e) => {
		release();
		press = undefined;
		if (e.pointerType !== 'touch') return;
		press = window.setTimeout(() => {
			press = 'fired';
			onLongPress(e);
		}, HOLD_DURATION);
	});
	element.addEventListener('pointerup', release);
	element.addEventListener('pointercancel', release);

	// Captured, so the element's own listeners never see them: the click a fired press ends
	// in, and Android's native long-press menu, which would open the action a second time.
	element.addEventListener(
		'click',
		(e) => {
			if (press === 'fired') e.stopImmediatePropagation();
		},
		true,
	);
	element.addEventListener(
		'contextmenu',
		(e) => {
			if (!press) return;
			e.preventDefault();
			e.stopImmediatePropagation();
		},
		true,
	);
}

export default { make };
