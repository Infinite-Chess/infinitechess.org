// src/client/scripts/esm/game/gui/toast.ts

/**
 * This script handles the showing and hiding of toast (status message) at the bottom of the page
 */

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
 * Weight of visibility for the status message.
 * When it is 0, the status message is hidden.
 */
let visibilityWeight = 0;

// Functions ---------------------------------------------------------

/**
 * Display a status message on-screen, auto-calculating its duration.
 * @param text - Message to display
 * @param [isError] Whether the backdrop should be red for an error
 * @param durationMultiplier - Optional. Multiplies the default duration. Default: 1.
 */
function showStatus(text: unknown, isError = false, durationMultiplier = 1): void {
	if (typeof text !== 'string') return; // Not defined (can happen if translation unavailable)

	const duration = (DURATION_BASE + text.length * DURATION_MULTIPLIER) * durationMultiplier;
	showStatusForDuration(text, duration, isError);
}

/**
 * Display a status message on-screen, manually passing in duration.
 * @param text - Message to display
 * @param durationMillis - Amount of time, in milliseconds, to display the message
 * @param [isError] Optional. Whether the backdrop should be red for an error
 */
function showStatusForDuration(text: string, durationMillis: number, isError = false): void {
	if (!text) return; // Not defined (can happen if translation unavailable)

	visibilityWeight++;

	fadeAfter(durationMillis);

	statusText.textContent = text;
	statusText.classList.remove('fade-out-1s');
	statusMessage.classList.remove('hidden');

	if (!isError) {
		statusText.classList.remove('error');
		statusText.classList.add('ok');
	} else {
		statusText.classList.remove('ok');
		statusText.classList.add('error');
		console.error(text);
	}
}

/**
 * Fades out the status message after the provided time,
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
 * Hides the status message after the provided time,
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

/** Shows a status message stating to please wait to perform this task. */
function pleaseWaitForTask(): void {
	showStatus(translations['please_wait'], false, 0.5);
}

// Exports -----------------------------------------------------------

export default {
	showStatus,
	showStatusForDuration,
	pleaseWaitForTask,
};
