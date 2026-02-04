// src/client/scripts/esm/game/gui/guipause.ts

/**
 * This script handles our Pause menu
 */

import onlinegame from '../misc/onlinegame/onlinegame.js';
import arrows from '../rendering/arrows/arrows.js';
import toast from './toast.js';
import copygame from '../chess/copygame.js';
import pastegame from '../chess/pastegame.js';
import drawoffers from '../misc/onlinegame/drawoffers.js';
import guititle from './guititle.js';
import moveutil from '../../../../../shared/chess/util/moveutil.js';
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
import { GameBus } from '../GameBus.js';

// Types --------------------------------------------------------

interface UpdateTextOfMainMenuButtonOptions {
	/** If true, and the main menu changes from "Abort" to "Resign" or from "Resign"/"Abort" to "Main Menu",
	 * we will disable it and grey it out for 1 second so the player doesn't accidentally click resign when they wanted to abort or "Main Menu" when they wanted to resign.
	 * This should only be true when called from onReceiveOpponentsMove() or onReceiveGameConclusion(), not on open()
	 */
	freezeMainMenuButtonUponChange?: boolean;
}

// Variables ---------------------------------------------------------

// Pause UI
let isPaused: boolean = false;
/** This is true if the main menu button says "Resign Game" or "Abort Game". In all other cases, this is false. */
let is_main_menu_button_used_as_resign_or_abort_button: boolean = false;
/** Amount of milliseconds to freeze the Main Menu button after the text on it changes */
const MAIN_MENU_BUTTON_CHANGE_FREEZE_DURATION_MILLIS: number = 1000;

const element_pauseUI: HTMLElement = document.getElementById('pauseUI')!;
const element_resume: HTMLElement = document.getElementById('resume')!;
const element_pointers: HTMLElement = document.getElementById('togglepointers')!;
const element_copygame: HTMLElement = document.getElementById('copygame')!;
const element_pastegame: HTMLElement = document.getElementById('pastegame')!;
const element_mainmenu: HTMLButtonElement = document.getElementById(
	'mainmenu',
)! as HTMLButtonElement;
const element_practicemenu: HTMLElement = document.getElementById('practicemenu')!;
const element_offerDraw: HTMLElement = document.getElementById('offerdraw')!;
const element_perspective: HTMLElement = document.getElementById('toggleperspective')!;

// Events -----------------------------------------------------------------------------------

GameBus.addEventListener('game-concluded', () => {
	updateTextOfMainMenuButton({ freezeMainMenuButtonUponChange: true });
});

// Functions --------------------------------------------------------------------------------

/**
 * Returns *true* if the game is currently paused.
 */
function areWePaused(): boolean {
	return isPaused;
}

/**
 * Returns the perspective toggle button element.
 */
function getelement_perspective(): HTMLElement {
	return element_perspective;
}

/** Opens the pause menu. */
function open(): void {
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

/** Toggles the pause menu open or closed. */
function toggle(): void {
	if (!isPaused) open();
	else callback_Resume();
}

/** Updates the paste button's transparency depending on whether pasting is legal. */
function updatePasteButtonTransparency(): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;
	const moves = gamefile.boardsim.moves;

	const legalInPrivateMatch =
		onlinegame.areInOnlineGame() && onlinegame.getIsPrivate() && moves.length === 0;

	if (onlinegame.areInOnlineGame() && !legalInPrivateMatch)
		element_pastegame.classList.add('opacity-0_5');
	else element_pastegame.classList.remove('opacity-0_5');
}

/** Updates the perspective button's transparency depending on whether a mouse is supported. */
function updatePerspectiveButtonTransparency(): void {
	if (docutil.isMouseSupported()) element_perspective.classList.remove('opacity-0_5');
	else element_perspective.classList.add('opacity-0_5');
}

/**
 * Update the draw offer button's text content to either say "Offer Draw"
 * or "Accept Draw", and update its transparency depending on whether it's legal.
 */
function updateDrawOfferButton(): void {
	if (!isPaused) return; // Not paused, no point in updating button, because it's updated as soon as we pause the game
	// Should it say "offer draw" or "accept draw"?
	if (drawoffers.areWeAcceptingDraw()) {
		element_offerDraw.innerText = translations['accept_draw']; // "Accept Draw"
		element_offerDraw.classList.remove('opacity-0_5');
		return;
	} else element_offerDraw.innerText = translations['offer_draw']; // "Offer Draw"

	// Update transparency
	if (drawoffers.isOfferingDrawLegal()) element_offerDraw.classList.remove('opacity-0_5');
	else element_offerDraw.classList.add('opacity-0_5');
}

/** Called when we receive an opponent's move, to update the pause menu buttons. */
function onReceiveOpponentsMove(): void {
	updateTextOfMainMenuButton({ freezeMainMenuButtonUponChange: true });
	updateDrawOfferButton();
}

/**
 * Updates the text content of the Main Menu button to either say
 * "Main Menu", "Abort Game", or "Resign Game", whichever is relevant
 * in the situation.
 */
function updateTextOfMainMenuButton({
	freezeMainMenuButtonUponChange,
}: UpdateTextOfMainMenuButtonOptions = {}): void {
	if (!isPaused) return;

	if (
		!onlinegame.areInOnlineGame() ||
		onlinegame.hasServerConcludedGame() ||
		onlinegame.hasPlayerPressedAbortOrResignButton()
	) {
		// If the text currently says "Abort Game" or "Resign Game", freeze the button for 1 second in case the user clicked it RIGHT after it switched text! They may have tried to abort or resign and actually not want to exit to main menu.
		if (
			freezeMainMenuButtonUponChange &&
			element_mainmenu.textContent !== translations['main_menu']
		)
			freezeMainMenuButton();
		element_mainmenu.textContent = translations['main_menu'];
		is_main_menu_button_used_as_resign_or_abort_button = false;
		return;
	}

	is_main_menu_button_used_as_resign_or_abort_button = true;
	const gamefile = gameslot.getGamefile();
	if (gamefile && moveutil.isGameResignable(gamefile.basegame)) {
		// If the text currently says "Abort Game", freeze the button for 1 second in case the user clicked it RIGHT after it switched text! They may have tried to abort and actually not want to resign.
		if (
			freezeMainMenuButtonUponChange &&
			element_mainmenu.textContent !== translations['resign_game']
		)
			freezeMainMenuButton();
		element_mainmenu.textContent = translations['resign_game'];
		return;
	}

	element_mainmenu.textContent = translations['abort_game'];
}

/** Temporarily disable the main menu button for a certain number of milliseconds */
function freezeMainMenuButton(): void {
	element_mainmenu.disabled = true;
	element_mainmenu.classList.add('opacity-0_5');
	setTimeout(() => {
		element_mainmenu.disabled = false;
		element_mainmenu.classList.remove('opacity-0_5');
	}, MAIN_MENU_BUTTON_CHANGE_FREEZE_DURATION_MILLIS);
}

/** Initializes event listeners for the pause menu buttons. */
function initListeners(): void {
	element_resume.addEventListener('click', callback_Resume);
	element_pointers.addEventListener('click', callback_ToggleArrows);
	element_copygame.addEventListener('click', callback_CopyGame);
	element_pastegame.addEventListener('click', pastegame.callbackPaste);
	element_mainmenu.addEventListener('click', callback_MainMenu);
	element_practicemenu.addEventListener('click', callback_PracticeMenu);
	element_offerDraw.addEventListener('click', callback_OfferDraw);
	element_perspective.addEventListener('click', callback_Perspective);
}

/** Removes event listeners for the pause menu buttons. */
function closeListeners(): void {
	element_resume.removeEventListener('click', callback_Resume);
	element_pointers.removeEventListener('click', callback_ToggleArrows);
	element_copygame.removeEventListener('click', callback_CopyGame);
	element_pastegame.removeEventListener('click', pastegame.callbackPaste);
	element_mainmenu.removeEventListener('click', callback_MainMenu);
	element_practicemenu.removeEventListener('click', callback_PracticeMenu);
	element_offerDraw.removeEventListener('click', callback_OfferDraw);
	element_perspective.removeEventListener('click', callback_Perspective);
}

/** Called when the copy game button is clicked. */
function callback_CopyGame(_event: Event): void {
	copygame.copyGame(false);
}

/** Called when the resume button is clicked. */
function callback_Resume(): void {
	if (!isPaused) return;
	isPaused = false;
	element_pauseUI.classList.add('hidden');
	closeListeners();
	frametracker.onVisualChange();
}

/** Called when the main menu button is clicked. */
function callback_MainMenu(): void {
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

/** Called when the practice menu button is clicked. */
function callback_PracticeMenu(): void {
	callback_Resume();
	gameloader.unloadGame();

	guipractice.open();
}

/** Called when the Offer Draw button is clicked in the pause menu */
function callback_OfferDraw(): void {
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

	toast.show("Can't offer draw.");
}

/** Called when the toggle arrows button is clicked. */
function callback_ToggleArrows(): void {
	arrows.toggleArrows();
	const mode = arrows.getMode();
	// prettier-ignore
	const text = mode === 0 ? translations['arrows_off']
               : mode === 1 ? translations['arrows_defense']
			   : mode === 2 ? translations['arrows_all']
			   : translations['arrows_all_hippogonals'];
	element_pointers.textContent = text;
	if (!isPaused) toast.show(translations['toggled'] + ' ' + text);
}

/** Called when the perspective button is clicked. */
function callback_Perspective(): void {
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
	callback_Resume,
	callback_ToggleArrows,
};
