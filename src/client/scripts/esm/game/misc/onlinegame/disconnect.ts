// src/client/scripts/esm/game/misc/onlinegame/disconnect.ts

/**
 * This script displays a countdown on screen, when our opponent disconnects,
 * how much longer they have remaining until they are auto-resigned.
 *
 * If they disconnect not by choice (bad network), the server they are gives them a little
 * extra time to reconnect.
 */

import * as z from 'zod';

import moveutil from '../../../../../../shared/chess/util/moveutil.js';

import afk from './afk.js';
import toast from '../../gui/toast.js';
import gameslot from '../../chess/gameslot.js';
import pingManager from '../../../util/pingManager.js';

// Schemas ---------------------------------------------------------------

/** Zod schema for the 'opponentdisconnect' game route action from the server. */
const opponentDisconnectSchem = z.object({
	millisUntilAutoDisconnectResign: z.number(),
	wasByChoice: z.boolean(),
});

/** Zod schemas for all incoming server messages handled by the disconnect module. */
const DisconnectGameSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('opponentdisconnect'), value: opponentDisconnectSchem }),
	z.strictObject({ action: z.literal('opponentdisconnectreturn') }),
]);

export { DisconnectGameSchema };

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
}: z.infer<typeof opponentDisconnectSchem>): void {
	// This overwrites the "Opponent is AFK" timer
	afk.stopOpponentAFKCountdown();
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
		? translations.onlinegame.opponent_disconnected
		: translations.onlinegame.opponent_lost_connection;
	const resigningOrAborting = moveutil.isGameResignable(gameslot.getGamefile()!.basegame)
		? translations.onlinegame.auto_resigning_in
		: translations.onlinegame.auto_aborting_in;
	// The "You are AFK" message should overwrite, be on top of, this message,
	// so if that is running, don't display this 1-second disconnect message, but don't cancel it either!
	if (!afk.isOurAFKAutoResignTimerRunning())
		toast.show(
			`${opponent_disconnectedOrLostConnection} ${resigningOrAborting} ${secsRemaining}...`,
			{ durationMillis: 1000 },
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
