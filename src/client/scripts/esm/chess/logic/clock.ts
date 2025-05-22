
/**
 * This script keeps track of both players timer,
 * updates them each frame,
 * and the update() method will return the loser
 * if somebody loses on time.
 */

import moveutil from '../util/moveutil.js';
import timeutil from '../../util/timeutil.js';
import gamefileutility from '../util/gamefileutility.js';
import typeutil from '../util/typeutil.js';
import type { PlayerGroup } from '../util/typeutil.js';
import clockutil from '../util/clockutil.js';

// Type Definitions ---------------------------------------------------------------

import type { Game } from './game.js';
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
	/** We need this separate from gamefile's "whosTurn", because when we are
	 * in an online game and we make a move, we want our Clock to continue
	 * ticking until we receive the Clock information back from the server!*/
	colorTicking: undefined
	/** The amount of time in millis the current player had at the beginning of their turn, in milliseconds.
	 * When set to undefined no clocks are ticking*/
	timeRemainAtTurnStart: undefined
	/** The time at the beginning of the current player's turn, in milliseconds elapsed since the Unix epoch.*/
	timeAtTurnStart: undefined
})

// Functions -----------------------------------------------------------------------

/**
 * Sets the clocks. If no current clock values are specified, clocks will
 * be set to the starting values, according to the game's TimeControl metadata.
 * @param gamefile 
 * @param [currentTimes] Optional. An object containing the current times of the players. Often used if we re-joining an online game.
 */
function set(game: Game, currentTimes?: ClockValues) {
	const clock = game.metadata.TimeControl; // "600+5"
	game.untimed = clockutil.isClockValueInfinite(clock);
	if (game.untimed) {
		// @ts-ignore
		delete game.clocks;
		return;
	}
	// { minutes, increment }
	const clockPartsSplit = clockutil.getMinutesAndIncrementFromClock(clock)!;

	const clocks: ClockData = {
		startTime: {
			minutes: clockPartsSplit.minutes,
			millis: timeutil.minutesToMillis(clockPartsSplit.minutes),
			increment: clockPartsSplit.increment
		},
		currentTime: {},
		
		colorTicking: undefined,
		timeAtTurnStart: undefined,
		timeRemainAtTurnStart: undefined
	};

	game.clocks = clocks;

	// Edit the closk if we're re-loading an online game
	if (currentTimes) edit(game, currentTimes);
	else { // No current time specified, start both players with the default.
		game.gameRules.turnOrder.forEach((color: Player) => {
			clocks.currentTime[color] = clocks.startTime.millis;
		});
	}
}

/**
 * Updates the gamefile with new clock information received from the server.
 * @param gamefile - The current game state object containing clock information.
 * @param [clockValues] - An object containing the updated clock values.
 */
function edit(game: Game, clockValues?: ClockValues) {
	if (!clockValues || game.untimed) return; // Likely a no-timed game
	const clocks = game.clocks;

	const colorTicking = game.whosTurn;

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
 * @returns The time in milliseconds the player who just moved has remaining, if the clocks are ticking.
 */
function push(game: Game): number | undefined {
	if (game.untimed) return;

	const clocks = game.clocks;

	const prevcolor = moveutil.getWhosTurnAtMoveIndex(game, game.moves.length - 2);

	if (!moveutil.isGameResignable(game)) return clocks.currentTime[prevcolor]!;

		// Add increment to the previous player's clock and capture their remaining time to later insert into move.
	if (clocks.timeAtTurnStart !== undefined) { // 3+ moves
		clocks.currentTime[prevcolor]! += timeutil.secondsToMillis(clocks.startTime.increment!);
	}

	// Set up clocksticking for the new turn.
	clocks.colorTicking = gamefile.whosTurn;
	clocks.timeRemainAtTurnStart = clocks.currentTime[clocks.colorTicking]!;
	clocks.timeAtTurnStart = Date.now();
	
	return clocks.currentTime[prevcolor];
}

function endGame(game: Game) {
	if (game.untimed) return;
	const clocks = game.clocks;
	clocks.timeRemainAtTurnStart = undefined;
	clocks.timeAtTurnStart = undefined;
	clocks.colorTicking = undefined;
}

/**
 * Called every frame, updates values.
 * @param gamefile
 * @returns undefined if clocks still have time, otherwise it's the color who won.
*/
function update(game: Game): Player | undefined {
	if (game.untimed || gamefileutility.isGameOver(game) || !moveutil.isGameResignable(game)) return;
	
	const clocks = game.clocks;
	if (clocks.timeAtTurnStart === undefined) return;

	// Update current values
	const timePassedSinceTurnStart = Date.now() - clocks.timeAtTurnStart;

	clocks.currentTime[clocks.colorTicking] = Math.ceil(clocks.timeRemainAtTurnStart - timePassedSinceTurnStart);

	for (const [playerStr,time] of Object.entries(clocks.currentTime)) {
		const player: Player = Number(playerStr) as Player;
		if (time as number <= 0) {
			clocks.currentTime[playerStr] = 0;
			return typeutil.invertPlayer(player); // The color who won on time
		}
	}

	return; // Without this, typescript complains not all code paths return a value.
}

/**
 * Returns the true time remaining for the player whos clock is ticking.
 * Independant of reading clocks.currentTime, because that isn't updated
 * every frame if the user unfocuses the window.
 */
function getColorTickingTrueTimeRemaining(game: Game): number | undefined {
	if (game.untimed) return;
	const clocks = game.clocks!;
	if (clocks.colorTicking === undefined) return;
	const timeElapsedSinceTurnStartMillis = Date.now() - clocks.timeAtTurnStart;
	return clocks.timeRemainAtTurnStart - timeElapsedSinceTurnStartMillis;
}

function printClocks(game: Game) {
	if (game.untimed) return console.log("Game is untimed.");
	const clocks = game.clocks!;
	for (const color in clocks.currentTime) {
		console.log(`${color} time: ${clocks.currentTime[color]}`);
	}
	console.log(`timeRemainAtTurnStart: ${clocks.timeRemainAtTurnStart}`);
	console.log(`timeAtTurnStart: ${clocks.timeAtTurnStart}`);
}

export default {
	set,
	edit,
	endGame,
	update,
	push,
	getColorTickingTrueTimeRemaining,
	printClocks,
};

export type {
	ClockValues,
	ClockData
};