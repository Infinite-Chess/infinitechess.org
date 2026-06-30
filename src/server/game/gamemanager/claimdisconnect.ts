// src/server/game/gamemanager/claimdisconnect.ts

/**
 * This script handles a present player claiming victory or a draw against an
 * opponent who has been disconnected long enough for their claim window to open.
 *
 * The claim is validated on-demand against the opponent's recorded claim-window
 * timestamp (see disconnect.ts).
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { ServerGame } from './gameutility.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';

import typeutil from '../../../shared/chess/util/typeutil.js';

import gameutility from './gameutility.js';
import { setGameConclusion } from './gamemanager.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';

//--------------------------------------------------------------------------------------------------------

/** The color the socket is playing as in the game. */
function getColorOfSocket(servergame: ServerGame, ws: CustomWebSocket): Player {
	return (ws.metadata.subscriptions.game?.color ??
		gameutility.doesSocketBelongToGame_ReturnColor(servergame.match, ws)!) as Player;
}

/**
 * Whether `ourColor` may currently claim victory / a draw against their opponent:
 * the game is resignable and ongoing, and the opponent's claim window has opened.
 */
function mayClaimAgainstOpponent(servergame: ServerGame, ourColor: Player): boolean {
	if (gameutility.isGameOver(servergame)) return false;
	if (!gameutility.isGameResignable(servergame)) return false; // Nothing to claim before resignable.

	const opponentColor = typeutil.invertPlayer(ourColor);
	const claimTime = servergame.match.playerData[opponentColor]!.disconnect.timeOpponentMayClaim;
	if (claimTime === undefined) return false; // Opponent isn't in an open-able claim window.
	return Date.now() >= claimTime; // The window has opened.
}

/**
 * Called when a client tries to claim victory against their disconnected opponent.
 * @param ws - The websocket
 * @param servergame - The game they are in.
 */
function claimVictory(ws: CustomWebSocket, servergame: ServerGame): void {
	const ourColor = getColorOfSocket(servergame, ws);
	if (!mayClaimAgainstOpponent(servergame, ourColor)) {
		logEventsAndPrint(
			`Player tried to claim victory in game ${servergame.match.id} when they were not allowed to! Ignoring..`,
			'hackLog',
		);
		return;
	}
	setGameConclusion(servergame, { victor: ourColor, condition: 'disconnect' });
}

/**
 * Called when a client tries to claim a draw against their disconnected opponent.
 * @param ws - The websocket
 * @param servergame - The game they are in.
 */
function claimDraw(ws: CustomWebSocket, servergame: ServerGame): void {
	const ourColor = getColorOfSocket(servergame, ws);
	if (!mayClaimAgainstOpponent(servergame, ourColor)) {
		logEventsAndPrint(
			`Player tried to claim a draw in game ${servergame.match.id} when they were not allowed to! Ignoring..`,
			'hackLog',
		);
		return;
	}
	setGameConclusion(servergame, { victor: null, condition: 'abandonment' });
}

//--------------------------------------------------------------------------------------------------------

export { claimVictory, claimDraw };
