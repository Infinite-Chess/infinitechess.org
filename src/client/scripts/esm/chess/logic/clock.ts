
/**
 * This script keeps track of both players timer,
 * updates them each frame,
 * and the update() method will return the loser
 * if somebody loses on time.
 */

import moveutil from '../util/moveutil.js';
import timeutil from '../../util/timeutil.js';
import gamefileutility from '../util/gamefileutility.js';
import onlinegame from '../../game/misc/onlinegame/onlinegame.js';
import { ClockValues } from './offlineclockstuff.js';
import pingManager from '../../util/pingManager.js';


// Type Definitions ---------------------------------------------------------------

// @ts-ignore
import type gamefile from './gamefile.js';


// Functions -----------------------------------------------------------------------




/**
 * Call after flipping whosTurn. Flips colorTicking in local games.
 */
function push(gamefile: gamefile) {
	const clocks = gamefile.clocks;
	if (onlinegame.areInOnlineGame()) return; // Only the server can push clocks
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
	clocks.timeRemainAtTurnStart = null;
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
	if (onlinegame.areInOnlineGame()) return; // Don't conclude game by time if in an online game, only the server does that.

	for (const [color,time] of Object.entries(clocks.currentTime)) {
		if (time as number <= 0) {
			clocks.currentTime[color] = 0;
			return color;
		}
	}

	return; // Without this, typescript complains not all code paths return a value.
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

/**
 * Modifies the clock values to account for ping.
 */
function adjustClockValuesForPing(clockValues: ClockValues): ClockValues {
	if (!clockValues.colorTicking) return clockValues; // No clock is ticking (< 2 moves, or game is over), don't adjust for ping



	// Ping is round-trip time (RTT), So divided by two to get the approximate
	// time that has elapsed since the server sent us the correct clock values
	const halfPing = pingManager.getHalfPing();
	if (halfPing > 2500) console.error("Ping is above 5000 milliseconds!!! This is a lot to adjust the clock values!");
	// console.log(`Ping is ${halfPing * 2}. Subtracted ${halfPing} millis from ${clockValues.colorTicking}'s clock.`);
	if (clockValues.clocks[clockValues.colorTicking] === undefined) throw Error(`Invalid color "${clockValues.colorTicking}" to modify clock value to account for ping.`);
	clockValues.clocks[clockValues.colorTicking]! -= halfPing;

	// Flag what time the player who's clock is ticking will lose on time.
	// Do this because while while the gamefile is being constructed, the time left may become innacurate.
	clockValues.timeColorTickingLosesAt = Date.now() + clockValues.clocks[clockValues.colorTicking]!;

	return clockValues;
}


export default {
	endGame,
	update,
	push,
	printClocks,
	isGameUntimed,
	adjustClockValuesForPing
};