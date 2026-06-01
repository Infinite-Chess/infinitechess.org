// src/client/scripts/esm/components/toast.ts

/**
 * Site-wide toast notifications. Available on every page.
 *
 * A toast element (from components/toast/toast.njk) slides in from the
 * top-right and auto-dismisses. Subsequent calls replace its content and
 * restart the timer without re-animating. Pauses on hover, dismissible via X.
 * Used by the websocket router for `notify` / `notifyerror` actions, and by
 * any other client code that needs to surface a transient message.
 */

// Types --------------------------------------------------------

interface ToastOptions {
	/** Whether the toast indicates an error. Renders with the error styling. */
	error?: boolean;
	/** Overrides the default duration of the toast. */
	durationMillis?: number;
	/** Multiplies the default duration of the toast. */
	durationMultiplier?: number;
}

// Constants ---------------------------------------------------------

/** Base duration for toasts, in milliseconds. */
const DURATION_BASE = 2000;
/** Duration multiplier per character in toasts, in milliseconds. */
const DURATION_PER_CHAR = 45;
/** Duration of the slide-out animation, in milliseconds. Must match toast.css. */
const EXIT_ANIMATION_MS = 280;

// Elements ----------------------------------------------------------

const toastEl = document.getElementById('toast')!;
const textEl = toastEl.querySelector<HTMLElement>('.toast-text')!;
const closeBtn = toastEl.querySelector<HTMLButtonElement>('.toast-close')!;

// State -------------------------------------------------------------

let timerId: number | undefined;
let hideTimerId: number | undefined;
/** Total duration of the currently shown toast, in milliseconds. */
let currentDuration = 0;
/** Time the currently shown toast was first displayed. Shifts forward while paused on hover. */
let shownAt = 0;
/** Time hover began, or undefined when not paused. */
let pauseStart: number | undefined;

// Functions ---------------------------------------------------------

function show(text: string, options: ToastOptions = {}): void {
	// Safety net in case `text` was provided by an undefined translation of the `any` type:
	if (typeof text !== 'string') {
		console.warn('Unable to show toast: Not a string.');
		return;
	}

	const { error = false, durationMillis, durationMultiplier = 1 } = options;
	const duration =
		durationMillis ?? (DURATION_BASE + text.length * DURATION_PER_CHAR) * durationMultiplier;

	if (error) console.error(text);

	textEl.textContent = text;
	toastEl.classList.toggle('toast-error', error);
	toastEl.classList.toggle('toast-info', !error);
	toastEl.classList.remove('toast-leaving');
	toastEl.classList.remove('hidden');

	currentDuration = duration;
	shownAt = Date.now();
	pauseStart = undefined;
	startTimer(duration);
}

/** Starts or restarts the timer to auto-dismiss the currently shown toast after the given duration. */
function startTimer(duration: number): void {
	window.clearTimeout(timerId);
	window.clearTimeout(hideTimerId);
	timerId = window.setTimeout(dismiss, duration);
}

/** Dismisses the currently shown toast. */
function dismiss(): void {
	window.clearTimeout(timerId);
	if (toastEl.classList.contains('hidden')) return;
	toastEl.classList.add('toast-leaving');
	hideTimerId = window.setTimeout(() => {
		toastEl.classList.add('hidden');
		toastEl.classList.remove('toast-leaving');
	}, EXIT_ANIMATION_MS);
}

toastEl.addEventListener('mouseenter', () => {
	window.clearTimeout(timerId);
	pauseStart = Date.now();
});
toastEl.addEventListener('mouseleave', () => {
	if (pauseStart === undefined) return;
	// Shift `shownAt` forward by the pause length so `elapsed` ignores paused time.
	shownAt += Date.now() - pauseStart;
	pauseStart = undefined;
	if (toastEl.classList.contains('hidden') || toastEl.classList.contains('toast-leaving')) return;
	const remaining = currentDuration - (Date.now() - shownAt);
	if (remaining > 0) startTimer(remaining);
	else dismiss();
});
closeBtn.addEventListener('click', dismiss);

/** Shows a toast message stating to please wait to perform this task. */
function showPleaseWaitForTask(): void {
	show(translations.please_wait, { durationMultiplier: 0.5 });
}

// Exports -----------------------------------------------------------

export default {
	show,
	showPleaseWaitForTask,
};
