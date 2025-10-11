
// This script manages the sound settings dropdown

import preferences from "../preferences.js";
import themes from "../../../../../../shared/components/header/themes.js";

// Document Elements -------------------------------------------------------------------------

const settingsDropdown = document.querySelector('.settings-dropdown') as HTMLElement;

const soundDropdown = document.querySelector('.sound-dropdown') as HTMLElement;
const soundDropdownTitle = document.querySelector('.sound-dropdown .dropdown-title') as HTMLElement;

const masterVolumeSlider = document.querySelector('.sound-options .master-volume .slider') as HTMLInputElement;
/** The text that displays the value */
const masterVolumeOutput = document.querySelector('.sound-options .master-volume .value') as HTMLElement;

const ambienceCheckbox = document.querySelector('.boolean-option.ambience input') as HTMLInputElement;


// Functions ---------------------------------------------------------------------------------


(function init(): void {

	setInitialValues();
	updateSwitchColor();
	document.addEventListener('theme-change', updateSwitchColor);

})();


/** Update the sliders and checkboxes according to the already existing preferences */
function setInitialValues(): void {
	masterVolumeSlider.value = String(preferences.getMasterVolume());
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
	setMasterVolume(value);
}


function setMasterVolume(value: number): void {
	preferences.setMasterVolume(value);
	updateMasterVolumeOutput();
}


function updateMasterVolumeOutput(): void {
	const value = Number(masterVolumeSlider.value);
	masterVolumeOutput.textContent = value + '%';
}

function toggleAmbience(): void {
	preferences.setAmbienceEnabled(ambienceCheckbox.checked);
}

function updateSwitchColor(): void {
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
