
// This script allows us to enable or disable premoves and dragging pieces

import preferences from "../preferences.js";
import themes from "../themes.js";

// Document Elements -------------------------------------------------------------------------

const settingsDropdown = document.querySelector('.settings-dropdown');

const selectionDropdown = document.querySelector('.selection-dropdown');
const selectionDropdownTitle = document.querySelector('.selection-dropdown .dropdown-title');

const dragCheckbox = document.querySelector('.selection-option.drag input');
const premoveCheckbox = document.querySelector('.selection-option.premove input');
const animationsCheckbox = document.querySelector('.selection-option.animations input');

// Functions ---------------------------------------------------------------------------------

(function init() {

	showCheckmarkOnSelectedOptions();
	updateSwitchColor();
	document.addEventListener('theme-change', updateSwitchColor);

})();

function showCheckmarkOnSelectedOptions() {
	dragCheckbox.checked = preferences.getDragEnabled();
	premoveCheckbox.checked = preferences.getPremoveMode();
	animationsCheckbox.checked = preferences.getAnimationsMode();
}

function open() {
	selectionDropdown.classList.remove('visibility-hidden');
	initListeners();
	settingsDropdown.classList.add('transparent');
}
function close() {
	selectionDropdown.classList.add('visibility-hidden');
	closeListeners();
	settingsDropdown.classList.remove('transparent');
}

function initListeners() {
	selectionDropdownTitle.addEventListener('click', close);
	dragCheckbox.addEventListener("click", toggleDrag);
	premoveCheckbox.addEventListener("click", togglePremove);
	animationsCheckbox.addEventListener('click', toggleAnimations);
}
function closeListeners() {
	selectionDropdownTitle.removeEventListener('click', close);
	dragCheckbox.removeEventListener("click", toggleDrag);
	premoveCheckbox.removeEventListener("click", togglePremove);
	animationsCheckbox.removeEventListener('click', toggleAnimations);
}

function toggleDrag() {
	preferences.setDragEnabled(dragCheckbox.checked);
}
function togglePremove() {
	//preferences.setPremoveMode(premoveCheckbox.checked);
}
function toggleAnimations() {
	preferences.setAnimationsMode(animationsCheckbox.checked);
}

function updateSwitchColor() {
	const theme = preferences.getTheme();
	const lightTiles = themes.getPropertyOfTheme(theme, "lightTiles");
	const darkTiles = themes.getPropertyOfTheme(theme, "darkTiles");
	
	const AvgR = (lightTiles[0] + darkTiles[0]) / 2;
	const AvgG = (lightTiles[1] + darkTiles[1]) / 2;
	const AvgB = (lightTiles[2] + darkTiles[2]) / 2;
	
	const css = `rgb(${AvgR * 255}, ${AvgG * 255}, ${AvgB * 255})`;
	const root = document.documentElement;
	root.style.setProperty('--switch-on-color', css);
}

export default {
	initListeners,
	closeListeners,
	close,
	open,
};