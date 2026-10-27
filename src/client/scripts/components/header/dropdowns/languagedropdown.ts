// src/client/scripts/components/header/dropdowns/languagedropdown.ts

/**
 * Selects a new language when we click one in the language dropdown, storing the
 * choice in the "lang" cookie that the server reads to localize each page.
 */

import timeutil from '../../../../../shared/util/timeutil.js';

import docutil from '../../../util/docutil.js';

// Elements --------------------------------------------------------------------

const languageDropdown = document.querySelector('.language-dropdown')!;
const dropdownItems = document.querySelectorAll('.language-dropdown-item');
const languageDropdownTitle = document.querySelector('.language-dropdown .dropdown-title')!;

// Constants -------------------------------------------------------------------

/** How long the language-override cookie persists. */
const LANGUAGE_COOKIE_EXPIRY_MS = timeutil.toMillis(1, 'years');

// Functions -------------------------------------------------------------------

/** Opens the dropdown. */
function open(): void {
	languageDropdown.classList.remove('hidden');
	initListeners();
}

/** Closes the dropdown. */
function close(): void {
	languageDropdown.classList.add('hidden');
	closeListeners();
}

/** Listens for a click on its title, which closes it, or on a language. */
function initListeners(): void {
	languageDropdownTitle.addEventListener('click', close);
	dropdownItems.forEach((item) => {
		item.addEventListener('click', onLanguageClicked);
	});
}

/** Removes the listeners {@link initListeners} added. */
function closeListeners(): void {
	languageDropdownTitle.removeEventListener('click', close);
	dropdownItems.forEach((item) => {
		item.removeEventListener('click', onLanguageClicked);
	});
}

/** Stores the clicked language in the "lang" cookie, then reloads so the server renders in it. */
function onLanguageClicked(event: Event): void {
	const item = event.currentTarget as HTMLElement;
	const selectedLanguage = item.getAttribute('value')!;
	docutil.updateCookie('lang', selectedLanguage, LANGUAGE_COOKIE_EXPIRY_MS);
	location.reload();
}

// Exports ---------------------------------------------------------------------

export default {
	open,
	close,
};
