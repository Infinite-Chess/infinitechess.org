// src/client/scripts/esm/components/header/settings.ts

// This script opens and closes our settings drop-down menu when it is clicked.

import math from '../../../../../shared/util/math/math.js';
import themes from '../../../../../shared/components/header/themes.js';

import style from '../../game/gui/style.js';
import preferences from './preferences.js';
import sounddropdown from './dropdowns/sounddropdown.js';
import languagedropdown from './dropdowns/languagedropdown.js';
import gameplaydropdown from './dropdowns/gameplaydropdown.js';
import appearancedropdown from './dropdowns/appearancedropdown.js';
import perspectivedropdown from './dropdowns/perspectivedropdown.js';

import './pingmeter.js'; // Only imported so its code runs

// Document Elements -------------------------------------------------------------------------

// Main settings dropdown
const settings = document.getElementById('settings')!;
const settingsDropdown = document.querySelector('.settings-dropdown')!;

// Each sub-dropdown's navigation item paired with its module, for listener registration
const subDropdowns: { selection: Element; module: { open(): void; close(): void } }[] = [
	{
		selection: document.getElementById('language-settings-dropdown-item')!,
		module: languagedropdown,
	},
	{
		selection: document.getElementById('appearance-settings-dropdown-item')!,
		module: appearancedropdown,
	},
	{
		selection: document.getElementById('perspective-settings-dropdown-item')!,
		module: perspectivedropdown,
	},
	{
		selection: document.getElementById('gameplay-settings-dropdown-item')!,
		module: gameplaydropdown,
	},
	{ selection: document.getElementById('sound-settings-dropdown-item')!, module: sounddropdown },
];

const allSettingsDropdownsExceptMainOne = [
	document.querySelector('.language-dropdown')!,
	document.querySelector('.appearance-dropdown')!,
	document.querySelector('.perspective-dropdown')!,
	document.querySelector('.gameplay-dropdown')!,
	document.querySelector('.sound-dropdown')!,
];

// Variables ---------------------------------------------------------------------------------

const allSettingsDropdowns = [...allSettingsDropdownsExceptMainOne, settingsDropdown];
const allBackButtons = document.querySelectorAll<Element>('.dropdown-title');
let settingsIsOpen = settings.classList.contains('open');

/** Pre-built handlers for opening each sub-dropdown and hiding the main settings panel. */
const openHandlers = subDropdowns.map(({ module }) => () => {
	module.open();
	hideMainSettingsPanel();
});

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
	settingsDropdown.classList.remove('hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	initSettingsListeners();
	settingsIsOpen = true;
}
function closeAllSettingsDropdowns(): void {
	// Closes all dropdowns that may be open
	settings.classList.remove('open');

	settingsDropdown.classList.add('hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	closeSettingsListeners();
	preferences.sendPrefsToServer();

	subDropdowns.forEach(({ module }) => module.close());

	settingsIsOpen = false;
}

function hideMainSettingsPanel(): void {
	settingsDropdown.classList.add('hidden');
}
function showMainSettingsPanel(): void {
	settingsDropdown.classList.remove('hidden');
}

function initSettingsListeners(): void {
	subDropdowns.forEach(({ selection }, i) =>
		selection.addEventListener('click', openHandlers[i]!),
	);
	allBackButtons.forEach((btn) => btn.addEventListener('click', showMainSettingsPanel));
}
function closeSettingsListeners(): void {
	subDropdowns.forEach(({ selection }, i) =>
		selection.removeEventListener('click', openHandlers[i]!),
	);
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

/** Updates the stylesheet colors --c-tile and --c-tile-2 based on the current theme. */
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

	// Also set the --c-tile-2 property, which is just a slightly brightened version!
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
	root.style.setProperty('--c-tile', cssSwitch);
	root.style.setProperty('--c-tile-2', cssBackground);
}

export default {};
