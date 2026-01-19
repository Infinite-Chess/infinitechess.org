// This script allows us to enable or disable premoves and dragging pieces

import preferences from '../preferences.js';

// Document Elements -------------------------------------------------------------------------

const settingsDropdown = document.querySelector('.settings-dropdown')!;

const selectionDropdown = document.querySelector('.selection-dropdown')!;
const selectionDropdownTitle = document.querySelector('.selection-dropdown .dropdown-title')!;

const dragCheckbox = document.querySelector('.boolean-option.drag input') as HTMLInputElement;
const premoveCheckbox = document.querySelector('.boolean-option.premove input') as HTMLInputElement;
const animationsCheckbox = document.querySelector(
	'.boolean-option.animations input',
) as HTMLInputElement;
const lingeringAnnotationsCheckbox = document.querySelector(
	'.boolean-option.lingering-annotations input',
) as HTMLInputElement;

// Functions ---------------------------------------------------------------------------------

(function init() {
	showCheckmarkOnSelectedOptions();
})();

function showCheckmarkOnSelectedOptions(): void {
	dragCheckbox.checked = preferences.getDragEnabled();
	premoveCheckbox.checked = preferences.getPremoveEnabled();
	animationsCheckbox.checked = preferences.getAnimationsMode();
	lingeringAnnotationsCheckbox.checked = preferences.getLingeringAnnotationsMode();
}

function open(): void {
	selectionDropdown.classList.remove('visibility-hidden');
	initListeners();
	settingsDropdown.classList.add('transparent');
}
function close(): void {
	selectionDropdown.classList.add('visibility-hidden');
	closeListeners();
	settingsDropdown.classList.remove('transparent');
}

function initListeners(): void {
	selectionDropdownTitle.addEventListener('click', close);
	dragCheckbox.addEventListener('click', toggleDrag);
	premoveCheckbox.addEventListener('click', togglePremove);
	animationsCheckbox.addEventListener('click', toggleAnimations);
	lingeringAnnotationsCheckbox.addEventListener('click', toggleLingeringAnnotations);
}
function closeListeners(): void {
	selectionDropdownTitle.removeEventListener('click', close);
	dragCheckbox.removeEventListener('click', toggleDrag);
	premoveCheckbox.removeEventListener('click', togglePremove);
	animationsCheckbox.removeEventListener('click', toggleAnimations);
	lingeringAnnotationsCheckbox.removeEventListener('click', toggleLingeringAnnotations);
}

function toggleDrag(): void {
	preferences.setDragEnabled(dragCheckbox.checked);
}
function togglePremove(): void {
	preferences.setPremoveMode(premoveCheckbox.checked);
}
function toggleAnimations(): void {
	preferences.setAnimationsMode(animationsCheckbox.checked);
}
function toggleLingeringAnnotations(): void {
	preferences.setLingeringAnnotationsMode(lingeringAnnotationsCheckbox.checked);
}

export default {
	initListeners,
	closeListeners,
	close,
	open,
};
