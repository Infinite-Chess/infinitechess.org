
// @ts-ignore
import gamefile from "./gamefile";
// @ts-ignore
import clockutil from '../util/clockutil.js';
// @ts-ignore
import timeutil from "../../util/timeutil.js";

/** An object containg the values of each color's clock, and which one is currently counting down, if any. */
interface ClockValues {
	/** The actual clock values. An object containing each color in the game for the keys, and that color's time left in milliseconds for the values. */
	clocks: { [color: string]: number }
	/**
	 * If a player's timer is currently counting down, this should be specified.
	 * No clock is ticking if less than 2 moves are played, or if game is over.
	 * 
	 * The color specified should have their time immediately accomodated for ping.
	 */
	colorTicking?: string,
	/**
	 * The timestamp the color ticking (if there is one) will lose by timeout.
	 * This should be calulated AFTER we adjust the clock values for ping.
	 * 
	 * The server should NOT specify this when sending the clock information
	 * to the client, because the server and client's clocks are not always in sync.
	 */
	timeColorTickingLosesAt?: number,
};



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
		gamefile.gameRules.turnOrder.forEach((color: string) => {
			clocks.currentTime[color] = clocks.startTime.millis;
		});
	}

	clocks.untimed = clockutil.isClockValueInfinite(clock);
}

/**
 * Updates the gamefile with new clock information received from the server.
 * @param gamefile - The current game state object containing clock information.
 * @param [clockValues] - An object containing the updated clock values.
 */
function edit(gamefile: gamefile, clockValues?: ClockValues) {
	if (!clockValues) return; // Likely a no-timed game
	const clocks = gamefile.clocks;

	const colorTicking = gamefile.whosTurn;

	if (clockValues.colorTicking !== undefined) {
		// Adjust the clock value according to the precalculated time they will lost by timeout.
		if (clockValues.timeColorTickingLosesAt === undefined) throw Error('clockValues should have been modified to account for ping BEFORE editing the clocks. Use adjustClockValuesForPing() beore edit()');
		const colorTickingTrueTimeRemaining = clockValues.timeColorTickingLosesAt - Date.now();
		clockValues.clocks[colorTicking] = colorTickingTrueTimeRemaining;
	}

	clocks.colorTicking = colorTicking;
	clocks.currentTime = { ...clockValues.clocks };

	const now = Date.now();
	clocks.timeAtTurnStart = now;

	clocks.timeRemainAtTurnStart = clocks.colorTicking === 'white' ? clocks.currentTime.white : clocks.currentTime.black;
}


export default {
	set,
	edit,
};

export type {
	ClockValues,
};