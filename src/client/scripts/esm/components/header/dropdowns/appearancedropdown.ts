// src/client/scripts/esm/components/header/dropdowns/appearancedropdown.ts

import themes from '../../../../../../shared/components/header/themes.js';

import style from '../../../game/gui/style.js';
import preferences from '../preferences.js';
import checkerboardgenerator from '../../../chess/rendering/checkerboardgenerator.js';

// Document Elements -------------------------------------------------------------------------

const appearanceDropdownTitle = document.querySelector('.appearance-dropdown .dropdown-title')!;
const appearanceDropdown = document.querySelector('.appearance-dropdown')!;
const themeToggleContainer = document.querySelector<HTMLElement>('[data-theme-toggle]')!;
const themeIndicator = document.querySelector<HTMLElement>('[data-theme-toggle] .select-value')!;
const legalMoveToggleContainer = document.querySelector<HTMLElement>('[data-legal-move-toggle]')!;
const legalMoveIndicator = document.querySelector<HTMLElement>(
	'[data-legal-move-toggle] .select-value',
)!;
const boardColorList = document.querySelector('.board-color-list')!; // Get the board color list div

const coordinatesCheckbox = document.querySelector<HTMLInputElement>(
	'.boolean-option.coordinates input',
)!;
const starfieldCheckbox = document.querySelector<HTMLInputElement>(
	'.boolean-option.starfield input',
)!;
const advancedEffectsCheckbox = document.querySelector<HTMLInputElement>(
	'.boolean-option.advanced-effects input',
)!;

// Constants ---------------------------------------------------------------------------------

/** The key used to store the light/dark theme preference in localStorage. */
const THEME_KEY = 'color-scheme';

const THEME_DARK = 'dark';
const THEME_LIGHT = 'light';

// Types -------------------------------------------------------------------------------------

type Theme = typeof THEME_DARK | typeof THEME_LIGHT;

// Functions ---------------------------------------------------------------------------------

(function init() {
	showCheckmarkOnSelectedOptions();
	addBoardThemesToDropdown();
	initThemeToggle();
	initLegalMoveToggle();
})();

function initThemeToggle(): void {
	const td = t.header.settings.appearance_dropdown;
	themeIndicator.textContent = getCurrentTheme() === THEME_DARK ? td.theme_dark : td.theme_light;
	themeToggleContainer.addEventListener('click', () => {
		const next: Theme = getCurrentTheme() === THEME_DARK ? THEME_LIGHT : THEME_DARK;
		document.documentElement.setAttribute('data-theme', next);
		localStorage.setItem(THEME_KEY, next);
		themeIndicator.textContent = next === THEME_DARK ? td.theme_dark : td.theme_light;
	});
}

function initLegalMoveToggle(): void {
	const td = t.header.settings.appearance_dropdown;
	legalMoveIndicator.textContent =
		preferences.getLegalMovesShape() === 'squares'
			? td.legal_moves_squares
			: td.legal_moves_dots;
	legalMoveToggleContainer.addEventListener('click', toggleLegalMoveShape);
}

function toggleLegalMoveShape(): void {
	const td = t.header.settings.appearance_dropdown;
	const next = preferences.getLegalMovesShape() === 'squares' ? 'dots' : 'squares';
	preferences.setLegalMovesShape(next);
	legalMoveIndicator.textContent =
		next === 'squares' ? td.legal_moves_squares : td.legal_moves_dots;
	document.dispatchEvent(new CustomEvent('legalmove-shape-change'));
}

function getCurrentTheme(): Theme {
	const attr = document.documentElement.getAttribute('data-theme');
	return attr === THEME_LIGHT ? THEME_LIGHT : THEME_DARK;
}

function showCheckmarkOnSelectedOptions(): void {
	coordinatesCheckbox.checked = preferences.getCoordinatesEnabled();
	starfieldCheckbox.checked = preferences.getStarfieldMode();
	advancedEffectsCheckbox.checked = preferences.getAdvancedEffectsMode();
}

async function addBoardThemesToDropdown(): Promise<void> {
	const themeDictionary = themes.themes;

	// Loop through each theme in the dictionary
	for (const themeName in themeDictionary) {
		const theme = themeDictionary[themeName]!;
		const lightTiles = theme.lightTiles;
		const darkTiles = theme.darkTiles;

		// Create the checkerboard image for the board theme
		const checkerboardImage = await checkerboardgenerator.createCheckerboardIMG(
			style.arrayToCssColor(lightTiles), // Convert to CSS color format
			style.arrayToCssColor(darkTiles), // Convert to CSS color format
			2, // Width
		);
		checkerboardImage.setAttribute('data-board-color', themeName);
		checkerboardImage.setAttribute('draggable', 'false');

		// Append the image to the board color list div
		boardColorList.appendChild(checkerboardImage);
	}

	updateBoardColorSelection();
}

function open(): void {
	appearanceDropdown.classList.remove('hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	initListeners();
}
function close(): void {
	appearanceDropdown.classList.add('hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	closeListeners();
}

function initListeners(): void {
	appearanceDropdownTitle.addEventListener('click', close);
	initBoardColorListeners();
	// Coordinates toggle
	coordinatesCheckbox.addEventListener('click', toggleCoordinates);
	// Starfield toggle
	starfieldCheckbox.addEventListener('click', toggleStarfield);
	// Advanced Effects toggle
	advancedEffectsCheckbox.addEventListener('click', toggleAdvancedEffects);
}
function closeListeners(): void {
	appearanceDropdownTitle.removeEventListener('click', close);
	closeBoardColorListeners();
	// Coordinates toggle
	coordinatesCheckbox.removeEventListener('click', toggleCoordinates);
	// Starfield toggle
	starfieldCheckbox.removeEventListener('click', toggleStarfield);
	// Advanced Effects toggle
	advancedEffectsCheckbox.removeEventListener('click', toggleAdvancedEffects);
}
function initBoardColorListeners(): void {
	for (let i = 0; i < boardColorList.children.length; i++) {
		const boardColorImg = boardColorList.children[i]!;
		boardColorImg.addEventListener('click', selectBoardColor);
	}
}
function closeBoardColorListeners(): void {
	for (let i = 0; i < boardColorList.children.length; i++) {
		const boardColorImg = boardColorList.children[i]!;
		boardColorImg.removeEventListener('click', selectBoardColor);
	}
}

function selectBoardColor(event: Event): void {
	const selectedBoardColor = (event.currentTarget as HTMLElement).getAttribute(
		'data-board-color',
	)!;

	// Saves it to browser storage
	preferences.setBoardColor(selectedBoardColor);

	updateBoardColorSelection();

	// Dispatch a custom event for theme change so that any game code present can pick it up.
	document.dispatchEvent(new Event('theme-change'));
}
/** Outlines the current board color selection */
function updateBoardColorSelection(): void {
	const selectedBoardColor = preferences.getBoardColor();
	for (let i = 0; i < boardColorList.children.length; i++) {
		const boardColorImg = boardColorList.children[i]!;
		if (boardColorImg.getAttribute('data-board-color') === selectedBoardColor)
			boardColorImg.classList.add('selected');
		else boardColorImg.classList.remove('selected');
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
