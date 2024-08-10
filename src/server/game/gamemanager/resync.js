
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
const { Socket, Game } = require('../TypeDefinitions')
const gameutility = require('./gameutility');

const { cancelDisconnectTimer } = require('./afkdisconnect');

/**
 * Resyncs a client's websocket to a game. The client already
 * knows the game id and much other information. We only need to send
 * them the current move list, player timers, and game conclusion.
 * @param {Socket} ws - Their websocket
 * @param {Game} game - The game, if already known. If not specified we will find it.
 * @param {number} gameID - The game, if already known. If not specified we will find it.
 * @param {number} [replyToMessageID] - If specified, the id of the incoming socket message this resync will be the reply to
 */
function resyncToGame(ws, game, gameID, replyToMessageID) {
    if (!game) {
        console.log(`Cannot resync client to game when they aren't in one! They claimed the game id was ${gameID}.`)
        return ws.metadata.sendmessage(ws, 'game', 'nogame')
    }

    if (game.id !== gameID) return console.error(`Client tried to resync to a game with id ${gameID} when they belong to game with id ${game.id}!`)

    const colorPlayingAs = ws.metadata.subscriptions.game?.color || gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
    if (!colorPlayingAs) return ws.metadata.sendmessage(ws, 'game', 'login'); // Unable to verify their socket belongs to this game (probably logged out)

    gameutility.resyncToGame(ws, game, colorPlayingAs, replyToMessageID)

    cancelDisconnectTimer(game, colorPlayingAs)
}

module.exports = {
    resyncToGame
}