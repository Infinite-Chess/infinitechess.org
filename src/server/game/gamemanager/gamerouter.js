
/*
 * This script routes all incoming websocket messages
 * with the "game" route to where they need to go.
 * 
 * The script that actually keeps track of our active
 * online games is gamemanager
 */


// Custom imports
// eslint-disable-next-line no-unused-vars
const { Socket, WebsocketMessage } = require('../TypeDefinitions')

const { getGameBySocket, onRequestRemovalFromPlayersInActiveGames } = require('./gamemanager');
const { offerDraw, acceptDraw, declineDraw } = require('./drawoffers');
const { abortGame, resignGame } = require('./abortresigngame');
const { onAFK, onAFK_Return } = require('./onAFK');
const { onReport } = require('./cheatreport');
const { resyncToGame } = require('./resync');
const { submitMove } = require('./movesubmission');
const { onJoinGame } = require('./joingame');


/**
 * Handles all incoming websocket messages related to active games.
 * Possible actions: submitmove/offerdraw/abort/resign/joingame/resync...
 * @param {Socket} ws - The socket
 * @param {WebsocketMessage} message - The incoming websocket message, with the properties `route`, `action`, `value`, `id`.
 */
function handleGameRoute(ws, message) {
    const game = getGameBySocket(ws); // The game they belong in, if they belong in one.
    switch (message.action) {
        case 'submitmove':
            submitMove(ws, message.value);
            break;
        case 'joingame':
            onJoinGame(ws);
            break;
        case 'removefromplayersinactivegames':
            onRequestRemovalFromPlayersInActiveGames(ws, game);
            break;
        case 'resync':
            resyncToGame(ws, game, message.value, message.id);
            break;
        case 'abort':
            abortGame(ws, game);
            break;
        case 'resign':
            resignGame(ws, game);
            break;
        case 'offerdraw':
            offerDraw(ws, game);
            break;
        case 'acceptdraw':
            acceptDraw(ws, game)
            break;
        case 'declinedraw':
            declineDraw(ws, game);
            break;
        case 'AFK':
            onAFK(ws, game);
            break;
        case 'AFK-Return':
            onAFK_Return(ws, game);
            break;
        case 'report':
            onReport(ws, game, message.value);
            break;
        default:
            return console.error(`Unsupported action ${message.action} in game route.`)
    }
}


module.exports = {
    handleGameRoute
}