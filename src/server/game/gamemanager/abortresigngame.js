
/**
 * This script handles the abortings and resignations of online games
 */

// Custom imports
// eslint-disable-next-line no-unused-vars
const { Socket, Game } = require('../TypeDefinitions');
const gameutility = require('./gameutility');
const wsutility = require('../wsutility');
const sendNotify = wsutility.sendNotify;
const sendNotifyError = wsutility.sendNotifyError;
const movesscript1 = require('../movesscript1');
const math1 = require('../math1');
const { setGameConclusion, onRequestRemovalFromPlayersInActiveGames } = require('./gamemanager');

//--------------------------------------------------------------------------------------------------------

/**
 * Called when a client tries to abort a game.
 * @param {Socket} ws - The websocket
 * @param {Game | undefined} game - The game they belong in, if they belong in one.
 */
function abortGame(ws, game) {
    if (!game) return console.error("Can't abort a game when player isn't in one.");
    const colorPlayingAs = gameutility.doesSocketBelongToGame_ReturnColor(game, ws);

    // Any time they click "Abort Game", they leave the game to the Main Menu, unsubbing, whether or not it ends up being legal.
    gameutility.unsubClientFromGame(game, ws, { sendMessage: false });

    // Is it legal?...

    if (game.gameConclusion === 'aborted') { // Opponent aborted first.
        onRequestRemovalFromPlayersInActiveGames(ws, game);
        return;
    } else if (gameutility.isGameOver(game)) { // Resync them to the game because they did not see the game conclusion.
        console.error("Player tried to abort game when the game is already over!");
        sendNotify(ws, "server.javascript.ws-no_abort_game_over");
        gameutility.subscribeClientToGame(game, ws, colorPlayingAs);
        return;
    }

    if (movesscript1.isGameResignable(game)) {
        console.error("Player tried to abort game when there's been atleast 2 moves played!");
        sendNotify(ws, "server.javascript.ws-no_abort_after_moves");
        gameutility.subscribeClientToGame(game, ws, colorPlayingAs);
        return;
    }

    // Abort

    setGameConclusion(game, 'aborted');
    onRequestRemovalFromPlayersInActiveGames(ws, game);
    const opponentColor = math1.getOppositeColor(colorPlayingAs);
    gameutility.sendGameUpdateToColor(game, opponentColor);
}

/**
 * Called when a client tries to resign a game.
 * @param {Socket} ws - The websocket
 * @param {Game | undefined} game - The game they belong in, if they belong in one.
 */
function resignGame(ws, game) {
    if (!game) return console.error("Can't resign a game when player isn't in one.");

    // Any time they click "Resign Game", they leave the game to the Main Menu, unsubbing, whether or not it ends up being legal.
    gameutility.unsubClientFromGame(game, ws, { sendMessage: false });

    // Is it legal?...

    if (gameutility.isGameOver(game)) { // Resync them to the game because they did not see the game conclusion.
        console.error("Player tried to resign game when the game is already over!");
        sendNotify(ws, "server.javascript.ws-cannot_resign_finished_game");
        const colorPlayingAs = gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
        gameutility.subscribeClientToGame(game, ws, colorPlayingAs);
        return;
    }

    if (!movesscript1.isGameResignable(game)) console.error("Player tried to resign game when there's less than 2 moves played! Ignoring..");

    // Resign

    const ourColor = ws.metadata.subscriptions.game?.color || gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
    const opponentColor = math1.getOppositeColor(ourColor);
    const gameConclusion = `${opponentColor} resignation`;
    setGameConclusion(game, gameConclusion);
    onRequestRemovalFromPlayersInActiveGames(ws, game);
    gameutility.sendGameUpdateToColor(game, opponentColor);
}


module.exports = {
    abortGame,
    resignGame,
};