// src/shared/chess/logic/clock.ts

/**
 * This script keeps track of both players timer,
 * updates them each frame,
 * and the update() method will return the loser
 * if somebody loses on time.
 */

import type { Player } from '../util/typeutil.js';
import type { PlayerGroup } from '../util/typeutil.js';
import type { TimeControl } from '../util/metadata.js';
import type { ClockDependant, Game } from './gamefile.js';

import typeutil from '../util/typeutil.js';
import moveutil from '../util/moveutil.js';
import timeutil from '../../util/timeutil.js';
import clockutil from '../util/clockutil.js';
import gamefileutility from '../util/gamefileutility.js';

// Type Definitions ---------------------------------------------------------------

/** An object containg the values of each color's clock, and which one is currently counting down, if any. */
interface ClockValues {
	/** The actual clock values. An object containing each color in the game for the keys, and that color's time left in milliseconds for the values. */
	clocks: { [_color in Player]?: number };
	/**
	 * If a player's timer is currently counting down, this should be specified.
	 * No clock is ticking if less than 2 moves are played, or if game is over.
	 *
	 * The color specified should have their time immediately accomodated for ping.
	 */
	colorTicking?: Player;
	/**
	 * The timestamp the color ticking (if there is one) will lose by timeout.
	 * This should be calulated AFTER we adjust the clock values for ping.
	 *
	 * The server should NOT specify this when sending the clock information
	 * to the client, because the server and client's clocks are not always in sync.
	 */
	timeColorTickingLosesAt?: number;
}

type ClockData = {
	/** The time each player has remaining, in milliseconds.*/
	currentTime: PlayerGroup<number>;

	/** Contains information about the start time of the game. */
	startTime: {
		/** The number of minutes both sides started with. */
		minutes: number;
		/** The number of miliseconds both sides started with.  */
		millis: number;
		/** The increment used, in milliseconds. */
		increment: number;
	};
} & (
	| {
			/** We need this separate from gamefile's "whosTurn", because when we are
			 * in an online game and we make a move, we want our Clock to continue
			 * ticking until we receive the Clock information back from the server!*/
			colorTicking: Player;
			/** The amount of time in millis the current player had at the beginning of their turn, in milliseconds.
			 * When set to undefined no clocks are ticking*/
			timeRemainAtTurnStart: number;
			/** The time at the beginning of the current player's turn, in milliseconds elapsed since the Unix epoch.*/
			timeAtTurnStart: number;
	  }
	| {
			/** We need this separate from gamefile's "whosTurn", because when we are
			 * in an online game and we make a move, we want our Clock to continue
			 * ticking until we receive the Clock information back from the server!*/
			colorTicking: undefined;
			/** The amount of time in millis the current player had at the beginning of their turn, in milliseconds.
			 * When set to undefined no clocks are ticking*/
			timeRemainAtTurnStart: undefined;
			/** The time at the beginning of the current player's turn, in milliseconds elapsed since the Unix epoch.*/
			timeAtTurnStart: undefined;
	  }
);

// Functions -----------------------------------------------------------------------

/**
 * Sets the clocks. If no current clock values are specified, clocks will
 * be set to the starting values, according to the game's TimeControl metadata.
 */
function init(players: Iterable<Player>, time_control: TimeControl): ClockDependant {
	const untimed = clockutil.isClockValueInfinite(time_control);
	if (untimed) return { untimed: true, clocks: undefined };
	const clockPartsSplit = clockutil.getMinutesAndIncrementFromClock(time_control)!; // { minutes, increment }

	const clocks: ClockData = {
		startTime: {
			minutes: clockPartsSplit.minutes,
			millis: timeutil.minutesToMillis(clockPartsSplit.minutes),
			increment: clockPartsSplit.increment,
		},
		currentTime: {},

		colorTicking: undefined,
		timeAtTurnStart: undefined,
		timeRemainAtTurnStart: undefined,
	};

	// start both players with the default.
	for (const color of players) {
		clocks.currentTime[color] = clocks.startTime.millis;
	}

	return { untimed: false, clocks };
}

/**
 * Updates the gamefile with new clock information received from the server.
 * @param basegame - The game to update the clocks of.
 * @param clockValues - The new clock values to set.
 */
function edit(currentClocks: ClockData, clockValues: ClockValues): void {
	const colorTicking = clockValues.colorTicking;
	const now = Date.now();

	if (colorTicking !== undefined) {
		// Adjust the clock value according to the precalculated time they will lost by timeout.
		if (clockValues.timeColorTickingLosesAt === undefined)
			throw Error(
				'clockValues should have been modified to account for ping BEFORE editing the clocks. Use adjustClockValuesForPing() beore edit()',
			);
		const colorTickingTrueTimeRemaining = clockValues.timeColorTickingLosesAt - now;
		clockValues.clocks[colorTicking] = colorTickingTrueTimeRemaining;
	}

	currentClocks.colorTicking = colorTicking;
	currentClocks.currentTime = { ...clockValues.clocks };

	if (colorTicking !== undefined) {
		currentClocks.timeAtTurnStart = now;

		currentClocks.timeRemainAtTurnStart = currentClocks.currentTime[colorTicking];
	}
}

/**
 * Call after flipping whosTurn. Flips colorTicking in local games.
 * @returns The time in milliseconds the player who just moved has remaining, if the clocks are ticking.
 */
function push(basegame: Game, clocks: ClockData): number | undefined {
	const prevcolor = moveutil.getWhosTurnAtMoveIndex(basegame, basegame.moves.length - 2);

	if (!moveutil.isGameResignable(basegame)) return clocks.currentTime[prevcolor]!;

	// Add increment to the previous player's clock and capture their remaining time to later insert into move.
	if (clocks.timeAtTurnStart !== undefined) {
		// Update current values
		const timePassedSinceTurnStart = Date.now() - clocks.timeAtTurnStart;

		clocks.currentTime[clocks.colorTicking] =
			clocks.timeRemainAtTurnStart - timePassedSinceTurnStart;
		// 3+ moves
		clocks.currentTime[prevcolor]! += timeutil.secondsToMillis(clocks.startTime.increment!);
	}

	// Set up clocksticking for the new turn.
	clocks.colorTicking = basegame.whosTurn;
	clocks.timeRemainAtTurnStart = clocks.currentTime[clocks.colorTicking]!;
	clocks.timeAtTurnStart = Date.now();

	return clocks.currentTime[prevcolor];
}

function stop(basegame: Game): void {
	if (basegame.untimed) return;
	const clocks = basegame.clocks;

	if (clocks.colorTicking === undefined) return;

	const timeSpent = Date.now() - clocks.timeAtTurnStart!;
	let newTime = clocks.timeRemainAtTurnStart! - timeSpent;
	if (newTime < 0) newTime = 0;

	clocks.currentTime[clocks.colorTicking]! = newTime;

	endGame(basegame);
}

function endGame(basegame: Game): void {
	if (basegame.untimed) return;
	const clocks = basegame.clocks;
	delete clocks.timeRemainAtTurnStart;
	delete clocks.timeAtTurnStart;
	delete clocks.colorTicking;
}

/**
 * Called every frame, updates values.
 * @param basegame
 * @returns undefined if clocks still have time, otherwise it's the color who won.
 */
function update(basegame: Game): Player | undefined {
	if (
		basegame.untimed ||
		gamefileutility.isGameOver(basegame) ||
		!moveutil.isGameResignable(basegame)
	)
		return;

	const clocks = basegame.clocks;
	if (clocks.timeAtTurnStart === undefined) return;

	// Update current values
	const timePassedSinceTurnStart = Date.now() - clocks.timeAtTurnStart;

	clocks.currentTime[clocks.colorTicking] = Math.ceil(
		clocks.timeRemainAtTurnStart - timePassedSinceTurnStart,
	);

	for (const [playerStr, time] of Object.entries(clocks.currentTime)) {
		const player: Player = Number(playerStr) as Player;
		if ((time as number) <= 0) {
			clocks.currentTime[player] = 0;
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
function getColorTickingTrueTimeRemaining(clocks: ClockData): number | undefined {
	if (clocks.colorTicking === undefined) return;
	const timeElapsedSinceTurnStartMillis = Date.now() - clocks.timeAtTurnStart;
	return clocks.timeRemainAtTurnStart - timeElapsedSinceTurnStartMillis;
}

function printClocks(basegame: Game): void {
	if (basegame.untimed) return console.log('Game is untimed.');
	const clocks = basegame.clocks!;
	for (const color in clocks.currentTime) {
		console.log(`${color} time: ${clocks.currentTime[Number(color) as Player]}`);
	}
	console.log(`timeRemainAtTurnStart: ${clocks.timeRemainAtTurnStart}`);
	console.log(`timeAtTurnStart: ${clocks.timeAtTurnStart}`);
}

function createEdit(clocks: ClockData): ClockValues {
	const tickingData: Omit<ClockValues, 'clocks'> = {};
	if (clocks.colorTicking !== undefined) {
		tickingData.colorTicking = clocks.colorTicking;
		tickingData.timeColorTickingLosesAt = clocks.timeAtTurnStart + clocks.timeRemainAtTurnStart;
	}

	return {
		clocks: clocks.currentTime,
		...tickingData,
	};
}

export default {
	init,
	createEdit,
	edit,
	stop,
	endGame,
	update,
	push,
	getColorTickingTrueTimeRemaining,
	printClocks,
};

export type { ClockValues, ClockData, ClockDependant };
