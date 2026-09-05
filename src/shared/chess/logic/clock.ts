// src/shared/chess/logic/clock.ts

/**
 * This script keeps track of both players timer,
 * updates them each frame,
 * and the update() method will return the loser
 * if somebody loses on time.
 */

import type { GameRules } from '../util/gamerules.js';
import type { MoveRecord } from './movepiece.js';
import type { GameConclusion } from '../util/typeschemas.js';
import type { ClockDependant } from './gamefile.js';
import type { Player, PlayerGroup } from '../util/typeutil.js';
import type { ClockValues, TimeControl } from '../../chess/util/clockutil.js';

import typeutil from '../util/typeutil.js';
import moveutil from './moveutil.js';
import timeutil from '../../util/timeutil.js';
import gamerules from '../util/gamerules.js';
import clockutil from '../util/clockutil.js';
import gamefileutility from './gamefileutility.js';

// Types -----------------------------------------------------------------------

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
	/** The clock currently ticking down. Absent when clocks are stopped/paused. */
	ticking?: {
		/**
		 * We need this separate from gamefile's "whosTurn", because when we are
		 * in an online game and we make a move, we want our Clock to continue
		 * ticking until we receive the Clock information back from the server!
		 */
		color: Player;
		/** The time this color's turn began, in milliseconds elapsed since the Unix epoch. */
		startedAt: number;
		/** The time in millis this color had remaining when their turn began. */
		timeRemainingAtStart: number;
	};
};

// Functions -------------------------------------------------------------------

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
			millis: timeutil.toMillis(clockPartsSplit.minutes, 'minutes'),
			increment: clockPartsSplit.increment,
		},
		currentTime: {},
	};

	// start both players with the default.
	for (const color of players) {
		clocks.currentTime[color] = clocks.startTime.millis;
	}

	return { untimed: false, clocks };
}

/**
 * Updates the clocks with new information received from the server.
 * @param currentClocks - The clocks to update, modified in place.
 * @param clockValues - The new clock values to set.
 */
function edit(currentClocks: ClockData, clockValues: ClockValues): void {
	const ticking = clockValues.ticking;
	const now = Date.now();

	if (ticking !== undefined) {
		// Adjust the clock value according to the precalculated time they will lost by timeout.
		if (ticking.losesAt === undefined)
			throw Error('clockValues should have been modified to account for ping BEFORE editing the clocks. Use adjustClockValuesForPing() beore edit()'); // prettier-ignore
		const timeRemainingAtStart = ticking.losesAt - now;
		clockValues.clocks[ticking.color] = timeRemainingAtStart;
		currentClocks.ticking = { color: ticking.color, startedAt: now, timeRemainingAtStart };
	} else {
		delete currentClocks.ticking;
	}

	currentClocks.currentTime = { ...clockValues.clocks };
}

/**
 * Seeds the clocks of a game loaded from an ICN with the values it ended on, read
 * from its final clock stamps, so a concluded game doesn't display its starting times.
 * @param alreadyKnown - Live clock values sourced from the server. Load-bearing: a live game's
 * move packets carry no stamps, so without this its clocks would reset to the starting times.
 * The colors it covers are left untouched.
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
 * Call after flipping whosTurn. Flips the ticking color in local games.
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
	if (clocks.ticking !== undefined) {
		// Update current values
		const timePassedSinceTurnStart = Date.now() - clocks.ticking.startedAt;

		clocks.currentTime[clocks.ticking.color] =
			clocks.ticking.timeRemainingAtStart - timePassedSinceTurnStart;
		// 3+ moves
		clocks.currentTime[prevcolor]! += timeutil.toMillis(clocks.startTime.increment, 'seconds');
	}

	// Set up clocksticking for the new turn.
	clocks.ticking = {
		color: gamefile.whosTurn,
		startedAt: Date.now(),
		timeRemainingAtStart: clocks.currentTime[gamefile.whosTurn]!,
	};

	return clocks.currentTime[prevcolor];
}

/** Stops the game's clocks, updates the current player's remaining time. Idempotent. */
function stop(basegame: ClockDependant): void {
	if (basegame.untimed) return;
	const clocks = basegame.clocks;

	if (clocks.ticking === undefined) return; // Clocks already stopped

	const timeSpent = Date.now() - clocks.ticking.startedAt;
	clocks.currentTime[clocks.ticking.color] = Math.max(
		clocks.ticking.timeRemainingAtStart - timeSpent,
		0,
	);

	endGame(basegame);
}

/** Stops the ticking clock, freezing both players' remaining time. */
function endGame(basegame: ClockDependant): void {
	if (basegame.untimed) return;
	delete basegame.clocks.ticking;
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
	if (clocks.ticking === undefined) return;

	// Update current values
	const timePassedSinceTurnStart = Date.now() - clocks.ticking.startedAt;

	clocks.currentTime[clocks.ticking.color] = Math.ceil(
		clocks.ticking.timeRemainingAtStart - timePassedSinceTurnStart,
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
	if (clocks.ticking === undefined) return;
	const timeElapsedSinceTurnStartMs = Date.now() - clocks.ticking.startedAt;
	return clocks.ticking.timeRemainingAtStart - timeElapsedSinceTurnStartMs;
}

/**
 * Snapshots the clocks into the {@link ClockValues} shape sent to clients.
 * The flag deadline is deliberately omitted — only the receiver can stamp one.
 */
function createEdit(clocks: ClockData): ClockValues {
	if (clocks.ticking === undefined) return { clocks: clocks.currentTime };
	return { clocks: clocks.currentTime, ticking: { color: clocks.ticking.color } };
}

// Exports ---------------------------------------------------------------------

export default {
	init,
	edit,
	seedFromMoveStamps,
	clocksAtMoveIndex,
	push,
	stop,
	endGame,
	update,
	getColorTickingTrueTimeRemaining,
	createEdit,
};
