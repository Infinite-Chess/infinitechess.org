
// Import Start
import onlinegame from './onlinegame.js';
import movesscript from '../chess/movesscript.js';
import clockutil from './clockutil.js';
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
	const clocks = gamefile.clocks;

	clocks.startTime.minutes = null;
	clocks.startTime.millis = null;
	clocks.startTime.increment = null;

	const clockPartsSplit = clockutil.getMinutesAndIncrementFromClock(clock); // { minutes, increment }
	if (clockPartsSplit !== null) {
		clocks.startTime.minutes = clockPartsSplit.minutes;
		clocks.startTime.millis = timeutil.minutesToMillis(clocks.startTime.minutes);
		clocks.startTime.increment = clockPartsSplit.increment;
	}

	// Edit the closk if we're re-loading an online game
	if (currentTimes) edit(gamefile, currentTimes.timerWhite, currentTimes.timerBlack, currentTimes.timeNextPlayerLosesAt);
	else { // No current time specified, start both players with the default.
		clocks.currentTime.white = clocks.startTime.millis;
		clocks.currentTime.black = clocks.startTime.millis;
	}

	clocks.untimed = clockutil.isClockValueInfinite(clock);
}

/**
 * Called when receive updated clock info from the server.
 * @param {gamefile} gamefile
 * @param {number} newTimeWhite - White's current time, in milliseconds.
 * @param {number} newTimeBlack - Black's current time, in milliseconds.
 * @param {number} timeNextPlayerLoses - The time at which the current player will lose on time if they don't move in time.
 */
function edit(gamefile, newTimeWhite, newTimeBlack, timeNextPlayerLoses) {
	const clocks = gamefile.clocks;

	clocks.currentTime.white = newTimeWhite;
	clocks.currentTime.black = newTimeBlack;
	clocks.timeNextPlayerLosesAt = timeNextPlayerLoses;
	const now = Date.now();
	clocks.timeAtTurnStart = now;

	if (timeNextPlayerLoses) {
		const nextPlayerTrueTime = timeNextPlayerLoses - now;
		clocks.currentTime[gamefile.whosTurn] = nextPlayerTrueTime;
	}
	clocks.timeRemainAtTurnStart = gamefile.whosTurn === 'white' ? clocks.currentTime.white : clocks.currentTime.black;
}

/**
 * Call after flipping whosTurn. Flips colorTicking in local games.
 * @param {gamefile} gamefile 
 */
function push(gamefile) {
	const clocks = gamefile.clocks;

	if (onlinegame.areInOnlineGame()) return; // Only the server can push clocks
	if (clocks.untimed) return;
	if (!movesscript.isGameResignable(gamefile)) return; // Don't push unless atleast 2 moves have been played
	
	// Add increment if the last move has a clock ticking
	if (clocks.timeAtTurnStart !== undefined) {
		const prevcolor = movesscript.getWhosTurnAtMoveIndex(gamefile, gamefile.moves.length - 2);
		clocks.currentTime[prevcolor] += timeutil.secondsToMillis(clocks.startTime.increment);
	}

	clocks.timeRemainAtTurnStart = clocks.currentTime[gamefile.whosTurn];
	clocks.timeAtTurnStart = Date.now();
	clocks.timeNextPlayerLosesAt = clocks.timeAtTurnStart + clocks.timeRemainAtTurnStart;
}

function endGame(gamefile) {
	const clocks = gamefile.clocks;
	clocks.timeRemainAtTurnStart = undefined;
	clocks.timeAtTurnStart = undefined;
	clocks.timeNextPlayerLosesAt = undefined;
}

/**
 * Called every frame, updates values.
 * @param {gamefile} gamefile
 * @returns {undefined | string} undefined if clocks still have time, otherwise it's the color who won.
*/
function update(gamefile) {
	const clocks = gamefile.clocks;
	if (clocks.untimed || gamefile.gameConclusion || !movesscript.isGameResignable(gamefile) || clocks.timeAtTurnStart === undefined) return;

	// Update current values
	const timePassedSinceTurnStart = Date.now() - clocks.timeAtTurnStart;

	clocks.currentTime[gamefile.whosTurn] = Math.ceil(clocks.timeRemainAtTurnStart - timePassedSinceTurnStart);

	// Has either clock run out of time?
	if (onlinegame.areInOnlineGame()) return; // Don't conclude game by time if in an online game, only the server does that.
	// TODO: update when lose conditions are added
	if (clocks.currentTime.white <= 0) return 'black';
	else if (clocks.currentTime.black <= 0) return 'white';
}

/**
 * 
 * @param {gamefile} gamefile 
 */
function printClocks(gamefile) {
	const clocks = gamefile.clocks;
	for (const color in clocks.currentTime) {
		console.log(`${color} time: ${clocks.currentTime[color]}`);
	}
	console.log(`timeRemainAtTurnStart: ${clocks.timeRemainAtTurnStart}`);
	console.log(`timeAtTurnStart: ${clocks.timeAtTurnStart}`);
}

/**
 * Returns true if the current game is untimed (infinite clocks) 
 * @param {gamefile} gamefile 
 */
function isGameUntimed(gamefile) {
	return gamefile.clocks.untimed;
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