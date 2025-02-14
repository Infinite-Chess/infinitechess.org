
/*
 * This script handles our Practice page, containing
 * our practice selection menu.
 */


import checkmatepractice from '../chess/checkmatepractice.js';
import gui from './gui.js';
import guititle from './guititle.js';
import timeutil from '../../util/timeutil.js';
import frametracker from '../rendering/frametracker.js';
import variant from '../../chess/variants/variant.js';
import gameslot from '../chess/gameslot.js';
import spritesheet from '../rendering/spritesheet.js';
// @ts-ignore
import area from '../rendering/area.js';
// @ts-ignore
import enginegame from '../misc/enginegame.js';
// @ts-ignore
import options from '../rendering/options.js';
// @ts-ignore
import style from './style.js';
// @ts-ignore
import movement from '../rendering/movement.js';
// @ts-ignore
import sound from '../misc/sound.js';


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

/** Whether we are in a checkmate practice engine game. */
let inCheckmatePractice: boolean = false;

// Functions

function getModeSelected() {
	return modeSelected;
}

/**
 * Returns the last selected checkmate practce. Useful
 * for knowing which one we just beat.
 */
function getCheckmateSelectedID() {
	return checkmateSelectedID;
}

function open() {
	inCheckmatePractice = false;
	style.revealElement(element_practiceSelection);
	style.revealElement(element_menuExternalLinks);
	changePracticeMode('checkmate-practice');
	changeCheckmateSelected(checkmateSelectedID);
	updateCheckmatesBeaten(); // Adds 'beaten' class to them
	if (!generatedIcons) addPieceIcons();
	initListeners();
}

function close() {
	style.hideElement(element_practiceSelection);
	style.hideElement(element_menuExternalLinks);
	closeListeners();
}

async function addPieceIcons() {
	// let sprites = await spritesheet.getSVGElementsByIds();
	const spritenames = ["kingsB"];
	const sprites: { [pieceType: string]: SVGElement } = {};
	for (const checkmate of elements_checkmates) {
		for (const piece of checkmate.getElementsByClassName('piecelistW')[0].getElementsByClassName('checkmatepiececontainer')) {
			const actualpiece = piece.getElementsByClassName('checkmatepiece')[0];
			spritenames.push(actualpiece.className.split(' ')[1]);
		}
	}
	const spriteSVGs = await spritesheet.getSVGElementsByIds(spritenames);
	for (let i = 0; i < spritenames.length; i++) {
		sprites[spritenames[i]] = spriteSVGs[i];
	}
	for (const checkmate of elements_checkmates) {
		for (const piece of checkmate.getElementsByClassName('piecelistW')[0].getElementsByClassName('checkmatepiececontainer')) {
			const actualpiece = piece.getElementsByClassName('checkmatepiece')[0];
			actualpiece.appendChild(sprites[actualpiece.className.split(' ')[1]].cloneNode(true));
		}
		const container = checkmate.getElementsByClassName('piecelistB')[0].getElementsByClassName('checkmatepiececontainer')[0];
		container.getElementsByClassName('checkmatepiece')[0].appendChild(sprites.kingsB.cloneNode(true));
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

function changePracticeMode(mode) { // checkmate-practice / tactics-practice
	modeSelected = mode;
	if (mode === 'checkmate-practice') {
		element_practiceName.textContent = translations.menu_checkmate;
		element_checkmatePractice.classList.add('selected');
		element_tacticsPractice.classList.remove('selected');
		// callback_updateOptions()
	} else if (mode === 'tactics-practice') {
		// nothing yet
	}
}

function changeCheckmateSelected(checkmateid) {
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
 * @param {string[]} completedCheckmates - A list of checkmate strings we have beaten: `[ "2Q-1k", "3R-1k", "2CH-1k"]`
 */
function updateCheckmatesBeaten(completedCheckmates = checkmatepractice.getCompletedCheckmates()) {
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
		startCheckmatePractice();
	} else if (modeSelected === 'tactics-practice') {
		// nothing yet
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
	const newSelectionElement = elements_checkmates[indexSelected];
	changeCheckmateSelected(newSelectionElement.id);
}

function moveUpSelection(event: Event) {
	event.preventDefault();
	if (indexSelected <= 0) return;
	indexSelected--;
	const newSelectionElement = elements_checkmates[indexSelected];
	changeCheckmateSelected(newSelectionElement.id);
}

/**
 * Starts a checkmate practice game
 */
function startCheckmatePractice() {
	inCheckmatePractice = true;
	const startingPosition = checkmatepractice.generateCheckmateStartingPosition(checkmateSelectedID);
	const gameOptions = {
		metadata: {
			Event: `Infinite chess checkmate practice`,
			Site: "https://www.infinitechess.org/",
			Round: "-",
			TimeControl: "-",
			White: "(You)",
			Black: "Engine",
			// Variant: "Classical"
		},
		youAreColor: 'white',
		clock: "-",
		currentEngine: "engineCheckmatePractice",
		viewWhitePerspective: true,
		// allow edit?x

		engineConfig: {checkmateSelectedID: checkmateSelectedID},
		additional:{
			variantOptions: {
				turn: "white",
				fullMove: "1",
				startingPosition: startingPosition,
				specialRights: {},
				gameRules: variant.getBareMinimumGameRules()}
		}
	};
	enginegame.setColorAndGameID(gameOptions);
	loadGame(gameOptions);
	enginegame.initEngineGame(gameOptions);
	// clock.set(gameOptions.clock);
}

/**
 * Loads a game according to the options provided.
 * @param {Object} gameOptions - An object that contains the properties `metadata`, `youAreColor`, `clock` and `variantOptions`
 */
async function loadGame(gameOptions) {
	console.log("Loading practice checkmate with game options:");
	console.log(gameOptions);
	frametracker.onVisualChange();
	movement.eraseMomentum();
	options.disableEM();

	gameOptions.metadata.UTCDate = gameOptions.metadata.UTCDate || timeutil.getCurrentUTCDate();
	gameOptions.metadata.UTCTime = gameOptions.metadata.UTCTime || timeutil.getCurrentUTCTime();

	const variantOptions = gameOptions.variantOptions;
	// const newGamefile = new gamefile(gameOptions.metadata, { variantOptions });
	await gameslot.loadGamefile(gameOptions);
	const newGamefile = gameslot.getGamefile()!;

	const centerArea = area.calculateFromUnpaddedBox(newGamefile.startSnapshot.box);
	movement.setPositionToArea(centerArea);
	
	// SHOULD BE HANDLED by gameloader.ts
	// options.setNavigationBar(true);
	sound.playSound_gamestart();
}

function areInCheckmatePractice() {
	return inCheckmatePractice;
}



export default {
	getModeSelected,
	getCheckmateSelectedID,
	open,
	close,
	updateCheckmatesBeaten,
	startCheckmatePractice,
	areInCheckmatePractice,
};