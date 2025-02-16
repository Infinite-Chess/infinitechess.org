
/*
 * This script handles our Practice page, containing
 * our practice selection menu.
 */


import checkmatepractice from '../chess/checkmatepractice.js';
import gui from './gui.js';
import guititle from './guititle.js';
import spritesheet from '../rendering/spritesheet.js';
// @ts-ignore
import style from './style.js';


// Variables ----------------------------------------------------------------------------


const element_menuExternalLinks: HTMLElement = document.getElementById('menu-external-links')!;

const element_practiceSelection: HTMLElement = document.getElementById('practice-selection')!;
const element_practiceName: HTMLElement = document.getElementById('practice-name')!;
const element_practiceBack: HTMLElement = document.getElementById('practice-back')!;
const element_checkmatePractice: HTMLElement = document.getElementById('checkmate-practice')!;
const element_tacticsPractice: HTMLElement = document.getElementById('tactics-practice')!;
const element_practicePlay: HTMLElement = document.getElementById('practice-play')!;

const elements_checkmates = document.getElementsByClassName('checkmate')!;

let modeSelected: 'checkmate-practice' | 'tactics-practice';
let checkmateSelectedID: string = '2Q-1k'; // id of selected checkmate
let indexSelected: number = 0; // index of selected checkmate among its brothers and sisters
let generatedIcons: boolean = false;


// Functions ------------------------------------------------------------------------


/**
 * Returns the last selected checkmate practce. Useful
 * for knowing which one we just beat.
 */
function getCheckmateSelectedID() {
	return checkmateSelectedID;
}

function open() {
	element_practiceSelection.classList.remove("hidden");
	element_menuExternalLinks.classList.remove("hidden");
	changePracticeMode('checkmate-practice');
	changeCheckmateSelected(checkmateSelectedID);
	updateCheckmatesBeaten(); // Adds 'beaten' class to them
	if (!generatedIcons) addPieceIcons();
	initListeners();
}

function close() {
	element_practiceSelection.classList.add("hidden");
	element_menuExternalLinks.classList.add("hidden");
	closeListeners();
}

async function addPieceIcons() {
	// let sprites = await spritesheet.getSVGElementsByIds();
	const spritenames: string[] = [];
	const sprites: { [pieceType: string]: SVGElement } = {};
	for (const checkmate of elements_checkmates) {
		for (const piece of checkmate.getElementsByClassName('piecelistW')[0]!.getElementsByClassName('checkmatepiececontainer')) {
			const actualpiece = piece.getElementsByClassName('checkmatepiece')[0]!;
			spritenames.push(actualpiece.className.split(' ')[1]!);
		}
		const pieceBlack = checkmate.getElementsByClassName('piecelistB')[0]!.getElementsByClassName('checkmatepiececontainer')[0]!;
		const actualpieceBlack = pieceBlack.getElementsByClassName('checkmatepiece')[0]!;
		spritenames.push(actualpieceBlack.className.split(' ')[1]!);
	}
	const spriteSVGs = await spritesheet.getSVGElementsByIds(spritenames);
	for (let i = 0; i < spritenames.length; i++) {
		sprites[spritenames[i]!] = spriteSVGs[i]!;
	}
	for (const checkmate of elements_checkmates) {
		for (const piece of checkmate.getElementsByClassName('piecelistW')[0]!.getElementsByClassName('checkmatepiececontainer')) {
			const actualpiece = piece.getElementsByClassName('checkmatepiece')[0]!;
			actualpiece.appendChild(sprites[actualpiece.className.split(' ')[1]!]!.cloneNode(true));
		}
		const pieceBlack = checkmate.getElementsByClassName('piecelistB')[0]!.getElementsByClassName('checkmatepiececontainer')[0]!;
		const actualpieceBlack = pieceBlack.getElementsByClassName('checkmatepiece')[0]!;
		actualpieceBlack.appendChild(sprites[actualpieceBlack.className.split(' ')[1]!]!.cloneNode(true));
	}
	generatedIcons = true;
}

function initListeners() {
	element_practiceBack.addEventListener('click', callback_practiceBack);
	element_checkmatePractice.addEventListener('click', callback_checkmatePractice);
	element_tacticsPractice.addEventListener('click', gui.displayStatus_FeaturePlanned);
	element_practicePlay.addEventListener('click', callback_practicePlay);
	document.addEventListener('keydown', callback_keyPress);
	for (const element of elements_checkmates) {
		element.addEventListener('click', callback_checkmateList);
		element.addEventListener('dblclick', callback_practicePlay); // Simulate clicking "Play"
	}
}

function closeListeners() {
	element_practiceBack.removeEventListener('click', callback_practiceBack);
	element_checkmatePractice.removeEventListener('click', callback_checkmatePractice);
	element_tacticsPractice.removeEventListener('click', gui.displayStatus_FeaturePlanned);
	element_practicePlay.removeEventListener('click', callback_practicePlay);
	document.removeEventListener('keydown', callback_keyPress);
	for (const element of elements_checkmates) {
		element.removeEventListener('click', callback_checkmateList);
		element.removeEventListener('dblclick', callback_practicePlay); // Simulate clicking "Play"
	}
}

function changePracticeMode(mode: 'checkmate-practice' | 'tactics-practice') {
	modeSelected = mode;
	if (mode === 'checkmate-practice') {
		element_practiceName.textContent = translations['menu_checkmate'];
		element_checkmatePractice.classList.add('selected');
		element_tacticsPractice.classList.remove('selected');
		// callback_updateOptions()
	} else if (mode === 'tactics-practice') {
		// nothing yet
	}
}

function changeCheckmateSelected(checkmateid: string) {
	for (const element of elements_checkmates) {
		if (checkmateid === element.id) {
			element.classList.add('selected');
			checkmateSelectedID = checkmateid;
			element.scrollIntoView({ behavior: 'instant', block: 'nearest' });
		} else {
			element.classList.remove('selected');
		}
	}
}

/**
 * Updates each checkmate practice element's 'beaten' class.
 * @param completedCheckmates - A list of checkmate strings we have beaten: `[ "2Q-1k", "3R-1k", "2CH-1k"]`
 */
function updateCheckmatesBeaten() {
	const completedCheckmates = checkmatepractice.getCompletedCheckmates();
	for (const element of elements_checkmates) {
		// What is the id string of this checkmate?
		const id_string = element.id; // "2Q-1k"
		// If this id is inside our list of beaten checkmates, add the beaten class
		if (completedCheckmates.includes(id_string)) element.classList.add('beaten');
		else element.classList.remove('beaten');
	}
}

function callback_practiceBack(event: Event) {
	close();
	guititle.open();
}

function callback_checkmatePractice(event: Event) {
	changePracticeMode('checkmate-practice');
}

function callback_checkmateList(event: Event) {
	changeCheckmateSelected((event.currentTarget as HTMLElement).id);
	indexSelected = style.getElementIndexWithinItsParent((event.currentTarget as HTMLElement));
}

function callback_practicePlay() {
	if (modeSelected === 'checkmate-practice') {
		close();
		checkmatepractice.startCheckmatePractice(checkmateSelectedID);
	} else if (modeSelected === 'tactics-practice') {
		throw Error("Can't play tactics practice yet.");
	}
}

/** If enter is pressed, click Play. Or if arrow keys are pressed, move up and down selection */
function callback_keyPress(event: KeyboardEvent) {
	if (event.key === 'Enter') callback_practicePlay();
	else if (event.key === 'ArrowDown') moveDownSelection(event);
	else if (event.key === 'ArrowUp') moveUpSelection(event);
}

function moveDownSelection(event: Event) {
	event.preventDefault();
	if (indexSelected >= elements_checkmates.length - 1) return;
	indexSelected++;
	const newSelectionElement = elements_checkmates[indexSelected]!;
	changeCheckmateSelected(newSelectionElement.id);
}

function moveUpSelection(event: Event) {
	event.preventDefault();
	if (indexSelected <= 0) return;
	indexSelected--;
	const newSelectionElement = elements_checkmates[indexSelected]!;
	changeCheckmateSelected(newSelectionElement.id);
}


// Exports ------------------------------------------------------------------------


export default {
	getCheckmateSelectedID,
	open,
	updateCheckmatesBeaten,
};