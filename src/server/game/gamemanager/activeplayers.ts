
/**
 * This script keeps track of the ID's of games members and browsers are currently in.
 */
import type { CustomWebSocket } from "../../socket/socketUtility.js";
import type { Player } from "../../../client/scripts/esm/chess/util/typeutil.js";
import type { Game } from "./gameutility.js";
import type { AuthMemberInfo } from "../../../types.js"; 

//--------------------------------------------------------------------------------------------------------

/**
 * Contains what members are currently in a game: `{ member: gameID }`
 * Users that are present in this list are not allowed to join another game until they're
 * deleted from here. As soon as a game is over, we can {@link removeUserFromActiveGame()},
 * even though the game may not be deleted/logged yet.
 */
const membersInActiveGames: Record<number, number> = {};

/**
 * Contains what browsers are currently in a game: `{ browser: gameID }`
 * Users that are present in this list are not allowed to join another game until they're
 * deleted from here. As soon as a game is over, we can {@link removeUserFromActiveGame()}
 * even though the game may not be deleted/logged yet.
 */
const browsersInActiveGames: Record<string, number> = {};

//--------------------------------------------------------------------------------------------------------

/**
 * Adds the user to the list of users currently in an active game.
 * Players in this are not allowed to join a second game.
 * @param id - The id of the game they are in.
 */
function addUserToActiveGames(user: AuthMemberInfo, id: number): void {
	if (user.signedIn) membersInActiveGames[user.user_id] = id;
	else browsersInActiveGames[user.browser_id] = id;
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
		if (membersInActiveGames[user.user_id] === gameID) delete membersInActiveGames[user.user_id];
		else if (membersInActiveGames[user.user_id] !== undefined) console.log("Not removing member from active games because they speedily joined a new game!");
	} else {
		if (browsersInActiveGames[user.browser_id] === gameID) delete browsersInActiveGames[user.browser_id];
		else if (browsersInActiveGames[user.browser_id] !== undefined) console.log("Not removing browser from active games because they speedily joined a new game!");
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
	if (player.signedIn) { // Their username trumps their browser id.
		return player.user_id in membersInActiveGames;
	} else return player.browser_id in browsersInActiveGames;
}

/**
 * Returns true if the player behind the socket is not in an active game
 * of the provided ID (has seen the game conclusion).
 * @param game
 * @param color
 */
function hasColorInGameSeenConclusion(game: Game, color: Player): boolean {
	const player = game.players[color]; // { member, user_id }  OR  { browser }   (only contains one)
	if (!player) throw new Error(`Invalid color "${color}" when checking if color in game has seen game conclusion!`);

	return getIDOfGamePlayerIsIn(player.identifier) !== game.id;
}

/**
 * Gets a game by player.
 * @param player - The player object containing all the memberinfo
 * @returns The game they are in, if they belong in one, otherwise undefined.
 */
function getIDOfGamePlayerIsIn(player: AuthMemberInfo): number | undefined {
	if (player.signedIn) return membersInActiveGames[player.user_id];
	else return browsersInActiveGames[player.browser_id];
}

//--------------------------------------------------------------------------------------------------------

export {
	addUserToActiveGames,
	removeUserFromActiveGame,
	isSocketInAnActiveGame,
	hasColorInGameSeenConclusion,
	getIDOfGamePlayerIsIn,
};