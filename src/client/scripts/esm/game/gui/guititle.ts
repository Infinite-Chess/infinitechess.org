
/**
 * This script handles our Title Screen
 */

// @ts-ignore
import style from './style.js';
// @ts-ignore
import gui from './gui.js';
// @ts-ignore
import guiguide from './guiguide.js';
// @ts-ignore
import guiplay from './guiplay.js';


// Variables ----------------------------------------------------------------------------


// Title Screen
const boardVel = 0.6; // Speed at which board slowly moves while on title screen

const titleElement = document.getElementById('title')!; // Visible when on the title screen
const element_play = document.getElementById('play')!;
const element_guide = document.getElementById('rules')!;
const element_boardEditor = document.getElementById('board-editor')!;
const element_menuExternalLinks = document.getElementById('menu-external-links')!;


// Functions ----------------------------------------------------------------------------


// Call when title screen is loaded
function open() {
	style.revealElement(titleElement);
	style.revealElement(element_menuExternalLinks);
	initListeners();
};

function close() {
	style.hideElement(titleElement);
	style.hideElement(element_menuExternalLinks);
	closeListeners();
}

function initListeners() {
	element_play.addEventListener('click', callback_Play);
	element_guide.addEventListener('click', callback_Guide);
	element_boardEditor.addEventListener('click', gui.displayStatus_FeaturePlanned);
}

function closeListeners() {
	element_play.removeEventListener('click', callback_Play);
	element_guide.removeEventListener('click', callback_Guide);
	element_boardEditor.removeEventListener('click', gui.displayStatus_FeaturePlanned);
}

function callback_Play(event: Event) {
	close();
	guiplay.open();
}

function callback_Guide(event: Event) {
	close();
	guiguide.open();
}



export default {
	boardVel,
	open,
	close,
};