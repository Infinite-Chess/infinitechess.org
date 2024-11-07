
// This script selects new languages when we click a language in the language dropdown.
// It also appends the lng query param to all header navigation links.
// And it removes the lng query param from the url after loading.

import docutil from "../../util/docutil.js";

const dropdownItems = document.querySelectorAll(".language-dropdown-item");



// Request cookie if it doesn't exist
if (!docutil.getCookieValue("i18next")) {
	fetch("/setlanguage", {
		method: "POST",
		credentials: "same-origin",
	});
}

(function addLngToNavLinks() {
	const lng = docutil.getCookieValue('i18next');
	if (!lng) return;

	const home = document.querySelector('.home'); // "Infinite Chess" text
	home.href = addLngQueryParamToLink(home.href);

	const navLinks = document.querySelectorAll('nav a');
	navLinks.forEach(link => {
		link.href = addLngQueryParamToLink(link);
	});

	/** Adds the "lng" query parameter to the ToS link at the bottom, if it exists (it doesn't on the play page) */
	toslink: {
		const element_toslink = document.getElementById("toslink");
		if (!element_toslink) break toslink;
		element_toslink.href = addLngQueryParamToLink(element_toslink);
	}
})();

function initListeners() {
	// Attach click event listener to language dropdown items
	dropdownItems.forEach(item => {
		item.addEventListener("click", callback_LanguageClicked);
	});
}

function closeListeners() {
	dropdownItems.forEach(item => {
		item.removeEventListener("click", callback_LanguageClicked);
	});
}

function callback_LanguageClicked(event) {
	const item = event.currentTarget;
	const selectedLanguage = item.getAttribute("value"); // Get the selected language code
	docutil.updateCookie("i18next", selectedLanguage, 365);

	// Modify the URL to include the "lng" query parameter
	const url = new URL(window.location);
	url.searchParams.set("lng", selectedLanguage);

	// Update the browser's URL without reloading the page
	window.history.replaceState({}, '', url);

	// Reload the page
	location.reload();
}

/**
 * Modifies the provided URL to include the "lng" query parameter based on the i18next cookie.
 * @param {string} href - The original URL.
 * @returns {string} The modified URL with the "lng" query parameter.
 */
function addLngQueryParamToLink(href) {
	// Get the value of the i18next cookie
	const lng = docutil.getCookieValue('i18next');
	if (!lng) return href;

	// Create a URL object from the given href
	const url = new URL(href, window.location.origin);

	// Add or update the "lng" query parameter
	url.searchParams.set('lng', lng);

	// Return the modified URL as a string
	return url.toString();
}

// This block auto-removes the "lng" query parameter from the url, visually, without refreshing
(function removeLngQueryParam() {
	// Create a URL object from the current window location
	const url = new URL(window.location);

	// Remove the "lng" query parameter
	url.searchParams.delete('lng');

	// Update the browser's URL without refreshing the page
	window.history.replaceState({}, '', url);
})();

export default {
	initListeners,
	closeListeners,
	addLngQueryParamToLink,
};