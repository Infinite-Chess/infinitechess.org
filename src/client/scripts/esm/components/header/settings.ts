// src/client/scripts/esm/components/header/settings.ts

// This script opens and closes our settings drop-down menu when it is clicked.

import math from '../../../../../shared/util/math/math.js';
import themes from '../../../../../shared/components/header/themes.js';

import style from '../../game/gui/style.js';
import preferences from './preferences.js';
import boarddropdown from './dropdowns/boarddropdown.js';
import sounddropdown from './dropdowns/sounddropdown.js';
import languagedropdown from './dropdowns/languagedropdown.js';
import legalmovedropdown from './dropdowns/legalmovedropdown.js';
import selectiondropdown from './dropdowns/selectiondropdown.js';
import perspectivedropdown from './dropdowns/perspectivedropdown.js';

import './pingmeter.js'; // Only imported so its code runs

// Document Elements -------------------------------------------------------------------------

// Main settings dropdown
const settings = document.getElementById('settings')!;
const settingsDropdown = document.querySelector('.settings-dropdown')!;

// All buttons to open nested dropdowns
const languageDropdownSelection = document.getElementById('language-settings-dropdown-item')!;
const boardDropdownSelection = document.getElementById('board-settings-dropdown-item')!;
const legalmoveDropdownSelection = document.getElementById('legalmove-settings-dropdown-item')!;
const mouseDropdownSelection = document.getElementById('perspective-settings-dropdown-item')!;
const selectionDropdownSelection = document.getElementById('selection-settings-dropdown-item')!;
const soundDropdownSelection = document.getElementById('sound-settings-dropdown-item')!;

// All nested dropdowns
const languageDropdown = document.querySelector('.language-dropdown')!;
const boardDropdown = document.querySelector('.board-dropdown')!;
const legalmoveDropdown = document.querySelector('.legalmove-dropdown')!;
const perspectiveDropdown = document.querySelector('.perspective-dropdown')!;
const selectionDropdown = document.querySelector('.selection-dropdown')!;
const soundDropdown = document.querySelector('.sound-dropdown')!;
const allSettingsDropdownsExceptMainOne = [
	languageDropdown,
	boardDropdown,
	legalmoveDropdown,
	perspectiveDropdown,
	selectionDropdown,
	soundDropdown,
];

// Variables ---------------------------------------------------------------------------------

const allSettingsDropdowns = [...allSettingsDropdownsExceptMainOne, settingsDropdown];
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
	closeMainSettingsDropdown();
	closeAllSettingsDropdownsExceptMainOne();
	settingsIsOpen = false;
}
function closeMainSettingsDropdown(): void {
	settingsDropdown.classList.add('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	closeSettingsListeners();
	preferences.sendPrefsToServer();
}
function closeAllSettingsDropdownsExceptMainOne(): void {
	languagedropdown.close();
	boarddropdown.close();
	legalmovedropdown.close();
	selectiondropdown.close();
	perspectivedropdown.close();
	sounddropdown.close();
}

function initSettingsListeners(): void {
	languageDropdownSelection.addEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	languageDropdownSelection.addEventListener('click', languagedropdown.open);
	boardDropdownSelection.addEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	boardDropdownSelection.addEventListener('click', boarddropdown.open);
	legalmoveDropdownSelection.addEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	legalmoveDropdownSelection.addEventListener('click', legalmovedropdown.open);
	mouseDropdownSelection.addEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	mouseDropdownSelection.addEventListener('click', perspectivedropdown.open);
	selectionDropdownSelection.addEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	selectionDropdownSelection.addEventListener('click', selectiondropdown.open);
	soundDropdownSelection.addEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	soundDropdownSelection.addEventListener('click', sounddropdown.open);
}
function closeSettingsListeners(): void {
	languageDropdownSelection.removeEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	languageDropdownSelection.removeEventListener('click', languagedropdown.open);
	boardDropdownSelection.removeEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	boardDropdownSelection.removeEventListener('click', boarddropdown.open);
	legalmoveDropdownSelection.removeEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	legalmoveDropdownSelection.removeEventListener('click', legalmovedropdown.open);
	mouseDropdownSelection.removeEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	mouseDropdownSelection.removeEventListener('click', perspectivedropdown.open);
	selectionDropdownSelection.removeEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	selectionDropdownSelection.removeEventListener('click', selectiondropdown.open);
	soundDropdownSelection.removeEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	soundDropdownSelection.removeEventListener('click', sounddropdown.open);
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
	const theme = preferences.getTheme();
	const lightTiles = themes.getPropertyOfTheme(theme, 'lightTiles');
	const darkTiles = themes.getPropertyOfTheme(theme, 'darkTiles');

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
