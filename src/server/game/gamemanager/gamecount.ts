// src/server/game/gamemanager/gamecount.ts

/**
 * Derives the active game count from the activeGames object in gamemanager.ts.
 */

import { activeGames } from './gamemanager.js';
import { broadcastToAllInviteSubs } from '../invitesmanager/invitessubscribers.js';

/** Broadcasts the current game count to all sockets subscribed to the invites list. */
function broadcastGameCountToInviteSubs(): void {
	broadcastToAllInviteSubs('gamecount', getActiveGameCount());
}

/** Returns the active game count. */
function getActiveGameCount(): number {
	return Object.keys(activeGames).length;
}

/** Prints the active game count to the console. */
function printActiveGameCount(): void {
	console.log(
		`Active games: ${getActiveGameCount()} ===========================================`,
	);
}

export { getActiveGameCount, printActiveGameCount, broadcastGameCountToInviteSubs };
