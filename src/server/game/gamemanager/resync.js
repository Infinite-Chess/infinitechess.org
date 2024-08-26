
/**
 * This script handles resyncing a client to a game when their
 * websocket closes unexpectedly, but they haven't left the page.
 * 
 * This is SEPARATE from the re-joining game that happens when you
 * refresh the page. THAT needs more info sent to the client than this resync does,
 * which is only a websocket reopening.
 * 
 * This needs to be its own script instead of in gamemanager because
 * both gamemanager and movesubmission depend on this, so we avoid circular dependancy.
 */

// Custom imports
import gameutility from './gameutility.js';
import { getGameByID } from './gamemanager.js';
import { cancelDisconnectTimer } from './afkdisconnect.js';

/**
 * Type Definitions
 * @typedef {import('../TypeDefinitions.js').Socket} Socket
 * @typedef {import('../TypeDefinitions.js').Game} Game
 */

/**
 * Resyncs a client's websocket to a game. The client already
 * knows the game id and much other information. We only need to send
 * them the current move list, player timers, and game conclusion.
 * @param {Socket} ws - Their websocket
 * @param {Game | undefined} game - The game, if already known. If not specified we will find from the id they gave us.
 * @param {number} gameID - The game, if already known. If not specified we will find it.
 * @param {number} [replyToMessageID] - If specified, the id of the incoming socket message this resync will be the reply to
 */
function resyncToGame(ws, game, gameID, replyToMessageID) {
    if (game && game.id !== gameID) {
        console.log(`Cannot resync client to game because they tried to resync to a game with id ${gameID} when they belong to game with id ${game.id}!`);
        return ws.metadata.sendmessage(ws, 'game', 'nogame');
    }

    // Perhaps this is a socket reopening, and we weren't able to find their game because they are signed out.
    // Let's check the game they said they're in!
    game = game || getGameByID(gameID);

    if (!game) {
        console.log(`Cannot resync client to game because they aren't in one, and the ID they said it was ${gameID} doesn't exist.`);
        return ws.metadata.sendmessage(ws, 'game', 'nogame');
    }

    const colorPlayingAs = ws.metadata.subscriptions.game?.color || gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
    if (!colorPlayingAs) return ws.metadata.sendmessage(ws, 'game', 'login'); // Unable to verify their socket belongs to this game (probably logged out)

    gameutility.resyncToGame(ws, game, colorPlayingAs, replyToMessageID);

    cancelDisconnectTimer(game, colorPlayingAs);
}

export {
    resyncToGame
};