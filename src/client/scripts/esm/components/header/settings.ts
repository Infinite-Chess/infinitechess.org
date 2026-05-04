// src/client/scripts/esm/components/header/settings.ts

// This script opens and closes our settings drop-down menu when it is clicked.

import math from '../../../../../shared/util/math/math.js';
import themes from '../../../../../shared/components/header/themes.js';

import style from '../../game/gui/style.js';
import preferences from './preferences.js';
import sounddropdown from './dropdowns/sounddropdown.js';
import languagedropdown from './dropdowns/languagedropdown.js';
import gameplaydropdown from './dropdowns/gameplaydropdown.js';
import legalmovedropdown from './dropdowns/legalmovedropdown.js';
import appearancedropdown from './dropdowns/appearancedropdown.js';
import perspectivedropdown from './dropdowns/perspectivedropdown.js';

import './pingmeter.js'; // Only imported so its code runs

// Document Elements -------------------------------------------------------------------------

// Main settings dropdown
const settings = document.getElementById('settings')!;
const settingsDropdown = document.querySelector('.settings-dropdown')!;

// All buttons to open nested dropdowns
const languageDropdownSelection = document.getElementById('language-settings-dropdown-item')!;
const appearanceDropdownSelection = document.getElementById('appearance-settings-dropdown-item')!;
const legalmoveDropdownSelection = document.getElementById('legalmove-settings-dropdown-item')!;
const mouseDropdownSelection = document.getElementById('perspective-settings-dropdown-item')!;
const gameplayDropdownSelection = document.getElementById('gameplay-settings-dropdown-item')!;
const soundDropdownSelection = document.getElementById('sound-settings-dropdown-item')!;

// All nested dropdowns
const languageDropdown = document.querySelector('.language-dropdown')!;
const appearanceDropdown = document.querySelector('.appearance-dropdown')!;
const legalmoveDropdown = document.querySelector('.legalmove-dropdown')!;
const perspectiveDropdown = document.querySelector('.perspective-dropdown')!;
const gameplayDropdown = document.querySelector('.gameplay-dropdown')!;
const soundDropdown = document.querySelector('.sound-dropdown')!;
const allSettingsDropdownsExceptMainOne = [
	languageDropdown,
	appearanceDropdown,
	legalmoveDropdown,
	perspectiveDropdown,
	gameplayDropdown,
	soundDropdown,
];

// Variables ---------------------------------------------------------------------------------

const allSettingsDropdowns = [...allSettingsDropdownsExceptMainOne, settingsDropdown];
const allBackButtons = document.querySelectorAll<Element>('.dropdown-title');
let settingsIsOpen = settings.classList.contains('open');

// Functions ---------------------------------------------------------------------------------

(function init() {
	settings.addEventListener('click', (event) => {
		if (didEventClickAnyDropdown(event)) return; // We clicked any dropdown, don't toggle it off
		toggleSettingsDropdown();
	});

	// Close the dropdown if clicking outside of it
	document.addEventListener('click', closeSettingsDropdownIfClickedAway);
	document.addEventListener('touchstart', closeSettingsDropdownIfClickedAway);

	updateBackgroundColor();
	document.addEventListener('theme-change', updateBackgroundColor);

	// [DEBUGGING] Instantly open the settings dropdown on page refresh
	// openSettingsDropdown();
})();

function toggleSettingsDropdown(): void {
	if (settingsIsOpen) closeAllSettingsDropdowns();
	else openSettingsDropdown();
}
function openSettingsDropdown(): void {
	// Opens the initial settings dropdown
	settings.classList.add('open');
	settingsDropdown.classList.remove('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	initSettingsListeners();
	settingsIsOpen = true;
}
function closeAllSettingsDropdowns(): void {
	// Closes all dropdowns that may be open
	settings.classList.remove('open');

	settingsDropdown.classList.add('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	closeSettingsListeners();
	preferences.sendPrefsToServer();

	languagedropdown.close();
	appearancedropdown.close();
	legalmovedropdown.close();
	gameplaydropdown.close();
	perspectivedropdown.close();
	sounddropdown.close();

	settingsIsOpen = false;
}

function hideMainSettingsPanel(): void {
	settingsDropdown.classList.add('visibility-hidden');
}
function showMainSettingsPanel(): void {
	settingsDropdown.classList.remove('visibility-hidden');
}

function initSettingsListeners(): void {
	languageDropdownSelection.addEventListener('click', languagedropdown.open);
	languageDropdownSelection.addEventListener('click', hideMainSettingsPanel);
	appearanceDropdownSelection.addEventListener('click', appearancedropdown.open);
	appearanceDropdownSelection.addEventListener('click', hideMainSettingsPanel);
	legalmoveDropdownSelection.addEventListener('click', legalmovedropdown.open);
	legalmoveDropdownSelection.addEventListener('click', hideMainSettingsPanel);
	mouseDropdownSelection.addEventListener('click', perspectivedropdown.open);
	mouseDropdownSelection.addEventListener('click', hideMainSettingsPanel);
	gameplayDropdownSelection.addEventListener('click', gameplaydropdown.open);
	gameplayDropdownSelection.addEventListener('click', hideMainSettingsPanel);
	soundDropdownSelection.addEventListener('click', sounddropdown.open);
	soundDropdownSelection.addEventListener('click', hideMainSettingsPanel);
	allBackButtons.forEach((btn) => btn.addEventListener('click', showMainSettingsPanel));
}
function closeSettingsListeners(): void {
	languageDropdownSelection.removeEventListener('click', languagedropdown.open);
	languageDropdownSelection.removeEventListener('click', hideMainSettingsPanel);
	appearanceDropdownSelection.removeEventListener('click', appearancedropdown.open);
	appearanceDropdownSelection.removeEventListener('click', hideMainSettingsPanel);
	legalmoveDropdownSelection.removeEventListener('click', legalmovedropdown.open);
	legalmoveDropdownSelection.removeEventListener('click', hideMainSettingsPanel);
	mouseDropdownSelection.removeEventListener('click', perspectivedropdown.open);
	mouseDropdownSelection.removeEventListener('click', hideMainSettingsPanel);
	gameplayDropdownSelection.removeEventListener('click', gameplaydropdown.open);
	gameplayDropdownSelection.removeEventListener('click', hideMainSettingsPanel);
	soundDropdownSelection.removeEventListener('click', sounddropdown.open);
	soundDropdownSelection.removeEventListener('click', hideMainSettingsPanel);
	allBackButtons.forEach((btn) => btn.removeEventListener('click', showMainSettingsPanel));
}

function closeSettingsDropdownIfClickedAway(event: MouseEvent | TouchEvent): void {
	// Check if it is actually a Node before using .contains
	if (
		event.target instanceof Node &&
		!settings.contains(event.target) &&
		!didEventClickAnyDropdown(event)
	) {
		closeAllSettingsDropdowns();
	}
}
function didEventClickAnyDropdown(event: MouseEvent | TouchEvent): boolean {
	// Check if the click was outside the dropdown
	let clickedDropdown = false;
	allSettingsDropdowns.forEach((dropdown) => {
		if (event.target instanceof Node && dropdown.contains(event.target)) clickedDropdown = true;
	});
	return clickedDropdown;
}

/** Updates the stylesheet colors --background-theme-color and --switch-on-color based on the current theme. */
function updateBackgroundColor(): void {
	const boardColor = preferences.getBoardColor();
	const lightTiles = themes.getPropertyOfTheme(boardColor, 'lightTiles');
	const darkTiles = themes.getPropertyOfTheme(boardColor, 'darkTiles');

	const AvgR = (lightTiles[0] + darkTiles[0]) / 2;
	const AvgG = (lightTiles[1] + darkTiles[1]) / 2;
	const AvgB = (lightTiles[2] + darkTiles[2]) / 2;

	const switchR = AvgR * 255;
	const switchG = AvgG * 255;
	const switchB = AvgB * 255;

	const cssSwitch = style.rgbToCssString(switchR, switchG, switchB);

	// Also set the --background-theme-color property, which is just a slightly brightened version!
	// The board editor uses this for the background of selected tools.

	// Convert to HSL Color
	const backgroundHSL = style.rgbToHsl(switchR, switchG, switchB);

	// Brighten by 5%
	backgroundHSL.l += 0.05;
	// Min lightness of 0.6 (Prevent dark themes from making accent colors too dark)
	backgroundHSL.l = math.clamp(backgroundHSL.l, 0.6, 1);

	// Create CSS string
	const cssBackground = style.hslToCssString(backgroundHSL);

	// Set CSS properties

	const root = document.documentElement;
	root.style.setProperty('--switch-on-color', cssSwitch);
	root.style.setProperty('--background-theme-color', cssBackground);
}

export default {};
