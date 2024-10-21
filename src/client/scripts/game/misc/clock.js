
// Import Start
import onlinegame from './onlinegame.js';
import game from '../chess/game.js';
import movesscript from '../chess/movesscript.js';
import gamefileutility from '../chess/gamefileutility.js';
import timeutil from './timeutil.js';
// Import End

/**
 * @typedef {import('../chess/gamefile').gamefile} gamefile
 */

"use strict";

/**
 * This script keeps track of both players timer, updates them,
 * and ends game if somebody loses on time.
 */
/**
 * Sets the clocks.
 * @param {gamefile} gamefile 
 * @param {string} clock - The clock value (e.g. "10+5").
 * @param {Object} [currentTimes] - An object containing the properties `timerWhite`, and `timerBlack` for the current time of the players. Often used if we re-joining an online game.
 */
function set(gamefile, clock, currentTimes) {
	gamefile.startTime.minutes = null;
	gamefile.startTime.millis = null;
	gamefile.startTime.increment = null;

	const clockPartsSplit = timeutil.getMinutesAndIncrementFromClock(clock); // { minutes, increment }
	if (clockPartsSplit !== null) {
		gamefile.startTime.minutes = clockPartsSplit.minutes;
		gamefile.startTime.millis = timeutil.minutesToMillis(gamefile.startTime.minutes);
		gamefile.startTime.increment = clockPartsSplit.increment;
	}

	// Edit the closk if we're re-loading an online game
	if (currentTimes) edit(gamefile, currentTimes.timerWhite, currentTimes.timerBlack, currentTimes.timeNextPlayerLosesAt);
	else { // No current time specified, start both players with the default.
		gamefile.currentTime.white = gamefile.startTime.millis;
		gamefile.currentTime.black = gamefile.startTime.millis;
	}

	gamefile.untimed = timeutil.isClockValueInfinite(clock);
}

/**
 * Called when receive updated clock info from the server.
 * @param {gamefile} gamefile
 * @param {number} newTimeWhite - White's current time, in milliseconds.
 * @param {number} newTimeBlack - Black's current time, in milliseconds.
 * @param {number} timeNextPlayerLoses - The time at which the current player will lose on time if they don't move in time.
 */
function edit(gamefile, newTimeWhite, newTimeBlack, timeNextPlayerLoses) {   
	gamefile.colorTicking = gamefile.whosTurn; // Update colorTicking because we don't call push() with this.

	gamefile.currentTime.white = newTimeWhite;
	gamefile.currentTime.black = newTimeBlack;
	gamefile.timeNextPlayerLosesAt = timeNextPlayerLoses;
	const now = Date.now();
	gamefile.timeAtTurnStart = now;

	if (timeNextPlayerLoses) {
		const nextPlayerTrueTime = timeNextPlayerLoses - now;
		gamefile.currentTime[gamefile.colorTicking] = nextPlayerTrueTime;
	}
	gamefile.timeRemainAtTurnStart = gamefile.colorTicking === 'white' ? gamefile.currentTime.white : gamefile.currentTime.black;
}

/**
 * Call after flipping whosTurn. Flips colorTicking in local games.
 * @param {gamefile} gamefile 
 */
function push(gamefile) {
	if (onlinegame.areInOnlineGame()) return; // Only the server can push clocks
	if (gamefile.untimed) return;
	if (!movesscript.isGameResignable(gamefile)) return; // Don't push unless atleast 2 moves have been played

	// Add increment
	currentTime[gamefile.colorTicking] += timeutil.secondsToMillis(gamefile.startTime.increment);
	// Flip colorTicking
	gamefile.colorTicking = gamefile.whosTurn;

	gamefile.timeRemainAtTurnStart = currentTime[gamefile.colorTicking];
	gamefile.timeAtTurnStart = Date.now();
	gamefile.timeNextPlayerLosesAt = gamefile.timeAtTurnStart + gamefile.timeRemainAtTurnStart;
}

function endGame(gamefile) {
	gamefile.timeRemainAtTurnStart = undefined;
	gamefile.timeAtTurnStart = undefined;
	gamefile.timeNextPlayerLosesAt = undefined;
	gamefile.colorTicking = undefined;
}

/**
 * Called every frame, updates values.
 * @param {gamefile} gamefile
*/
function update(gamefile) {
	if (gamefile.untimed || gamefile.gameConclusion || !movesscript.isGameResignable(gamefile) || gamefile.timeAtTurnStart === undefined) return;

	// Update current values
	const timePassedSinceTurnStart = Date.now() - gamefile.timeAtTurnStart;
	if (gamefile.colorTicking === 'white') gamefile.currentTime.white = Math.ceil(gamefile.timeRemainAtTurnStart - timePassedSinceTurnStart);
	else gamefile.currentTime.black = Math.ceil(gamefile.timeRemainAtTurnStart - timePassedSinceTurnStart);

	// Has either clock run out of time?
	if (onlinegame.areInOnlineGame()) return; // Don't conclude game by time if in an online game, only the server does that.
	if (currentTime.white <= 0) {
		gamefile.gameConclusion = 'black time';
		gamefileutility.concludeGame(game.getGamefile());
	} else if (currentTime.black <= 0) {
		gamefile.gameConclusion = 'white time';
		gamefileutility.concludeGame(game.getGamefile());
	}
}

/**
 * 
 * @param {gamefile} gamefile 
 */
function printClocks(gamefile) {
	console.log(`White time: ${gamefile.currentTime.white}`);
	console.log(`Black time: ${gamefile.currentTime.black}`);
	console.log(`timeRemainAtTurnStart: ${gamefile.timeRemainAtTurnStart}`);
	console.log(`timeAtTurnStart: ${gamefile.timeAtTurnStart}`);
}

/**
 * Returns true if the current game is untimed (infinite clocks) 
 * @param {gamefile} gamefile 
 */
function isGameUntimed(gamefile) {
	return gamefile.untimed;
}

export default {
	set,
	edit,
	endGame,
	update,
	push,
	printClocks,
	isGameUntimed,
};