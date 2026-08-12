// src/shared/chess/logic/clock.ts

/**
 * This script keeps track of both players timer,
 * updates them each frame,
 * and the update() method will return the loser
 * if somebody loses on time.
 */

import type { Player } from '../util/typeutil.js';
import type { GameRules } from '../util/gamerules.js';
import type { MoveRecord } from './movepiece.js';
import type { PlayerGroup } from '../util/typeutil.js';
import type { GameConclusion } from '../util/winconutil.js';
import type { ClockDependant } from './gamefile.js';
import type { ClockValues, TimeControl } from '../../domain.js';

import typeutil from '../util/typeutil.js';
import moveutil from '../util/moveutil.js';
import timeutil from '../../util/timeutil.js';
import gamerules from '../util/gamerules.js';
import clockutil from '../util/clockutil.js';
import gamefileutility from '../util/gamefileutility.js';

// Types --------------------------------------------------------------------------

export type ClockData = {
	/** The time each player has remaining, in milliseconds.*/
	currentTime: PlayerGroup<number>;

	/** Contains information about the start time of the game. */
	startTime: {
		/** The number of minutes both sides started with. */
		minutes: number;
		/** The number of miliseconds both sides started with.  */
		millis: number;
		/** The increment used, in seconds. */
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
 * Seeds the clocks of a game loaded from an ICN with the values it ended on, read
 * from its final clock stamps, so a concluded game doesn't display its starting times.
 * @param alreadyKnown - Clock values sourced from the server, which are exact where a stamp isn't
 * (it predates any time burned before a resignation). The colors it covers are left untouched.
 */
function seedFromMoveStamps(
	basegame: {
		moves: MoveRecord[];
		gameRules: GameRules;
		gameConclusion?: GameConclusion;
	} & ClockDependant,
	alreadyKnown: PlayerGroup<number> = {},
): void {
	if (basegame.untimed) return;

	const stamped = clocksAtMoveIndex(basegame, basegame.moves.length - 1);
	for (const [playerStr, time] of Object.entries(stamped)) {
		const player = Number(playerStr) as Player;
		if (alreadyKnown[player] === undefined) basegame.clocks.currentTime[player] = time;
	}
}

/**
 * Reads each color's remaining time as of the given move index off the moves' clock stamps —
 * the time a player had left after their most recent move at or before that index.
 * Only games loaded from an ICN carry stamps; live move packets are stripped of them.
 * @param moveIndex - The move to read the clocks as of. -1 for the start of the game.
 */
function clocksAtMoveIndex(
	basegame: {
		moves: MoveRecord[];
		gameRules: GameRules;
		gameConclusion?: GameConclusion;
		clocks: ClockData;
	},
	moveIndex: number,
): PlayerGroup<number> {
	// A time forfeit zeroes the player who was to move at the game's end,
	// as their last stamp predates all the time they burned up to the flag.
	const flaggedPlayer =
		basegame.gameConclusion?.condition === 'time' && moveIndex === basegame.moves.length - 1
			? moveutil.getWhosTurnAtMoveIndex(basegame, basegame.moves.length - 1)
			: undefined;

	const currentTime: PlayerGroup<number> = {};
	for (const player of gamerules.getUniquePlayersInTurnOrder(basegame.gameRules.turnOrder)) {
		if (player === flaggedPlayer) {
			// They lost on time, and we're viewing the final move
			currentTime[player] = 0;
			continue;
		}
		currentTime[player] = basegame.clocks.startTime.millis; // Fallback if they never moved.
		// Walk backwards to their most recent move.
		for (let i = moveIndex; i >= 0; i--) {
			if (moveutil.getColorThatPlayedMoveIndex(basegame, i) !== player) continue;
			const stamp = basegame.moves[i]!.clockStamp;
			// Moves added on the analysis board carry no clock; skip past them so the
			// clock keeps this variation's last real value instead of dropping to 0.
			if (stamp === undefined) continue;
			currentTime[player] = stamp;
			break;
		}
	}

	return currentTime;
}

/**
 * Call after flipping whosTurn. Flips colorTicking in local games.
 * @param gamefile - The minimum properties needed from the gamefile to push the clocks. MUST PASS IN ACTUAL GAMEFILE, NOT A FAKE.
 * @returns The time in milliseconds the player who just moved has remaining, if the clocks are ticking.
 */
function push(gamefile: {
	moves: MoveRecord[];
	whosTurn: Player;
	clocks: ClockData;
	gameRules: GameRules;
}): number | undefined {
	const clocks = gamefile.clocks;
	const prevcolor = moveutil.getWhosTurnAtMoveIndex(gamefile, gamefile.moves.length - 2);

	if (!moveutil.isGameResignable(gamefile)) return clocks.currentTime[prevcolor]!;

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
	clocks.colorTicking = gamefile.whosTurn;
	clocks.timeRemainAtTurnStart = clocks.currentTime[gamefile.whosTurn]!;
	clocks.timeAtTurnStart = Date.now();

	return clocks.currentTime[prevcolor];
}

/** Stops the game's clocks, updates the current player's remaining time. Idempotent. */
function stop(basegame: ClockDependant): void {
	if (basegame.untimed) return;
	const clocks = basegame.clocks;

	if (clocks.colorTicking === undefined) return; // Clocks already stopped

	const timeSpent = Date.now() - clocks.timeAtTurnStart;
	clocks.currentTime[clocks.colorTicking] = Math.max(clocks.timeRemainAtTurnStart - timeSpent, 0);

	endGame(basegame);
}

function endGame(basegame: ClockDependant): void {
	if (basegame.untimed) return;
	const clocks = basegame.clocks;
	delete clocks.timeRemainAtTurnStart;
	delete clocks.timeAtTurnStart;
	delete clocks.colorTicking;
}

/**
 * Called every frame, updates values.
 * @param basegame - The minimum properties needed from the gamefile to update the clocks. MUST PASS IN ACTUAL GAMEFILE, NOT A FAKE.
 * @returns undefined if clocks still have time, otherwise it's the color who won.
 */
function update(
	basegame: {
		moves: MoveRecord[];
		gameConclusion?: GameConclusion;
	} & ClockDependant,
): Player | undefined {
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

function printClocks(basegame: ClockDependant): void {
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
	seedFromMoveStamps,
	clocksAtMoveIndex,
	stop,
	endGame,
	update,
	push,
	getColorTickingTrueTimeRemaining,
	printClocks,
};
