
/**
 * This script handles the abortings and resignations of online games
 */

// Custom imports
const { Socket, Game } = require('./TypeDefinitions')
const game1 = require('./game1');
const wsutility = require('./wsutility');
const sendNotify = wsutility.sendNotify;
const sendNotifyError = wsutility.sendNotifyError;
const movesscript1 = require('./movesscript1');

//--------------------------------------------------------------------------------------------------------

/**
 * Called when a client tries to abort a game.
 * @param {Socket} ws - The websocket
 * @param {Game} game - The game they belong in, if they belong in one.
 * @returns {true | undefined} true if the aborting was a success (the game manager should terminate the game), otherwise undefined.
 */
function abortGame(ws, game) {
    if (!game) return console.error("Can't abort a game when player isn't in one.")
    const colorPlayingAs = game1.doesSocketBelongToGame_ReturnColor(game, ws);

    // Is it legal?...

    if (game.gameConclusion === 'aborted') return; // Opponent aborted first.
    else if (game1.isGameOver(game)) { // Resync them to the game because they did not see the game conclusion.
        console.error("Player tried to abort game when the game is already over!")
        sendNotify(ws, "server.javascript.ws-no_abort_game_over")
        game1.subscribeClientToGame(game, ws, colorPlayingAs);
        return;
    }

    if (movesscript1.isGameResignable(game)) {
        console.error("Player tried to abort game when there's been atleast 2 moves played!")
        sendNotify(ws, "server.javascript.ws-no_abort_after_moves")
        game1.subscribeClientToGame(game, ws, colorPlayingAs);
        return;
    }

    // Abort

    game1.unsubClientFromGame(game, ws, { sendMessage: false });

    return true; // Aborting was a success!
}

/**
 * Called when a client tries to resign a game.
 * @param {Socket} ws - The websocket
 * @param {Game} game - The game they belong in, if they belong in one.
 * @returns {true | undefined} true if the resignation was a success (the game manager should terminate the game), otherwise undefined.
 */
function resignGame(ws, game) {
    if (!game) return console.error("Can't resign a game when player isn't in one.")

    // Is it legal?...

    if (game1.isGameOver(game)) { // Resync them to the game because they did not see the game conclusion.
        console.error("Player tried to resign game when the game is already over!")
        sendNotify(ws, "server.javascript.ws-cannot_resign_finished_game")
        const colorPlayingAs = game1.doesSocketBelongToGame_ReturnColor(game, ws);
        game1.subscribeClientToGame(game, ws, colorPlayingAs);
        return;
    }

    if (!movesscript1.isGameResignable(game)) console.error("Player tried to resign game when there's less than 2 moves played! Ignoring..")

    // Resign

    game1.unsubClientFromGame(game, ws, { sendMessage: false });

    return true; // Resigning was a success!
}


module.exports = {
    abortGame,
    resignGame,
}