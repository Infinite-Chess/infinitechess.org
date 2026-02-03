// src/client/scripts/esm/components/header/dropdowns/languagedropdown.ts

// This script selects new languages when we click a language in the language dropdown.
// It also appends the lng query param to all header navigation links.
// And it removes the lng query param from the url after loading.

import docutil from '../../../util/docutil.js';

// Document Elements -------------------------------------------------------------------------

const settingsDropdown = document.querySelector('.settings-dropdown')!;

const languageDropdown = document.querySelector('.language-dropdown')!;
const dropdownItems = document.querySelectorAll('.language-dropdown-item');
const languageDropdownTitle = document.querySelector('.language-dropdown .dropdown-title')!;

// Functions ---------------------------------------------------------------------------------

(function init() {
	// Request cookie if it doesn't exist
	if (!docutil.getCookieValue('i18next')) {
		fetch('/setlanguage', {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'is-fetch-request': 'true', // Custom header
			},
		});
	}
	removeLngQueryParam();
})();

/**
 * Modifies the provided URL to include the "lng" query parameter based on the i18next cookie.
 * @param href - The original URL.
 * @returns The modified URL with the "lng" query parameter.
 */
function addLngQueryParamToLink(href: string): string {
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

/** This block auto-removes the "lng" query parameter from the url, visually, without refreshing */
function removeLngQueryParam(): void {
	// Create a URL object from the current window location
	const url = new URL(window.location.href);

	// Remove the "lng" query parameter
	url.searchParams.delete('lng');

	// Update the browser's URL without refreshing the page
	window.history.replaceState({}, '', url);
}

function open(): void {
	languageDropdown.classList.remove('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	initListeners();
	settingsDropdown.classList.add('transparent');
}
function close(): void {
	languageDropdown.classList.add('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	closeListeners();
	settingsDropdown.classList.remove('transparent');
}

function initListeners(): void {
	languageDropdownTitle.addEventListener('click', close);
	dropdownItems.forEach((item) => {
		item.addEventListener('click', onLanguageClicked);
	});
}
function closeListeners(): void {
	languageDropdownTitle.removeEventListener('click', close);
	dropdownItems.forEach((item) => {
		item.removeEventListener('click', onLanguageClicked);
	});
}

function onLanguageClicked(event: Event): void {
	const item = event.currentTarget as HTMLElement;
	const selectedLanguage = item.getAttribute('value')!; // Get the selected language code
	docutil.updateCookie('i18next', selectedLanguage, 365);

	// Modify the URL to include the "lng" query parameter
	const url = new URL(window.location.href);
	url.searchParams.set('lng', selectedLanguage);

	// Update the browser's URL without reloading the page
	window.history.replaceState({}, '', url);

	// Reload the page
	location.reload();
}

export default {
	initListeners,
	closeListeners,
	addLngQueryParamToLink,
	open,
	close,
};
