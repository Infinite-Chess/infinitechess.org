
/**
 * This script keeps track of the ID's of games members and browsers are currently in.
 */

import { wsutility } from '../wsutility.js';

//--------------------------------------------------------------------------------------------------------

/**
 * Contains what members are currently in a game: `{ member: gameID }`
 * Users that are present in this list are not allowed to join another game until they're
 * deleted from here. As soon as a game is over, we can {@link removeUserFromActiveGame()},
 * even though the game may not be deleted/logged yet.
 */
const membersInActiveGames = {};

/**
 * Contains what browsers are currently in a game: `{ browser: gameID }`
 * Users that are present in this list are not allowed to join another game until they're
 * deleted from here. As soon as a game is over, we can {@link removeUserFromActiveGame()}
 * even though the game may not be deleted/logged yet.
 */
const browsersInActiveGames = {};

//--------------------------------------------------------------------------------------------------------

/**
 * Adds the user to the list of users currently in an active game.
 * Players in this are not allowed to join a second game.
 * @param {Object} user - An object containing either the `member` or `browser` property.
 * @param {string} id - The id of the game they are in.
 */
function addUserToActiveGames(user, id) {
    if (user.member) membersInActiveGames[user.member] = id;
    else if (user.browser) browsersInActiveGames[user.browser] = id;
}

/**
 * Removes the user from the list of users currently in an active game.
 * This allows them to join a new game.
 * Doesn't remove them if they are already in a new game of a different ID.
 * @param {Object} user - An object containing either the `member` or `browser` property.
 * @param {string} id - The id of the game they are in.
 */
function removeUserFromActiveGame(user, gameID) { // { member/browser }
    if (!user) return console.error("user must be specified when removing user from players in active games.");
    if (!gameID) return console.error("gameID must be specified when removing user from players in active games.");

    // Only removes them from the game if they belong to a game of that ID.
    // If they DON'T belong to that game, that means they speedily
    // resigned and started a new game, so don't modify this!
    if (user.member) {
        if (membersInActiveGames[user.member] === gameID) delete membersInActiveGames[user.member];
        else if (membersInActiveGames[user.member]) console.log("Not removing member from active games because they speedily joined a new game!");
    } else if (user.browser) {
        if (browsersInActiveGames[user.browser] === gameID) delete browsersInActiveGames[user.browser];
        else if (browsersInActiveGames[user.browser]) console.log("Not removing browser from active games because they speedily joined a new game!");
    } else console.error("Cannot remove user from active games because they don't have a member/browser property!");
}

/**
 * Returns true if the player behind the socket is already in an
 * active game, which means they're not allowed to join a new one.
 * @param {Socket} ws - The websocket
 * @returns {boolean}
 */
function isSocketInAnActiveGame(ws) {
    const player = wsutility.getOwnerFromSocket(ws);
    // Allow a member to still join a new game, even if they're browser may be connected to one already.
    if (player.member) { // Their username trumps their browser id.
        if (membersInActiveGames[player.member]) return true;
        return false; // EVEN IF their browser may still be in a game, still return false because their logged-in account can still join one.
    } else if (player.browser && browsersInActiveGames[player.browser]) return true;
    
    return false; // Not in a game
}

/**
 * Returns true if the player behind the socket is not in an active game
 * of the provided ID (has seen the game conclusion).
 * @param {Game} game
 * @param {color} color
 * @returns {boolean}
 */
function hasColorInGameSeenConclusion(game, color) {
    const player = game[color]; // { member }  OR  { browser }   (only contains one)
    if (!player) return console.error(`Invalid color "${color}" when checking if color in game has seen game conclusion!`);

    if (player.member) {
        if (membersInActiveGames[player.member] !== game.id) return true;
    } else if (player.browser) {
        if (browsersInActiveGames[player.browser] !== game.id) return true;
    }
    
    return false; // Has not seen conclusion yet, (has not requested to be removed from the players in active games list).
}

/**
 * Gets a game by player.
 * @param {Object} player - The player object with one of 2 properties: `member` or `browser`, depending on if they are signed in.
 * @returns {string | undefined} - The game they are in, if they belong in one, otherwise undefined.
 */
function getIDOfGamePlayerIsIn(player) {
    if (player.browser) return browsersInActiveGames[player.browser];
    if (player.member)  return membersInActiveGames [player.member];
}

//--------------------------------------------------------------------------------------------------------

export {
    addUserToActiveGames,
    removeUserFromActiveGame,
    isSocketInAnActiveGame,
    hasColorInGameSeenConclusion,
    getIDOfGamePlayerIsIn,
};