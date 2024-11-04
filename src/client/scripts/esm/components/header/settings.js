
// This script opens and closes our settings drop-down menu when it is clicked.

import localstorage from "../../util/localstorage.js";
import checkerboardgenerator from "../../game/rendering/checkerboardgenerator.js";
import languageselector from "./languageselector.js";
import themes from "./themes.js";
import timeutil from "../../game/misc/timeutil.js";
import style from "../../game/gui/style.js";

const settings = document.getElementById('settings');
const settingsDropdown = document.querySelector('.settings-dropdown');
const languageDropdownSelection = document.getElementById('language-settings-dropdown-item');
const boardDropdownSelection = document.getElementById('board-settings-dropdown-item');
const languageDropdown = document.querySelector('.language-dropdown');
const boardDropdown = document.querySelector('.board-dropdown');

const languageDropdownTitle = document.querySelector('.language-dropdown .dropdown-title');
const boardDropdownTitle = document.querySelector('.board-dropdown .dropdown-title');
const themeList = document.querySelector('.theme-list'); // Get the theme list div

const allSettingsDropdownsExceptMainOne = [languageDropdown, boardDropdown];
const allSettingsDropdowns = [...allSettingsDropdownsExceptMainOne, settingsDropdown];
let settingsIsOpen = settings.classList.contains('open');

settings.addEventListener('click', event => {
	if (didEventClickAnyDropdown(event)) return; // We clicked any dropdown, don't toggle it off
	toggleSettingsDropdown();
});

// Close the dropdown if clicking outside of it
document.addEventListener('click', closeSettingsDropdownIfConditionsMet);
document.addEventListener('touchstart', closeSettingsDropdownIfConditionsMet);

function closeSettingsDropdownIfConditionsMet(event) {
	if (!settings.contains(event.target) && !didEventClickAnyDropdown(event)) closeSettingsDropdowns();
}

function didEventClickAnyDropdown(event) {
	// Check if the click was outside the dropdown
	let clickedDropdown = false;
	allSettingsDropdowns.forEach(dropdown => {
		if (dropdown.contains(event.target)) clickedDropdown = true;
	});
	return clickedDropdown;
}

function toggleSettingsDropdown() {
	if (settingsIsOpen) closeSettingsDropdowns();
	else openSettingsDropdown();
}
function openSettingsDropdown() { // Opens the initial settings dropdown
	settings.classList.add('open');
	settingsDropdown.classList.remove('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	settingsIsOpen = true;
}
function closeSettingsDropdowns() { // Closes all dropdowns that may be open
	settings.classList.remove('open');
	settingsDropdown.classList.add('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	closeAllSettingsDropdownsExceptMainOne();
	settingsIsOpen = false;
}
function closeAllSettingsDropdownsExceptMainOne() {
	allSettingsDropdownsExceptMainOne.forEach(dropdown => { dropdown.classList.add('visibility-hidden'); });
	languageselector.closeListeners();
}



languageDropdownSelection.addEventListener('click', toggleLanguageDropdown);

function toggleLanguageDropdown() {
	if (languageDropdown.classList.contains('visibility-hidden')) { // Is toggling on
		closeAllSettingsDropdownsExceptMainOne();
		languageselector.initListeners();
	} else { // Is toggling off
		languageselector.closeListeners();
	}
	languageDropdown.classList.toggle('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
}

languageDropdownTitle.addEventListener('click', toggleLanguageDropdown);



boardDropdownSelection.addEventListener('click', toggleBoardDropdown);

function toggleBoardDropdown() {
	if (boardDropdown.classList.contains('visibility-hidden')) closeAllSettingsDropdownsExceptMainOne();
	boardDropdown.classList.toggle('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
}

boardDropdownTitle.addEventListener('click', toggleBoardDropdown);


(async function addThemesToThemesDropdown() {

	const themeDictionary = themes.themes;

	// Loop through each theme in the dictionary
	for (const themeName in themeDictionary) {
		const theme = themeDictionary[themeName];
		const lightTiles = theme.lightTiles;
		const darkTiles = theme.darkTiles;

		// Create the checkerboard image for the theme
		console.log(lightTiles, darkTiles);
		const checkerboardImage = await checkerboardgenerator.createCheckerboardIMG(
			style.arrayToCssColor(lightTiles), // Convert to CSS color format
			style.arrayToCssColor(darkTiles),  // Convert to CSS color format
			2 // Width
		);
		checkerboardImage.setAttribute('theme', themeName);
		checkerboardImage.setAttribute('draggable', 'false');

		// Append the image to the theme list div
		themeList.appendChild(checkerboardImage);
	}

	updateThemeSelectedStyling();

	(function initThemeChangeListeners() {
		// Iterate through each child in the themeList using a for loop
		for (let i = 0; i < themeList.children.length; i++) {
			const theme = themeList.children[i];
			theme.addEventListener('click', selectTheme);
		}
	})();

	function selectTheme(event) {
		const selectedTheme = event.target.getAttribute('theme');
		// console.log('Selected theme:', selectedTheme);

		// Save it to browser storage
		const oneYearInMillis = timeutil.getTotalMilliseconds({ years: 1});
		localstorage.saveItem('theme', selectedTheme, oneYearInMillis);

		updateThemeSelectedStyling();
		
		// Dispatch a custom event for theme change so that any game code present can pick it up.
		const detail = selectedTheme;
		const themeChangeEvent = new CustomEvent('theme-change', { detail });
		document.dispatchEvent(themeChangeEvent);
	}

	/** Outlines in black the current theme selection */
	function updateThemeSelectedStyling() {
		const selectedTheme = localstorage.loadItem('theme') || themes.defaultTheme;
		if (!selectTheme) return;
		for (let i = 0; i < themeList.children.length; i++) {
			const theme = themeList.children[i];
			if (selectTheme && theme.getAttribute('theme') === selectedTheme) theme.classList.add('selected');
			else theme.classList.remove('selected');
		}
	}
})();

export default {};