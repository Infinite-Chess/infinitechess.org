

/**
 * This script manages the periodic messages that display on-screen when you're in a game,
 * stating the server will restart in N minutes.
 */

import statustext from "../../gui/statustext.js";


/** The minute intervals at which to display on scree, reminding the user the server is restarting. */
const keyMinutes: number[] = [30, 20, 15, 10, 5, 2, 1, 0];

/** The time the server plans on restarting, if it has alerted us it is, otherwise false. */
let time: number | undefined;

/** The timeout ID of the timer to display the next "Server restarting..." message.
 * This can be used to cancel the timer when the server informs us it's already restarted. */
let timeoutID: ReturnType<typeof setTimeout> | undefined = undefined;



/**
 * Called when the server informs us they will be restarting shortly.
 * This periodically reminds the user, in a game, of that fact.
 * @param timeToRestart - The timestamp the server informed us it will be restarting.
 */
function initServerRestart(timeToRestart: number) {
	if (time === timeToRestart) return; // We already know the server is restarting.
	resetServerRestarting(); // Overwrite the previous one, if it exists.
	time = timeToRestart;
	const timeRemain = timeToRestart - Date.now();
	const minutesLeft = Math.ceil(timeRemain / (1000 * 60));
	console.log(`Server has informed us it is restarting in ${minutesLeft} minutes!`);
	displayServerRestarting(minutesLeft);
}

/** Displays the next "Server restaring..." message, and schedules the next one. */
function displayServerRestarting(minutesLeft: number) {
	if (minutesLeft === 0) {
		statustext.showStatus(translations.onlinegame.server_restarting, false, 2);
		time = undefined;
		return; // Print no more server restarting messages
	}
	const minutes_plurality = minutesLeft === 1 ? translations.onlinegame.minute : translations.onlinegame.minutes;
	statustext.showStatus(`${translations.onlinegame.server_restarting_in} ${minutesLeft} ${minutes_plurality}...`, false, 2);
	let nextKeyMinute: number;
	for (const keyMinute of keyMinutes) {
		if (keyMinute < minutesLeft) {
			nextKeyMinute = keyMinute;
			break;
		}
	}
	const timeToDisplayNextServerRestart = time! - nextKeyMinute! * 60 * 1000;
	const timeUntilDisplayNextServerRestart = timeToDisplayNextServerRestart - Date.now();
	timeoutID = setTimeout(displayServerRestarting, timeUntilDisplayNextServerRestart, nextKeyMinute!);
}

/** Cancels the timer to display the next "Server restaring..." message, and resets the values. */
function resetServerRestarting() {
	time = undefined;
	clearTimeout(timeoutID);
	timeoutID = undefined;
}


export default {
	initServerRestart,
	resetServerRestarting,
};