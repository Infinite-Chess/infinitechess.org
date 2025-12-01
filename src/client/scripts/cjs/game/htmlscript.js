'use strict';

/* global main */

/**
 * The server injects this script directly into the html document
 * before serving that.
 * This is so we can execute code that needs to be executed preferrably
 * before the document fully loads (for example, the loading screen,
 * or pre-loading the sound spritesheet)
 *
 * This is also what calls our main() function when the page fully loads.
 */
// eslint-disable-next-line no-unused-vars
const htmlscript = (function () {
	// Listen for the first user gesture...

	// If there's an error in loading, stop the loading animation
	// ...

	let loadingErrorOcurred = false;
	let lostNetwork = false;

	function callback_LoadingError(_event) {
		// const type = event.type; // Event type: "error"/"abort"
		// const target = event.target; // Element that triggered the event
		// const elementType = target?.tagName.toLowerCase();
		// const sourceURL = target?.src || target?.href; // URL of the resource that failed to load
		// console.error(`Event ${type} ocurred loading ${elementType} at ${sourceURL}.`);

		if (loadingErrorOcurred) return; // We only need to show the error text once
		loadingErrorOcurred = true;

		// Hide the "LOADING" text
		const element_loadingText = document.getElementById('loading-text');
		element_loadingText.classList.add('hidden'); // This applies a 'display: none' rule

		// Show the ERROR text
		const element_loadingError = document.getElementById('loading-error');
		const element_loadingErrorText = document.getElementById('loading-error-text');
		element_loadingError.classList.remove('hidden');
		element_loadingErrorText.textContent = lostNetwork
			? translations.lost_network
			: translations.failed_to_load;

		// Remove the glowing in the background animation
		const element_loadingGlow = document.getElementById('loading-glow');
		element_loadingGlow.classList.remove('loadingGlowAnimation');
		element_loadingGlow.classList.add('loading-glow-error');
	}

	// Removes the onerror event listener from the "this" object.
	function removeOnerror() {
		this.removeAttribute('onerror');
		this.removeAttribute('onload');
	}

	// Add event listeners for when connection is dropped when loading

	(function initLoadingScreenListeners() {
		window.addEventListener('offline', callback_Offline);
		window.addEventListener('online', callback_Online);
	})();
	function closeLoadingScreenListeners() {
		window.removeEventListener('offline', callback_Offline);
		window.removeEventListener('online', callback_Online);
	}

	function callback_Offline() {
		console.log('Network connection lost');
		lostNetwork = true;
		callback_LoadingError();
	}
	function callback_Online() {
		console.log('Network connection regained');
		lostNetwork = false;
		if (loadingErrorOcurred) window.location.reload(); // Refresh the page
	}

	// When the document is loaded, start the game!

	window.addEventListener('load', function () {
		if (loadingErrorOcurred) return; // Page never finished loading, don't start the game.
		closeLoadingScreenListeners(); // Remove document event listeners for the loading screen
		main.start(); // Start the game!
	});

	return Object.freeze({
		callback_LoadingError,
		removeOnerror,
	});
})();
