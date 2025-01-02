
/**
 * This script keeps track of both players timer,
 * updates them each frame,
 * and the update() method will return the loser
 * if somebody loses on time.
 */

// @ts-ignore
import moveutil from '../util/moveutil.js';
// @ts-ignore
import clockutil from '../util/clockutil.js';
// @ts-ignore
import timeutil from '../../util/timeutil.js';
// @ts-ignore
import gamefileutility from '../util/gamefileutility.js';
// @ts-ignore
import pingManager from '../../util/pingManager.js';
// @ts-ignore
import options from '../../game/rendering/options.js';


// Type Definitions ---------------------------------------------------------------

// @ts-ignore
import type gamefile from './gamefile.js';

/** An object containing each color in the game for the keys, and that color's time left in milliseconds for the values. */
interface ClockValues { [color: string]: number };


// Functions -----------------------------------------------------------------------





/**
 * Sets the clocks. If no current clock values are specified, clocks will
 * be set to the starting values, according to the game's TimeControl metadata.
 * @param gamefile 
 * @param [currentTimes] Optional. An object containing the current times of the players. Often used if we re-joining an online game.
 */
function set(gamefile: gamefile, currentTimes?: ClockValues) {
	const clock = gamefile.metadata.TimeControl; // "600+5"
	const clocks = gamefile.clocks;

	clocks.startTime.minutes = null;
	clocks.startTime.millis = null;
	clocks.startTime.increment = null;

	const clockPartsSplit = clockutil.getMinutesAndIncrementFromClock(clock); // { minutes, increment }
	if (clockPartsSplit !== null) {
		clocks.startTime.minutes = clockPartsSplit.minutes;
		clocks.startTime.millis = timeutil.minutesToMillis(clocks.startTime.minutes!);
		clocks.startTime.increment = clockPartsSplit.increment;
	}

	clocks.colorTicking = gamefile.whosTurn;

	// Edit the closk if we're re-loading an online game
	if (currentTimes) edit(gamefile, currentTimes);
	else { // No current time specified, start both players with the default.
		gamefile.gameRules.turnOrder.forEach(color => {
			clocks.currentTime[color] = clocks.startTime.millis;
		});
	}

	clocks.untimed = clockutil.isClockValueInfinite(clock);
}

/**
 * Updates the gamefile with new clock information received from the server.
 * @param {gamefile} gamefile - The current game state object containing clock information.
 * @param {object} clockValues - An object containing the updated clock values.
 */
function edit(gamefile: gamefile, clockValues: ClockValues) {
	if (!clockValues) return; // Likely a no-timed game
	const { timerWhite, timerBlack } = clockValues;
	const clocks = gamefile.clocks;

	clocks.colorTicking = gamefile.whosTurn;
	clocks.currentTime.white = timerWhite;
	clocks.currentTime.black = timerBlack;
	const now = Date.now();
	clocks.timeAtTurnStart = now;

	if (clockValues.accountForPing && moveutil.isGameResignable(gamefile) && !gamefileutility.isGameOver(gamefile)) {
	// 	// Ping is round-trip time (RTT), So divided by two to get the approximate
	// 	// time that has elapsed since the server sent us the correct clock values
	// 	const halfPing = pingManager.getHalfPing();
	// 	clocks.currentTime[gamefile.whosTurn] -= halfPing; 
	// 	if (halfPing > 2500) console.error("Ping is above 5000 milliseconds!!! This is a lot to adjust the clock values!");
	// 	if (options.isDebugModeOn()) console.log(`Ping is ${halfPing * 2}. Subtracted ${halfPing} millis from ${gamefile.whosTurn}'s clock.`);
	}
	clocks.timeRemainAtTurnStart = clocks.colorTicking === 'white' ? clocks.currentTime.white : clocks.currentTime.black;
}

/**
 * Modifies the clock values to account for ping.
 */
function adjustClockValuesForPing(clockValues: ClockValues, whosTurn: string) {
	// Ping is round-trip time (RTT), So divided by two to get the approximate
	// time that has elapsed since the server sent us the correct clock values
	const halfPing = pingManager.getHalfPing();
	if (halfPing > 2500) console.error("Ping is above 5000 milliseconds!!! This is a lot to adjust the clock values!");
	if (options.isDebugModeOn()) console.log(`Ping is ${halfPing * 2}. Subtracted ${halfPing} millis from ${whosTurn}'s clock.`);

	if (clockValues[whosTurn] === undefined) throw Error(`Invalid color "${whosTurn}" to modify clock value to account for ping.`);
	clockValues[whosTurn] -= halfPing;

	return clockValues;
}

/**
 * Call after flipping whosTurn. Flips colorTicking in local games.
 */
function push(gamefile: gamefile) {
	const clocks = gamefile.clocks;
	if (clocks.untimed) return;
	if (!moveutil.isGameResignable(gamefile)) return; // Don't push unless atleast 2 moves have been played

	clocks.colorTicking = gamefile.whosTurn;

	// Add increment if the last move has a clock ticking
	if (clocks.timeAtTurnStart !== undefined) {
		const prevcolor = moveutil.getWhosTurnAtMoveIndex(gamefile, gamefile.moves.length - 2);
		clocks.currentTime[prevcolor]! += timeutil.secondsToMillis(clocks.startTime.increment!);
	}

	clocks.timeRemainAtTurnStart = clocks.currentTime[clocks.colorTicking]!;
	clocks.timeAtTurnStart = Date.now();
}

function endGame(gamefile: gamefile) {
	const clocks = gamefile.clocks;
	clocks.timeRemainAtTurnStart = undefined;
	clocks.timeAtTurnStart = undefined;
}

/**
 * Called every frame, updates values.
 * @param gamefile
 * @returns undefined if clocks still have time, otherwise it's the color who won.
*/
function update(gamefile: gamefile): string | undefined {
	const clocks = gamefile.clocks;
	if (clocks.untimed || gamefileutility.isGameOver(gamefile) || !moveutil.isGameResignable(gamefile) || clocks.timeAtTurnStart === undefined) return;

	// Update current values
	const timePassedSinceTurnStart = Date.now() - clocks.timeAtTurnStart;

	clocks.currentTime[clocks.colorTicking] = Math.ceil(clocks.timeRemainAtTurnStart! - timePassedSinceTurnStart);

	// Has either clock run out of time?

	for (const [color,time] of Object.entries(clocks.currentTime)) {
		if (time! <= 0) {
			clocks.currentTime[color] = 0;
			return color;
		}
	}
}

function printClocks(gamefile: gamefile) {
	const clocks = gamefile.clocks;
	for (const color in clocks.currentTime) {
		console.log(`${color} time: ${clocks.currentTime[color]}`);
	}
	console.log(`timeRemainAtTurnStart: ${clocks.timeRemainAtTurnStart}`);
	console.log(`timeAtTurnStart: ${clocks.timeAtTurnStart}`);
}

/**
 * Returns true if the current game is untimed (infinite clocks) 
 */
function isGameUntimed(gamefile: gamefile): boolean {
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
	adjustClockValuesForPing,
};