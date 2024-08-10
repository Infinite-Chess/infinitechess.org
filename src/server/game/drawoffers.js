
/**
 * This script handles the creation and acceptance of draw offers in online games
 */

const { Socket, Game } = require('./TypeDefinitions')
const game1 = require('./game1');
const math1 = require('./math1')
const movesscript1 = require('./movesscript1');

//--------------------------------------------------------------------------------------------------------

/**
 * Minimum number of plies (half-moves) that
 * must span between 2 consecutive draw offers
 * by the same player!
 */
const movesBetweenDrawOffers = 2

//--------------------------------------------------------------------------------------------------------

/** 
 * Called when client wants to offer a draw
 * Sends confirmation to opponents
 * @param {Socket} ws - The socket
 * @param {Game} game - The game they belong in, if they belong in one.
 */
function offerDraw(ws, game) {
    console.log("Client offers a draw.")

    if (!game) return console.error("Client offered a draw when they don't belong in a game.")
    const color = game1.doesSocketBelongToGame_ReturnColor(game, ws);

    if (game1.isGameOver(game)) return console.error("Client offered a draw when the game is already over. Ignoring.");
    
    if (hasGameDrawOffer(game)) return console.error(`${color} tried to offer a draw when the game already has a draw offer!`);

    const movesSinceLastOffer = color === 'white' ? game.moves.length - game.whiteDrawOfferMove
                              : color === 'black' ? game.moves.length - game.blackDrawOfferMove
                              : 0;
    if (movesSinceLastOffer < movesBetweenDrawOffers) return console.error("Client trying to offer a draw too fast")

    if (!movesscript1.isGameResignable(game)) return console.error("Client trying to offer a draw on the first 2 moves")
    
    // Update the status of game
    if (color === 'white') {
        game.whiteDrawOffer = 'offered'
        game.blackDrawOffer = 'unconfirmed'
        game.whiteDrawOfferMove = game.moves.length
    } else if (color === 'black') {
        game.blackDrawOffer = 'offered'
        game.whiteDrawOffer = 'unconfirmed'
        game.blackDrawOfferMove = game.moves.length
    }

    // Alert their opponent
    const opponentColor = math1.getOppositeColor(color);
    const value = { offererColor: color, whiteOfferMove: game.whiteDrawOfferMove, blackOfferMove: game.blackDrawOfferMove }
    game1.sendMessageToSocketOfColor(game, opponentColor, 'game', 'drawoffer', value)
}

/** 
 * Called when client accepts a draw
 * Ends the game
 * @param {Socket} ws - The socket
 * @param {Game} game - The game they belong in, if they belong in one.
 * @returns {true | undefined} true if the draw accept was a success (the game manager should terminate the game), otherwise undefined.
 */
function acceptDraw(ws, game) {
    console.log("Client accepts a draw.")

    if (!game) return console.error("Client accepted a draw when they don't belong in a game.")
    const color = game1.doesSocketBelongToGame_ReturnColor(game, ws);

    if (game1.isGameOver(game)) return console.error("Client accepted a draw when the game is already over. Ignoring.");
    
    // Update the status of game
    if (color === 'white') {
        if (!hasBlackDrawOffer(game)) return console.error("Client white accepted a draw when there wasn't a draw offer")
        game.whiteDrawOffer = 'confirmed'
    } else if (color === 'black') {
        if (!hasWhiteDrawOffer(game)) return console.error("Client black accepted a draw when there wasn't a draw offer")
        game.blackDrawOffer = 'confirmed'
    } else console.error(`Unknown color "${color}" when accepting draw!`)

    return true; // Draw offer acceptance was a success!
}

/** 
 * Called when client declines a draw
 * Alerts opponent
 * @param {Socket} ws - The socket
 * @param {Game} game - The game they belong in, if they belong in one.
 */
function declineDraw(ws, game) {
    if (!game) return console.error("Can't decline any open draw when they don't belong in a game.")
    const color = game1.doesSocketBelongToGame_ReturnColor(game, ws);
    const opponentColor = math1.getOppositeColor(color);

    // Since this method is run every time a move is submitted, we have to early exit
    // if their opponent doesn't have an open draw offer. 
    if (!hasColorDrawOffer(game, opponentColor)) return;

    console.log("Client declines a draw.")

    if (game1.isGameOver(game)) return console.error("Client declined a draw when the game is already over. Ignoring.");

    // Update the status of game
    if (color === 'white') {
        game.whiteDrawOffer = 'declined'
        game.blackDrawOffer = undefined
    } else if (color === 'black') {
        game.blackDrawOffer = 'declined'
        game.whiteDrawOffer = undefined
    } else console.error(`Unknown color "${color}" when accepting draw!`)

    // Alert their opponent
    game1.sendMessageToSocketOfColor(game, opponentColor, 'game', 'declinedraw')
}

//--------------------------------------------------------------------------------------------------------

/**
 * Returns *true* if the white in the provided game has a draw offer.
 * @param {Game} game - The game
 * @returns {boolean}
 */
function hasWhiteDrawOffer(game) {
    const isOffering = (game.whiteDrawOffer === 'offered')
    return isOffering
}

/**
 * Returns *true* if the black in the provided game has a draw offer.
 * @param {Game} game - The game
 * @returns {boolean}
 */
function hasBlackDrawOffer(game) {
    const isOffering = (game.blackDrawOffer === 'offered')
    return isOffering
}

/**
 * Returns *true* if the provided game has a draw offer.
 * @param {Game} game - The game
 * @returns {boolean}
 */
function hasGameDrawOffer(game) {
    const isOffering = (hasWhiteDrawOffer(game) || hasBlackDrawOffer(game))
    return isOffering
}

/**
 * Returns *true* if the provided game has a draw offer.
 * @param {Game} game - The game
 * @param {String} color - Color
 * @returns {boolean}
 */
function hasColorDrawOffer(game, color) {
    if (color === "white") {
        return hasWhiteDrawOffer(game)
    }
    return hasBlackDrawOffer(game)
}

//--------------------------------------------------------------------------------------------------------

// THIS SHOULD NOT BE NEEDED if we send the details about open draw offers in the correct places
/**
 * Reinforms the player about draw offers after page refresh
 * @param {Game} game The game in which the player is
 * @param {WebSocket} ws The websocket to inform
 */
function reinformPlayerAboutDrawOffers(game, ws) {
    const color = game1.doesSocketBelongToGame_ReturnColor(game, ws);
    if (hasGameDrawOffer(game)) {
        if (color == 'white') {
            if (game.blackDrawOffer == 'offered') {
                const value = { offererColor: 'black', whiteOfferMove: game.whiteDrawOfferMove, blackOfferMove: game.blackDrawOfferMove }
                game1.sendMessageToSocketOfColor(game, color, 'game', 'drawoffer', value)
            }
        } else if (color == 'black') {
            if (game.whiteDrawOffer == 'offered') {
                const value = { offererColor: 'white', whiteOfferMove: game.whiteDrawOfferMove, blackOfferMove: game.blackDrawOfferMove }
                game1.sendMessageToSocketOfColor(game, color, 'game', 'drawoffer', value)
            }
        }

    }
}



module.exports = {
    offerDraw,
    acceptDraw,
    declineDraw,
}