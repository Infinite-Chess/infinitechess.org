// src/client/scripts/esm/views/checkmatepractice/gui/guipracticeactions.ts

/**
 * Manages the practice actions in the practice page's side bar:
 * undo move, restart the checkmate, and back to the selection list.
 */

import { GameBus } from '../../../board/GameBus.js';
import guipractice from './guipractice.js';
import practicegame from '../practicegame.js';

// Elements ----------------------------------------------------------------------

const element_Undo = document.getElementById('btn-practice-undo') as HTMLButtonElement;
const element_Restart = document.getElementById('btn-practice-restart') as HTMLButtonElement;
const element_Back = document.getElementById('btn-practice-back') as HTMLButtonElement;

// Events ------------------------------------------------------------------------

// practicegame's own listeners for these registered first (importing it above executes
// it first), so its undo-legality state is already fresh when the button repaints.
GameBus.addEventListener('game-loaded', () => updateUndoButton());
GameBus.addEventListener('user-move-played', () => updateUndoButton());
GameBus.addEventListener('engine-move-played', () => updateUndoButton());
GameBus.addEventListener('game-concluded', () => updateUndoButton());

// Functions -----------------------------------------------------------------------

/** Enables the undo button exactly while undoing is legal. */
function updateUndoButton(): void {
	element_Undo.disabled = !practicegame.isUndoingLegal();
}

/** Undoes the player's last move (and the engine's reply, when it's our turn). */
function callback_Undo(): void {
	practicegame.undoMove();
	updateUndoButton();
}

/** Wires the click listeners for every practice action button. */
function initListeners(): void {
	element_Undo.addEventListener('click', callback_Undo);
	element_Restart.addEventListener('click', () => practicegame.restartGame());
	element_Back.addEventListener('click', () => guipractice.open());
}

initListeners();
