// src/client/scripts/esm/components/header/dropdowns/languagedropdown.ts

// This script selects new languages when we click a language in the language dropdown,
// storing the choice in the "lang" cookie that the server reads to localize each page.

import docutil from '../../../util/docutil.js';

// Document Elements -------------------------------------------------------------------------

const languageDropdown = document.querySelector('.language-dropdown')!;
const dropdownItems = document.querySelectorAll('.language-dropdown-item');
const languageDropdownTitle = document.querySelector('.language-dropdown .dropdown-title')!;

/** How long the language-override cookie persists, in days. */
const LANGUAGE_COOKIE_DAYS = 365;

// Functions ---------------------------------------------------------------------------------

function open(): void {
	languageDropdown.classList.remove('hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	initListeners();
}
function close(): void {
	languageDropdown.classList.add('hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	closeListeners();
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
	docutil.updateCookie('lang', selectedLanguage, LANGUAGE_COOKIE_DAYS);

	// Reload so the server re-renders the page in the newly selected language.
	location.reload();
}

export default {
	open,
	close,
};
