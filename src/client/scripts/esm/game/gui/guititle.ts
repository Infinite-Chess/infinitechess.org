
/**
 * This script handles our Title Screen
 */

import gui from './gui.js';
// @ts-ignore
import guiguide from './guiguide.js';
// @ts-ignore
import guipause from './guipause.js';
// @ts-ignore
import guiplay from './guiplay.js';


// Variables ----------------------------------------------------------------------------


// Title Screen

const titleElement = document.getElementById('title')!; // Visible when on the title screen
const element_play = document.getElementById('play')!;
const element_practice = document.getElementById('practice')!;
const element_guide = document.getElementById('rules')!;
const element_boardEditor = document.getElementById('board-editor')!;
const element_menuExternalLinks = document.getElementById('menu-external-links')!;


// Functions ----------------------------------------------------------------------------


// Call when title screen is loaded
function open() {
	titleElement.classList.remove('hidden');
	element_menuExternalLinks.classList.remove('hidden');
	guipause.init('play');
	initListeners();
};

function close() {
	titleElement.classList.add('hidden');
	element_menuExternalLinks.classList.add('hidden');
	closeListeners();
}

function initListeners() {
	element_play.addEventListener('click', callback_Play);
	element_practice.addEventListener('click', callback_Practice);
	element_guide.addEventListener('click', callback_Guide);
	element_boardEditor.addEventListener('click', gui.displayStatus_FeaturePlanned);
}

function closeListeners() {
	element_play.removeEventListener('click', callback_Play);
	element_practice.removeEventListener('click', callback_Practice);
	element_guide.removeEventListener('click', callback_Guide);
	element_boardEditor.removeEventListener('click', gui.displayStatus_FeaturePlanned);
}

function callback_Play(event: Event) {
	close();
	guiplay.open();
}


function callback_Practice(event: Event) {
	const currentUrl = document.location.href;
	const baseUrl = currentUrl.substring(0, currentUrl.length - 4);
	document.location.href = baseUrl + "practice";
}
function callback_Guide(event: Event) {
	close();
	guiguide.open();
}



export default {
	open,
	close,
};