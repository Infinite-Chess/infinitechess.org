
// Import Start
import style from '../gui/style.js';
import onlinegame from './onlinegame.js';
import game from '../chess/game.js';
import sound from './sound.js';
import movesscript from '../chess/movesscript.js';
import gamefileutility from '../chess/gamefileutility.js';
import timeutil from './timeutil.js';
// Import End

"use strict";

/**
 * This script keeps track of both players timer, updates them,
 * and ends game if somebody loses on time.
 */
// TODO: gamefile data
/** True if the game is not timed. */
let untimed;
/** Contains information about the start time of the game. */
const startTime = {
	/** The number of minutes both sides started with. */
	minutes: undefined,
	/** The number of miliseconds both sides started with. */
	millis: undefined,
	/** The increment used, in milliseconds. */
	increment: undefined,
};

/** The time each player has remaining, in milliseconds. */
const currentTime = {
	white: undefined,
	black: undefined,
};

/** Which color's clock is currently running. This is usually the same as the gamefile's whosTurn property. */
let colorTicking;
/** The amount of time in millis the current player had at the beginning of their turn, in milliseconds. */
let timeRemainAtTurnStart;
/** The time at the beginning of the current player's turn, in milliseconds elapsed since the Unix epoch. */
let timeAtTurnStart;
let timeNextPlayerLosesAt;

// TODO: clock logic
/**
 * Sets the clocks.
 * @param {string} clock - The clock value (e.g. "10+5").
 * @param {Object} [currentTimes] - An object containing the properties `timerWhite`, and `timerBlack` for the current time of the players. Often used if we re-joining an online game.
 */
function set(clock, currentTimes) {
	const gamefile = game.getGamefile();
	if (!gamefile) return console.error("Game must be initialized before starting the clocks.");

	startTime.minutes = null;
	startTime.millis = null;
	startTime.increment = null;

	const clockPartsSplit = getMinutesAndIncrementFromClock(clock); // { minutes, increment }
	if (clockPartsSplit !== null) {
		startTime.minutes = clockPartsSplit.minutes;
		startTime.millis = timeutil.minutesToMillis(startTime.minutes);
		startTime.increment = clockPartsSplit.increment;
	}

	// Edit the closk if we're re-loading an online game
	if (currentTimes) edit(currentTimes.timerWhite, currentTimes.timerBlack, currentTimes.timeNextPlayerLosesAt);
	else { // No current time specified, start both players with the default.
		currentTime.white = startTime.millis;
		currentTime.black = startTime.millis;
	}

	untimed = isClockValueInfinite(clock);
}

// TODO: clock logic
/**
 * Called when receive updated clock info from the server.
 * @param {number} newTimeWhite - White's current time, in milliseconds.
 * @param {number} newTimeBlack - Black's current time, in milliseconds.
 * @param {number} timeNextPlayerLoses - The time at which the current player will lose on time if they don't move in time.
 */
function edit(newTimeWhite, newTimeBlack, timeNextPlayerLoses) {   
	const gamefile = game.getGamefile();
	colorTicking = gamefile.whosTurn; // Update colorTicking because we don't call push() with this.

	currentTime.white = newTimeWhite;
	currentTime.black = newTimeBlack;
	timeNextPlayerLosesAt = timeNextPlayerLoses;
	const now = Date.now();
	timeAtTurnStart = now;

	if (timeNextPlayerLoses) {
		const nextPlayerTrueTime = timeNextPlayerLoses - now;
		currentTime[colorTicking] = nextPlayerTrueTime;
	}
	timeRemainAtTurnStart = colorTicking === 'white' ? currentTime.white : currentTime.black;
}

// clock logic
/**
 * Call after flipping whosTurn. Flips colorTicking in local games.
 */
function push() {
	if (onlinegame.areInOnlineGame()) return; // Only the server can push clocks
	if (untimed) return;
	const gamefile = game.getGamefile();
	if (!movesscript.isGameResignable(gamefile)) return; // Don't push unless atleast 2 moves have been played

	// Add increment
	currentTime[colorTicking] += timeutil.secondsToMillis(startTime.increment);
	// Flip colorTicking
	colorTicking = gamefile.whosTurn;

	timeRemainAtTurnStart = currentTime[colorTicking];
	timeAtTurnStart = Date.now();
	timeNextPlayerLosesAt = timeAtTurnStart + timeRemainAtTurnStart;

	// TODO clock gui

}

// TODO: clock logic
function endGame() {
	timeRemainAtTurnStart = undefined;
	timeAtTurnStart = undefined;
	timeNextPlayerLosesAt = undefined;
	colorTicking = undefined;
}

function reset() {
	stop();
	untimed = undefined;
	startTime.minutes = undefined;
	startTime.millis = undefined;
	startTime.increment = undefined;
	currentTime.white = undefined;
	currentTime.black = undefined;
}

// TODO: clock logic
/** Called every frame, updates values. */
function update() {
	const gamefile = game.getGamefile();
	if (untimed || gamefile.gameConclusion || !movesscript.isGameResignable(gamefile) || timeAtTurnStart == null) return;

	// Update border color
	if (colorTicking === 'white') updateBorderColor(element_timerWhite, currentTime.white);
	else updateBorderColor(element_timerBlack, currentTime.black);

	// Update current values
	const timePassedSinceTurnStart = Date.now() - timeAtTurnStart;
	if (colorTicking === 'white') currentTime.white = Math.ceil(timeRemainAtTurnStart - timePassedSinceTurnStart);
	else currentTime.black = Math.ceil(timeRemainAtTurnStart - timePassedSinceTurnStart);

	updateTextContent();

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

// TODO: clock logic
/**
 * Returns the clock in a slightly more human-readable format: `10m+5s`
 * @param {string} key - The clock string: `600+5`, where the left is the start time in seconds, right is increment in seconds.
 * @returns {string}
 */
function getClockFromKey(key) { // ssss+ss  converted to  15m+15s
	const minutesAndIncrement = getMinutesAndIncrementFromClock(key);
	if (minutesAndIncrement === null) return translations.no_clock;
	return `${minutesAndIncrement.minutes}m+${minutesAndIncrement.increment}s`;
}

// TODO: clock logic
/**
 * Splits the clock from the form `10+5` into the `minutes` and `increment` properties.
 * If it is an untimed game (represented by `-`), then this will return null.
 * @param {string} clock - The string representing the clock value: `10+5`
 * @returns {Object} An object with 2 properties: `minutes`, `increment`, or `null` if the clock is infinite.
 */
function getMinutesAndIncrementFromClock(clock) {
	if (isClockValueInfinite(clock)) return null;
	const [ seconds, increment ] = clock.split('+').map(part => +part); // Convert them into a number
	const minutes = seconds / 60;
	return { minutes, increment };
}

// TODO: clock logic
/**
 * Returns true if the clock value is infinite. Internally, untimed games are represented with a "-".
 * @param {string} clock - The clock value (e.g. "10+5").
 * @returns {boolean} *true* if it's infinite.
 */
function isClockValueInfinite(clock) { return clock === '-'; }

// TODO: clock logic
function printClocks() {
	console.log(`White time: ${currentTime.white}`);
	console.log(`Black time: ${currentTime.black}`);
	console.log(`timeRemainAtTurnStart: ${timeRemainAtTurnStart}`);
	console.log(`timeAtTurnStart: ${timeAtTurnStart}`);
}
// TODO: clock logic
/** Returns true if the current game is untimed (infinite clocks) */
function isGameUntimed() {
	return untimed;
}

export default {
	set,
	edit,
	stop,
	reset,
	update,
	push,
	getClockFromKey,
	isClockValueInfinite,
	printClocks,
	isGameUntimed,
	hideClocks,
	showClocks,
};