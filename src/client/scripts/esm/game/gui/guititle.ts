
/**
 * This script handles our Title Screen
 */

import guipractice from './guipractice.js';
import guiboardeditor from './guiboardeditor.js';
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
const element_practice = document.getElementById('practice')!;
const element_guide = document.getElementById('rules')!;
const element_boardEditor = document.getElementById('board-editor')!;
const element_menuExternalLinks = document.getElementById('menu-external-links')!;


// Functions ----------------------------------------------------------------------------


// Call when title screen is loaded
function open() {
	titleElement.classList.remove('hidden');
	element_menuExternalLinks.classList.remove('hidden');
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
	// element_boardEditor.addEventListener('click', gui.displayStatus_FeaturePlanned);
	// ENABLE WHEN board editor is ready
	element_boardEditor.addEventListener('click', callback_BoardEditor);
}

function closeListeners() {
	element_play.removeEventListener('click', callback_Play);
	element_practice.removeEventListener('click', callback_Practice);
	element_guide.removeEventListener('click', callback_Guide);
	// element_boardEditor.removeEventListener('click', gui.displayStatus_FeaturePlanned);
	// ENABLE WHEN board editor is ready
	element_boardEditor.removeEventListener('click', callback_BoardEditor);
}

function callback_Play(event: Event) {
	close();
	guiplay.open();
}

function callback_Practice(event: Event) {
	close();
	guipractice.open();
}

function callback_Guide(event: Event) {
	close();
	guiguide.open();
}

function callback_BoardEditor(event: Event) {
	close();
	guiboardeditor.open();
}



export default {
	boardVel,
	open,
	close,
};