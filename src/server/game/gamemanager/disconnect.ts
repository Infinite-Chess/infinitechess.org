// src/server/game/gamemanager/disconnect.ts

/**
 * The script handles the setting, resetting, and cancellation
 * of the disconnection timer when they leave the page / lose internet.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { MatchInfo, ServerGame } from './gameutility.js';

import typeutil from '../../../shared/chess/util/typeutil.js';

import gameutility from './gameutility.js';

//--------------------------------------------------------------------------------------------------------

/**
 * The time to give players who disconnected not by choice
 * (network interruption) to reconnect to the game before
 * we tell their opponent they've disconnected, and start an auto-resign timer.
 */
const timeToGiveDisconnectedBeforeStartingAutoResignTimerMillis = 5_000; // 5 seconds

/**
 * The duration of the auto-resign timer by disconnect
 * when the player has intentionally left the page.
 */
const timeBeforeAutoResignByDisconnectMillis = 10_000; // 10 seconds
/**
 * The duration of the auto-resign timer by disconnect (more forgiving),
 * when the player's internet cuts out.
 */
const timeBeforeAutoResignByDisconnectMillis_NotByChoice = 60_000; // 60 seconds

//--------------------------------------------------------------------------------------------------------

/**
 * Starts a timer to auto-resign a player from disconnection.
 * @param servergame - The game
 * @param color - The color to start the auto-resign timer for
 * @param closureNotByChoice - True if the player didn't close the connection on purpose.
 * @param onAutoResignFunc - The function to call when the player should be auto resigned from disconnection. This should have 2 arguments: The game, and the color that won.
 */
function startDisconnectTimer(
	servergame: ServerGame,
	color: Player,
	closureNotByChoice: boolean,
	onAutoResignFunc: (_game: ServerGame, _winner: Player) => void,
): void {
	// console.log(`Starting disconnect timer to auto resign player ${color}.`);

	const now = Date.now();
	const resignable = gameutility.isGameResignable(servergame);

	const timeBeforeAutoResign =
		closureNotByChoice && resignable
			? timeBeforeAutoResignByDisconnectMillis_NotByChoice
			: timeBeforeAutoResignByDisconnectMillis;
	// console.log(`Time before auto resign: ${timeBeforeAutoResign}`)
	const timeToAutoLoss = now + timeBeforeAutoResign;

	const playerdata = servergame.match.playerData[color]!;
	const opponentColor = typeutil.invertPlayer(color);

	// Clear the cushion timer state since we're transitioning to the auto-resign timer.
	playerdata.disconnect.startTime = undefined;

	playerdata.disconnect.timeoutID = setTimeout(
		() => onAutoResignFunc(servergame, opponentColor),
		timeBeforeAutoResign,
	);
	playerdata.disconnect.timeToAutoLoss = timeToAutoLoss;
	playerdata.disconnect.wasByChoice = !closureNotByChoice;

	// Alert their opponent the time their opponent will be auto-resigned by disconnection.
	const value = {
		millisUntilAutoDisconnectResign: timeBeforeAutoResign,
		wasByChoice: !closureNotByChoice,
	};
	gameutility.sendMessageToSocketOfColor(
		servergame.match,
		opponentColor,
		'game',
		'opponentdisconnect',
		value,
	);
}

/**
 * Cancels both players timers to auto-resign them from disconnection if they were disconnected.
 * Typically called when a game ends.
 * @param match - The match
 */
function cancelDisconnectTimers(match: MatchInfo): void {
	for (const color of Object.keys(match.playerData)) {
		cancelDisconnectTimer(match, Number(color) as Player, true);
	}
}

/**
 * Cancels the player's timer to auto-resign them from disconnection if they were disconnected.
 * This is called when they reconnect/refresh.
 * @param match - The game
 * @param color - The color to cancel the timer for
 */
function cancelDisconnectTimer(
	match: MatchInfo,
	color: Player,
	dontNotifyOpponent: boolean = false,
): void {
	// console.log(`Canceling disconnect timer for player ${color}!`)

	/** Whether the timer (not the cushion to start the timer) for auto-resigning is RUNNING! */
	const autoResignTimerWasRunning = gameutility.isAutoResignDisconnectTimerActiveForColor(
		match,
		color,
	);

	const playerdata = match.playerData[color]!;

	clearTimeout(playerdata.disconnect.startID);
	clearTimeout(playerdata.disconnect.timeoutID);
	playerdata.disconnect.startID = undefined;
	playerdata.disconnect.startTime = undefined;
	playerdata.disconnect.timeoutID = undefined;
	playerdata.disconnect.timeToAutoLoss = undefined;
	playerdata.disconnect.wasByChoice = undefined;

	if (dontNotifyOpponent) return;

	// Alert their opponent we have returned

	if (!autoResignTimerWasRunning) return; // Their timer wasn't running in the first place, skip.

	const opponentColor = typeutil.invertPlayer(color);
	gameutility.sendMessageToSocketOfColor(
		match,
		opponentColor,
		'game',
		'opponentdisconnectreturn',
	);
}

//--------------------------------------------------------------------------------------------------------

export {
	timeToGiveDisconnectedBeforeStartingAutoResignTimerMillis,
	startDisconnectTimer,
	cancelDisconnectTimers,
	cancelDisconnectTimer,
};
