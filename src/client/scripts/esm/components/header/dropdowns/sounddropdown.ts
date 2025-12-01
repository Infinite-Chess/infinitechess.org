// This script manages the sound settings dropdown

import preferences from '../preferences.js';

// Document Elements -------------------------------------------------------------------------

const settingsDropdown = document.querySelector('.settings-dropdown') as HTMLElement;

const soundDropdown = document.querySelector('.sound-dropdown') as HTMLElement;
const soundDropdownTitle = document.querySelector('.sound-dropdown .dropdown-title') as HTMLElement;

const masterVolumeSlider = document.querySelector(
	'.sound-options .master-volume .slider',
) as HTMLInputElement;
/** The text that displays the value */
const masterVolumeOutput = document.querySelector(
	'.sound-options .master-volume .value',
) as HTMLElement;

const ambienceCheckbox = document.querySelector(
	'.boolean-option.ambience input',
) as HTMLInputElement;

// Functions ---------------------------------------------------------------------------------

(function init(): void {
	setInitialValues();
})();

/** Update the sliders and checkboxes according to the already existing preferences */
function setInitialValues(): void {
	masterVolumeSlider.value = String(preferences.getMasterVolume() * 100); // Preferences stores a value from 0 to 1
	updateMasterVolumeOutput();

	ambienceCheckbox.checked = preferences.getAmbienceEnabled();
}

function open(): void {
	soundDropdown.classList.remove('visibility-hidden');
	initListeners();
	settingsDropdown.classList.add('transparent');
}
function close(): void {
	soundDropdown.classList.add('visibility-hidden');
	closeListeners();
	settingsDropdown.classList.remove('transparent');
}

function initListeners(): void {
	soundDropdownTitle.addEventListener('click', close);
	masterVolumeSlider.addEventListener('input', onMasterVolumeChange);
	ambienceCheckbox.addEventListener('click', toggleAmbience);
}
function closeListeners(): void {
	soundDropdownTitle.removeEventListener('click', close);
	masterVolumeSlider.removeEventListener('input', onMasterVolumeChange);
	ambienceCheckbox.removeEventListener('click', toggleAmbience);
}

function onMasterVolumeChange(event: Event): void {
	const value = Number((event.currentTarget as HTMLInputElement).value);
	preferences.setMasterVolume(value / 100); // Preferences expects a value from 0 to 1
	updateMasterVolumeOutput();
}

function toggleAmbience(): void {
	preferences.setAmbienceEnabled(ambienceCheckbox.checked);
}

function updateMasterVolumeOutput(): void {
	const value = Number(masterVolumeSlider.value);
	masterVolumeOutput.textContent = value + '%';
}

export default {
	initListeners,
	closeListeners,
	close,
	open,
};
