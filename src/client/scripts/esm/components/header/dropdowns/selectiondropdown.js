
// This script allows us to enable or disable premoves and dragging pieces

import preferences from "../preferences.js";
import themes from "../../../../../../shared/components/header/themes.js";

// Document Elements -------------------------------------------------------------------------

const settingsDropdown = document.querySelector('.settings-dropdown');

const selectionDropdown = document.querySelector('.selection-dropdown');
const selectionDropdownTitle = document.querySelector('.selection-dropdown .dropdown-title');

const dragCheckbox = document.querySelector('.boolean-option.drag input');
const premoveCheckbox = document.querySelector('.boolean-option.premove input');
const animationsCheckbox = document.querySelector('.boolean-option.animations input');
const lingeringAnnotationsCheckbox = document.querySelector('.boolean-option.lingering-annotations input');

// Functions ---------------------------------------------------------------------------------

(function init() {

	showCheckmarkOnSelectedOptions();

})();

function showCheckmarkOnSelectedOptions() {
	dragCheckbox.checked = preferences.getDragEnabled();
	premoveCheckbox.checked = preferences.getPremoveEnabled();
	animationsCheckbox.checked = preferences.getAnimationsMode();
	lingeringAnnotationsCheckbox.checked = preferences.getLingeringAnnotationsMode();
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
	lingeringAnnotationsCheckbox.addEventListener('click', toggleLingeringAnnotations);
}
function closeListeners() {
	selectionDropdownTitle.removeEventListener('click', close);
	dragCheckbox.removeEventListener("click", toggleDrag);
	premoveCheckbox.removeEventListener("click", togglePremove);
	animationsCheckbox.removeEventListener('click', toggleAnimations);
	lingeringAnnotationsCheckbox.removeEventListener('click', toggleLingeringAnnotations);
}

function toggleDrag() {
	preferences.setDragEnabled(dragCheckbox.checked);
}
function togglePremove() {
	preferences.setPremoveMode(premoveCheckbox.checked);
}
function toggleAnimations() {
	preferences.setAnimationsMode(animationsCheckbox.checked);
}
function toggleLingeringAnnotations() {
	preferences.setLingeringAnnotationsMode(lingeringAnnotationsCheckbox.checked);
}

export default {
	initListeners,
	closeListeners,
	close,
	open,
};