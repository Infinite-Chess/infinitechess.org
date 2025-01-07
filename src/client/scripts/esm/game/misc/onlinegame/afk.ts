
/**
 * This script keeps track of how long we have been afk in the current online game,
 * and if it's for too long, it informs the server that fact,
 * then the server starts an auto-resign timer if we don't return.
 * 
 * This will also display a countdown onscreen, and sound effects,
 * before we are auto-resigned.
 * 
 * It will also display a countdown until our opponent is auto-resigned,
 * if they are the one that is afk.
 */

// @ts-ignore
import clock from "../../../chess/logic/clock.js";
import gamefileutility from "../../../chess/util/gamefileutility.js";
import moveutil from "../../../chess/util/moveutil.js";
import gameslot from "../../chess/gameslot.js";
import input from "../../input.js";
import websocket from "../../websocket.js";
import onlinegame from "./onlinegame.js";
import sound from "../sound.js";
import statustext from "../../gui/statustext.js";
import pingManager from "../../../util/pingManager.js";



/** The time, in seconds, we must be AFK for us to alert the server that fact. Afterward the server will start an auto-resign timer. */
const timeUntilAFKSecs: number = 40; // 40 + 20 = 1 minute

/** ABORTABLE GAMES ONLY (< 2 moves played): The time, in seconds, we must be AFK for us to alert the server that fact. Afterward the server will start an auto-resign timer. */
const timeUntilAFKSecs_Abortable: number = 20; // 20 + 20 = 40 seconds

/** UNTIMED GAMES ONLY: The time, in seconds, we must be AFK for us to alert the server that fact. Afterward the server will start an auto-resign timer. */
const timeUntilAFKSecs_Untimed: number = 100; // 100 + 20 = 2 minutes

/** The amount of time we have, in milliseconds, from the time we alert the
 * server we are afk, to the time we lose if we don't return. */
const timerToLossFromAFK: number = 20000; // HAS TO MATCH SERVER-END

/** The ID of the timeout that can be used to cancel the timer that will alert the server we are afk, if we are not no longer afk by then. */
let timeoutID: ReturnType<typeof setTimeout> | undefined;

/** The timestamp we will lose from being AFK, if we are not no longer afk by that time. */
let timeWeLoseFromAFK: number | undefined;

/** The timeout ID of the timer to display the next "You are AFK..." message. */
let displayAFKTimeoutID: ReturnType<typeof setTimeout> | undefined;

/** The timeout ID of the timer to play the next staccato violin sound effect of the 10-second countdown to auto-resign from being afk. */
let playStaccatoTimeoutID: ReturnType<typeof setTimeout> | undefined;

/** The timestamp our opponent will lose from being AFK, if they are not no longer afk by that time. */
let timeOpponentLoseFromAFK: number | undefined;

/** The timeout ID of the timer to display the next "Opponent is AFK..." message. */
let displayOpponentAFKTimeoutID: ReturnType<typeof setTimeout> | undefined;



// If we lost connection while displaying status messages of when our opponent
// will disconnect, stop doing that.
document.addEventListener('connection-lost', () => {
	// Stop saying when the opponent will lose from being afk
	clearTimeout(displayOpponentAFKTimeoutID);
});



function isOurAFKAutoResignTimerRunning() {
	// If the time we will lose from being afk is defined, the timer is running
	return timeWeLoseFromAFK !== undefined;
}

function onGameStart() {
	// Start the timer that will inform the server we are afk, the server thenafter starting an auto-resign timer.
	rescheduleAlertServerWeAFK();
}

function onGameClose() {
	// Reset everything
	cancelAFKTimer();
	timeoutID = undefined,
	timeWeLoseFromAFK = undefined;
	displayAFKTimeoutID = undefined,
	playStaccatoTimeoutID = undefined,
	displayOpponentAFKTimeoutID = undefined,
	timeOpponentLoseFromAFK = undefined;
}

function onMovePlayed({ isOpponents }: { isOpponents: boolean }) {
	// Restart the timer that will inform the server we are afk, the server thenafter starting an auto-resign timer.
	rescheduleAlertServerWeAFK();
	if (isOpponents) stopOpponentAFKCountdown(); // The opponent is no longer AFK if they were)
}

function updateAFK() {
	if (!input.atleast1InputThisFrame() || gamefileutility.isGameOver(gameslot.getGamefile()!)) return; // No input this frame, don't reset the timer to tell the server we are afk.
	// There has been mouse movement, restart the afk auto-resign timer.
	if (isOurAFKAutoResignTimerRunning()) tellServerWeBackFromAFK(); // Also tell the server we are back, IF it had started an auto-resign timer!
	rescheduleAlertServerWeAFK();
}

/**
 * Restarts the timer that will inform the server we are afk,
 * the server thenafter starting an auto-resign timer.
 */
function rescheduleAlertServerWeAFK() {
	clearTimeout(timeoutID);
	const gamefile = gameslot.getGamefile()!;
	if (!onlinegame.isItOurTurn() || gamefileutility.isGameOver(gamefile) || onlinegame.getIsPrivate() && clock.isGameUntimed(gamefile) || !clock.isGameUntimed(gamefile) && moveutil.isGameResignable(gamefile)) return;
	// Games with less than 2 moves played more-quickly start the AFK auto resign timer
	const timeUntilAlertServerWeAFKSecs = !moveutil.isGameResignable(gamefile) ? timeUntilAFKSecs_Abortable
						   : clock.isGameUntimed(gamefile) ? timeUntilAFKSecs_Untimed
						   : timeUntilAFKSecs;
	timeoutID = setTimeout(tellServerWeAFK, timeUntilAlertServerWeAFKSecs * 1000);
}

function cancelAFKTimer() {
	clearTimeout(timeoutID);
	clearTimeout(displayAFKTimeoutID);
	clearTimeout(playStaccatoTimeoutID);
	clearTimeout(displayOpponentAFKTimeoutID);
}

function tellServerWeAFK() {
	websocket.sendmessage('game','AFK');
	timeWeLoseFromAFK = Date.now() + timerToLossFromAFK;

	// Play lowtime alert sound
	sound.playSound_lowtime();

	// Display on screen "You are AFK. Auto-resigning in 20..."
	displayWeAFK(20);
	// The first violin staccato note is played in 10 seconds
	playStaccatoTimeoutID = setTimeout(playStaccatoNote, 10000, 'c3', 10);
}

function tellServerWeBackFromAFK() {
	websocket.sendmessage('game','AFK-Return');
	timeWeLoseFromAFK = undefined;
	clearTimeout(displayAFKTimeoutID);
	clearTimeout(playStaccatoTimeoutID);
	displayAFKTimeoutID = undefined;
	playStaccatoTimeoutID = undefined;
}

function displayWeAFK(secsRemaining: number) {
	const resigningOrAborting = moveutil.isGameResignable(gameslot.getGamefile()!) ? translations.onlinegame.auto_resigning_in : translations.onlinegame.auto_aborting_in;
	statustext.showStatusForDuration(`${translations.onlinegame.afk_warning} ${resigningOrAborting} ${secsRemaining}...`, 1000);
	const nextSecsRemaining = secsRemaining - 1;
	if (nextSecsRemaining === 0) return; // Stop
	const timeRemainUntilAFKLoss = timeWeLoseFromAFK! - Date.now();
	const timeToPlayNextDisplayWeAFK = timeRemainUntilAFKLoss - nextSecsRemaining * 1000;
	displayAFKTimeoutID = setTimeout(displayWeAFK, timeToPlayNextDisplayWeAFK, nextSecsRemaining);
}

function playStaccatoNote(note: 'c3' | 'c4', secsRemaining: number) {
	if (note === 'c3') sound.playSound_viola_c3();
	else if (note === 'c4') sound.playSound_violin_c4();
	else return console.error("Invalid violin note");
    
	const nextSecsRemaining = secsRemaining > 5 ? secsRemaining - 1 : secsRemaining - 0.5;
	if (nextSecsRemaining === 0) return; // Stop
	const nextNote = nextSecsRemaining === Math.floor(nextSecsRemaining) ? 'c3' : 'c4';
	const timeRemainUntilAFKLoss = timeWeLoseFromAFK! - Date.now();
	const timeToPlayNextDisplayWeAFK = timeRemainUntilAFKLoss - nextSecsRemaining * 1000;
	playStaccatoTimeoutID = setTimeout(playStaccatoNote, timeToPlayNextDisplayWeAFK, nextNote, nextSecsRemaining);
}




function startOpponentAFKCountdown(millisUntilAutoAFKResign: number) {
	// Cancel the previous one if this is overwriting
	stopOpponentAFKCountdown();

	// Ping is round-trip time (RTT), So divided by two to get the approximate
	// time that has elapsed since the server sent us the correct clock values
	const timeLeftMillis = millisUntilAutoAFKResign - pingManager.getHalfPing();

	timeOpponentLoseFromAFK = Date.now() + timeLeftMillis;
	// How much time is left? Usually starts at 20 seconds
	const secsRemaining = Math.ceil(timeLeftMillis / 1000);
	displayOpponentAFK(secsRemaining);
}

function stopOpponentAFKCountdown() {
	clearTimeout(displayOpponentAFKTimeoutID);
	displayOpponentAFKTimeoutID = undefined;
}

function displayOpponentAFK(secsRemaining: number) {
	const resigningOrAborting = moveutil.isGameResignable(gameslot.getGamefile()!) ? translations.onlinegame.auto_resigning_in : translations.onlinegame.auto_aborting_in;
	statustext.showStatusForDuration(`${translations.onlinegame.opponent_afk} ${resigningOrAborting} ${secsRemaining}...`, 1000);
	const nextSecsRemaining = secsRemaining - 1;
	if (nextSecsRemaining === 0) return; // Stop
	const timeRemainUntilAFKLoss = timeOpponentLoseFromAFK! - Date.now();
	const timeToPlayNextDisplayWeAFK = timeRemainUntilAFKLoss - nextSecsRemaining * 1000;
	displayOpponentAFKTimeoutID = setTimeout(displayOpponentAFK, timeToPlayNextDisplayWeAFK, nextSecsRemaining);
}



export default {
	onGameStart,
	isOurAFKAutoResignTimerRunning,
	onMovePlayed,
	updateAFK,
	timeUntilAFKSecs,
	onGameClose,
	startOpponentAFKCountdown,
	stopOpponentAFKCountdown,
};