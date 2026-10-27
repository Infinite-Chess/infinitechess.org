// src/client/scripts/components/header/dropdowns/perspectivedropdown.ts

/**
 * Adjust the mouse sensitivity and field of view in perspective mode.
 */

import docutil from '../../../util/docutil.js';
import preferences from '../../../util/preferences.js';

// Elements --------------------------------------------------------------------

// The option in the main settings menu
const perspectiveSettingsDropdownItem = document.getElementById(
	'perspective-settings-dropdown-item',
)!;

const perspectiveDropdown = document.querySelector('.perspective-dropdown')!;
const perspectiveDropdownTitle = document.querySelector('.perspective-dropdown .dropdown-title')!;

const mouseSensitivitySlider = document.querySelector<HTMLInputElement>(
	'.perspective-options .mouse-sensitivity .slider',
)!;
/** The text that displays the value */
const mouseSensitivityOutput = document.querySelector(
	'.perspective-options .mouse-sensitivity .value',
)!;

const fovSlider = document.querySelector<HTMLInputElement>('.perspective-options .fov .slider')!;
/** The text that displays the value */
const fovOutput = document.querySelector('.perspective-dropdown .fov .value')!;
const fovResetDefaultContainer = document.querySelector(
	'.perspective-dropdown .fov .reset-default-container',
)!;
const fovResetDefault = document.querySelector('.perspective-dropdown .fov .reset-default')!;

// Functions -------------------------------------------------------------------

(function init() {
	if (!docutil.isMouseSupported()) return; // Perspective mode can't be used on mobile
	perspectiveSettingsDropdownItem.classList.remove('hidden');
	setInitialValues();
})();

/** Update the sliders according to the already existing preferences */
function setInitialValues(): void {
	mouseSensitivitySlider.value = String(preferences.getPerspectiveSensitivity());
	updateMouseSensitivityOutput();

	fovSlider.value = String(preferences.getPerspectiveFOV());
	updateFOVOutput();
}

/** Opens the dropdown. */
function open(): void {
	perspectiveDropdown.classList.remove('hidden');
	initListeners();
}

/** Closes the dropdown. */
function close(): void {
	perspectiveDropdown.classList.add('hidden');
	closeListeners();
}

/** Listens for a click on its title, which closes it, or for a change to an option. */
function initListeners(): void {
	perspectiveDropdownTitle.addEventListener('click', close);
	mouseSensitivitySlider.addEventListener('input', onMouseSensitivityChange);
	fovSlider.addEventListener('input', onFOVChange);
	fovResetDefault.addEventListener('click', resetFOVDefault);
}

/** Removes the listeners {@link initListeners} added. */
function closeListeners(): void {
	perspectiveDropdownTitle.removeEventListener('click', close);
	mouseSensitivitySlider.removeEventListener('input', onMouseSensitivityChange);
	fovSlider.removeEventListener('input', onFOVChange);
	fovResetDefault.removeEventListener('click', resetFOVDefault);
}

/** Applies the mouse sensitivity slider's new value. */
function onMouseSensitivityChange(event: Event): void {
	const value = Number((event.currentTarget as HTMLInputElement).value);
	setMouseSensitivity(value);
}

/** Applies the field of view slider's new value. */
function onFOVChange(event: Event): void {
	const value = Number((event.currentTarget as HTMLInputElement).value);
	setFOV(value);
}

/** Saves the mouse sensitivity, and shows it. */
function setMouseSensitivity(value: number): void {
	preferences.setPerspectiveSensitivity(value);
	updateMouseSensitivityOutput();
}

/** Saves the field of view, and shows it. */
function setFOV(value: number): void {
	preferences.setPerspectiveFOV(value);
	updateFOVOutput();
}

/** Shows the mouse sensitivity slider's value as a percentage. */
function updateMouseSensitivityOutput(): void {
	const value = Number(mouseSensitivitySlider.value);
	mouseSensitivityOutput.textContent = value + '%';
}

/** Shows the field of view slider's value, and whether it can be reset. */
function updateFOVOutput(): void {
	const value = Number(fovSlider.value);
	fovOutput.textContent = String(value);
	updateFOVResetDefaultButton(value);
}

/** Shows the reset button only while the field of view isn't the default. */
function updateFOVResetDefaultButton(value: number): void {
	if (value === preferences.getDefaultPerspectiveFOV())
		fovResetDefaultContainer.classList.add('hidden');
	else fovResetDefaultContainer.classList.remove('hidden');
}

/** Resets the field of view to the default. */
function resetFOVDefault(): void {
	const defaultFOV = preferences.getDefaultPerspectiveFOV();
	fovSlider.value = String(defaultFOV);
	setFOV(defaultFOV);
}

// Exports ---------------------------------------------------------------------

export default {
	open,
	close,
};
