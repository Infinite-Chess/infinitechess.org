// src/client/scripts/components/header/settings.ts

/**
 * Opens and closes the settings drop-down, and routes between it and its
 * sub-dropdowns.
 *
 * Also keeps the --c-board-accent and --c-board-accent-bright stylesheet colors
 * matched to the chosen board theme, which the rest of the site's accents are built from.
 */

import math from '../../../../shared/util/math/math.js';
import themes from '../../../../shared/components/header/themes.js';

import colorutil from '../../util/colorutil.js';
import preferences from '../../util/preferences.js';
import sounddropdown from './dropdowns/sounddropdown.js';
import { SettingsBus } from '../../util/SettingsBus.js';
import languagedropdown from './dropdowns/languagedropdown.js';
import gameplaydropdown from './dropdowns/gameplaydropdown.js';
import appearancedropdown from './dropdowns/appearancedropdown.js';
import perspectivedropdown from './dropdowns/perspectivedropdown.js';

import './pingmeter.js'; // Only imported so its code runs

// Elements --------------------------------------------------------------------

// Main settings dropdown
const settings = document.getElementById('settings')!;
const settingsDropdown = document.querySelector('.settings-dropdown')!;

/** The sub-dropdown panels the settings dropdown navigates into. */
const allSettingsDropdownsExceptMainOne = [
	document.querySelector('.language-dropdown')!,
	document.querySelector('.appearance-dropdown')!,
	document.querySelector('.perspective-dropdown')!,
	document.querySelector('.gameplay-dropdown')!,
	document.querySelector('.sound-dropdown')!,
];
const allSettingsDropdowns = [...allSettingsDropdownsExceptMainOne, settingsDropdown];
const allBackButtons = document.querySelectorAll<Element>('.dropdown-title');

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

// Constants -------------------------------------------------------------------

/** How --c-board-accent-bright is derived from --c-board-accent, in HSL lightness. */
const BRIGHT_ACCENT = {
	/** How much lighter it is. */
	lighten: 0.05,
	/** The lightness it never drops below, so dark themes keep bright accents. */
	minLightness: 0.6,
};

/** Pre-built handlers for opening each sub-dropdown and hiding the main settings panel. */
const OPEN_HANDLERS = subDropdowns.map(({ module }) => () => {
	module.open();
	hideMainSettingsPanel();
});

// State -----------------------------------------------------------------------

let settingsIsOpen = settings.classList.contains('open');

// Functions -------------------------------------------------------------------

(function init() {
	settings.addEventListener('click', (event) => {
		if (didEventClickAnyDropdown(event)) return; // We clicked any dropdown, don't toggle it off
		toggleSettingsDropdown();
	});

	document.addEventListener('click', closeSettingsDropdownIfClickedAway);
	document.addEventListener('touchstart', closeSettingsDropdownIfClickedAway);

	updateBoardAccent();
	SettingsBus.addEventListener('theme-change', updateBoardAccent);
})();

/** Opens the settings dropdown, or closes it and every sub-dropdown if it's open. */
function toggleSettingsDropdown(): void {
	if (settingsIsOpen) closeAllSettingsDropdowns();
	else openSettingsDropdown();
}

/** Opens the main settings dropdown. */
function openSettingsDropdown(): void {
	settings.classList.add('open');
	settingsDropdown.classList.remove('hidden');
	initSettingsListeners();
	settingsIsOpen = true;
}

/** Closes the main settings dropdown and every sub-dropdown. */
function closeAllSettingsDropdowns(): void {
	settings.classList.remove('open');

	settingsDropdown.classList.add('hidden');
	closeSettingsListeners();

	subDropdowns.forEach(({ module }) => module.close());

	settingsIsOpen = false;
}

/** Hides the main panel, as a sub-dropdown opens in its place. */
function hideMainSettingsPanel(): void {
	settingsDropdown.classList.add('hidden');
}

/** Shows the main panel again, as a sub-dropdown's back button is clicked. */
function showMainSettingsPanel(): void {
	settingsDropdown.classList.remove('hidden');
}

/** Listens for the navigation items opening their sub-dropdowns, and the back buttons. */
function initSettingsListeners(): void {
	subDropdowns.forEach(({ selection }, i) =>
		selection.addEventListener('click', OPEN_HANDLERS[i]!),
	);
	allBackButtons.forEach((btn) => btn.addEventListener('click', showMainSettingsPanel));
}

/** Removes the listeners {@link initSettingsListeners} added. */
function closeSettingsListeners(): void {
	subDropdowns.forEach(({ selection }, i) =>
		selection.removeEventListener('click', OPEN_HANDLERS[i]!),
	);
	allBackButtons.forEach((btn) => btn.removeEventListener('click', showMainSettingsPanel));
}

/** Closes every settings dropdown when a click or touch lands outside all of them. */
function closeSettingsDropdownIfClickedAway(event: MouseEvent | TouchEvent): void {
	if (
		event.target instanceof Node &&
		!settings.contains(event.target) &&
		!didEventClickAnyDropdown(event)
	) {
		closeAllSettingsDropdowns();
	}
}

/** Whether the event landed inside any settings dropdown, main or sub. */
function didEventClickAnyDropdown(event: MouseEvent | TouchEvent): boolean {
	const target = event.target;
	if (!(target instanceof Node)) return false;
	return allSettingsDropdowns.some((dropdown) => dropdown.contains(target));
}

/** Matches --c-board-accent and --c-board-accent-bright to the current board theme. */
function updateBoardAccent(): void {
	const boardColor = preferences.getBoardColor();
	const lightTiles = themes.getPropertyOfTheme(boardColor, 'lightTiles');
	const darkTiles = themes.getPropertyOfTheme(boardColor, 'darkTiles');

	const AvgR = (lightTiles[0] + darkTiles[0]) / 2;
	const AvgG = (lightTiles[1] + darkTiles[1]) / 2;
	const AvgB = (lightTiles[2] + darkTiles[2]) / 2;

	const switchR = AvgR * 255;
	const switchG = AvgG * 255;
	const switchB = AvgB * 255;

	const cssSwitch = colorutil.rgbToCssString(switchR, switchG, switchB);

	// The board editor uses the bright one for the background of selected tools.
	const backgroundHSL = colorutil.rgbToHsl(switchR, switchG, switchB);
	backgroundHSL.l = math.clamp(
		backgroundHSL.l + BRIGHT_ACCENT.lighten,
		BRIGHT_ACCENT.minLightness,
		1,
	);
	const cssBackground = colorutil.hslToCssString(backgroundHSL);

	const root = document.documentElement;
	root.style.setProperty('--c-board-accent', cssSwitch);
	root.style.setProperty('--c-board-accent-bright', cssBackground);
}
