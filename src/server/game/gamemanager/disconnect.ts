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
import type { MatchInfo, ServerGame } from './serverGameTypes.js';

import typeutil from '../../../shared/chess/util/typeutil.js';

import chat from './chat.js';
import gameSockets from './gameSockets.js';
import liveGameValues from './liveGameValues.js';

// Constants -------------------------------------------------------------------

/**
 * The time to give players who disconnected not by choice
 * (network interruption) to reconnect to the game before
 * we tell their opponent they've disconnected, and open the claim window.
 */
const RECONNECT_CUSHION_MS = 5_000; // 5 seconds

/**
 * How long after disconnection, when the player intentionally left the page,
 * before their opponent may claim victory / a draw against them.
 */
const CLAIM_DELAY_VOLUNTARY_MS = 10_000; // 10 seconds
/**
 * How long after disconnection, when the player's internet cuts out (more forgiving),
 * before their opponent may claim victory / a draw against them.
 */
const CLAIM_DELAY_INVOLUNTARY_MS = 60_000; // 60 seconds

// Functions -------------------------------------------------------------------

/**
 * Starts the 5-second cushion timer for a player who disconnected involuntarily
 * (network interruption). After the cushion elapses, if they have not yet reconnected,
 * their disconnect claim timer is started and opponent notified.
 */
function startCushionTimer(servergame: ServerGame, role: Player): void {
	servergame.match.playerData[role]!.disconnect.cushion = {
		id: setTimeout(() => startClaimTimer(servergame, role, true), RECONNECT_CUSHION_MS),
		endTime: Date.now() + RECONNECT_CUSHION_MS,
	};
	liveGameValues.onPlayerDisconnected(servergame, role); // Persist the state to the db
}

/**
 * Confirmed disconnected player: Informs the opponent how long until they may
 * claim victory against this player.
 */
function startClaimTimer(servergame: ServerGame, role: Player, involuntary: boolean): void {
	const now = Date.now();

	const timeUntilClaimable = involuntary ? CLAIM_DELAY_INVOLUNTARY_MS : CLAIM_DELAY_VOLUNTARY_MS;

	const playerdata = servergame.match.playerData[role]!;
	const opponentRole = typeutil.invertPlayer(role);

	// Clear the cushion state since we're transitioning to the open claim window.
	delete playerdata.disconnect.cushion;

	playerdata.disconnect.claim = {
		openTime: now + timeUntilClaimable,
		voluntary: !involuntary,
	};

	// Alert their opponent when they'll be able to claim victory by disconnection.
	const value = {
		millisUntilClaimable: timeUntilClaimable,
		voluntary: !involuntary,
	};
	gameSockets.sendToColor(servergame.match, opponentRole, 'game', 'opponentdisconnect', value);

	chat.appendNotice(servergame, role, involuntary ? 'disconnect-involuntary' : 'disconnect-voluntary'); // prettier-ignore

	liveGameValues.onPlayerDisconnected(servergame, role); // Persist the state to the db
}

/**
 * Cancels both players' claim windows if they were disconnected.
 * Typically called when a game ends.
 */
function cancelAllTimers(match: MatchInfo): void {
	for (const color of Object.keys(match.playerData)) {
		cancelTimer(match, Number(color) as Player);
	}
}

/**
 * Cancels the player's disconnect state (cushion + open claim window) if they were
 * disconnected. Also clears the game's empty-since stamp, since someone being
 * present means it is no longer empty. Called when they reconnect/refresh.
 */
function cancelTimer(match: MatchInfo, ourRole: Player): void {
	const playerdata = match.playerData[ourRole]!;

	clearTimeout(playerdata.disconnect.cushion?.id);
	delete playerdata.disconnect.cushion;
	delete playerdata.disconnect.claim;

	// A reconnect (or game over) means the game is no longer empty.
	delete match.emptySince;
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	RECONNECT_CUSHION_MS,
	// Functions
	startCushionTimer,
	startClaimTimer,
	cancelAllTimers,
	cancelTimer,
};
