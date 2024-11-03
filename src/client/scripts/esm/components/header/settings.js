
// This script opens and closes our settings drop-down menu when it is clicked.

import localstorage from "../../util/localstorage.js";
import checkerboardgenerator from "../../game/rendering/checkerboardgenerator.js";
import languageselector from "./languageselector.js";
import themes from "./themes.js";

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
document.addEventListener('click', (event) => {
	if (!settings.contains(event.target) && !didEventClickAnyDropdown(event)) closeSettingsDropdowns();
});

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

	const themeDictionary = themes.getThemes();

	// Loop through each theme in the dictionary
	for (const themeName in themeDictionary) {
		const theme = themeDictionary[themeName];
		const whiteTiles = theme.whiteTiles;
		const darkTiles = theme.darkTiles;

		// Create the checkerboard image for the theme
		const checkerboardImage = await checkerboardgenerator.createCheckerboardIMG(
			arrayToCssColor(whiteTiles), // Convert to CSS color format
			arrayToCssColor(darkTiles),  // Convert to CSS color format
			2 // Width
		);
		checkerboardImage.setAttribute('theme', themeName);
		checkerboardImage.setAttribute('draggable', 'false');

		// Append the image to the theme list div
		themeList.appendChild(checkerboardImage);
	}

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

		const detail = { theme: selectedTheme, properties: themeDictionary[selectedTheme] };

		// Save it to browser storage
		localstorage.saveItem('theme', detail);
		
		// Dispatch a custom event for theme change so that any game code present can pick it up.
		const themeChangeEvent = new CustomEvent('theme-change', { detail });
		document.dispatchEvent(themeChangeEvent);
	}
})();

/**
 * Converts an array of [r, g, b, a], range 0-1, into a valid CSS rgba color string.
 * @param {number[]} colorArray - An array containing [r, g, b, a] values, where r, g, b are in the range [0, 1].
 * @returns {string} A CSS rgba color string.
 */
function arrayToCssColor(colorArray) {
	if (colorArray.length !== 4) throw new Error('Array must have exactly 4 elements: [r, g, b, a].');

	const [r, g, b, a] = colorArray.map((value, index) => {
		if (index < 3) {
			if (value < 0 || value > 1) throw new Error('RGB values must be between 0 and 1.');
			return Math.round(value * 255);
		} else {
			if (value < 0 || value > 1) throw new Error('Alpha value must be between 0 and 1.');
			return value;
		}
	});

	return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export default {};