// src/server/game/gamemanager/claimdisconnect.ts

/**
 * This script handles a present player claiming victory or a draw against an
 * opponent who has been disconnected long enough for their claim window to open.
 *
 * The claim is validated on-demand against the opponent's recorded claim-window
 * timestamp (see disconnect.ts).
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { ServerGame } from './servergametypes.js';

import moveutil from '../../../shared/chess/util/moveutil.js';
import typeutil from '../../../shared/chess/util/typeutil.js';

import gameutility from './gameutility.js';
import gamelifecycle from './gamelifecycle.js';
import { logEventsAndPrint } from '../../utility/logEvents.js';

// Functions -------------------------------------------------------------------------------------

/**
 * Whether `ourColor` may currently claim victory / a draw against their opponent:
 * the game is resignable and ongoing, and the opponent's claim window has opened.
 */
function mayClaimAgainstOpponent(servergame: ServerGame, ourColor: Player): boolean {
	if (gameutility.isGameOver(servergame)) return false;
	if (!moveutil.isGameResignable(servergame)) return false; // Nothing to claim before resignable.

	const opponentColor = typeutil.invertPlayer(ourColor);
	const claimTime = servergame.match.playerData[opponentColor]?.disconnect.timeOpponentMayClaim;
	if (claimTime === undefined) return false; // Opponent isn't in an open-able claim window.
	return Date.now() >= claimTime; // The window has opened.
}

/**
 * Called when a client tries to claim victory against their disconnected opponent.
 * @param servergame - The game they are in.
 * @param ourRole - The color the socket is playing as.
 */
function claimVictory(servergame: ServerGame, ourRole: Player): void {
	if (!mayClaimAgainstOpponent(servergame, ourRole)) {
		logEventsAndPrint(
			`Player tried to claim victory in game ${servergame.match.id} when they were not allowed to! Ignoring..`,
			'hackLog',
		);
		return;
	}
	gamelifecycle.conclude(servergame, { victor: ourRole, condition: 'disconnect' });
}

/**
 * Called when a client tries to claim a draw against their disconnected opponent.
 * @param servergame - The game they are in.
 * @param ourRole - The color the socket is playing as.
 */
function claimDraw(servergame: ServerGame, ourRole: Player): void {
	if (!mayClaimAgainstOpponent(servergame, ourRole)) {
		logEventsAndPrint(
			`Player tried to claim a draw in game ${servergame.match.id} when they were not allowed to! Ignoring..`,
			'hackLog',
		);
		return;
	}
	gamelifecycle.conclude(servergame, { victor: null, condition: 'abandonment' });
}

// Exports ---------------------------------------------------------------------------------------

export default {
	claimVictory,
	claimDraw,
};
