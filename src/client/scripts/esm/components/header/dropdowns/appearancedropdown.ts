// src/client/scripts/esm/components/header/dropdowns/appearancedropdown.ts

import themes from '../../../../../../shared/components/header/themes.js';

import style from '../../../game/gui/style.js';
import preferences from '../preferences.js';
import checkerboardgenerator from '../../../chess/rendering/checkerboardgenerator.js';

// Document Elements -------------------------------------------------------------------------

const appearanceDropdownTitle = document.querySelector('.appearance-dropdown .dropdown-title')!;
const appearanceDropdown = document.querySelector('.appearance-dropdown')!;
const themeList = document.querySelector('.theme-list')!; // Get the theme list div

const coordinatesCheckbox = document.querySelector<HTMLInputElement>(
	'.boolean-option.coordinates input',
)!;
const starfieldCheckbox = document.querySelector<HTMLInputElement>(
	'.boolean-option.starfield input',
)!;
const advancedEffectsCheckbox = document.querySelector<HTMLInputElement>(
	'.boolean-option.advanced-effects input',
)!;

// Functions ---------------------------------------------------------------------------------

(function init() {
	showCheckmarkOnSelectedOptions();
	addThemesToThemesDropdown();
})();

function showCheckmarkOnSelectedOptions(): void {
	coordinatesCheckbox.checked = preferences.getCoordinatesEnabled();
	starfieldCheckbox.checked = preferences.getStarfieldMode();
	advancedEffectsCheckbox.checked = preferences.getAdvancedEffectsMode();
}

async function addThemesToThemesDropdown(): Promise<void> {
	const themeDictionary = themes.themes;

	// Loop through each theme in the dictionary
	for (const themeName in themeDictionary) {
		const theme = themeDictionary[themeName]!;
		const lightTiles = theme.lightTiles;
		const darkTiles = theme.darkTiles;

		// Create the checkerboard image for the theme
		const checkerboardImage = await checkerboardgenerator.createCheckerboardIMG(
			style.arrayToCssColor(lightTiles), // Convert to CSS color format
			style.arrayToCssColor(darkTiles), // Convert to CSS color format
			2, // Width
		);
		checkerboardImage.setAttribute('theme', themeName);
		checkerboardImage.setAttribute('draggable', 'false');

		// Append the image to the theme list div
		themeList.appendChild(checkerboardImage);
	}

	updateThemeSelectedStyling();
}

function open(): void {
	appearanceDropdown.classList.remove('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	initListeners();
}
function close(): void {
	appearanceDropdown.classList.add('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	closeListeners();
}

function initListeners(): void {
	appearanceDropdownTitle.addEventListener('click', close);
	initThemeChangeListeners();
	// Coordinates toggle
	coordinatesCheckbox.addEventListener('click', toggleCoordinates);
	// Starfield toggle
	starfieldCheckbox.addEventListener('click', toggleStarfield);
	// Advanced Effects toggle
	advancedEffectsCheckbox.addEventListener('click', toggleAdvancedEffects);
}
function closeListeners(): void {
	appearanceDropdownTitle.removeEventListener('click', close);
	closeThemeChangeListeners();
	// Coordinates toggle
	coordinatesCheckbox.removeEventListener('click', toggleCoordinates);
	// Starfield toggle
	starfieldCheckbox.removeEventListener('click', toggleStarfield);
	// Advanced Effects toggle
	advancedEffectsCheckbox.removeEventListener('click', toggleAdvancedEffects);
}
function initThemeChangeListeners(): void {
	for (let i = 0; i < themeList.children.length; i++) {
		const theme = themeList.children[i]!;
		theme.addEventListener('click', selectTheme);
	}
}
function closeThemeChangeListeners(): void {
	for (let i = 0; i < themeList.children.length; i++) {
		const theme = themeList.children[i]!;
		theme.removeEventListener('click', selectTheme);
	}
}

function selectTheme(event: Event): void {
	const selectedTheme = (event.currentTarget as HTMLElement).getAttribute('theme')!;

	// Saves it to browser storage
	preferences.setTheme(selectedTheme);

	updateThemeSelectedStyling();

	// Dispatch a custom event for theme change so that any game code present can pick it up.
	document.dispatchEvent(new Event('theme-change'));
}
/** Outlines in black the current theme selection */
function updateThemeSelectedStyling(): void {
	const selectedTheme = preferences.getTheme();
	for (let i = 0; i < themeList.children.length; i++) {
		const theme = themeList.children[i]!;
		if (theme.getAttribute('theme') === selectedTheme) theme.classList.add('selected');
		else theme.classList.remove('selected');
	}
}

function toggleCoordinates(): void {
	preferences.setCoordinatesEnabled(coordinatesCheckbox.checked);
}

function toggleStarfield(): void {
	preferences.setStarfieldMode(starfieldCheckbox.checked);
}

function toggleAdvancedEffects(): void {
	preferences.setAdvancedEffectsMode(advancedEffectsCheckbox.checked);
}

export default {
	open,
	close,
};
