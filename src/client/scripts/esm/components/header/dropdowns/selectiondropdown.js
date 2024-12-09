
// This script allows us to enable or disable premoves and dragging pieces

import preferences from "../preferences.js";

// Document Elements -------------------------------------------------------------------------

const settingsDropdown = document.querySelector('.settings-dropdown');

const selectionDropdown = document.querySelector('.selection-dropdown');
const selectionDropdownTitle = document.querySelector('.selection-dropdown .dropdown-title');

const dragOption = document.querySelector('.selection-option.drag');
const constantOption = document.querySelector('.selection-option.constant');
const centerOption = document.querySelector('.selection-option.center');
const disabledOption = document.querySelector('.selection-option.disabled');
const oneOption = document.querySelector('.selection-option.one');
const manyOption = document.querySelector('.selection-option.many');

// Functions ---------------------------------------------------------------------------------

(function init() {

	showCheckmarkOnSelectedOptions();

})();

function showCheckmarkOnSelectedOptions() {
	const dragEnabled = preferences.getDragEnabled();
	if (dragEnabled) {
		const checkMark = document.querySelector('.selection-option.drag .checkmark');
		checkMark.classList.remove('visibility-hidden');
	}
	if (preferences.getConstantMaxSpeed()) {
		const checkMark = document.querySelector('.selection-option.constant .checkmark');
		checkMark.classList.remove('visibility-hidden');
	}
	if (preferences.getPanFromCenter()) {
		const checkMark = document.querySelector('.selection-option.center .checkmark');
		checkMark.classList.remove('visibility-hidden');
	}
	
	const premoveOption = preferences.getPremoveMode();
	const premoveCheckMark = document.querySelector(`.selection-option.${premoveOption} .checkmark`);
	premoveCheckMark.classList.remove('visibility-hidden');
}

function open() {
	selectionDropdown.classList.remove('visibility-hidden');
	initListeners();
	settingsDropdown.classList.add('transparent');
}
function close() {
	selectionDropdown.classList.add('visibility-hidden');
	closeListeners();
	settingsDropdown.classList.remove('transparent');
}

function initListeners() {
	selectionDropdownTitle.addEventListener('click', close);
	dragOption.addEventListener("click", toggleDrag);
	constantOption.addEventListener('click', toggleConstantMaxSpeed);
	centerOption.addEventListener('click', toggleCenter);
	disabledOption.addEventListener("click", disablePremove);
	oneOption.addEventListener("click", onePremove);
	manyOption.addEventListener("click", manyPremove);
}
function closeListeners() {
	selectionDropdownTitle.removeEventListener('click', close);
	dragOption.removeEventListener("click", toggleDrag);
	constantOption.removeEventListener('click', toggleConstantMaxSpeed);
	centerOption.removeEventListener('click', toggleCenter);
	disabledOption.removeEventListener("click", disablePremove);
	oneOption.removeEventListener("click", onePremove);
	manyOption.removeEventListener("click", manyPremove);
}

function toggleDrag() {
	const checkmark = document.querySelector('.selection-option.drag .checkmark');
	preferences.setDragEnabled(checkmark.classList.contains('visibility-hidden'));
	checkmark.classList.toggle('visibility-hidden');
}

function toggleConstantMaxSpeed() {
	const checkmark = document.querySelector('.selection-option.constant .checkmark');
	preferences.setConstantMaxSpeed(checkmark.classList.contains('visibility-hidden'));
	checkmark.classList.toggle('visibility-hidden');
}

function toggleCenter() {
	const checkmark = document.querySelector('.selection-option.center .checkmark');
	preferences.setPanFromCenter(checkmark.classList.contains('visibility-hidden'));
	checkmark.classList.toggle('visibility-hidden');
}

function disablePremove() {
	preferences.setPremoveMode('disabled');
	hideAllPremoveCheckmarks();
	const checkmark = document.querySelector('.selection-option.disabled .checkmark');
	checkmark.classList.remove('visibility-hidden');
}
function onePremove() {
	preferences.setPremoveMode('one');
	hideAllPremoveCheckmarks();
	const checkmark = document.querySelector('.selection-option.one .checkmark');
	checkmark.classList.remove('visibility-hidden');
}
function manyPremove() {
	preferences.setPremoveMode('many');
	hideAllPremoveCheckmarks();
	const checkmark = document.querySelector('.selection-option.many .checkmark');
	checkmark.classList.remove('visibility-hidden');
}

function hideAllPremoveCheckmarks() {
	document.querySelectorAll('.selection-option.premove .checkmark').forEach(checkMark => {
		checkMark.classList.add('visibility-hidden');
	});
}

export default {
	initListeners,
	closeListeners,
	close,
	open,
};