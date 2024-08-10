
// Middleware imports
const { logEvents } = require('../../middleware/logEvents');

// Custom imports
const { Socket, WebsocketMessage, Game } = require('../TypeDefinitions')
const gameutility = require('./gameutility');
const wsutility = require('../wsutility');
const sendNotify = wsutility.sendNotify;
const sendNotifyError = wsutility.sendNotifyError;
const math1 = require('../math1')
const wincondition1 = require('../wincondition1');
const movesscript1 = require('../movesscript1');
const statlogger = require('../statlogger');
const { executeSafely_async } = require('../../utility/errorGuard');

const { getTranslation } = require('../../config/setupTranslations');
const { getTimeServerRestarting } = require('../serverrestart');
const { offerDraw, acceptDraw, declineDraw } = require('./drawoffers');
const { abortGame, resignGame } = require('./abortresigngame');
const { onAFK, onAFK_Return, cancelAutoAFKResignTimer, startDisconnectTimer, cancelDisconnectTimers, cancelDisconnectTimer, getDisconnectionForgivenessDuration } = require('./afkdisconnect');
const { onReport } = require('./cheatreport');
const { resyncToGame } = require('./resync');

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
     * Creates a new game when an invite is accepted.
     * Prints the game info and prints the active game count.
     * @param {Object} invite - The invite with the properties `id`, `owner`, `variant`, `clock`, `color`, `rated`, `publicity`.
     * @param {Object} player1Socket - Player 1 (the invite owner)'s websocket. This may not always be defined.
     * @param {Object} player2Socket  - Player 2 (the invite accepter)'s websocket. This will **always** be defined.
     */
    function createGame(invite, player1Socket, player2Socket) { // Player 1 is the invite owner.
        const gameID = math1.genUniqueID(5, activeGames);
        const game = gameutility.newGame(invite, gameID, player1Socket, player2Socket)
        if (!player1Socket) {
            // Player 1 (invite owner)'s socket closed before their invite was deleted.
            // Immediately start the auto-resign by disconnection timer
            const player2Color = gameutility.doesSocketBelongToGame_ReturnColor(game, player2Socket);
            const player1Color = math1.getOppositeColor(player2Color);
            startDisconnectTimer(game, player1Color, false, onPlayerLostByDisconnect)
        }

        addUserToActiveGames(game.white, game.id)
        addUserToActiveGames(game.black, game.id)

        addGameToActiveGames(game);

        console.log("Starting new game:")
        gameutility.printGame(game)
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
        if (game.whiteSocket) gameutility.unsubClientFromGame(game, game.whiteSocket)
        if (game.blackSocket) gameutility.unsubClientFromGame(game, game.blackSocket)

        // Remove them from the list of users in active games to allow them to join a new game.
        removeUserFromActiveGame(game.white, id)
        removeUserFromActiveGame(game.black, id)

        delete activeGames[id] // Delete the game

        console.log(`Deleted game ${game.id}.`)

        await executeSafely_async(gameutility.logGame, `Unable to log game! ${gameutility.getSimplifiedGameString(game)}`, game)
        await statlogger.logGame(game); // The statlogger will only log games with atleast 2 moves played (resignable)
    }

    /**
     * Called when a player in the game loses by disconnection.
     * Sets the gameConclusion, notifies the opponent.
     * @param {Game} game - The game
     * @param {string} colorWon - The color that won by opponent disconnection
     */
    function onPlayerLostByDisconnect(game, colorWon) {
        if (!colorWon) return console.log("Cannot lose player by disconnection when colorWon is undefined")

        if (gameutility.isGameOver(game)) return console.error("We should have cancelled the auto-loss-by-disconnection timer when the game ended!")

        const resignable = movesscript1.isGameResignable(game)

        if (resignable) {
            console.log("Someone has lost by disconnection!")
            setGameConclusion(game, `${colorWon} disconnect`)
        } else {
            console.log("Game aborted from disconnection.")
            setGameConclusion(game, 'aborted')
        }

        gameutility.sendGameUpdateToBothPlayers(game)
    }

    /**
     * Unsubscribes a websocket from the game their connected to.
     * Detaches their socket from the game, updates their metadata.subscriptions.
     * @param {Socket} ws - Their websocket.
     * @param {Object} options - Additional options.
     * @param {boolean} [unsubNotByChoice] When true, we will give them a 5-second cushion to re-sub before we start an auto-resignation timer. Set to false if we call this due to them closing the tab.
     */
    function unsubClientFromGameBySocket(ws, { unsubNotByChoice = true } = {}) {
        const gameID = ws.metadata.subscriptions.game?.id;
        if (gameID == null) return console.error("Cannot unsub client from game when it's not subscribed to one.")

        const game = getGameByID(gameID)
        if (!game) return console.log(`Cannot unsub client from game when game doesn't exist! Metadata: ${wsutility.stringifySocketMetadata(ws)}`)

        gameutility.unsubClientFromGame(game, ws, { sendMessage: false })

        // Let their opponent know they've disconnected...

        if (gameutility.isGameOver(game)) return; // It's fine if players unsub/disconnect after the game has ended.

        const color = gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
        if (unsubNotByChoice) { // Internet interruption. Give them 5 seconds before starting auto-resign timer.
            console.log("Waiting 5 seconds before starting disconnection timer.")
            const forgivenessDurationMillis = getDisconnectionForgivenessDuration();
            game.disconnect.startTimer[color] = setTimeout(startDisconnectTimer, forgivenessDurationMillis, game, color, unsubNotByChoice, onPlayerLostByDisconnect)
        } else { // Closed tab manually. Immediately start auto-resign timer.
            startDisconnectTimer(game, color, unsubNotByChoice, onPlayerLostByDisconnect)
        }
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

        const colorPlayingAs = gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
        gameutility.subscribeClientToGame(game, ws, colorPlayingAs);

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
     * Called when a player in the game loses by abandonment (AFK).
     * Sets the gameConclusion, notifies both players.
     * Sets a 5 second timer to delete the game in case
     * one of them was disconnected when this happened.
     * @param {Game} game - The game
     * @param {string} colorWon - The color that won by opponent abandonment (AFK)
     */
    function onPlayerLostByAbandonment(game, colorWon) {
        if (!colorWon) return console.log("Cannot lose player by abandonment when colorWon is undefined")

        if (movesscript1.isGameResignable(game)) {
            console.log("Someone has lost by abandonment!")
            setGameConclusion(game, `${colorWon} disconnect`)
        } else {
            console.log("Game aborted from abandonment.")
            setGameConclusion(game, 'aborted')
        }

        gameutility.sendGameUpdateToBothPlayers(game);
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
     * @returns {Game | undefined} - The game they are in, if they belong in one, otherwise undefined..
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
     * @returns {Game | undefined} - The game they are in, if they belong in one, otherwise undefined.
     */
    function getGameBySocket(ws) {
        const gameID = ws.metadata.subscriptions.game?.id;
        if (gameID != null) return getGameByID(gameID); 
        
        // The socket is not subscribed to any game. Perhaps this is a resync/refresh?

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
     * Handles all incoming websocket messages related to active games.
     * Possible actions: submitmove/offerdraw/abort/resign/joingame/resync
     * @param {Socket} ws - The socket
     * @param {WebsocketMessage} message - The incoming websocket message, with the properties `route`, `action`, `value`, `id`.
     */
    function handleIncomingMessage(ws, message) {
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
                // Perhaps this is a socket reopening, and we weren't able to find their game because they are signed out.
                // Let's check the game they said they're in!
                const gameID = message.value;
                game = game || getGameByID(gameID)
                resyncToGame(ws, game, message.value, message.id);
                break;
            case 'abort':
                if (abortGame(ws, game)) { // Aborting was a success, terminate the game
                    setGameConclusion(game, 'aborted')
                    onRequestRemovalFromPlayersInActiveGames(ws, game);
                    const colorPlayingAs = gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
                    const opponentColor = math1.getOppositeColor(colorPlayingAs)
                    gameutility.sendGameUpdateToColor(game, opponentColor);
                } break;
            case 'resign':
                if (resignGame(ws, game)) { // Resigning was a success, terminate the game
                    const ourColor = ws.metadata.subscriptions.game?.color || gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
                    const opponentColor = math1.getOppositeColor(ourColor)
                    const gameConclusion = `${opponentColor} resignation`
                    setGameConclusion(game, gameConclusion)
                    onRequestRemovalFromPlayersInActiveGames(ws, game);
                    gameutility.sendGameUpdateToColor(game, opponentColor);
                } break;
            case 'offerdraw':
                offerDraw(ws, game);
                break;
            case 'acceptdraw':
                if (acceptDraw(ws, game)) { // Draw acceptance was a success, terminate the game.
                    setGameConclusion(game, "draw agreement")
                    gameutility.sendGameUpdateToBothPlayers(game);
                } break;
            case 'declinedraw':
                declineDraw(ws, game);
                break;
            case 'AFK':
                onAFK(ws, game, onPlayerLostByAbandonment);
                break;
            case 'AFK-Return':
                onAFK_Return(ws, game);
                break;
            case 'report':
                if (onReport(ws, game, message.value)) { // Cheating report was valid, terminate the game
                    setGameConclusion(game, 'aborted')
                    gameutility.sendGameUpdateToBothPlayers(game);
                } break;
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
        if (gameutility.isGameOver(game)) return; 

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

        declineDraw(ws, game) // Auto-decline any open draw offer on move submissions

        if (gameutility.isGameOver(game)) gameutility.sendGameUpdateToColor(game, color)
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
        if (game.untimed) return; // Don't send clock values in an untimed game

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
        if (game.untimed) return; // Don't adjust the times if the game isn't timed.

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
        if (game.untimed) return;

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
        if (gameutility.isGameOver(game)) return; // Don't set the timer if the game is over
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

        gameutility.sendGameUpdateToBothPlayers(game);
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
     * @param {Game} game - The game they belong in, if they belong in one.
     */
    function onRequestRemovalFromPlayersInActiveGames(ws, game) {
        const user = wsutility.getOwnerFromSocket(ws); // { member/browser }
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
            gameutility.sendMessageToSocketOfColor(game, 'white', 'game', 'serverrestart', timeToRestart)
            gameutility.sendMessageToSocketOfColor(game, 'black', 'game', 'serverrestart', timeToRestart)
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
            if (!gameutility.isGameOver(game)) {
                // Abort the game
                setGameConclusion(game, 'aborted')
                // Report conclusion to players
                gameutility.sendGameUpdateToBothPlayers(game)
            }
            // Immediately log the game and update statistics.
            clearTimeout(game.deleteTimeoutID); // Cancel first, in case it's already scheduled to be deleted.
            await deleteGame(gameID)
        }
    }

    return Object.freeze({
        createGame,
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
