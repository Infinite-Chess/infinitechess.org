// src/server/game/gamemanager/activeplayers.ts

/**
 * This script keeps track of the ID's of games members and browsers are currently in,
 * and whether they've yet been told to navigate to them.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';

//--------------------------------------------------------------------------------------------------------

/** What we track about a single user currently in an active game. */
interface ActiveGameEntry {
	/** The id of the game they are in. */
	gameID: number;
	/** The color they are playing as, so their lobby tabs can link to the game from their side. */
	role: Player;
	/**
	 * Whether they still have to be told to navigate to the game page. Armed at game creation
	 * for a player with no socket to push to (e.g. their seek was accepted while their connection
	 * was interrupted), and consumed by whichever comes first: their next lobby subscribe, or
	 * their arrival at the game page.
	 */
	awaitingNavigateNotice: boolean;
}

/**
 * Contains what members are currently in a game: `{ member: entry }`
 * Users that are present in this list are not allowed to join another game until they're
 * deleted from here. As soon as a game is over, we can {@link removeUserFromActiveGame()},
 * even though the game may not be finalized or evicted yet.
 */
const membersInActiveGames: Record<number, ActiveGameEntry> = {};

/**
 * Contains what browsers are currently in a game: `{ browser: entry }`
 * Users that are present in this list are not allowed to join another game until they're
 * deleted from here. As soon as a game is over, we can {@link removeUserFromActiveGame()}
 * even though the game may not be finalized or evicted yet.
 */
const browsersInActiveGames: Record<string, ActiveGameEntry> = {};

//--------------------------------------------------------------------------------------------------------

/**
 * Adds the user to the list of users currently in an active game.
 * Players in this are not allowed to join a second game.
 * @param id - The id of the game they are in.
 * @param role - The color they are playing as.
 * @param awaitingNavigateNotice - Whether they still have to be told to navigate to the game.
 */
function addUserToActiveGames(
	user: AuthMemberInfo,
	id: number,
	role: Player,
	awaitingNavigateNotice: boolean,
): void {
	const entry: ActiveGameEntry = { gameID: id, role, awaitingNavigateNotice };
	if (user.signedIn) membersInActiveGames[user.user_id] = entry;
	else browsersInActiveGames[user.browser_id] = entry;
}

/**
 * Removes the user from the list of users currently in an active game.
 * This allows them to join a new game.
 * Doesn't remove them if they are already in a new game of a different ID.
 * @param user - An object containing either the `member` or `browser` property.
 * @param gameID - The id of the game they are in.
 */
function removeUserFromActiveGame(user: AuthMemberInfo, gameID: number): void {
	// Only removes them from the game if they belong to a game of that ID.
	// If they DON'T belong to that game, that means they speedily
	// resigned and started a new game, so don't modify this!
	if (user.signedIn) {
		if (membersInActiveGames[user.user_id]?.gameID === gameID)
			delete membersInActiveGames[user.user_id];
		else if (membersInActiveGames[user.user_id] !== undefined)
			console.log(
				'Not removing member from active games because they speedily joined a new game!',
			);
	} else {
		if (browsersInActiveGames[user.browser_id]?.gameID === gameID)
			delete browsersInActiveGames[user.browser_id];
		else if (browsersInActiveGames[user.browser_id] !== undefined)
			console.log(
				'Not removing browser from active games because they speedily joined a new game!',
			);
	}
}

/**
 * Returns true if the player behind the socket is already in an
 * active game, which means they're not allowed to join a new one.
 * @param ws - The websocket
 */
function isSocketInAnActiveGame(ws: CustomWebSocket): boolean {
	const player = ws.metadata.memberInfo;
	// Allow a member to still join a new game, even if they're browser may be connected to one already.
	if (player.signedIn) {
		// Their username trumps their browser id.
		return player.user_id in membersInActiveGames;
	} else return player.browser_id in browsersInActiveGames;
}

/** Gets the active-game entry of a player, if they belong to one. */
function getEntry(player: AuthMemberInfo): ActiveGameEntry | undefined {
	if (player.signedIn) return membersInActiveGames[player.user_id];
	else return browsersInActiveGames[player.browser_id];
}

/**
 * Gets a game by player.
 * @param player - The player object containing all the memberinfo
 * @returns The game they are in, if they belong in one, otherwise undefined.
 */
function getIDOfGamePlayerIsIn(player: AuthMemberInfo): number | undefined {
	return getEntry(player)?.gameID;
}

/** The color a player is playing as in their active game, if they're in one. */
function getRoleOfGamePlayerIsIn(player: AuthMemberInfo): Player | undefined {
	return getEntry(player)?.role;
}

/**
 * Reads and clears whether the player still has to be told to navigate to their active game.
 * Returns false if they're in no game, or already know about it.
 */
function consumeNavigateNotice(player: AuthMemberInfo): boolean {
	const entry = getEntry(player);
	if (entry === undefined || !entry.awaitingNavigateNotice) return false;
	entry.awaitingNavigateNotice = false;
	return true;
}

//--------------------------------------------------------------------------------------------------------

export {
	addUserToActiveGames,
	removeUserFromActiveGame,
	isSocketInAnActiveGame,
	getIDOfGamePlayerIsIn,
	getRoleOfGamePlayerIsIn,
	consumeNavigateNotice,
};
