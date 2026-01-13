import preferences from '../preferences.js';
import checkerboardgenerator from '../../../chess/rendering/checkerboardgenerator.js';
import themes from '../../../../../../shared/components/header/themes.js';
// @ts-ignore
import style from '../../../game/gui/style.js';

// Document Elements -------------------------------------------------------------------------

const boardDropdownTitle = document.querySelector('.board-dropdown .dropdown-title')!;
const boardDropdown = document.querySelector('.board-dropdown')!;
const themeList = document.querySelector('.theme-list')!; // Get the theme list div

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
	boardDropdown.classList.remove('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	initListeners();
}
function close(): void {
	boardDropdown.classList.add('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	closeListeners();
}

function initListeners(): void {
	boardDropdownTitle.addEventListener('click', close);
	initThemeChangeListeners();
	// Starfield toggle
	starfieldCheckbox.addEventListener('click', toggleStarfield);
	// Advanced Effects toggle
	advancedEffectsCheckbox.addEventListener('click', toggleAdvancedEffects);
}
function closeListeners(): void {
	boardDropdownTitle.removeEventListener('click', close);
	closeThemeChangeListeners();
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
