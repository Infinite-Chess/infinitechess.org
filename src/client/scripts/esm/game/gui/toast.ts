// src/client/scripts/esm/game/gui/toast.ts

/**
 * This script displays the toast (status message) on the bottom of the page.
 */

// Types --------------------------------------------------------

interface ToastOptions {
	/** Whether the toast indicates an error. The backdrop will be red. */
	error?: boolean;
	/** Overrides the default duration of the toast. */
	durationMillis?: number;
	/** Multiplies the duration of the toast. */
	durationMultiplier?: number;
}

// Elements ----------------------------------------------------------

const statusMessage = document.getElementById('toastmessage')!;
const statusText = document.getElementById('toast')!;

// Constants ---------------------------------------------------------

/** Base duration for toasts, in milliseconds. */
const DURATION_BASE = 900;
/** Duration multiplier per character in toasts, in milliseconds. */
const DURATION_MULTIPLIER = 45;

/** Duration of the toasts' fade-out animation, in milliseconds. */
const FADE_DURATION = 1000;

// Variables ---------------------------------------------------------

/**
 * Weight of visibility for the toast.
 * When it is 0, it is hidden.
 */
let visibilityWeight = 0;

// Functions ---------------------------------------------------------

function show(text: string, options: ToastOptions = {}): void {
	// Safety net in case `text` was provided by an undefined translation of the `any` type:
	if (typeof text !== 'string') {
		console.warn('Unable to show toast: Not a string.');
		return;
	}

	const { error = false, durationMillis, durationMultiplier = 1 } = options;

	const duration =
		durationMillis ?? (DURATION_BASE + text.length * DURATION_MULTIPLIER) * durationMultiplier;

	visibilityWeight++;

	fadeAfter(duration);

	statusText.textContent = text;
	statusText.classList.remove('fade-out-1s');
	statusMessage.classList.remove('hidden');

	if (error) {
		statusText.classList.remove('ok');
		statusText.classList.add('error');
		console.error(text);
	} else {
		statusText.classList.remove('error');
		statusText.classList.add('ok');
	}
}

/**
 * Fades the current toast after the provided time,
 * if no new messages have been displayed in the meantime.
 */
function fadeAfter(ms: number): void {
	setTimeout(() => {
		if (visibilityWeight === 1) {
			statusText.classList.add('fade-out-1s');
			hideAfter(FADE_DURATION);
		} else visibilityWeight--; // This layer has been overwritten!
	}, ms);
}

/**
 * Hides the current toast after the provided time,
 * if no new messages have been displayed in the meantime.
 */
function hideAfter(ms: number): void {
	setTimeout(() => {
		visibilityWeight--;
		if (visibilityWeight > 0) return; // Only one left, hide!
		statusMessage.classList.add('hidden');
		statusText.classList.remove('fade-out-1s');
	}, ms);
}

/** Shows a toast message stating to please wait to perform this task. */
function showPleaseWaitForTask(): void {
	show(translations.please_wait, { durationMultiplier: 0.5 });
}

// Exports -----------------------------------------------------------

export default {
	show,
	showPleaseWaitForTask,
};
