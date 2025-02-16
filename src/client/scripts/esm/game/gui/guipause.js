
// Import Start
import onlinegame from '../misc/onlinegame/onlinegame.js';
import arrows from '../rendering/arrows/arrows.js';
import statustext from './statustext.js';
import copypastegame from '../chess/copypastegame.js';
import drawoffers from '../misc/onlinegame/drawoffers.js';
import moveutil from '../../chess/util/moveutil.js';
import perspective from '../rendering/perspective.js';
import frametracker from '../rendering/frametracker.js';
import gameloader from '../chess/gameloader.js';
import gameslot from '../chess/gameslot.js';
// Import End

"use strict";

/**
 * This script handles our Pause menu
 */

// Pause UI
let isPaused = false;
const element_pauseUI = document.getElementById('pauseUI');
const element_resume = document.getElementById('resume');
const element_pointers = document.getElementById('togglepointers');
const element_copygame = document.getElementById('copygame');
const element_pastegame = document.getElementById('pastegame');
const element_mainmenu = document.getElementById('mainmenu');
const element_offerDraw = document.getElementById('offerdraw');
const element_perspective = document.getElementById('toggleperspective');
let returnPage;

// Functions

/**
 * Returns *true* if the game is currently paused.
 * @returns {boolean}
 */
function areWePaused() { return isPaused; }

function getelement_perspective() {
	return element_perspective;
}

function init(page) {
	returnPage = page;
}

function open() {
	isPaused = true;
	updateTextOfMainMenuButton();
	updatePasteButtonTransparency();
	updateDrawOfferButton();
	element_pauseUI.classList.remove('hidden');
	initListeners();
}

function toggle() {
	if (!isPaused) open();
	else callback_Resume();
}

function updatePasteButtonTransparency() {
	const moves = gameslot.getGamefile().moves;

	const legalInPrivateMatch = onlinegame.areInOnlineGame() && onlinegame.getIsPrivate() && moves.length === 0;

	if (onlinegame.areInOnlineGame() && !legalInPrivateMatch) element_pastegame.classList.add('opacity-0_5');
	else                                                      element_pastegame.classList.remove('opacity-0_5');
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
	updateTextOfMainMenuButton({ freezeResignButtonIfNoLongerAbortable: true });
	updateDrawOfferButton();
}

/**
 * Updates the text content of the Main Menu button to either say
 * "Main Menu", "Abort Game", or "Resign Game", whichever is relevant
 * in the situation.
 * @param {Object} options - Additional options
 * @param {boolean} [options.freezeResignButtonIfNoLongerAbortable] - If true, and the main menu changes from "Abort" to "Resign",
 * we will disable it and grey it out for 1 second so the player doesn't accidentally click resign when they wanted to abort.
 * This should only be true when called from onReceiveOpponentsMove(), not on open()
 */
function updateTextOfMainMenuButton({ freezeResignButtonIfNoLongerAbortable } = {}) {
	if (!isPaused) return;

	if (!onlinegame.areInOnlineGame() || onlinegame.hasServerConcludedGame()) return element_mainmenu.textContent = translations.main_menu;

	if (moveutil.isGameResignable(gameslot.getGamefile())) {
		// If the text currently says "Abort Game", freeze the button for 1 second in case the user clicked it RIGHT after it switched text! They may have tried to abort and actually not want to resign.
		if (freezeResignButtonIfNoLongerAbortable && element_mainmenu.textContent === translations.abort_game) {
			element_mainmenu.disabled = true;
			element_mainmenu.classList.add('opacity-0_5');
			setTimeout(() => {
				element_mainmenu.disabled = false;
				element_mainmenu.classList.remove('opacity-0_5');
			}, 1000);
		}
		element_mainmenu.textContent = translations.resign_game;
		return;
	}

	element_mainmenu.textContent = translations.abort_game;
}

function initListeners() {
	element_resume.addEventListener('click', callback_Resume);
	element_pointers.addEventListener('click', callback_ToggleArrows);
	element_copygame.addEventListener('click', callback_CopyGame);
	element_pastegame.addEventListener('click', copypastegame.callbackPaste);
	element_mainmenu.addEventListener('click', callback_MainMenu);
	element_offerDraw.addEventListener('click', callback_OfferDraw);
	element_perspective.addEventListener('click', callback_Perspective);
}

function closeListeners() {
	element_resume.removeEventListener('click', callback_Resume);
	element_pointers.removeEventListener('click', callback_ToggleArrows);
	element_copygame.removeEventListener('click', callback_CopyGame);
	element_pastegame.removeEventListener('click', copypastegame.callbackPaste);
	element_mainmenu.removeEventListener('click', callback_MainMenu);
	element_offerDraw.removeEventListener('click', callback_OfferDraw);
	element_perspective.removeEventListener('click', callback_Perspective);
}

function callback_CopyGame(event) {
	copypastegame.copyGame(false);
}

function callback_Resume() {
	if (!isPaused) return;
	isPaused = false;
	element_pauseUI.classList.add('hidden');
	closeListeners();
	frametracker.onVisualChange();
}

function callback_MainMenu() {
	onlinegame.onMainMenuPress();
	callback_Resume();
	gameloader.unloadGame();
	const temp = returnPage;
	returnPage = undefined;

	const currentUrl = document.location.href;
	const baseUrl = currentUrl.substring(0, currentUrl.length - 4);
	document.location.href = baseUrl + (temp ?? (() => { throw new Error("No destination to return to!"); }));
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
	perspective.toggle();
}

export default {
	areWePaused,
	getelement_perspective,
	open,
	toggle,
	updateDrawOfferButton,
	onReceiveOpponentsMove,
	updateTextOfMainMenuButton,
	callback_Resume,
	callback_ToggleArrows,
	init,
};