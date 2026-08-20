// src/client/scripts/esm/views/game/tabnameflash.ts

/**
 * This script controls the flashing of the tab name "YOUR MOVE"
 * when it is your turn and your in another tab.
 */

import bd from '@naviary/bigdecimal';

import moveutil from '../../../../../shared/chess/util/moveutil.js';

import gameslot from '../../game/chess/gameslot.js';
import movesound from '../../game/misc/movesound.js';
import { GameBus } from '../../game/GameBus.js';
import gamesession from '../../game/chess/gamesession.js';

/** Number of millis to wait before reminding us a 2nd time it's our move by playing a sound effect. */
const MOVE_SOUND_REMINDER_MS: number = 1000 * 20; // 20 seconds

/** The original tab title. We will always revert to this after temporarily changing the name name to alert player's it's their move. */
const originalDocumentTitle: string = document.title;

/** How rapidly the tab title should flash "YOUR MOVE" */
const periodicityMillis = 1500;

/** The ID of the timeout that can be used to cancel the timer that flips the tab title between "YOUR MOVE" and the default title. */
let timeoutID: ReturnType<typeof setTimeout> | undefined;

/** The ID of the timeout that can be used to cancel the timer that will play a move sound effect to help you realize it's your move. Typically about 20 seconds. */
let moveSound_timeoutID: ReturnType<typeof setTimeout> | undefined;

GameBus.addEventListener('game-loaded', () =>
	gamesession.isItOurTurn() ? onOurTurn() : onOpponentsTurn(),
);
GameBus.addEventListener('game-concluded', () => {
	cancelFlashTabTimer();
	cancelMoveSound();
});
GameBus.addEventListener('user-move-played', () => onOpponentsTurn());
GameBus.addEventListener('opponent-move-played', () => onOurTurn());
// Returning to the tab clears any active alert: restore the title and cancel the pending reminder sound.
document.addEventListener('visibilitychange', () => {
	if (document.hidden) return;
	cancelFlashTabTimer();
	cancelMoveSound();
});

/** It's now our turn: flash the tab name and schedule a reminder sound. */
function onOurTurn(): void {
	flashTabNameYOUR_MOVE(true);
	scheduleMoveSound_timeoutID();
}

/** It's now the opponent's turn: stop flashing the tab name. */
function onOpponentsTurn(): void {
	cancelFlashTabTimer();
}

/**
 * Toggles the document title showing "YOUR MOVE",
 * and sets a timer for the next toggle.
 * @param parity - If true, the tab name becomes "YOUR MOVE", otherwise it reverts to the original title
 */
function flashTabNameYOUR_MOVE(parity: boolean): void {
	if (!document.hidden) {
		// The page is no longer hidden, restore the tab's original title,
		// and stop flashing "YOUR MOVE"
		document.title = originalDocumentTitle;
		return;
	}

	document.title = parity ? 'YOUR MOVE' : originalDocumentTitle;
	// Set a timer for the next toggle
	timeoutID = setTimeout(flashTabNameYOUR_MOVE, periodicityMillis, !parity);
}

function cancelFlashTabTimer(): void {
	document.title = originalDocumentTitle;
	clearTimeout(timeoutID);
	timeoutID = undefined;
}

function scheduleMoveSound_timeoutID(): void {
	if (!document.hidden) return; // Don't schedule it if the page is already visible
	if (!moveutil.isGameResignable(gameslot.getGamefile()!)) return;
	const ZERO = bd.fromBigInt(0n);
	moveSound_timeoutID = setTimeout(
		() => movesound.playMove(ZERO, false, false),
		MOVE_SOUND_REMINDER_MS,
	);
}

function cancelMoveSound(): void {
	clearTimeout(moveSound_timeoutID);
	moveSound_timeoutID = undefined;
}
