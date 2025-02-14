
/*
 * This script handles our Practice page, containing
 * our practice selection menu.
 */

// Import Start
import sound from '../misc/sound.js';
import checkmatepractice from '../chess/checkmatepractice.js';
import movement from '../rendering/movement.js';
import gui from '../gui/gui.js';
import guititle from '../gui/guititle.js';
import style from '../gui/style.js';
import guigameinfo from '../gui/guigameinfo.js';
import area from '../rendering/area.js';
import enginegame from '../misc/enginegame.js';
import options from '../rendering/options.js';
import timeutil from '../../util/timeutil.js';
import frametracker from '../rendering/frametracker.js';
import variant from '../../chess/variants/variant.js';
import gameslot from '../chess/gameslot.js';
import spritesheet from '../rendering/spritesheet.js';
// Import End

"use strict";

const guipractice = (function() {

	// Variables

	const element_menuExternalLinks = document.getElementById('menu-external-links');

	const element_practiceSelection = document.getElementById('practice-selection');
	const element_practiceName = document.getElementById('practice-name');
	const element_practiceBack = document.getElementById('practice-back');
	const element_checkmatePractice = document.getElementById('checkmate-practice');
	const element_tacticsPractice = document.getElementById('tactics-practice');
	const element_practicePlay = document.getElementById('practice-play');

	const elements_checkmates = document.getElementsByClassName('checkmate');

	let modeSelected; // checkmate-practice / tactics-practice
	let checkmateSelectedID = '2Q-1k'; // id of selected checkmate
	let indexSelected = 0; // index of selected checkmate among its brothers and sisters
	let currentScreen = '';
	let generatedIcons=false;

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
		currentScreen = "title practice";
		style.revealElement(element_practiceSelection);
		style.revealElement(element_menuExternalLinks);
		changePracticeMode('checkmate-practice');
		changeCheckmateSelected(checkmateSelectedID);
		updateCheckmatesBeaten(); // Adds 'beaten' class to them
		if (!generatedIcons) addPieceIcons();
		initListeners();
	}

	async function addPieceIcons() {
		// let sprites = await spritesheet.getSVGElementsByIds();
		for (const checkmate of document.getElementById('checkmates').getElementsByClassName('checkmate')) {
			for (const piece of checkmate.getElementsByClassName('piecelistW')[0].getElementsByClassName('checkmatepiececontainer')) {
				piece.getElementsByClassName('checkmatepiece')[0].appendChild((await spritesheet.getSVGElementsByIds([piece.getElementsByClassName('checkmatepiece')[0].className.split(' ')[1]]))[0].cloneNode(true));
			}
			checkmate.getElementsByClassName('piecelistB')[0].getElementsByClassName('checkmatepiececontainer')[0].getElementsByClassName('checkmatepiece')[0].appendChild((await spritesheet.getSVGElementsByIds(['kingsB']))[0].cloneNode(true));
		}
		generatedIcons = true;
	}

	function close() {
		style.hideElement(element_practiceSelection);
		style.hideElement(element_menuExternalLinks);
		closeListeners();
	}

	function initListeners() {
		element_practiceBack.addEventListener('click', callback_practiceBack);
		element_checkmatePractice.addEventListener('click', callback_checkmatePractice);
		element_tacticsPractice.addEventListener('click', gui.callback_featurePlanned);
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
		element_tacticsPractice.removeEventListener('click', gui.callback_featurePlanned);
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

	function callback_practiceBack() {
		close();
		guititle.open();
	}

	function callback_checkmatePractice(event) {
		changePracticeMode('checkmate-practice');
	}

	function callback_checkmateList(event) {
		changeCheckmateSelected(event.currentTarget.id);
		indexSelected = style.getElementIndexWithinItsParent(event.currentTarget);
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
	function callback_keyPress(event) {
		if (event.key === 'Enter') callback_practicePlay();
		else if (event.key === 'ArrowDown') moveDownSelection(event);
		else if (event.key === 'ArrowUp') moveUpSelection(event);
	}

	function moveDownSelection(event) {
		event.preventDefault();
		if (indexSelected >= elements_checkmates.length - 1) return;
		indexSelected++;
		const newSelectionElement = elements_checkmates[indexSelected];
		changeCheckmateSelected(newSelectionElement.id);
	}

	function moveUpSelection(event) {
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
		currentScreen = 'checkmate practice'; // Change screen location

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
		guigameinfo.revealPlayerNames(gameOptions);
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
		const newGamefile = gameslot.getGamefile();

		const centerArea = area.calculateFromUnpaddedBox(newGamefile.startSnapshot.box);
		movement.setPositionToArea(centerArea, "pidough");
        
		options.setNavigationBar(true);
		sound.playSound_gamestart();
	}

	/**
     * Returns *true* if we are on the practice page.
     * @returns {boolean}
     */
	function onPracticePage() {
		return getScreen() === 'title practice';
	}
	function getScreen() {
		return currentScreen;
	}

	return Object.freeze({
		getModeSelected,
		getCheckmateSelectedID,
		open,
		close,
		updateCheckmatesBeaten,
		startCheckmatePractice,
		onPracticePage,
		getScreen
	});

})();

export default guipractice;