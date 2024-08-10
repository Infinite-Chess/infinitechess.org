
// Middleware imports
const { logEvents } = require('../../middleware/logEvents');

// Custom imports
const { Socket, Game } = require('../TypeDefinitions')
const gameutility = require('./gameutility');
const math1 = require('../math1')
const movesscript1 = require('../movesscript1');


/**
 * 
 * @param {Socket} ws - The socket
 * @param {Game} game - The game they belong in, if they belong in one.
 * @param {*} messageContents - The contents of the socket report message
 * @returns {true | undefined} true if the cheat report was valid (the game manager should terminate the game), otherwise undefined.
 */
function onReport(ws, game, messageContents) { // { reason, opponentsMoveNumber }
    console.log("Client reported hacking!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")

    if (!game) return console.error("Unable to find game after a hack report.")

    const ourColor = ws.metadata.subscriptions.game?.color || gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
    const opponentColor = math1.getOppositeColor(ourColor)

    if (game.publicity === 'private') {
        const errString = `Player tried to report cheating in a private game! Report message: ${JSON.stringify(messageContents)}. Reporter color: ${ourColor}.\nThe game: ${gameutility.getSimplifiedGameString(game)}`
        logEvents(errString, 'hackLog.txt', { print: true })
        gameutility.sendMessageToSocketOfColor(game, ourColor, 'general', 'printerror', 'Cannot report your friend for cheating in a private match!')
        return;
    }

    const perpetratingMoveIndex = game.moves.length - 1;
    const colorThatPlayedPerpetratingMove = movesscript1.getColorThatPlayedMoveIndex(perpetratingMoveIndex, game.blackGoesFirst)
    if (colorThatPlayedPerpetratingMove === ourColor) {
        const errString = `Silly goose player tried to report themselves for cheating. Report message: ${JSON.stringify(messageContents)}. Reporter color: ${ourColor}.\nThe game: ${gameutility.getSimplifiedGameString(game)}`
        logEvents(errString, 'hackLog.txt', { print: true })
        gameutility.sendMessageToSocketOfColor(game, ourColor, 'general', 'printerror', "Silly goose. You can't report yourself for cheating! You played that move!")
        return;
    }

    // Remove the last move played.
    const perpetratingMove = game.moves.pop();
    
    const reason = messageContents?.reason;
    const opponentsMoveNumber = messageContents?.opponentsMoveNumber;

    const errText = `Cheating reported! Perpetrating move: ${perpetratingMove}. Move number: ${opponentsMoveNumber}. The report description: ${reason}. Color who reported: ${ourColor}. Probably cheater: ${JSON.stringify(game[opponentColor])}. Their color: ${opponentColor}.\nThe game: ${gameutility.getSimplifiedGameString(game)}`;
    console.error(errText);
    logEvents(errText, 'hackLog.txt')
    
    gameutility.sendMessageToSocketOfColor(game, 'white', 'general', 'notify', "server.javascript.ws-game_aborted_cheating")
    gameutility.sendMessageToSocketOfColor(game, 'black', 'general', 'notify', "server.javascript.ws-game_aborted_cheating")

    return true;
}


module.exports = {
    onReport
}