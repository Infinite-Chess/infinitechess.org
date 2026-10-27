// src/client/scripts/components/header/dropdowns/sounddropdown.ts

/**
 * Set the master volume and turn zone ambience on or off.
 */

import preferences from '../../../util/preferences.js';

// Elements --------------------------------------------------------------------

const soundDropdown = document.querySelector('.sound-dropdown')!;
const soundDropdownTitle = document.querySelector('.sound-dropdown .dropdown-title')!;

const masterVolumeSlider = document.querySelector<HTMLInputElement>(
	'.sound-options .master-volume .slider',
)!;
/** The text that displays the value */
const masterVolumeOutput = document.querySelector('.sound-options .master-volume .value')!;

const ambienceCheckbox = document.querySelector<HTMLInputElement>(
	'.boolean-option.ambience input',
)!;

// Functions -------------------------------------------------------------------

(function init() {
	setInitialValues();
})();

/** Update the sliders and checkboxes according to the already existing preferences */
function setInitialValues(): void {
	masterVolumeSlider.value = String(preferences.getMasterVolume() * 100); // Preferences stores a value from 0 to 1
	updateMasterVolumeOutput();

	ambienceCheckbox.checked = preferences.getAmbienceEnabled();
}

/** Opens the dropdown. */
function open(): void {
	soundDropdown.classList.remove('hidden');
	initListeners();
}

/** Closes the dropdown. */
function close(): void {
	soundDropdown.classList.add('hidden');
	closeListeners();
}

/** Listens for a click on its title, which closes it, or for a change to an option. */
function initListeners(): void {
	soundDropdownTitle.addEventListener('click', close);
	masterVolumeSlider.addEventListener('input', onMasterVolumeChange);
	ambienceCheckbox.addEventListener('click', toggleAmbience);
}

/** Removes the listeners {@link initListeners} added. */
function closeListeners(): void {
	soundDropdownTitle.removeEventListener('click', close);
	masterVolumeSlider.removeEventListener('input', onMasterVolumeChange);
	ambienceCheckbox.removeEventListener('click', toggleAmbience);
}

/** Saves the master volume slider's new value, and shows it. */
function onMasterVolumeChange(event: Event): void {
	const value = Number((event.currentTarget as HTMLInputElement).value);
	preferences.setMasterVolume(value / 100); // Preferences expects a value from 0 to 1
	updateMasterVolumeOutput();
}

/** Saves the ambience option as its checkbox now reads. */
function toggleAmbience(): void {
	preferences.setAmbienceEnabled(ambienceCheckbox.checked);
}

/** Shows the master volume slider's value as a percentage. */
function updateMasterVolumeOutput(): void {
	const value = Number(masterVolumeSlider.value);
	masterVolumeOutput.textContent = value + '%';
}

// Exports ---------------------------------------------------------------------

export default {
	open,
	close,
};
