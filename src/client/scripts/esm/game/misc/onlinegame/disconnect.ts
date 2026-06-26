// src/client/scripts/esm/game/misc/onlinegame/disconnect.ts

/**
 * This script displays a countdown on screen, when our opponent disconnects,
 * how much longer they have remaining until they are auto-resigned.
 *
 * If they disconnect not by choice (bad network), the server they are gives them a little
 * extra time to reconnect.
 */

import moveutil from '../../../../../../shared/chess/util/moveutil.js';

import toast from '../../../components/toast.js';
import gameslot from '../../chess/gameslot.js';
import pingManager from '../../../util/pingManager.js';

// Types ---------------------------------------------------------------

/** The parameters for the opponent disconnect countdown. */
interface OpponentDisconnectValue {
	millisUntilAutoDisconnectResign: number;
	wasByChoice: boolean;
}

// Variables -----------------------------------------------------------------------

/** The timestamp our opponent will lose from disconnection, if they don't reconnect before then. */
let timeOpponentLoseFromDisconnect: number | undefined;

/** The timeout ID of the timer to display the next "Opponent has disconnected..." message. */
let displayOpponentDisconnectTimeoutID: ReturnType<typeof setTimeout> | undefined;

/**
 * Starts the countdown for when the opponent will be auto-resigned due to disconnection.
 * This will overwrite any existing "Opponent is AFK" or disconnection countdowns.
 * @param params - Parameters for the countdown.
 * @param params.millisUntilAutoDisconnectResign - The number of milliseconds remaining until the opponent is auto-resigned for disconnecting.
 * @param params.wasByChoice - Indicates whether the opponent disconnected intentionally (true) or unintentionally (false).
 */
function startOpponentDisconnectCountdown({
	millisUntilAutoDisconnectResign,
	wasByChoice,
}: OpponentDisconnectValue): void {
	// Cancel the previous one if this is overwriting
	stopOpponentDisconnectCountdown();
	const timeLeftMillis = millisUntilAutoDisconnectResign - pingManager.getHalfPing();
	timeOpponentLoseFromDisconnect = Date.now() + timeLeftMillis;
	// How much time is left? Usually starts at 20 | 60 seconds
	const secsRemaining = Math.ceil(timeLeftMillis / 1000);
	displayOpponentDisconnect(secsRemaining, wasByChoice);
}

function stopOpponentDisconnectCountdown(): void {
	clearTimeout(displayOpponentDisconnectTimeoutID);
	displayOpponentDisconnectTimeoutID = undefined;
}

function displayOpponentDisconnect(secsRemaining: number, wasByChoice: boolean): void {
	const opponent_disconnectedOrLostConnection = wasByChoice
		? 'Opponent has disconnected.'
		: 'Opponent has lost connection.';
	const resigningOrAborting = moveutil.isGameResignable(gameslot.getGamefile()!)
		? 'Auto-resigning in'
		: 'Auto-aborting in';
	toast.show(
		`${opponent_disconnectedOrLostConnection} ${resigningOrAborting} ${secsRemaining}...`,
	);
	const nextSecsRemaining = secsRemaining - 1;
	if (nextSecsRemaining === 0) return; // Stop
	const timeRemainUntilDisconnectLoss = timeOpponentLoseFromDisconnect! - Date.now();
	const timeToPlayNextDisplayOpponentDisconnect =
		timeRemainUntilDisconnectLoss - nextSecsRemaining * 1000;
	displayOpponentDisconnectTimeoutID = setTimeout(
		displayOpponentDisconnect,
		timeToPlayNextDisplayOpponentDisconnect,
		nextSecsRemaining,
		wasByChoice,
	);
}

export default {
	startOpponentDisconnectCountdown,
	stopOpponentDisconnectCountdown,
};
