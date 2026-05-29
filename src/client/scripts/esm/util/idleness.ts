// src/client/scripts/esm/util/idleness.ts

/**
 * Utility for detecting user idleness on the page.
 *
 * Tracks pointer and keyboard activity. Supports multiple independent
 * registrations each with their own threshold, so different features
 * can react to different idle durations without interfering with each other.
 */

/**
 * The events monitored for activity. `capture: true` catches
 * them before any other handler; `passive: true` keeps it cheap.
 */
const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown'] as const;

/** A single idle listener registration. */
type Registration = {
	idleAfterMs: number;
	onIdle: () => void;
	onActive?: () => void;
	isIdle: boolean;
	timerID: number | undefined;
};

/** All current registrations. */
const registrations = new Set<Registration>();

/** Whether we've attached the global listeners to detect activity. */
let listenersAttached = false;

/** Called on every tracked input event; resets all registration timers and fires `onActive` for any that were idle. */
function onActivity(): void {
	for (const reg of registrations) {
		if (reg.isIdle) {
			reg.isIdle = false;
			reg.onActive?.();
		}
		clearTimeout(reg.timerID);
		reg.timerID = window.setTimeout(() => onIdleForReg(reg), reg.idleAfterMs);
	}
}

/** Marks a registration as idle and fires its `onIdle` callback. */
function onIdleForReg(reg: Registration): void {
	reg.isIdle = true;
	reg.timerID = undefined;
	reg.onIdle();
}

/** Attaches the global activity listeners to the document (no-op if already attached). */
function attachListeners(): void {
	if (listenersAttached) return;
	listenersAttached = true;
	for (const event of ACTIVITY_EVENTS) {
		document.addEventListener(event, onActivity, { passive: true, capture: true });
	}
}

/** Removes the global activity listeners from the document (no-op if not attached). */
function detachListeners(): void {
	if (!listenersAttached) return;
	listenersAttached = false;
	for (const event of ACTIVITY_EVENTS) {
		document.removeEventListener(event, onActivity, { capture: true });
	}
}

/**
 * Registers an idle listener. The idle timer starts immediately.
 * @param idleAfterMs - Duration (ms) of inactivity before the user is considered idle.
 * @param onIdle - Called when the user becomes idle.
 * @param onActive - Optionally called when the user becomes active again after having been idle.
 * @returns An object with a `remove` method to cancel the registration and its timers.
 */
function addListener(
	idleAfterMs: number,
	onIdle: () => void,
	onActive?: () => void,
): { remove: () => void } {
	const reg: Registration = {
		idleAfterMs,
		onIdle,
		onActive,
		isIdle: false,
		timerID: window.setTimeout(() => onIdleForReg(reg), idleAfterMs),
	};
	registrations.add(reg);
	attachListeners();
	return {
		remove: () => {
			clearTimeout(reg.timerID);
			registrations.delete(reg);
			if (registrations.size === 0) detachListeners();
		},
	};
}

export default { addListener };
