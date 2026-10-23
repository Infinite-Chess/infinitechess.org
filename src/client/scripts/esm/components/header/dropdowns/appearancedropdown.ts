// src/client/scripts/esm/components/header/dropdowns/appearancedropdown.ts

/**
 * Pick the site's light/dark theme and board colors, choose whether legal
 * moves show as dots or squares, and toggle coordinates, the starfield, and
 * advanced effects.
 *
 * Board color swatches are generated here as checkerboard images, one per theme.
 */

import themes from '../../../../../../shared/components/header/themes.js';

import colorutil from '../../../util/colorutil.js';
import preferences from '../../../util/preferences.js';
import { SettingsBus } from '../../../util/SettingsBus.js';
import checkerboardgenerator from '../../../chess/rendering/checkerboardgenerator.js';

// Types -----------------------------------------------------------------------

/** The site's light/dark color scheme. */
type Theme = 'dark' | 'light';

// Document Elements -----------------------------------------------------------

const appearanceDropdownTitle = document.querySelector('.appearance-dropdown .dropdown-title')!;
const appearanceDropdown = document.querySelector('.appearance-dropdown')!;
const themeToggleContainer = document.querySelector<HTMLElement>('[data-theme-toggle]')!;
const themeIndicator = document.querySelector<HTMLElement>('[data-theme-toggle] .select-value')!;
const legalMoveToggleContainer = document.querySelector<HTMLElement>('[data-legal-move-toggle]')!;
const legalMoveIndicator = document.querySelector<HTMLElement>(
	'[data-legal-move-toggle] .select-value',
)!;
const swatchList = document.querySelector<HTMLElement>('.board-swatches')!;

const coordinatesCheckbox = document.querySelector<HTMLInputElement>(
	'.boolean-option.coordinates input',
)!;
const starfieldCheckbox = document.querySelector<HTMLInputElement>(
	'.boolean-option.starfield input',
)!;
const advancedEffectsCheckbox = document.querySelector<HTMLInputElement>(
	'.boolean-option.advanced-effects input',
)!;

// Constants -------------------------------------------------------------------

/** The key used to store the light/dark theme preference in localStorage. */
const THEME_KEY = 'color-scheme';

const THEME_DARK: Theme = 'dark';
const THEME_LIGHT: Theme = 'light';

// Functions -------------------------------------------------------------------

(function init() {
	showCheckmarkOnSelectedOptions();
	addSwatches();
	swatchList.addEventListener('click', (event) => onSwatchClick(event));
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
		// Notify listeners (e.g. the register page's Turnstile widget) of the light/dark switch.
		SettingsBus.dispatch('color-scheme-change');
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
	SettingsBus.dispatch('legalmove-shape-change');
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

/** Adds a swatch for each board theme, then highlights the selected one. */
async function addSwatches(): Promise<void> {
	for (const [themeName, theme] of Object.entries(themes.THEMES)) {
		const swatch = await checkerboardgenerator.createCheckerboardIMG(
			colorutil.arrayToCssColor(theme.lightTiles),
			colorutil.arrayToCssColor(theme.darkTiles),
		);
		swatch.setAttribute('data-board-color', themeName);
		swatch.setAttribute('draggable', 'false');
		swatchList.appendChild(swatch);
	}

	highlightSelectedSwatch();
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
	// Coordinates toggle
	coordinatesCheckbox.addEventListener('click', toggleCoordinates);
	// Starfield toggle
	starfieldCheckbox.addEventListener('click', toggleStarfield);
	// Advanced Effects toggle
	advancedEffectsCheckbox.addEventListener('click', toggleAdvancedEffects);
}
function closeListeners(): void {
	appearanceDropdownTitle.removeEventListener('click', close);
	// Coordinates toggle
	coordinatesCheckbox.removeEventListener('click', toggleCoordinates);
	// Starfield toggle
	starfieldCheckbox.removeEventListener('click', toggleStarfield);
	// Advanced Effects toggle
	advancedEffectsCheckbox.removeEventListener('click', toggleAdvancedEffects);
}

/** Selects the board color of the swatch clicked, if a swatch was. */
function onSwatchClick(event: MouseEvent): void {
	const swatch = (event.target as Element).closest('[data-board-color]');
	if (!swatch) return; // The gap between swatches
	preferences.setBoardColor(swatch.getAttribute('data-board-color')!);
	highlightSelectedSwatch();
	SettingsBus.dispatch('theme-change');
}

/** Outlines the swatch of the selected board color. */
function highlightSelectedSwatch(): void {
	const selectedBoardColor = preferences.getBoardColor();
	for (const swatch of swatchList.children) {
		const isSelected = swatch.getAttribute('data-board-color') === selectedBoardColor;
		swatch.classList.toggle('selected', isSelected);
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
