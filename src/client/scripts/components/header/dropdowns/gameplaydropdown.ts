// src/client/scripts/components/header/dropdowns/gameplaydropdown.ts

/**
 * Toggle dragging pieces, premoves, animations, fast transitions, and lingering annotations.
 */

import preferences from '../../../util/preferences.js';

// Elements --------------------------------------------------------------------

const gameplayDropdown = document.querySelector('.gameplay-dropdown')!;
const gameplayDropdownTitle = document.querySelector('.gameplay-dropdown .dropdown-title')!;

const dragCheckbox = document.querySelector<HTMLInputElement>('.boolean-option.drag input')!;
const premoveCheckbox = document.querySelector<HTMLInputElement>('.boolean-option.premove input')!;
const animationsCheckbox = document.querySelector<HTMLInputElement>(
	'.boolean-option.animations input',
)!;
const fastTransitionsCheckbox = document.querySelector<HTMLInputElement>(
	'.boolean-option.fast-transitions input',
)!;
const lingeringAnnotationsCheckbox = document.querySelector<HTMLInputElement>(
	'.boolean-option.lingering-annotations input',
)!;

// Functions -------------------------------------------------------------------

(function init() {
	showCheckmarkOnSelectedOptions();
})();

/** Checks the boxes of the options currently enabled. */
function showCheckmarkOnSelectedOptions(): void {
	dragCheckbox.checked = preferences.getDragEnabled();
	premoveCheckbox.checked = preferences.getPremoveEnabled();
	animationsCheckbox.checked = preferences.getAnimationsMode();
	fastTransitionsCheckbox.checked = preferences.getFastTransitionsMode();
	lingeringAnnotationsCheckbox.checked = preferences.getLingeringAnnotationsMode();
}

/** Opens the dropdown. */
function open(): void {
	gameplayDropdown.classList.remove('hidden');
	initListeners();
}

/** Closes the dropdown. */
function close(): void {
	gameplayDropdown.classList.add('hidden');
	closeListeners();
}

/** Listens for a click on its title, which closes it, or on an option. */
function initListeners(): void {
	gameplayDropdownTitle.addEventListener('click', close);
	dragCheckbox.addEventListener('click', toggleDrag);
	premoveCheckbox.addEventListener('click', togglePremove);
	animationsCheckbox.addEventListener('click', toggleAnimations);
	fastTransitionsCheckbox.addEventListener('click', toggleFastTransitions);
	lingeringAnnotationsCheckbox.addEventListener('click', toggleLingeringAnnotations);
}

/** Removes the listeners {@link initListeners} added. */
function closeListeners(): void {
	gameplayDropdownTitle.removeEventListener('click', close);
	dragCheckbox.removeEventListener('click', toggleDrag);
	premoveCheckbox.removeEventListener('click', togglePremove);
	animationsCheckbox.removeEventListener('click', toggleAnimations);
	fastTransitionsCheckbox.removeEventListener('click', toggleFastTransitions);
	lingeringAnnotationsCheckbox.removeEventListener('click', toggleLingeringAnnotations);
}

/** Saves the dragging option as its checkbox now reads. */
function toggleDrag(): void {
	preferences.setDragEnabled(dragCheckbox.checked);
}

/** Saves the premove option as its checkbox now reads. */
function togglePremove(): void {
	preferences.setPremoveMode(premoveCheckbox.checked);
}

/** Saves the animations option as its checkbox now reads. */
function toggleAnimations(): void {
	preferences.setAnimationsMode(animationsCheckbox.checked);
}

/** Saves the fast transitions option as its checkbox now reads. */
function toggleFastTransitions(): void {
	preferences.setFastTransitionsMode(fastTransitionsCheckbox.checked);
}

/** Saves the lingering annotations option as its checkbox now reads. */
function toggleLingeringAnnotations(): void {
	preferences.setLingeringAnnotationsMode(lingeringAnnotationsCheckbox.checked);
}

// Exports ---------------------------------------------------------------------

export default {
	open,
	close,
};
