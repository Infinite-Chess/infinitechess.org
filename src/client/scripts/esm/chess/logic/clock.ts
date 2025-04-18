
/**
 * This script keeps track of both players timer,
 * updates them each frame,
 * and the update() method will return the loser
 * if somebody loses on time.
 */

import moveutil from '../util/moveutil.js';
import timeutil from '../../util/timeutil.js';
import gamefileutility from '../util/gamefileutility.js';
// @ts-ignore
import clockutil from '../util/clockutil.js';
import type { PlayerGroup } from '../util/typeutil.js';

// Type Definitions ---------------------------------------------------------------

// @ts-ignore
import type gamefile from './gamefile.js';
import type { Player } from '../util/typeutil.js';

/** An object containg the values of each color's clock, and which one is currently counting down, if any. */
interface ClockValues {
	/** The actual clock values. An object containing each color in the game for the keys, and that color's time left in milliseconds for the values. */
	// eslint-disable-next-line no-unused-vars
	clocks: { [color in Player]?: number }
	/**
	 * If a player's timer is currently counting down, this should be specified.
	 * No clock is ticking if less than 2 moves are played, or if game is over.
	 * 
	 * The color specified should have their time immediately accomodated for ping.
	 */
	colorTicking?: Player,
	/**
	 * The timestamp the color ticking (if there is one) will lose by timeout.
	 * This should be calulated AFTER we adjust the clock values for ping.
	 * 
	 * The server should NOT specify this when sending the clock information
	 * to the client, because the server and client's clocks are not always in sync.
	 */
	timeColorTickingLosesAt?: number,
};

type ClockData = {
	/** The time each player has remaining, in milliseconds.*/
	currentTime: PlayerGroup<number>

	/** Contains information about the start time of the game. */
	startTime: {
		/** The number of minutes both sides started with. */
		minutes: number
		/** The number of miliseconds both sides started with.  */
		millis: number
		/** The increment used, in milliseconds. */
		increment: number
	}

} & ({
	/** We need this separate from gamefile's "whosTurn", because when we are
	 * in an online game and we make a move, we want our Clock to continue
	 * ticking until we receive the Clock information back from the server!*/
	colorTicking: Player,
	/** The amount of time in millis the current player had at the beginning of their turn, in milliseconds.
	 * When set to undefined no clocks are ticking*/
	timeRemainAtTurnStart: number,
	/** The time at the beginning of the current player's turn, in milliseconds elapsed since the Unix epoch.*/
	timeAtTurnStart: number,
} | {
	colorTicking: undefined
	timeRemainAtTurnStart: undefined
	timeAtTurnStart: undefined
})

// Functions -----------------------------------------------------------------------





/**
 * Sets the clocks. If no current clock values are specified, clocks will
 * be set to the starting values, according to the game's TimeControl metadata.
 * @param gamefile 
 * @param [currentTimes] Optional. An object containing the current times of the players. Often used if we re-joining an online game.
 */
function set(gamefile: gamefile, currentTimes?: ClockValues) {
	const clock = gamefile.metadata.TimeControl; // "600+5"
	gamefile.untimed = clockutil.isClockValueInfinite(clock);
	if (gamefile.untimed) {
		gamefile.clocks = undefined;
		return;
	}
	// { minutes, increment }
	const clockPartsSplit = clockutil.getMinutesAndIncrementFromClock(clock);

	const clocks: ClockData = {
		startTime: {
			minutes: clockPartsSplit.minutes,
			millis: timeutil.minutesToMillis(clockPartsSplit.minutes),
			increment: clockPartsSplit.increment
		},
		colorTicking: gamefile.whosTurn,
		timeAtTurnStart: -1,
		timeRemainAtTurnStart: -1,
		currentTime: {}
	};

	// Edit the closk if we're re-loading an online game
	if (currentTimes) edit(gamefile, currentTimes);
	else { // No current time specified, start both players with the default.
		gamefile.gameRules.turnOrder.forEach((color: Player) => {
			clocks.currentTime[color] = clocks.startTime.millis;
		});
	}

	gamefile.clocks = clocks;
}

/**
 * Updates the gamefile with new clock information received from the server.
 * @param gamefile - The current game state object containing clock information.
 * @param [clockValues] - An object containing the updated clock values.
 */
function edit(gamefile: gamefile, clockValues?: ClockValues) {
	if (!clockValues || gamefile.untimed) return; // Likely a no-timed game
	const clocks = gamefile.clocks!;

	const colorTicking = gamefile.whosTurn;

	if (clockValues.colorTicking !== undefined) {
		// Adjust the clock value according to the precalculated time they will lost by timeout.
		if (clockValues.timeColorTickingLosesAt === undefined) throw Error('clockValues should have been modified to account for ping BEFORE editing the clocks. Use adjustClockValuesForPing() beore edit()');
		const colorTickingTrueTimeRemaining = clockValues.timeColorTickingLosesAt - Date.now();
		// @ts-ignore
		clockValues.clocks[colorTicking] = colorTickingTrueTimeRemaining;
	}

	clocks.colorTicking = colorTicking;
	clocks.currentTime = { ...clockValues.clocks };

	const now = Date.now();
	clocks.timeAtTurnStart = now;

	clocks.timeRemainAtTurnStart = clocks.currentTime[clocks.colorTicking];
}

/**
 * Call after flipping whosTurn. Flips colorTicking in local games.
 */
function push(gamefile: gamefile) {
	if (gamefile.untimed) return;
	if (!moveutil.isGameResignable(gamefile)) return; // Don't push unless atleast 2 moves have been played
	const clocks = gamefile.clocks!;

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
	if (gamefile.untimed) return;
	const clocks = gamefile.clocks!;
	clocks.timeRemainAtTurnStart = undefined;
	clocks.timeAtTurnStart = undefined;
	clocks.colorTicking = undefined;
}

/**
 * Called every frame, updates values.
 * @param gamefile
 * @returns undefined if clocks still have time, otherwise it's the color who won.
*/
function update(gamefile: gamefile): string | undefined {
	if (gamefile.untimed || gamefileutility.isGameOver(gamefile) || !moveutil.isGameResignable(gamefile)) return;
	
	const clocks = gamefile.clocks!;
	if (clocks.timeAtTurnStart === undefined) return;

	// Update current values
	const timePassedSinceTurnStart = Date.now() - clocks.timeAtTurnStart;

	clocks.currentTime[clocks.colorTicking] = Math.ceil(clocks.timeRemainAtTurnStart - timePassedSinceTurnStart);

	for (const [color,time] of Object.entries(clocks.currentTime)) {
		if (time as number <= 0) {
			clocks.currentTime[color] = 0;
			return color;
		}
	}

	return; // Without this, typescript complains not all code paths return a value.
}

function printClocks(gamefile: gamefile) {
	if (gamefile.untimed) return console.log("Game is untimed.");
	const clocks = gamefile.clocks!;
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

export type {
	ClockValues,
	ClockData
};