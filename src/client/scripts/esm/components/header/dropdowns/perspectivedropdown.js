
// This script allows us to adjust the mouse sensitivity in perspective mode

import docutil from "../../../util/docutil.js";
import preferences from "../preferences.js";

// Document Elements -------------------------------------------------------------------------

const settingsDropdown = document.querySelector('.settings-dropdown');

// The option in the main settings menu
const perspectiveSettingsDropdownItem = document.getElementById('perspective-settings-dropdown-item');

const perspectiveDropdown = document.querySelector('.perspective-dropdown');
const perspectiveDropdownTitle = document.querySelector('.perspective-dropdown .dropdown-title');

const mouseSensitivitySlider = document.querySelector('.perspective-options .mouse-sensitivity .slider');
/** The text that displays the value */
const mouseSensitivityOutput = document.querySelector('.perspective-options .mouse-sensitivity .value');

const fovSlider = document.querySelector('.perspective-dropdown .fov .slider');
/** The text that displays the value */
const fovOutput = document.querySelector('.perspective-dropdown .fov .value');
const fovResetDefaultContainer = document.querySelector('.perspective-dropdown .fov .reset-default-container');
const fovResetDefault = document.querySelector('.perspective-dropdown .fov .reset-default');



// Functions ---------------------------------------------------------------------------------



(function init() {

	if (docutil.isMouseSupported()) perspectiveSettingsDropdownItem.classList.remove('hidden'); // Enable (perspective mode can't be used on mobile)
	else return;

	setInitialValues();

})();


/** Update the sliders according to the already existing preferences */
function setInitialValues() {
	mouseSensitivitySlider.value = preferences.getPerspectiveSensitivity();
	updateMouseSensitivityOutput();

	fovSlider.value = preferences.getPerspectiveFOV();
	updateFOVOutput();
}



function open() {
	perspectiveDropdown.classList.remove('visibility-hidden');
	initListeners();
	settingsDropdown.classList.add('transparent');
}
function close() {
	perspectiveDropdown.classList.add('visibility-hidden');
	closeListeners();
	settingsDropdown.classList.remove('transparent');
}


function initListeners() {
	perspectiveDropdownTitle.addEventListener('click', close);
	mouseSensitivitySlider.addEventListener('input', onMouseSensitivityChange);
	fovSlider.addEventListener('input', onFOVChange);
	fovResetDefault.addEventListener('click', resetFOVDefault);
}
function closeListeners() {
	perspectiveDropdownTitle.removeEventListener('click', close);
	mouseSensitivitySlider.removeEventListener('input', onMouseSensitivityChange);
	fovSlider.removeEventListener('input', onFOVChange);
	fovResetDefault.removeEventListener('click', resetFOVDefault);
}



function onMouseSensitivityChange(event) {
	const value = Number(event.currentTarget.value);
	// console.log(`Mouse sensitivity changed: ${value}`);
	setMouseSensitivity(value);
}
function onFOVChange(event) {
	const value = Number(event.currentTarget.value);
	// console.log(`FOV changed: ${value}`);
	setFOV(value);
}


function setMouseSensitivity(value) {
	preferences.setPerspectiveSensitivity(value);
	updateMouseSensitivityOutput();
}
function setFOV(value) {
	preferences.setPerspectiveFOV(value);
	updateFOVOutput();
}


function updateMouseSensitivityOutput() {
	const value = Number(mouseSensitivitySlider.value);
	mouseSensitivityOutput.textContent = value + '%';
}
function updateFOVOutput() {
	const value = Number(fovSlider.value);
	fovOutput.textContent = value;
	updateFOVResetDefaultButton(value);
}
function updateFOVResetDefaultButton(value) {
	if (value === preferences.getDefaultPerspectiveFOV()) fovResetDefaultContainer.classList.add('hidden');
	else fovResetDefaultContainer.classList.remove('hidden');
}
function resetFOVDefault() {
	const defaultFOV = preferences.getDefaultPerspectiveFOV();
	fovSlider.value = defaultFOV;
	setFOV(defaultFOV);
}



export default {
	initListeners,
	closeListeners,
	close,
	open,
};