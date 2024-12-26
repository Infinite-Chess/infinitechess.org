
// This script opens and closes our settings drop-down menu when it is clicked.

import languagedropdown from "./dropdowns/languagedropdown.js";
import boarddropdown from "./dropdowns/boarddropdown.js";
import legalmovedropdown from "./dropdowns/legalmovedropdown.js";
import perspectivedropdown from "./dropdowns/perspectivedropdown.js";
import selectiondropdown from "./dropdowns/selectiondropdown.js";
import preferences from "./preferences.js";
// Only imported so its code runs
// eslint-disable-next-line no-unused-vars
import pingmeter from "./pingmeter.js";


// Document Elements -------------------------------------------------------------------------


// Main settings dropdown
const settings = document.getElementById('settings');
const settingsDropdown = document.querySelector('.settings-dropdown');

// All buttons to open nested dropdowns
const languageDropdownSelection = document.getElementById('language-settings-dropdown-item');
const boardDropdownSelection = document.getElementById('board-settings-dropdown-item');
const legalmoveDropdownSelection = document.getElementById('legalmove-settings-dropdown-item');
const mouseDropdownSelection = document.getElementById('perspective-settings-dropdown-item');
const selectionDropdownSelection = document.getElementById('selection-settings-dropdown-item');

// All nested dropdowns
const languageDropdown = document.querySelector('.language-dropdown');
const boardDropdown = document.querySelector('.board-dropdown');
const legalmoveDropdown = document.querySelector('.legalmove-dropdown');
const perspectiveDropdown = document.querySelector('.perspective-dropdown');
const selectionDropdown = document.querySelector('.selection-dropdown');
const allSettingsDropdownsExceptMainOne = [languageDropdown, boardDropdown, legalmoveDropdown, perspectiveDropdown, selectionDropdown];


// Variables ---------------------------------------------------------------------------------

const allSettingsDropdowns = [...allSettingsDropdownsExceptMainOne, settingsDropdown];
let settingsIsOpen = settings.classList.contains('open');



// Functions ---------------------------------------------------------------------------------


(function init() {
	settings.addEventListener('click', event => {
		if (didEventClickAnyDropdown(event)) return; // We clicked any dropdown, don't toggle it off
		toggleSettingsDropdown();
	});

	// Close the dropdown if clicking outside of it
	document.addEventListener('click', closeSettingsDropdownIfClickedAway);
	document.addEventListener('touchstart', closeSettingsDropdownIfClickedAway);

	// openSettingsDropdown(); // DELETE WHEN UPDATE DONE !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
})();


function toggleSettingsDropdown() {
	if (settingsIsOpen) closeAllSettingsDropdowns();
	else openSettingsDropdown();
}
function openSettingsDropdown() { // Opens the initial settings dropdown
	settings.classList.add('open');
	settingsDropdown.classList.remove('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	initSettingsListeners();
	settingsIsOpen = true;
}
function closeAllSettingsDropdowns() { // Closes all dropdowns that may be open
	settings.classList.remove('open');
	closeMainSettingsDropdown();
	closeAllSettingsDropdownsExceptMainOne();
	settingsIsOpen = false;
}
function closeMainSettingsDropdown() {
	settingsDropdown.classList.add('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	closeSettingsListeners();
	preferences.sendPrefsToServer();
}
function closeAllSettingsDropdownsExceptMainOne() {
	languagedropdown.close();
	boarddropdown.close();
	legalmovedropdown.close();
	selectiondropdown.close();
	perspectivedropdown.close();
}


function initSettingsListeners() {
	languageDropdownSelection.addEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	languageDropdownSelection.addEventListener('click', languagedropdown.open);
	boardDropdownSelection.addEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	boardDropdownSelection.addEventListener('click', boarddropdown.open);
	legalmoveDropdownSelection.addEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	legalmoveDropdownSelection.addEventListener('click', legalmovedropdown.open);
	mouseDropdownSelection.addEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	mouseDropdownSelection.addEventListener('click', perspectivedropdown.open);
	selectionDropdownSelection.addEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	selectionDropdownSelection.addEventListener('click', selectiondropdown.open);
}
function closeSettingsListeners() {
	languageDropdownSelection.removeEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	languageDropdownSelection.removeEventListener('click', languagedropdown.open);
	boardDropdownSelection.removeEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	boardDropdownSelection.removeEventListener('click', boarddropdown.open);
	legalmoveDropdownSelection.removeEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	legalmoveDropdownSelection.removeEventListener('click', legalmovedropdown.open);
	mouseDropdownSelection.removeEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	mouseDropdownSelection.removeEventListener('click', perspectivedropdown.open);
	mouseDropdownSelection.addEventListener('click', closeAllSettingsDropdownsExceptMainOne);
	mouseDropdownSelection.addEventListener('click', perspectivedropdown.open);
}


function closeSettingsDropdownIfClickedAway(event) {
	if (!settings.contains(event.target) && !didEventClickAnyDropdown(event)) closeAllSettingsDropdowns();
}
function didEventClickAnyDropdown(event) {
	// Check if the click was outside the dropdown
	let clickedDropdown = false;
	allSettingsDropdowns.forEach(dropdown => {
		if (dropdown.contains(event.target)) clickedDropdown = true;
	});
	return clickedDropdown;
}


export default {};