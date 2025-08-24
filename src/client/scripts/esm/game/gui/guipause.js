
// Import Start
import onlinegame from '../misc/onlinegame/onlinegame.js';
import arrows from '../rendering/arrows/arrows.js';
import statustext from './statustext.js';
import copygame from '../chess/copygame.js';
import pastegame from '../chess/pastegame.js';
import drawoffers from '../misc/onlinegame/drawoffers.js';
import guititle from './guititle.js';
import moveutil from '../../chess/util/moveutil.js';
import perspective from '../rendering/perspective.js';
import frametracker from '../rendering/frametracker.js';
import gameloader from '../chess/gameloader.js';
import gameslot from '../chess/gameslot.js';
import guipractice from './guipractice.js';
import checkmatepractice from '../chess/checkmatepractice.js';
import docutil from '../../util/docutil.js';
import boardpos from '../rendering/boardpos.js';
import boarddrag from '../rendering/boarddrag.js';
import draganimation from '../rendering/dragging/draganimation.js';
import { listener_document } from '../chess/game.js';
import { Mouse } from '../input.js';
// Import End

"use strict";

/**
 * This script handles our Pause menu
 */

// Pause UI
let isPaused = false;
/** This is true if the main menu button says "Resign Game" or "Abort Game". In all other cases, this is false. */
let is_main_menu_button_used_as_resign_or_abort_button = false;
/** Amount of milliseconds to freeze the Main Menu button after the text on it changes */
const MAIN_MENU_BUTTON_CHANGE_FREEZE_DURATION_MILLIS = 1000;

const element_pauseUI = document.getElementById('pauseUI');
const element_resume = document.getElementById('resume');
const element_pointers = document.getElementById('togglepointers');
const element_copygame = document.getElementById('copygame');
const element_pastegame = document.getElementById('pastegame');
const element_mainmenu = document.getElementById('mainmenu');
const element_practicemenu = document.getElementById('practicemenu');
const element_offerDraw = document.getElementById('offerdraw');
const element_perspective = document.getElementById('toggleperspective');

// Functions

/**
 * Returns *true* if the game is currently paused.
 * @returns {boolean}
 */
function areWePaused() { return isPaused; }

/**
 * 
 * @returns {HTMLElement}
 */
function getelement_perspective() {
	return element_perspective;
}

function open() {
	isPaused = true;
	updatePerspectiveButtonTransparency();
	updateTextOfMainMenuButton();
	updatePasteButtonTransparency();
	if (checkmatepractice.areInCheckmatePractice()) {
		// Hide the draw offer button and show the Practice Menu button
		element_offerDraw.classList.add('hidden');
		element_practicemenu.classList.remove('hidden');
	} else {
		// Show the draw offer button and hide the Practice Menu button
		element_offerDraw.classList.remove('hidden');
		element_practicemenu.classList.add('hidden');
		updateDrawOfferButton();
	}
	element_pauseUI.classList.remove('hidden');
	initListeners();

	boardpos.eraseMomentum();
	boarddrag.cancelBoardDrag();
	draganimation.dropPiece();
}

function toggle() {
	if (!isPaused) open();
	else callback_Resume();
}

function updatePasteButtonTransparency() {
	const moves = gameslot.getGamefile().boardsim.moves;

	const legalInPrivateMatch = onlinegame.areInOnlineGame() && onlinegame.getIsPrivate() && moves.length === 0;

	if (onlinegame.areInOnlineGame() && !legalInPrivateMatch) element_pastegame.classList.add('opacity-0_5');
	else                                                      element_pastegame.classList.remove('opacity-0_5');
}

function updatePerspectiveButtonTransparency() {
	if (docutil.isMouseSupported()) element_perspective.classList.remove('opacity-0_5');
	else element_perspective.classList.add('opacity-0_5');
}

/**
 * Update the draw offer button's text content to either say "Offer Draw"
 * or "Accept Draw", and update its transparency depending on whether it's legal.
 */
function updateDrawOfferButton() {
	if (!isPaused) return; // Not paused, no point in updating button, because it's updated as soon as we pause the game
	// Should it say "offer draw" or "accept draw"?
	if (drawoffers.areWeAcceptingDraw()) {
		element_offerDraw.innerText = translations.accept_draw; // "Accept Draw"
		element_offerDraw.classList.remove('opacity-0_5');
		return;
	} else element_offerDraw.innerText = translations.offer_draw; // "Offer Draw"

	// Update transparency
	if (drawoffers.isOfferingDrawLegal()) element_offerDraw.classList.remove('opacity-0_5');
	else element_offerDraw.classList.add('opacity-0_5');
}

function onReceiveOpponentsMove() {
	updateTextOfMainMenuButton({ freezeMainMenuButtonUponChange: true });
	updateDrawOfferButton();
}

function onReceiveGameConclusion() {
	updateTextOfMainMenuButton({ freezeMainMenuButtonUponChange: true });
}

/**
 * Updates the text content of the Main Menu button to either say
 * "Main Menu", "Abort Game", or "Resign Game", whichever is relevant
 * in the situation.
 * @param {Object} options - Additional options
 * @param {boolean} [options.freezeMainMenuButtonUponChange] - If true, and the main menu changes from "Abort" to "Resign" or from "Resign"/"Abort" to "Main Menu",
 * we will disable it and grey it out for 1 second so the player doesn't accidentally click resign when they wanted to abort or "Main Menu" when they wanted to resign.
 * This should only be true when called from onReceiveOpponentsMove() or onReceiveGameConclusion(), not on open()
 */
function updateTextOfMainMenuButton({ freezeMainMenuButtonUponChange } = {}) {
	if (!isPaused) return;

	if (!onlinegame.areInOnlineGame() || onlinegame.hasServerConcludedGame() || onlinegame.hasPlayerPressedAbortOrResignButton() ) {
		// If the text currently says "Abort Game" or "Resign Game", freeze the button for 1 second in case the user clicked it RIGHT after it switched text! They may have tried to abort or resign and actually not want to exit to main menu.
		if (freezeMainMenuButtonUponChange && element_mainmenu.textContent !== translations.main_menu) freezeMainMenuButton();
		element_mainmenu.textContent = translations.main_menu;
		is_main_menu_button_used_as_resign_or_abort_button = false;
		return;
	}

	is_main_menu_button_used_as_resign_or_abort_button = true;
	if (moveutil.isGameResignable(gameslot.getGamefile().basegame)) {
		// If the text currently says "Abort Game", freeze the button for 1 second in case the user clicked it RIGHT after it switched text! They may have tried to abort and actually not want to resign.
		if (freezeMainMenuButtonUponChange && element_mainmenu.textContent !== translations.resign_game) freezeMainMenuButton();
		element_mainmenu.textContent = translations.resign_game;
		return;
	}

	element_mainmenu.textContent = translations.abort_game;
}

/** Temporarily disable the main menu button for a certain number of milliseconds */
function freezeMainMenuButton() {
	element_mainmenu.disabled = true;
	element_mainmenu.classList.add('opacity-0_5');
	setTimeout(() => {
		element_mainmenu.disabled = false;
		element_mainmenu.classList.remove('opacity-0_5');
	}, MAIN_MENU_BUTTON_CHANGE_FREEZE_DURATION_MILLIS);
}

function initListeners() {
	element_resume.addEventListener('click', callback_Resume);
	element_pointers.addEventListener('click', callback_ToggleArrows);
	element_copygame.addEventListener('click', callback_CopyGame);
	element_pastegame.addEventListener('click', pastegame.callbackPaste);
	element_mainmenu.addEventListener('click', callback_MainMenu);
	element_practicemenu.addEventListener('click', callback_PracticeMenu);
	element_offerDraw.addEventListener('click', callback_OfferDraw);
	element_perspective.addEventListener('click', callback_Perspective);
}

function closeListeners() {
	element_resume.removeEventListener('click', callback_Resume);
	element_pointers.removeEventListener('click', callback_ToggleArrows);
	element_copygame.removeEventListener('click', callback_CopyGame);
	element_pastegame.removeEventListener('click', pastegame.callbackPaste);
	element_mainmenu.removeEventListener('click', callback_MainMenu);
	element_practicemenu.removeEventListener('click', callback_PracticeMenu);
	element_offerDraw.removeEventListener('click', callback_OfferDraw);
	element_perspective.removeEventListener('click', callback_Perspective);
}

function callback_CopyGame(event) {
	copygame.copyGame(false);
}

function callback_Resume() {
	if (!isPaused) return;
	isPaused = false;
	element_pauseUI.classList.add('hidden');
	closeListeners();
	frametracker.onVisualChange();
}

function callback_MainMenu() {
	callback_Resume();

	if (is_main_menu_button_used_as_resign_or_abort_button) onlinegame.onAbortOrResignButtonPress();
	// Unload and exit game immediately if the button text says "Main Menu"
	else {
		// Let the onlinegame script know that the player willingly presses the "Main Menu" button.
		// This can happen if the server has informed him that game has ended or if the player has already pressed the "Resign" or "Abort" during this game.
		if (onlinegame.areInOnlineGame()) onlinegame.onMainMenuButtonPress();

		gameloader.unloadGame();
		guititle.open();
	}
}

function callback_PracticeMenu() {
	callback_Resume();
	gameloader.unloadGame();

	guipractice.open();
}

/** Called when the Offer Draw button is clicked in the pause menu */
function callback_OfferDraw() {
	// Are we accepting a draw?
	if (drawoffers.areWeAcceptingDraw()) {
		drawoffers.callback_AcceptDraw();
		callback_Resume();
		return;
	}

	// Not accepting. Is it legal to extend, then?
	if (drawoffers.isOfferingDrawLegal()) {
		drawoffers.extendOffer();
		callback_Resume();
		return;
	}

	statustext.showStatus("Can't offer draw.");
}

function callback_ToggleArrows() {
	arrows.toggleArrows();
	const mode = arrows.getMode();
	const text = mode === 0 ? translations.arrows_off
               : mode === 1 ? translations.arrows_defense
			   : mode === 2 ? translations.arrows_all
                            : translations.arrows_all_hippogonals;
	element_pointers.textContent = text;
	if (!isPaused) statustext.showStatus(translations.toggled + " " + text);
}

function callback_Perspective() {
	// This prevents toggling perspective ON in the pause menu immediately erasing all annotations.
	listener_document.claimMouseClick(Mouse.LEFT);
	perspective.toggle();
}

export default {
	areWePaused,
	getelement_perspective,
	open,
	toggle,
	updateDrawOfferButton,
	onReceiveOpponentsMove,
	onReceiveGameConclusion,
	updateTextOfMainMenuButton,
	callback_Resume,
	callback_ToggleArrows,
};