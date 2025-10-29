
/**
 * This script handles our Title Screen
 */

import guipractice from './guipractice.js';
import guiboardeditor from './guiboardeditor.js';
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
function open(): void {
	titleElement.classList.remove('hidden');
	element_menuExternalLinks.classList.remove('hidden');
	initListeners();
};

function close(): void {
	titleElement.classList.add('hidden');
	element_menuExternalLinks.classList.add('hidden');
	closeListeners();
}

function initListeners(): void {
	element_play.addEventListener('click', callback_Play);
	element_practice.addEventListener('click', callback_Practice);
	element_guide.addEventListener('click', callback_Guide);
	// element_boardEditor.addEventListener('click', gui.displayStatus_FeaturePlanned);
	// ENABLE WHEN board editor is ready
	element_boardEditor.addEventListener('click', callback_BoardEditor);
}

function closeListeners(): void {
	element_play.removeEventListener('click', callback_Play);
	element_practice.removeEventListener('click', callback_Practice);
	element_guide.removeEventListener('click', callback_Guide);
	// element_boardEditor.removeEventListener('click', gui.displayStatus_FeaturePlanned);
	// ENABLE WHEN board editor is ready
	element_boardEditor.removeEventListener('click', callback_BoardEditor);
}

// eslint-disable-next-line no-unused-vars
function callback_Play(event: Event): void {
	close();
	guiplay.open();
}

// eslint-disable-next-line no-unused-vars
function callback_Practice(event: Event): void {
	close();
	guipractice.open();
}

// eslint-disable-next-line no-unused-vars
function callback_Guide(event: Event): void {
	// Navigate to the guide page
	window.location.href = '/guide';
}

// eslint-disable-next-line no-unused-vars
function callback_BoardEditor(event: Event): void {
	close();
	guiboardeditor.open();
}



export default {
	boardVel,
	open,
	close,
};