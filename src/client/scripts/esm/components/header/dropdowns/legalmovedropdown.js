
// This script selects new languages when we click a language in the language dropdown.
// It also appends the lng query param to all header navigation links.
// And it removes the lng query param from the url after loading.

import preferences from "../preferences.js";


// Document Elements -------------------------------------------------------------------------

const settingsDropdown = document.querySelector('.settings-dropdown');

const legalmoveDropdown = document.querySelector('.legalmove-dropdown');
// const dropdownItems = document.querySelectorAll(".legalmove-option");
const legalmoveDropdownTitle = document.querySelector('.legalmove-dropdown .dropdown-title');

const squaresOption = document.querySelector('.legalmove-option.squares');
const dotsOption = document.querySelector('.legalmove-option.dots');



// Functions ---------------------------------------------------------------------------------


(function init() {

	showCheckmarkOnSelectedOption();

})();

function showCheckmarkOnSelectedOption() {
	const selectedLegalMovesOption = preferences.getLegalMovesShape(); // squares/dots
	const targetCheckmark = document.querySelector(`.legalmove-option.${selectedLegalMovesOption} .checkmark`);
	targetCheckmark.classList.remove('visibility-hidden');
}



function open() {
	legalmoveDropdown.classList.remove('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	initListeners();
	settingsDropdown.classList.add('transparent');
}
function close() {
	legalmoveDropdown.classList.add('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	closeListeners();
	settingsDropdown.classList.remove('transparent');
}


function initListeners() {
	legalmoveDropdownTitle.addEventListener('click', close);
	squaresOption.addEventListener("click", toggleSquares);
	dotsOption.addEventListener("click", toggleDots);
}
function closeListeners() {
	legalmoveDropdownTitle.removeEventListener('click', close);
	squaresOption.removeEventListener("click", toggleSquares);
	dotsOption.removeEventListener("click", toggleDots);
}


function toggleSquares() {
	// console.log("Clicked squares");
	preferences.setLegalMovesShape('squares');
	hideAllCheckmarks();
	const checkmark = document.querySelector('.legalmove-option.squares .checkmark');
	checkmark.classList.remove('visibility-hidden');
	dispatchLegalMoveChangeEvent();
}

function toggleDots() {
	// console.log("Clicked dots");
	preferences.setLegalMovesShape('dots');
	hideAllCheckmarks();
	const checkmark = document.querySelector('.legalmove-option.dots .checkmark');
	checkmark.classList.remove('visibility-hidden');
	dispatchLegalMoveChangeEvent();
}

function hideAllCheckmarks() {
	document.querySelectorAll('.legalmove-option .checkmark').forEach(checkmark => {
		checkmark.classList.add('visibility-hidden');
	});
}

function dispatchLegalMoveChangeEvent() {
	// Dispatch a custom event for theme change so that any game code present can pick it up.
	const themeChangeEvent = new CustomEvent('legalmove-shape-change');
	document.dispatchEvent(themeChangeEvent);
}



export default {
	initListeners,
	closeListeners,
	close,
	open,
};