
// Middleware imports
const { logEvents } = require('../../middleware/logEvents');

// Custom imports
// eslint-disable-next-line no-unused-vars
const { Socket, Game } = require('../TypeDefinitions')
const gameutility = require('./gameutility');
const wsutility = require('../wsutility');
const math1 = require('../math1')
const movesscript1 = require('../movesscript1');
const statlogger = require('../statlogger');
const { executeSafely_async } = require('../../utility/errorGuard');

const { getTimeServerRestarting } = require('../serverrestart');
const { cancelAutoAFKResignTimer, startDisconnectTimer, cancelDisconnectTimers, getDisconnectionForgivenessDuration } = require('./afkdisconnect');
const { incrementActiveGameCount, decrementActiveGameCount, printActiveGameCount } = require('./gamecount');
const { closeDrawOffer } = require('./drawoffers');



/**
 * Creates a new game when an invite is accepted.
 * Prints the game info and prints the active game count.
 * @param {Object} invite - The invite with the properties `id`, `owner`, `variant`, `clock`, `color`, `rated`, `publicity`.
 * @param {Socket} player1Socket - Player 1 (the invite owner)'s websocket. This may not always be defined.
 * @param {Socket} player2Socket  - Player 2 (the invite accepter)'s websocket. This will **always** be defined.
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



/** The object containing all currently active games. Each game's id is the key: `{ id: Game }` 
 * This may temporarily include games that are over, but not yet deleted/logged. */
const activeGames = {}

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
    closeDrawOffer(game);

    // Set a 5-second timer to delete it and change elos,
    // to give the other client time to oppose the conclusion if they want.
    clearTimeout(game.deleteTimeoutID); // Cancel first, in case a hacking report just ocurred.
    game.deleteTimeoutID = setTimeout(deleteGame, timeBeforeGameDeletionMillis, game.id)
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


module.exports = {
    createGame,
    unsubClientFromGameBySocket,
    isSocketInAnActiveGame,
    onPlayerLostByAbandonment,
    
    broadCastGameRestarting,
    logAllGames,

    getGameBySocket,
    onRequestRemovalFromPlayersInActiveGames,
    setGameConclusion,
    getGameByID,
    pushGameClock,

}