// src/server/game/gamemanager/disconnect.ts

/**
 * This script handles opening, resetting, and cancelling a disconnected player's
 * "claim window" — the point from which their opponent may claim victory or a draw
 * — when they leave the page / lose internet.
 *
 * The claim window is just a timestamp, validated on-demand when a claim arrives.
 * The opponent may sit and do nothing, and they lose the opportunity the moment
 * the disconnected player reconnects.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { MatchInfo, ServerGame } from './gameutility.js';

import typeutil from '../../../shared/chess/util/typeutil.js';

import gameutility from './gameutility.js';

//--------------------------------------------------------------------------------------------------------

/**
 * The time to give players who disconnected not by choice
 * (network interruption) to reconnect to the game before
 * we tell their opponent they've disconnected, and open the claim window.
 */
const timeToGiveDisconnectedBeforeOpeningClaimWindowMillis = 5_000; // 5 seconds

/**
 * How long after disconnection, when the player intentionally left the page,
 * before their opponent may claim victory / a draw against them.
 */
const timeBeforeClaimableByDisconnectMillis = 10_000; // 10 seconds
/**
 * How long after disconnection, when the player's internet cuts out (more forgiving),
 * before their opponent may claim victory / a draw against them.
 *
 * Reused as the duration of the both-disconnected timer (see gamemanager): once BOTH
 * players are disconnected, the game concludes after this long if neither reconnects.
 */
const timeBeforeClaimableByDisconnectMillis_NotByChoice = 60_000; // 60 seconds

//--------------------------------------------------------------------------------------------------------

/**
 * Records, for a disconnected player, the timestamp from which their opponent may claim
 * victory / a draw, and tells the opponent the countdown. The claim window "opens" once
 * that timestamp passes; the client reveals the claim buttons and the server validates
 * any claim against the timestamp.
 * @param servergame - The game
 * @param color - The color that disconnected
 * @param closureNotByChoice - True if the player didn't close the connection on purpose.
 */
function setOpponentClaimWindow(
	servergame: ServerGame,
	color: Player,
	closureNotByChoice: boolean,
): void {
	const now = Date.now();
	const resignable = gameutility.isGameResignable(servergame);

	const timeUntilClaimable =
		closureNotByChoice && resignable
			? timeBeforeClaimableByDisconnectMillis_NotByChoice
			: timeBeforeClaimableByDisconnectMillis;

	const playerdata = servergame.match.playerData[color]!;
	const opponentColor = typeutil.invertPlayer(color);

	// Clear the cushion state since we're transitioning to the open claim window.
	playerdata.disconnect.startTime = undefined;

	playerdata.disconnect.timeOpponentMayClaim = now + timeUntilClaimable;
	playerdata.disconnect.wasByChoice = !closureNotByChoice;

	// Alert their opponent when they'll be able to claim victory by disconnection.
	const value = {
		millisUntilClaimable: timeUntilClaimable,
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
 * Cancels both players' claim windows if they were disconnected.
 * Typically called when a game ends.
 * @param match - The match
 */
function cancelDisconnectTimers(match: MatchInfo): void {
	for (const color of Object.keys(match.playerData)) {
		cancelDisconnectTimer(match, Number(color) as Player);
	}
}

/**
 * Cancels the player's disconnect state (cushion + open claim window) if they were
 * disconnected. Also cancels the game-level both-disconnected timer, since a reconnect
 * means the two players are no longer both gone. Called when they reconnect/refresh.
 */
function cancelDisconnectTimer(match: MatchInfo, ourRole: Player): void {
	const playerdata = match.playerData[ourRole]!;

	clearTimeout(playerdata.disconnect.startID);
	delete playerdata.disconnect.startID;
	delete playerdata.disconnect.startTime;
	delete playerdata.disconnect.timeOpponentMayClaim;
	delete playerdata.disconnect.wasByChoice;

	// A reconnect (or game over) means the players are no longer both disconnected.
	clearTimeout(match.bothDisconnectedTimeoutID);
	delete match.bothDisconnectedTimeoutID;
	delete match.bothDisconnectedEndTime;
}

//--------------------------------------------------------------------------------------------------------

export {
	timeToGiveDisconnectedBeforeOpeningClaimWindowMillis,
	timeBeforeClaimableByDisconnectMillis_NotByChoice,
	setOpponentClaimWindow,
	cancelDisconnectTimers,
	cancelDisconnectTimer,
};
