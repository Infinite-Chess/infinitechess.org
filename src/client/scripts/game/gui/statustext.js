
"use strict";

/** This script handles the showing and hiding of status message at the bottom of the page */

const statusMessage = document.getElementById('statusmessage');
const statusText = document.getElementById('statustext');

const fadeTimer = 1000; // In milliseconds. UPDATE with the document!

const stapleLength = 900; // How many ms each status message atleast lasts! Can be shortened by the multiplier.
const length = 45; // This is multiplied by the messages character count to add to it's life span.

let layers = 0;

/**
 * Display a status message on-screen, auto-calculating its duration.
 * @param {string} text Message to display
 * @param {boolean} [isError] Optional. Whether the backdrop should be red for an error
 * @param {number} durationMultiplier - Optional. Multiplies the default duration. Default: 1.
 */
function showStatus(text, isError, durationMultiplier = 1) {
	const duration = (stapleLength + text.length * length) * durationMultiplier;
	showStatusForDuration(text, duration, isError);
}

/**
 * Display a status message on-screen, manually passing in duration.
 * @param {string} text - Message to display
 * @param {number} durationMillis - Amount of time, in milliseconds, to display the message
 * @param {boolean} [isError] Optional. Whether the backdrop should be red for an error
 */
function showStatusForDuration(text, durationMillis, isError) {
	if (text == null) return console.error("Cannot show status of undefined text!!");
    
	layers++;
    
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

function fadeAfter(ms) {
	setTimeout(function() {
		if (layers === 1) {
			statusText.classList.add('fade-out-1s');
			hideAfter(fadeTimer);
		} else layers--; // This layer has been overwritten!
	}, ms);
}

function hideAfter(ms) {
	setTimeout(function() {
		layers--;
		if (layers > 0) return; // Only one left, hide!
		statusMessage.classList.add('hidden');
		statusText.classList.remove('fade-out-1s');
	}, ms);
}

function lostConnection() {
	showStatus(translations.lost_connection);
}

/** Shows a status message stating to please wait to perform this task. */
function pleaseWaitForTask() {
	showStatus(translations.please_wait, false, 0.5);
}

// Dev purposes
function getLayerCount() {
	return layers;
}

export default {
	showStatus,
	lostConnection,
	pleaseWaitForTask,
	getLayerCount,
	showStatusForDuration
};