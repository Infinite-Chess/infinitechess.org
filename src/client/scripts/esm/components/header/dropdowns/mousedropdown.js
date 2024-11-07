
// This script allows us to adjust the mouse sensitivity in perspective mode

import preferences from "../preferences.js";

// Document Elements -------------------------------------------------------------------------

const settingsDropdown = document.querySelector('.settings-dropdown');

const mouseDropdown = document.querySelector('.mouse-dropdown');
const mouseDropdownTitle = document.querySelector('.mouse-dropdown .dropdown-title');

const slider = document.querySelector('.mouse-dropdown .slider');
const output = document.querySelector('.mouse-dropdown .value');

// Update the slider value on page load
output.textContent = slider.value + '%';



// Functions ---------------------------------------------------------------------------------


(function init() {

	// Update the value dynamically as the slider is moved. Called continuously.
	slider.addEventListener('input', event => {
		output.textContent = event.currentTarget.value + '%';
	});

	// Detect when the slider value changes. Called when the slider's released.
	slider.addEventListener('change', onSensitivityChanged);

})();



function open() {
	mouseDropdown.classList.remove('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	initListeners();
	settingsDropdown.classList.add('transparent');
}
function close() {
	mouseDropdown.classList.add('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	closeListeners();
	settingsDropdown.classList.remove('transparent');
}


function initListeners() {
	mouseDropdownTitle.addEventListener('click', close);
}
function closeListeners() {
	mouseDropdownTitle.removeEventListener('click', close);
}


function onSensitivityChanged(event) {
	const value = event.currentTarget.value;
	console.log(`Slider changed: ${value}`);
	preferences.setPerspectiveSensitivity(value);
}



export default {
	initListeners,
	closeListeners,
	close,
	open,
};