
// System imports
const WebSocket = require('ws');

// Middleware imports
const { logEvents } = require('../middleware/logEvents');

// Custom imports
const { Socket, WebsocketMessage, Game } = require('./TypeDefinitions')
const game1 = require('./game1');
const wsutility = require('./wsutility');
const sendNotify = wsutility.sendNotify;
const sendNotifyError = wsutility.sendNotifyError;
const clockweb = require('./clockweb');
const math1 = require('./math1')
const variant1 = require('./variant1');
const wincondition1 = require('./wincondition1');
const movesscript1 = require('./movesscript1');
const statlogger = require('./statlogger');
const { executeSafely_async } = require('../utility/errorGuard');
const { ensureJSONString } = require('../utility/JSONUtils');

const { getTranslation } = require('../config/setupTranslations');
const { getTimeServerRestarting } = require('./serverrestart');

const gamemanager = (function() {

    /** The object containing all currently active games. Each game's id is the key: `{ id: Game }` 
     * This may temporarily include games that are over, but not yet deleted/logged. */
    const activeGames = {}
    /** The number of currently active (not over) games. */
    let activeGameCount = 0;
    /** The function to execute whenever the active game count changes. */
    let onActiveGameCountChange;

    /**
     * Contains what members are currently in a game: `{ member: gameID }`
     * Users that are present in this list are not allowed to join another game until they're
     * deleted from here. As soon as a game is over, we can {@link removeUserFromActiveGame()},
     * even though the game may not be deleted/logged yet.
     */
    const membersInActiveGames = {} // "user": gameID
    /**
     * Contains what browsers are currently in a game: `{ browser: gameID }`
     * Users that are present in this list are not allowed to join another game until they're
     * deleted from here. As soon as a game is over, we can {@link removeUserFromActiveGame()}
     * even though the game may not be deleted/logged yet.
     */
    const browsersInActiveGames = {} // "browser": gameID

    /**
     * The time before concluded games are deleted, in milliseconds.
     * Adding a delay allows disconnected players enough time to
     * reconnect to see the results of the game.
     * 
     * TODO:
     * * If both players send the 'removefromplayersinactivegames' action request, we can immediately
     * log the game as both of them have seen the results of the game, and unsubbed!
     */
    const timeBeforeGameDeletionMillis = 1000 * 15; // 15 seconds

    /**
     * The time to give players who disconnected not by choice
     * (network interruption) to reconnect to the game before
     * we tell their opponent they've disconnected, and start an auto-resign timer.
     */
    const timeToGiveDisconnectedBeforeStartingAutoResignTimerMillis = 1000 * 5; // 5 seconds


    
    /**
     * Creates a new game when an invite is accepted.
     * Prints the game info and prints the active game count.
     * @param {Object} invite - The invite with the properties `id`, `owner`, `variant`, `clock`, `color`, `rated`, `publicity`.
     * @param {Object} player1Socket - Player 1 (the invite owner)'s websocket. This may not always be defined.
     * @param {Object} player2Socket  - Player 2 (the invite accepter)'s websocket. This will **always** be defined.
     */
    function createGame(invite, player1Socket, player2Socket) { // Player 1 is the invite owner.
        const gameID = math1.genUniqueID(5, activeGames);
        const game = game1.newGame(invite, gameID, player1Socket, player2Socket)
        if (!player1Socket) {
            // Player 1 (invite owner)'s socket closed before their invite was deleted.
            // Immediately start the auto-resign by disconnection timer
            startDisconnectTimer(game, player1Color, false)
        }

        addUserToActiveGames(game.white, game.id)
        addUserToActiveGames(game.black, game.id)

        addGameToActiveGames(game);

        console.log("Starting new game:")
        game1.printGame(game)
        printActiveGameCount()
    }

    /**
     * Adds a game to the active games list and increments the active game count.
     * @param {Game} game - The game
     */
    function addGameToActiveGames(game) {
        if (!game) return console.error("Can't add an undefined game to the active games list.")
        activeGames[game.id] = game
        incrementActiveGameCount()
    }

    /**
     * Deletes the game of specified id. Prints the active game count.
     * This should not be called until after both clients have had a chance
     * to see the game result, or after 15 seconds after the game ends.
     * @param {string} id - The id of the game.
     */
    async function deleteGame(id) {
        const game = getGameByID(id);
        if (!game) return console.error(`Unable to delete game because there is no game of id ${id}!`)

        const gameConclusion = game.gameConclusion;

        // THIS IS WHERE WE MODIFY ELO based on who won!!!
        // ...

        // Unsubscribe both players' sockets from the game if they still are connected.
        // If the socket is undefined, they will have already been auto-unsubscribed.
        if (game.whiteSocket) game1.unsubClientFromGame(game, game.whiteSocket)
        if (game.blackSocket) game1.unsubClientFromGame(game, game.blackSocket)

        // Remove them from the list of users in active games to allow them to join a new game.
        removeUserFromActiveGame(game.white, id)
        removeUserFromActiveGame(game.black, id)

        delete activeGames[id] // Delete the game

        console.log(`Deleted game ${game.id}.`)

        await executeSafely_async(game1.logGame, `Unable to log game! ${game1.getSimplifiedGameString(game)}`, game)
        await statlogger.logGame(game); // The statlogger will only log games with atleast 2 moves played (resignable)
    }

    /**
     * Flags, or sets a timer to, the socket as disconnected. Alerts their opponent. This does NOT unsub them from the game.
     * 
     * SHOULD THIS INSTEAD be when the client unsubs from the game? The only instance
     * the client EVER manually unsubs from the game is when the game is already over,
     * all other instances the server unsubs for them, and informs them of that.
     * @param {Socket} ws - The socket
     * @param {Object} options - An object that contains the property `closureNotByChoice`, that when true,
     * will give them 5 seconds to reconnect before flagging them as disconnected.
     */
    function onSocketClosure(ws, { closureNotByChoice = true } = {}) {
        // Quit if they're not in a game, they can't be auto-resigned by disconnection.
        if (!ws.metadata.subscriptions.game) return;

        // They were in a game...

        const game = getGameBySocket(ws);
        if (!game) return console.error("Cannot find game socket was in, cannot start timer to auto resign them.")

        // Quit if the game is over already
        if (game1.isGameOver(game)) return;

        const color = game1.doesSocketBelongToGame_ReturnColor(game, ws);

        if (closureNotByChoice) {
            // Their connection/internet dropped. Give them 5 seconds
            // before flagging them as disconnected, informing their opponent
            // they lost connection, and starting a 60s auto resign timer.
            console.log("Waiting 5 seconds before starting disconnection timer.")
            game.disconnect.startTimer[color] = setTimeout(startDisconnectTimer, timeToGiveDisconnectedBeforeStartingAutoResignTimerMillis, game, color, closureNotByChoice)
        } else {
            // Closed the tab manually. Immediately flag them
            // as disconnected, start a 20s auto resign timer.
            startDisconnectTimer(game, color, closureNotByChoice)
        }
    }

    /**
     * Starts a timer to auto-resign a player from disconnection.
     * @param {Game} game - The game
     * @param {string} color - The color to start the auto-resign timer for
     * @param {boolean} closureNotByChoice - True if the player didn't close the connection on purpose.
     */
    function startDisconnectTimer(game, color, closureNotByChoice) {
        // console.log(`Starting disconnect timer to auto resign player ${color}.`)

        const now = Date.now();
        const resignable = movesscript1.isGameResignable(game);

        let timeBeforeAutoResign = closureNotByChoice && resignable ? 60000 : 20000;
        // console.log(`Time before auto resign: ${timeBeforeAutoResign}`)
        let timeToAutoLoss = now + timeBeforeAutoResign;

        // Is there an afk timer already running for them?
        // If so, delete it, transferring it's time remaining to this disconnect timer.
        // We can do this because if player is disconnected, they are afk anyway.
        // And if if they reconnect, then they're not afk anymore either.
        if (game.whosTurn === color && game.autoAFKResignTime != null) {
            if (game.autoAFKResignTime > timeToAutoLoss) console.error("The time to auto-resign by AFK should not be greater than time to auto-resign by disconnect. We shouldn't be overwriting the AFK timer.")
            timeToAutoLoss = game.autoAFKResignTime;
            timeBeforeAutoResign = timeToAutoLoss - now;
            cancelAutoAFKResignTimer(game);
        }

        game.disconnect.autoResign[color].timeoutID = setTimeout(onPlayerLostByDisconnect, timeBeforeAutoResign, game, color);
        game.disconnect.autoResign[color].timeToAutoLoss = timeToAutoLoss;
        game.disconnect.autoResign[color].wasByChoice = !closureNotByChoice;

        // Alert their opponent the time their opponent will be auto-resigned by disconnection.
        const opponentColor = math1.getOppositeColor(color);
        const value = { autoDisconnectResignTime: timeToAutoLoss, wasByChoice: !closureNotByChoice }
        game1.sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentdisconnect', value)
    }

    function cancelDisconnectTimers(game) {
        cancelDisconnectTimer(game, 'white', { dontNotifyOpponent: true });
        cancelDisconnectTimer(game, 'black', { dontNotifyOpponent: true });
    }

    /**
     * 
     * @param {Game} game - The game
     * @param {string} color - The color to cancel the timer for
     */
    function cancelDisconnectTimer(game, color, { dontNotifyOpponent } = {}) {
        // console.log(`Canceling disconnect timer for player ${color}!`)
        
        clearTimeout(game.disconnect.startTimer[color])
        clearTimeout(game.disconnect.autoResign[color].timeoutID)
        game.disconnect.startTimer[color] = undefined;
        game.disconnect.autoResign[color].timeoutID = undefined;
        game.disconnect.autoResign[color].timeToAutoLoss = undefined;
        game.disconnect.autoResign[color].wasByChoice = undefined;
        
        if (dontNotifyOpponent) return;
        // Alert their opponent their opponent has returned.
        // ...
        const opponentColor = math1.getOppositeColor(color);
        game1.sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentdisconnectreturn')
    }

    /**
     * Called when a player in the game loses by disconnection.
     * Sets the gameConclusion, notifies the opponent.
     * @param {Game} game - The game
     * @param {string} colorLost - The color that lost by disconnection
     */
    function onPlayerLostByDisconnect(game, colorLost) {
        if (!colorLost) return console.log("Cannot lose player by disconnection when colorLost is undefined")
        const winner = math1.getOppositeColor(colorLost);

        if (game1.isGameOver(game)) return console.error("We should have cancelled the auto-loss-by-disconnection timer when the game ended!")

        const resignable = movesscript1.isGameResignable(game)

        if (resignable) {
            console.log("Someone has lost by disconnection!")
            setGameConclusion(game, `${winner} disconnect`)
        } else {
            console.log("Game aborted from disconnection.")
            setGameConclusion(game, 'aborted')
        }

        game1.sendGameUpdateToBothPlayers(game)
    }

    /**
     * Cancels the timer that automatically resigns a player due to being AFK (Away From Keyboard).
     * This function should be called when the "AFK-Return" websocket action is received, indicating that the player has returned.
     * @param {Game} game - The game
     * @param {Object} [options] - Optional parameters.
     * @param {boolean} [options.alertOpponent=false] - Whether to notify the opponent that the player has returned. This will cause their client to cease counting down the time until their opponent is auto-resigned.
     */
    function cancelAutoAFKResignTimer(game, { alertOpponent } = {}) {
        if (game.autoAFKResignTime != null && alertOpponent) { // Alert their opponent
            const opponentColor = math1.getOppositeColor(game.whosTurn);
            game1.sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentafkreturn')
        }

        clearTimeout(game.autoAFKResignTimeoutID)
        game.autoAFKResignTimeoutID = undefined;
        game.autoAFKResignTime = undefined;
    }

    /**
     * Unsubscribes a websocket from the game their connected to.
     * Detaches their socket from the game, updates their metadata.subscriptions.
     * @param {Socket} ws - Their websocket.
     */
    function unsubClientFromGameBySocket(ws) {
        const gameID = ws.metadata.subscriptions.game?.id;
        if (gameID == null) return console.error("Cannot unsub client from game when it's not subscribed to one.")

        const game = getGameByID(gameID)
        if (!game) return console.log(`Cannot unsub client from game when game doesn't exist! Metadata: ${wsutility.stringifySocketMetadata(ws)}`)

        game1.unsubClientFromGame(game, ws, { sendMessage: false })
    }

    /**
     * The method that fires when a client sends the 'joingame' command after refreshing the page.
     * This should fetch any game their in and reconnect them to it.
     * @param {Socket} ws - Their new websocket
     */
    function onJoinGame(ws) {
        // Is the client in a game?
        const game = getGameBySocket(ws);
        if (!game) return; // They don't belong in a game

        const colorPlayingAs = game1.doesSocketBelongToGame_ReturnColor(game, ws);
        game1.reconnectClientToGameAfterPageRefresh(game, colorPlayingAs, ws);

        // Cancel the timer that auto loses them by AFK, IF IT is their turn!
        if (game.whosTurn === colorPlayingAs) cancelAutoAFKResignTimer(game, { alertOpponent: true });
        cancelDisconnectTimer(game, colorPlayingAs)
    }

    /**
     * Adds the user to the list of users currently in an active game.
     * @param {Object} user - An object containing either the `member` or `browser` property.
     * @param {string} id - The id of the game they are in.
     */
    function addUserToActiveGames(user, id) { // { member/browser }, gameID
        if (user.member) membersInActiveGames[user.member] = id;
        else if (user.browser) browsersInActiveGames[user.browser] = id;
        else {
            const logText = `Cannot add user to active games list when they have neither a member nor browser property! ${user}`
            logEvents(logText, 'errLog.txt');
            console.log(logText)
        }
    }

    /**
     * Removes the user from the list of users currently in an active game.
     * This allows them to join a new game.
     * Doesn't remove them if they are already in a new game of a different ID.
     * @param {Object} user - An object containing either the `member` or `browser` property.
     * @param {string} id - The id of the game they are in.
     */
    function removeUserFromActiveGame(user, gameID) { // { member/browser }
        if (!user) return console.error("user must be specified when removing user from players in active games.")
        if (gameID == null) return console.error("gameID must be specified when removing user from players in active games.")

        // Only removes them from the game if they belong to a game of that ID.
        // If they DON'T belong to that game, that means they speedily
        // resigned and started a new game, so don't modify this!
        if (user.member) {
            if (membersInActiveGames[user.member] === gameID) delete membersInActiveGames[user.member]
            else if (membersInActiveGames[user.member]) console.log("Not removing member from active games because they speedily joined a new game!")
        } else if (user.browser) {
            if (browsersInActiveGames[user.browser] === gameID) delete browsersInActiveGames[user.browser]
            else if (browsersInActiveGames[user.browser]) console.log("Not removing browser from active games because they speedily joined a new game!")
        } else console.error("Cannot remove user from active games because they don't have a member/browser property!")
    }

    /**
     * Returns true if the player behind the socket is already in an
     * active game, or they're not allowed to join a new one.
     * @param {Socket} ws - The websocket
     */
    function isSocketInAnActiveGame(ws) {
        const player = wsutility.getOwnerFromSocket(ws);
        // Allow a member to still join a new game, even if they're browser may be connected to one already.
        if (player.member) {
            if (membersInActiveGames[player.member]) return true;
            return false;
        } else if (player.browser && browsersInActiveGames[player.browser]) return true;
        
        return false;
    }

    /**
     * Resyncs a client's websocket to a game. The client already
     * knows the game id and much other information. We only need to send
     * them the current move list, player timers, and game conclusion.
     * @param {Socket} ws - Their websocket
     * @param {Game} [game] The game, if already known. If not specified we will find it.
     */
    function resyncToGame(ws, game, gameID, replyToMessageID) {
        if (!game && gameID == null) return ws.metadata.sendmessage(ws, 'general', 'printerror', 'Cannot resync to game without game ID.')

        game = game || getGameByID(gameID) || (ws.metadata.subscriptions.game?.id ? getGameByID(ws.metadata.subscriptions.game?.id) : undefined);
        if (!game) {
            console.log(`Game of id ${gameID} not found for socket ${wsutility.stringifySocketMetadata(ws)}`)
            return ws.metadata.sendmessage(ws, 'game', 'nogame')
        }

        const colorPlayingAs = ws.metadata.subscriptions.game?.color || game1.doesSocketBelongToGame_ReturnColor(game, ws);
        if (!colorPlayingAs) return ws.metadata.sendmessage(ws, 'game', 'login'); // Unable to verify their socket belongs to this game (probably logged out)

        game1.resyncToGame(ws, game, colorPlayingAs, replyToMessageID)

        cancelDisconnectTimer(game, colorPlayingAs)
    }

    /**
     * Called when a client tries to abort a game.
     * @param {Socket} ws - The websocket
     */
    function abortGame(ws) {
        const game = getGameBySocket(ws)
        if (!game) return console.error("Can't abort a game when player isn't in one.")
        const colorPlayingAs = game1.doesSocketBelongToGame_ReturnColor(game, ws);

        // Is it legal?...

        if (game.gameConclusion === 'aborted') return; // Opponent aborted first.
        else if (game1.isGameOver(game)) { // Resync them to the game because they did not see the game conclusion.
            console.error("Player tried to abort game when the game is already over!")
            sendNotify(ws, "server.javascript.ws-no_abort_game_over")
            game1.subscribeClientToGame(game, ws, colorPlayingAs);
            return;
        };

        if (movesscript1.isGameResignable(game)) {
            console.error("Player tried to abort game when there's been atleast 2 moves played!")
            sendNotify(ws, "server.javascript.ws-no_abort_after_moves")
            game1.subscribeClientToGame(game, ws, colorPlayingAs);
            return;
        }
    
        setGameConclusion(game, 'aborted')

        const ourColor = ws.metadata.subscriptions.game?.color || game1.doesSocketBelongToGame_ReturnColor(game, ws);
        const opponentColor = math1.getOppositeColor(ourColor)

        onRequestRemovalFromPlayersInActiveGames(ws);
        game1.unsubClientFromGame(game, ws, { sendMessage: false });
        game1.sendGameUpdateToColor(game, opponentColor);
    }

    /**
     * 
     * @param {Socket} ws - The socket
     * @param {*} messageContents - The contents of the socket report message
     */
    function onReport(ws, messageContents) { // { reason, opponentsMoveNumber }
        console.log("Client reported hacking!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")

        if (!ws.metadata.subscriptions.game?.id) return console.error("Client reporting hacking isn't subscribed to a game. We can't get the game.")

        const game = getGameBySocket(ws);
        if (!game) return console.error("Unable to find game after a hack report.")

        const ourColor = ws.metadata.subscriptions.game?.color || game1.doesSocketBelongToGame_ReturnColor(game, ws);
        const opponentColor = math1.getOppositeColor(ourColor)

        if (game.publicity === 'private') {
            const errString = `Player tried to report cheating in a private game! Report message: ${JSON.stringify(messageContents)}. Reporter color: ${ourColor}.\nThe game: ${game1.getSimplifiedGameString(game)}`
            logEvents(errString, 'hackLog.txt', { print: true })
            game1.sendMessageToSocketOfColor(game, ourColor, 'general', 'printerror', 'Cannot report your friend for cheating in a private match!')
            return;
        }

        const perpetratingMoveIndex = game.moves.length - 1;
        const colorThatPlayedPerpetratingMove = movesscript1.getColorThatPlayedMoveIndex(perpetratingMoveIndex, game.blackGoesFirst)
        if (colorThatPlayedPerpetratingMove === ourColor) {
            const errString = `Silly goose player tried to report themselves for cheating. Report message: ${JSON.stringify(messageContents)}. Reporter color: ${ourColor}.\nThe game: ${game1.getSimplifiedGameString(game)}`
            logEvents(errString, 'hackLog.txt', { print: true })
            game1.sendMessageToSocketOfColor(game, ourColor, 'general', 'printerror', "Silly goose. You can't report yourself for cheating! You played that move!")
            return;
        }

        // Remove the last move played.
        const perpetratingMove = game.moves.pop();
        
        const reason = messageContents?.reason;
        const opponentsMoveNumber = messageContents?.opponentsMoveNumber;

        const errText = `Cheating reported! Perpetrating move: ${perpetratingMove}. Move number: ${opponentsMoveNumber}. The report description: ${reason}. Color who reported: ${ourColor}. Probably cheater: ${JSON.stringify(game[opponentColor])}. Their color: ${opponentColor}.\nThe game: ${game1.getSimplifiedGameString(game)}`;
        console.error(errText);
        logEvents(errText, 'hackLog.txt')
        
        setGameConclusion(game, 'aborted')

        game1.sendGameUpdateToBothPlayers(game);
        game1.sendMessageToSocketOfColor(game, 'white', 'general', 'notify', "server.javascript.ws-game_aborted_cheating")
        game1.sendMessageToSocketOfColor(game, 'black', 'general', 'notify', "server.javascript.ws-game_aborted_cheating")
    }

    /**
     * Called when a client tries to resign a game.
     * @param {Socket} ws - The websocket
     */
    function resignGame(ws) {
        const game = getGameBySocket(ws)

        if (!game) return console.error("Can't resign a game when player isn't in one.")

        // Is it legal?...

        if (game1.isGameOver(game)) { // Resync them to the game because they did not see the game conclusion.
            console.error("Player tried to resign game when the game is already over!")
            sendNotify(ws, "server.javascript.ws-cannot_resign_finished_game")
            const colorPlayingAs = game1.doesSocketBelongToGame_ReturnColor(game, ws);
            game1.subscribeClientToGame(game, ws, colorPlayingAs);
            return;
        }

        const ourColor = ws.metadata.subscriptions.game?.color || game1.doesSocketBelongToGame_ReturnColor(game, ws);
        const opponentColor = math1.getOppositeColor(ourColor)

        if (movesscript1.isGameResignable(game)) { // Resign
            const gameConclusion = `${opponentColor} resignation`
            setGameConclusion(game, gameConclusion)
        } else { // Abort instead
            console.error("Player tried to resign game when there's less than 2 moves played! Aborting instead..")
            setGameConclusion(game, 'aborted')
        }
    
        onRequestRemovalFromPlayersInActiveGames(ws);
        game1.unsubClientFromGame(game, ws, { sendMessage: false });
        game1.sendGameUpdateToColor(game, opponentColor);
    }


    /** 
     * Called when client wants to offer a draw
     * Sends confirmation to opponents
     * @param {Socket} ws - The socket
     */
    function offerDraw(ws) {
        console.log("Client offers a draw.")

        const game = getGameBySocket(ws);
        if (!game) return console.error("Client offered a draw when they don't belong in a game.")
        const color = game1.doesSocketBelongToGame_ReturnColor(game, ws);

        if (game1.isGameOver(game)) return console.error("Client offered a draw when the game is already over. Ignoring.");

        // Config for draw offers, change if eg. 4 player is enabled
        let movesBetweenDrawOffers = 2
        if (color === "white") {
            if (hasGameDrawOffer(game)) return console.error("White offered a draw when he already has a draw offer");
            if (game.moves.length - game.whiteDrawOfferMove + 1 <= movesBetweenDrawOffers) return console.error("Client trying to offer a draw too fast")
        } else {
            if (hasGameDrawOffer(game)) return console.error("Black offered a draw when he already has a draw offer");
            if (game.moves.length - game.blackDrawOfferMove + 1 <= movesBetweenDrawOffers) return console.error("Client trying to offer a draw too fast")
        }
        
        if (game.moves.length < 2) return console.error("Client trying to offer a draw on the first 2 moves")
        
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
     */
    function acceptDraw(ws) {
        console.log("Client accepts a draw.")

        const game = getGameBySocket(ws);
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
        }
        setGameConclusion(game, "draw agreement")
        game1.sendGameUpdateToBothPlayers(game);
    }

    /** 
     * Called when client declines a draw
     * Alerts opponent
     * @param {Socket} ws - The socket
     */
    function declineDraw(ws) {
        console.log("Client declines a draw.")

        const game = getGameBySocket(ws);
        if (!game) return console.error("Client declined a draw when they don't belong in a game.")
        const color = game1.doesSocketBelongToGame_ReturnColor(game, ws);
        const opponentColor = math1.getOppositeColor(color);

        if (game1.isGameOver(game)) return console.error("Client declined a draw when the game is already over. Ignoring.");
        
        // Update the status of game
        if (color === 'white') {
            if (!hasGameDrawOffer(game)) return console.error("Client declined a draw when there wasn't a draw offer")
            game.whiteDrawOffer = 'declined'
            game.blackDrawOffer = undefined
        } else if (color === 'black') {
            if (!hasGameDrawOffer(game)) return console.error("Client declined a draw when there wasn't a draw offer")
            game.blackDrawOffer = 'declined'
            game.whiteDrawOffer = undefined
        }

        // Alert their opponent
        game1.sendMessageToSocketOfColor(game, opponentColor, 'game', 'declinedraw')
    }

    // THIS SHOULD NOT BE NEEDED if we send the details about open draw offers in the correct places
    /**
     * Reinforms the player about draw offers after page refresh
     * @param {Game} game The game in which the player is
     * @param {WebSocket} ws The websocket to inform
     */
    // function reinformPlayerAboutDrawOffers(game, ws) {
    //     const color = game1.doesSocketBelongToGame_ReturnColor(game, ws);
    //     if (hasGameDrawOffer(game)) {
    //         if (color == 'white') {
    //             if (game.blackDrawOffer == 'offered') {
    //                 const value = { offererColor: 'black', whiteOfferMove: game.whiteDrawOfferMove, blackOfferMove: game.blackDrawOfferMove }
    //                 game1.sendMessageToSocketOfColor(game, color, 'game', 'drawoffer', value)
    //             }
    //         } else if (color == 'black') {
    //             if (game.whiteDrawOffer == 'offered') {
    //                 const value = { offererColor: 'white', whiteOfferMove: game.whiteDrawOfferMove, blackOfferMove: game.blackDrawOfferMove }
    //                 game1.sendMessageToSocketOfColor(game, color, 'game', 'drawoffer', value)
    //             }
    //         }

    //     }
    // }

    /**
     * Called when a client alerts us they have gone AFK.
     * Alerts their opponent, and starts a timer to auto-resign.
     * @param {Socket} ws - The socket
     */
    function onAFK(ws) {
        // console.log("Client alerted us they are AFK.")

        const game = getGameBySocket(ws);
        if (!game) return console.error("Client submitted they are afk when they don't belong in a game.")
        const color = game1.doesSocketBelongToGame_ReturnColor(game, ws);

        if (game1.isGameOver(game)) return console.error("Client submitted they are afk when the game is already over. Ignoring.")

        // Verify it's their turn (can't lose by afk if not)
        if (game.whosTurn !== color) return console.error("Client submitted they are afk when it's not their turn. Ignoring.")
        
        if (game.disconnect.startTimer[color] != null || game.disconnect.autoResign[color].timeToAutoLoss != null) return console.error("Player's disconnect timer should have been cancelled before starting their afk timer!")

        // Start a 20s timer to auto terminate the game by abandonment.
        game.autoAFKResignTimeoutID = setTimeout(onPlayerLostByAbandonment, 20000, game, color)
        game.autoAFKResignTime = Date.now() + 20000;

        // Alert their opponent
        const opponentColor = math1.getOppositeColor(color);
        const value = { autoAFKResignTime: game.autoAFKResignTime }
        game1.sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentafk', value)
    }

    /**
     * Called when a client alerts us they have returned from being AFK.
     * Alerts their opponent, and cancels the timer to auto-resign.
     * @param {Socket} ws - The socket
     */
    function onAFK_Return(ws) {
        // console.log("Client alerted us they no longer AFK.")

        const game = getGameBySocket(ws);
        if (!game) return console.error("Client submitted they are back from being afk when they don't belong in a game.")
        const color = game1.doesSocketBelongToGame_ReturnColor(game, ws);

        if (game1.isGameOver(game)) return console.error("Client submitted they are back from being afk when the game is already over. Ignoring.")

        // Verify it's their turn (can't lose by afk if not)
        if (game.whosTurn !== color) return console.error("Client submitted they are back from being afk when it's not their turn. Ignoring.")

        cancelAutoAFKResignTimer(game, { alertOpponent: true });
    }

    /**
     * Called when a player in the game loses on time.
     * Sets the gameConclusion, notifies both players.
     * Sets a 5 second timer to delete the game in case
     * one of them was disconnected when this happened.
     * @param {Game} game - The game
     */
    function onPlayerLostByAbandonment(game, colorLost) {
        if (!colorLost) return console.log("Cannot lose player by abandonment when colorLost is undefined")

        const resignable = movesscript1.isGameResignable(game)

        if (resignable) {
            console.log("Someone has lost by abandonment!")
            const winner = math1.getOppositeColor(colorLost);
            setGameConclusion(game, `${winner} disconnect`)
        } else {
            console.log("Game aborted from abandonment.")
            setGameConclusion(game, 'aborted')
        }

        game1.sendGameUpdateToBothPlayers(game);
    }

    /**
     * Returns the game with the specified id.
     * @param {string} id - The id of the game to pull.
     * @returns {Game} The game
     */
    function getGameByID(id) { return activeGames[id] }

    /**
     * Gets a game by player.
     * @param {Object} player - The player object with one of 2 properties: `member` or `browser`, depending on if they are signed in.
     * @returns {Game | undefined} - The game they are in, if they belong in one, otherwise *false*.
     */
    function getGameByPlayer(player) {
        let foundGame;
        if (player.browser) foundGame = getGameByID(browsersInActiveGames[player.browser])
        if (player.member)  foundGame = getGameByID(membersInActiveGames [player.member]) || foundGame; // The game their account is in trumps the game their browser is in
        return foundGame;
    }

    /**
     * Gets a game by socket, first checking if they are subscribed to a game,
     * if not then it checks if they are in the players in active games list.
     * @param {Socket} ws - Their websocket
     * @returns {Game | undefined} - The game they are in, if they belong in one, otherwise *false*.
     */
    function getGameBySocket(ws) {
        const gameID = ws.metadata.subscriptions.game?.id;
        if (gameID != null) return getGameByID(gameID); 

        // Is the client in a game? What's their username/browser-id?
        const player = wsutility.getOwnerFromSocket(ws)
        if (player.member == null && player.browser == null) return console.error(`Cannot get game by socket when they don't have authentication! We should not have allowed this socket creation. Socket: ${wsutility.stringifySocketMetadata(ws)}`);

        return getGameByPlayer(player);
    }

    /** Prints the active game count to the console. */
    function printActiveGameCount() {
        const activeGameCount = getActiveGameCount();
        console.log(`Active games: ${activeGameCount} ===========================================`)
    }

    /**
     * Returns the active game count. This is the number of active games that are not yet over.
     * Games that have ended are retained for a short period of time
     * to allow disconnected players to reconnect and see the results.
     * @returns {number} The active game count
     */
    function getActiveGameCount() {
        return activeGameCount
    }

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

    /**
     * Handles all incoming websocket messages related to active games.
     * Possible actions: submitmove/offerdraw/abort/resign/joingame/resync
     * @param {Socket} ws - The socket
     * @param {WebsocketMessage} message - The incoming websocket message, with the properties `route`, `action`, `value`, `id`.
     */
    function handleIncomingMessage(ws, message) {
        switch (message.action) {
            case 'submitmove':
                submitMove(ws, message.value);
                break;
            case 'joingame':
                onJoinGame(ws);
                break;
            case 'removefromplayersinactivegames':
                onRequestRemovalFromPlayersInActiveGames(ws);
                break;
            case 'resync':
                resyncToGame(ws, undefined, message.value, message.id);
                break;
            case 'abort':
                abortGame(ws);
                break;
            case 'resign':
                resignGame(ws)
                break;
            case 'offerdraw':
                offerDraw(ws);
                break;
            case 'acceptdraw':
                acceptDraw(ws);
                break;
            case 'declinedraw':
                declineDraw(ws);
                break;
            case 'AFK':
                onAFK(ws);
                break;
            case 'AFK-Return':
                onAFK_Return(ws);
                break;
            case 'report':
                onReport(ws, message.value)
                break;
            default:
                return console.error(`Unsupported action ${message.action} in game route.`)
        }
    }

    /**
     * Call when a websocket submits a move. Performs some checks,
     * adds the move to the game's move list, adjusts the game's
     * properties, and alerts their opponent of the move.
     * @param {Socket} ws - The websocket submitting the move
     * @param {Object} messageContents - An object containing the properties `move`, `moveNumber`, and `gameConclusion`.
     */
    function submitMove(ws, messageContents) {
        // They can't submit a move if they aren't subscribed to a game
        if (!ws.metadata.subscriptions.game) {
            console.error("Player tried to submit a move when not subscribed. They should only send move when they are in sync, not right after the socket opens.")
            // ws.metadata.sendmessage(ws, "general", "printerror", "Failed to submit move. Please refresh.")
            return;
        }

        // Their subscription info should tell us what game they're in, including the color they are.
        const { id, color } = ws.metadata.subscriptions.game;
        const opponentColor = math1.getOppositeColor(color);
        const game = getGameByID(id);
        if (!game) {
            console.error('They should not be submitting a move when the game their subscribed to is deleted! Server error. We should ALWAYS unsubscribe them when we delete the game.');
            return ws.metadata.sendmessage(ws, "general", "printerror", "Server error. Cannot submit move. This game does not exist.");
        }

        // If the game is already over, don't accept it.
        // Should we resync? Or tell the browser their move wasn't accepted? They will know if they need to resync.
        // The ACTUAL game conclusion SHOULD already be on the way to them so....
        if (game1.isGameOver(game)) return; 

        // Make sure the move number matches up. If not, they're out of sync, resync them!
        const expectedMoveNumber = game.moves.length + 1;
        if (messageContents.moveNumber !== expectedMoveNumber) {
            const errString = `Client submitted a move with incorrect move number! Expected: ${expectedMoveNumber}   Message: ${JSON.stringify(messageContents)}. Socket: ${wsutility.stringifySocketMetadata(ws)}`
            logEvents(errString, 'hackLog.txt', { print: true })
            return resyncToGame(ws, game);
        }

        // Make sure it's their turn
        if (game.whosTurn !== color) return ws.metadata.sendmessage(ws, "general", "printerror", "Cannot submit a move when it's not your turn.");

        // Legality checks...
        if (!doesMoveCheckOut(messageContents.move)) {
            const errString = `Player sent a message that doesn't check out! Invalid format. The message: ${JSON.stringify(messageContents)}. Socket: ${wsutility.stringifySocketMetadata(ws)}`
            console.error(errString)
            logEvents(errString, 'hackLog.txt')
            return ws.metadata.sendmessage(ws, "general", "printerror", "Invalid move format.")
        }
        if (!doesGameConclusionCheckOut(game, messageContents.gameConclusion, color)) {
            const errString = `Player sent a conclusion that doesn't check out! Invalid. The message: ${JSON.stringify(messageContents)}. Socket: ${wsutility.stringifySocketMetadata(ws)}`
            console.error(errString)
            logEvents(errString, 'hackLog.txt')
            return ws.metadata.sendmessage(ws, "general", "printerror", "Invalid game conclusion.");
        }
        
        game.moves.push(messageContents.move); // Add the move to the list!
        pushGameClock(game); // Flip whos turn and adjust the game properties
        setGameConclusion(game, messageContents.gameConclusion)

        // console.log(`Accepted a move! Their websocket message data:`)
        // console.log(messageContents)
        // console.log("New move list:")
        // console.log(game.moves);

        if (hasColorDrawOffer(game, opponentColor)) declineDraw(ws)

        if (game1.isGameOver(game)) game1.sendGameUpdateToColor(game, color)
        else sendUpdatedClockToColor(game, color);
        sendMoveToColor(game, opponentColor); // Send their move to their opponent.
    }

    /**
     * Returns true if their submitted move is in the format `x,y>x,y=N`.
     * @param {string} move - Their move submission.
     * @returns {boolean} *true* If the move is correctly formatted.
     */
    function doesMoveCheckOut(move) {
        if (typeof move !== 'string') return false;
        // Is the move in the correct format? "x,y>x,y=N"
        const coordinates = move.split('>');
        if (coordinates.length !== 2) return false;
        const startCoordComponents = coordinates[0].split(',');
        const endCoordComponents = coordinates[1].split(',');
        if (startCoordComponents.length !== 2) return false;
        if (endCoordComponents.length < 2) return false;
        if (isNaN(parseInt(startCoordComponents[0]))) return false;
        if (isNaN(parseInt(startCoordComponents[1]))) return false;
        if (isNaN(parseInt(endCoordComponents[0]))) return false;
        // Right now, don't test the 2nd component of the endCoord, because we haven't split it off the promotion piece.
        return true;
    }

    /**
     * Returns true if the provided game conclusion seems reasonable for their move submission.
     * An example of a not reasonable one would be if they claimed they won by their opponent resigning.
     * This does not run the checkmate algorithm, so it's not foolproof.
     * @param {Game} game - The game
     * @param {string | false} gameConclusion - Their claimed game conclusion.
     * @param {string} color - The color they are in the game.
     * @returns {boolean} *true* if their claimed conclusion seems reasonable.
     */
    function doesGameConclusionCheckOut(game, gameConclusion, color) {
        if (gameConclusion === false) return true;
        if (typeof gameConclusion !== 'string') return false;

        // If conclusion is "aborted", victor will not be specified.
        const { victor, condition } = wincondition1.getVictorAndConditionFromGameConclusion(gameConclusion);
        if (!wincondition1.isGameConclusionDecisive(condition)) return false; // either resignation, time, or disconnect, or whatever nonsense they specified, none of these which the client can claim the win from (the server has to tell them)
        // Game conclusion is decisive...
        // We can't submit a move where our opponent wins
        const oppositeColor = math1.getOppositeColor(color);
        return victor !== oppositeColor;
    }

    /**
     * Sends the current clock values to the player who just moved.
     * @param {Game} game - The game
     */
    function sendUpdatedClockToColor(game, color) {
        if (color !== 'white' && color !== 'black') return console.error(`color must be white or black! ${color}`)
        if (game1.isGameUntimed(game)) return; // Don't send clock values in an untimed game

        const message = {
            timerWhite: game.timerWhite,
            timerBlack: game.timerBlack,
            timeNextPlayerLosesAt: game.timeNextPlayerLosesAt
        }
        const playerSocket = color === 'white' ? game.whiteSocket : game.blackSocket;
        if (!playerSocket) return; // They are not connected, can't send message
        playerSocket.metadata.sendmessage(playerSocket, "game", "clock", message)
    }

    /**
     * Sends the most recent played move to the player who's turn it is now.
     * @param {Game} game - The game
     * @param {string} color - The color of the player to send the latest move to
     */
    function sendMoveToColor(game, color) {
        if (color !== 'white' && color !== 'black') return console.error(`colorJustMoved must be white or black! ${color}`)
        
        const message = {
            move: movesscript1.getLastMove(game.moves),
            gameConclusion: game.gameConclusion,
            moveNumber: game.moves.length,
            timerWhite: game.timerWhite,
            timerBlack: game.timerBlack,
            timeNextPlayerLosesAt: game.timeNextPlayerLosesAt
        }
        const sendToSocket = color === 'white' ? game.whiteSocket : game.blackSocket;
        if (!sendToSocket) return; // They are not connected, can't send message
        sendToSocket.metadata.sendmessage(sendToSocket, "game", "move", message)
    }

    /**
     * Pushes the game clock, adding increment. Resets the timer
     * to auto terminate the game when a player loses on time.
     * @param {Game} game - The game
     */
    function pushGameClock(game) {
        // if (!game.whosTurn) return; // Game is over
        const colorWhoJustMoved = game.whosTurn; // white/black
        game.whosTurn = math1.getOppositeColor(game.whosTurn);
        if (game1.isGameUntimed(game)) return; // Don't adjust the times if the game isn't timed.

        if (!movesscript1.isGameResignable(game)) return; ///////////////////////// Atleast 2 moves played

        const now = Date.now();
        const timeSpent = now - game.timeAtTurnStart;
        let newTime = game.timeRemainAtTurnStart - timeSpent;
        game.timeAtTurnStart = now;

        if (colorWhoJustMoved === 'white') game.timeRemainAtTurnStart = game.timerBlack;
        else                               game.timeRemainAtTurnStart = game.timerWhite;
        game.timeNextPlayerLosesAt = game.timeAtTurnStart + game.timeRemainAtTurnStart;

        // Start the timer that will auto-terminate the player when they lose on time
        setAutoTimeLossTimer(game);

        if (game.moves.length < 3) return; //////////////////////////////////////// Atleast 3 moves played

        newTime += game.incrementMillis; // Increment
        if (colorWhoJustMoved === 'white') game.timerWhite = newTime;
        else                               game.timerBlack = newTime;
    }

    /**
     * Stops the game clocks, updates both players clock time one last time.
     * Sets whosTurn to undefined
     * @param {Game} game - The game
     */
    function stopGameClock(game) {
        if (game1.isGameUntimed(game)) return;

        if (!movesscript1.isGameResignable(game)) { // The following values are undefined to begin with, their timers never left their starting values.
            game.whosTurn = undefined;
            return; 
        }

        const timeSpent = Date.now() - game.timeAtTurnStart;
        let newTime = game.timeRemainAtTurnStart - timeSpent;
        if (newTime < 0) newTime = 0;

        if (game.whosTurn === 'white') game.timerWhite = newTime;
        else                           game.timerBlack = newTime;

        game.whosTurn = undefined;

        game.timeAtTurnStart = undefined;
        game.timeNextPlayerLosesAt = undefined;
        game.timeRemainAtTurnStart = undefined;
    }

    /**
     * Reset the timer that will auto terminate the game when one player loses on time.
     * @param {Game} game - The game
     */
    function setAutoTimeLossTimer(game) {
        if (game1.isGameOver(game)) return; // Don't set the timer if the game is over
        // Cancel previous auto loss timer if it exists
        clearTimeout(game.autoTimeLossTimeoutID)
        // Set the next one
        const timeUntilLoseOnTime = game.timeRemainAtTurnStart;
        game.autoTimeLossTimeoutID = setTimeout(onPlayerLostOnTime, timeUntilLoseOnTime, game)
    }

    /**
     * Called when a player in the game loses on time.
     * Sets the gameConclusion, notifies both players.
     * Sets a 5 second timer to delete the game in case
     * one of them was disconnected when this happened.
     * @param {Game} game - The game
     */
    function onPlayerLostOnTime(game) {
        console.log("Someone has lost on time!")

        // Who lost on time?
        const loser = game.whosTurn;
        const winner = math1.getOppositeColor(loser);

        setGameConclusion(game, `${winner} time`)

        // Sometimes they're clock can have 1ms left. Just make that zero.
        // This needs to be done AFTER setting game conclusion, because that
        // stops the clocks and changes their values.
        if (loser === 'white') game.timerWhite = 0;
        else                   game.timerBlack = 0;

        game1.sendGameUpdateToBothPlayers(game);
    }

    /**
     * Sets the new conclusion for the game. May be *false*.
     * If truthy, it will fire the `onGameConclusion()` method.
     * @param {Game} game - The game
     * @param {string} conclusion - The new game conclusion
     */
    function setGameConclusion(game, conclusion) {
        const dontDecrementActiveGames = game.gameConclusion !== false; // Game already over, active game count already decremented.
        game.gameConclusion = conclusion;
        if (conclusion) onGameConclusion(game, { dontDecrementActiveGames });
    }

    /**
     * Fire whenever a game's `gameConclusion` property is set.
     * @param {Game} game - The game
     * */
    function onGameConclusion(game, { dontDecrementActiveGames } = {}) {
        if (!dontDecrementActiveGames) decrementActiveGameCount();

        console.log(`Game ${game.id} over. White: ${JSON.stringify(game.white)}. Black: ${JSON.stringify(game.black)}. Conclusion: ${game.gameConclusion}`)
        printActiveGameCount()

        stopGameClock(game);
        // Cancel the timer that will auto terminate
        // the game when the next player runs out of time
        clearTimeout(game.autoTimeLossTimeoutID)
        // Also cancel the one that auto loses by AFK
        cancelAutoAFKResignTimer(game);
        cancelDisconnectTimers(game);
        game.blackDrawOffer = 'declined'
        game.whiteDrawOffer = 'declined'

        // Set a 5-second timer to delete it and change elos,
        // to give the other client time to oppose the conclusion if they want.
        clearTimeout(game.deleteTimeoutID); // Cancel first, in case a hacking report just ocurred.
        game.deleteTimeoutID = setTimeout(deleteGame, timeBeforeGameDeletionMillis, game.id)
    }

    function incrementActiveGameCount() {
        activeGameCount++;
        // Game count increment is already broadcasted automatically
        // in the invites script when an invite is accepted.
    }

    function decrementActiveGameCount() {
        activeGameCount--;
        if (onActiveGameCountChange) onActiveGameCountChange();
    }

    /**
     * Called when the client sees the game conclusion. Tries to remove them from the players
     * in active games list, which then allows them to join a new game.
     * 
     * THIS SHOULD ALSO be the point when the server knows this player
     * agrees with the resulting game conclusion (no cheating detected),
     * and the server may change the players elos once both players send this.
     * @param {Socket} ws - Their websocket
     */
    function onRequestRemovalFromPlayersInActiveGames(ws) {
        const user = wsutility.getOwnerFromSocket(ws); // { member/browser }
        const game = getGameBySocket(ws);
        if (!game) return console.error("Can't remove player from players in active games list when they don't belong in a game")
        removeUserFromActiveGame(user, game.id)
    }

    /**
     * Sets the function to execute whenever the active game count changes.
     * @param {Function} callback - The function
     */
    function setOnActiveGameCountChange(callback) {
        onActiveGameCountChange = callback;
    }

    /**
     * Send a message to all sockets in a game saying the server will restart soon.
     * Every reconnection from now on should re-send the time the server will restart.
     */
    function broadCastGameRestarting() {
        const timeToRestart = getTimeServerRestarting()
        for (const gameID in activeGames) {
            const game = activeGames[gameID]
            game1.sendMessageToSocketOfColor(game, 'white', 'game', 'serverrestart', timeToRestart)
            game1.sendMessageToSocketOfColor(game, 'black', 'game', 'serverrestart', timeToRestart)
        }
        const minutesTillRestart = Math.ceil((timeToRestart - Date.now()) / (1000 * 60))
        console.log(`Alerted all clients in a game that the server is restarting in ${minutesTillRestart} minutes!`)
    }

    /**
     * Call when server's about to restart.
     * Aborts all active games, sends the conclusions to the players.
     * Immediately logs all games and updates statistics.
     */
    async function logAllGames() {
        for (const gameID in activeGames) {
            /** @type {Game} */
            const game = activeGames[gameID];
            if (!game1.isGameOver(game)) {
                // Abort the game
                setGameConclusion(game, 'aborted')
                // Report conclusion to players
                game1.sendGameUpdateToBothPlayers(game)
            }
            // Immediately log the game and update statistics.
            clearTimeout(game.deleteTimeoutID); // Cancel first, in case it's already scheduled to be deleted.
            await deleteGame(gameID)
        }
    }

    return Object.freeze({
        createGame,
        onSocketClosure,
        unsubClientFromGameBySocket,
        handleIncomingMessage,
        isSocketInAnActiveGame,
        getActiveGameCount,
        setOnActiveGameCountChange,
        printActiveGameCount,
        broadCastGameRestarting,
        logAllGames
    })
})();

module.exports = gamemanager
