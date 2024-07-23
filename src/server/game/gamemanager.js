
// System imports
const WebSocket = require('ws');

// Middleware imports
const { getUsernameCaseSensitive } = require('../controllers/members');
const { logEvents } = require('../middleware/logEvents');

// Custom imports
const { Socket, WebsocketMessage, Game } = require('./TypeDefinitions')
const wsfunctions = require('./wsfunctions');
const clockweb = require('./clockweb');
const math1 = require('./math1')
const variant1 = require('./variant1');
const wincondition1 = require('./wincondition1');
const movesscript1 = require('./movesscript1');
const formatconverter1 = require('./formatconverter1');
const statlogger = require('./statlogger');
const { executeSafely_async } = require('../utility/errorGuard');
const { ensureJSONString } = require('../utility/JSONUtils');

const gamemanager = (function() {

    /** The object containing all currently active games. Each game's id is the key: `{ id: Game } 
     * This may temporarily include games that are over, but not yet deleted/logged. */
    const activeGames = {}
    /** The number of currently active (not over) games. */
    let activeGameCount = 0;
    /** The function to execute whenever the active game count changes. */
    let onActiveGameCountChange;

    /** Contains what members are currently in a game: `{ member: gameID }` */
    const membersInActiveGames = {} // "user": gameID
    /** Contains what browsers are currently in a game: `{ browser: gameID }` */
    const browsersInActiveGames = {} // "browser": gameID

    /** The time before concluded games are deleted, in milliseconds.
     * Adding a delay allows disconnected players enough time to
     * reconnect to see the results of the game. */
    const timeBeforeGameDeletionMillis = 15000; // 15 seconds
    // const timeBeforeGameDeletionMillis = 5000; // 5 seconds

    /** The time to give players who disconnected not by choice
     * (network interruption) to reconnect to the game before
     * we flat them as disconnected and start an auto-resign timer. */
    const timeToGiveDisconnectedBeforeStartingAutoResignTimer = 5000

    /** The time the server is restarting, if it is, otherwise false. */
    let serverRestartingAt = false;


    /**
     * Game constructor. Descriptions for each property can be found in the {@link Game} type definition.
     * @param {Object} inviteOptions - The invite options that contain the properties `variant`, `publicity`, `clock`, `rated`.
     * @param {Object} player1Socket - Player 1 (the invite owner)'s websocket. This may not always be defined.
     * @param {Object} player2Socket  - Player 2 (the invite accepter)'s websocket. This will **always** be defined.
     * @returns {Game} The game
     */
    function NewGame(inviteOptions, player1Socket, player2Socket) {
        /** @type {Game} */
        const newGame = {
            id: math1.genUniqueID(5, activeGames),
            timeCreated: Date.now(),
            publicity: inviteOptions.publicity,
            variant: inviteOptions.variant,
            clock: inviteOptions.clock,
            rated: inviteOptions.rated === "Rated" ? "Yes" : "No",
            moves: [],
            blackGoesFirst: variant1.isVariantAVariantWhereBlackStarts(inviteOptions.variant),
            gameConclusion: false,
            timeRemainAtTurnStart: undefined,
            timeAtTurnStart: undefined,
            whiteSocket: undefined,
            blackSocket: undefined,
            timeNextPlayerLosesAt: undefined,
            autoTimeLossTimeoutID: undefined,
            drawOfferMove: 0,
            whiteDrawOffer: undefined,
            blackDrawOffer: undefined,
            disconnect: {
                startTimer: {
                    white: undefined,
                    black: undefined
                },
                autoResign: {
                    white: {},
                    black: {}
                }
            }
        }

        const { minutes, increment } = clockweb.getMinutesAndIncrementFromClock(inviteOptions.clock);
        newGame.startTimeMillis = math1.minutesToMillis(minutes);
        newGame.incrementMillis = math1.secondsToMillis(increment);

        const player1 = inviteOptions.owner; // { member/browser }  The invite owner
        const player2 = wsfunctions.getOwnerFromSocket(player2Socket); // { member/browser }  The invite accepter
        const { white, black, player1Color, player2Color } = assignWhiteBlackPlayersFromInvite(inviteOptions.color, player1, player2);
        newGame.white = white;
        newGame.black = black;

        newGame.whosTurn = newGame.blackGoesFirst ? 'black' : 'white';

        if (!clockweb.isClockValueInfinite(inviteOptions.clock)) {
            newGame.timerWhite = newGame.startTimeMillis;
            newGame.timerBlack = newGame.startTimeMillis;
        }

        // Auto-subscribe the players to this game!
        // This will link their socket to this game, modify their
        // metadata.subscriptions, and send them the game info!
        subscribeClientToGame(newGame, player2Socket, player2Color);
        if (player1Socket) subscribeClientToGame(newGame, player1Socket, player1Color);
        else {
            // Player 1 (invite owner)'s socket closed before their invite was deleted.
            // Immediately start the auto-resign by disconnection timer
            startDisconnectTimer(newGame, player1Color, false)
        }

        addUserToActiveGames(newGame.white, newGame.id)
        addUserToActiveGames(newGame.black, newGame.id)

        return newGame;
    }
    
    /**
     * Creates a new game when an invite is accepted.
     * Prints the game info and prints the active game count.
     * @param {Object} invite - The invite with the properties `id`, `owner`, `variant`, `clock`, `color`, `rated`, `publicity`.
     * @param {Object} player1Socket - Player 1 (the invite owner)'s websocket. This may not always be defined.
     * @param {Object} player2Socket  - Player 2 (the invite accepter)'s websocket. This will **always** be defined.
     */
    function createGame(invite, player1Socket, player2Socket) { // Player 1 is the invite owner.
        const game = NewGame(invite, player1Socket, player2Socket)
        addGameToActiveGames(game);

        console.log("Starting new game:")
        printGame(game)
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
        if (game.whiteSocket) unsubClientFromGame(game.whiteSocket)
        if (game.blackSocket) unsubClientFromGame(game.blackSocket)

        // Remove them from the list of users in active games to allow them to join a new game.
        removeUserFromActiveGame(game.white, id)
        removeUserFromActiveGame(game.black, id)

        delete activeGames[id] // Delete the game

        console.log(`Deleted game ${game.id}.`)

        await executeSafely_async(logGame, `Unable to log game! ${getSimplifiedGameString(game)}`, game)
        await statlogger.logGame(game); // The statlogger will only log games with atleast 2 moves played (resignable)
    }

    /**
     * 
     * @param {Game} game - The game to log
     * @returns 
     */
    async function logGame(game) {
        if (game.moves.length === 0) return; // Don't log

        // First line of log...

        const playerWhite = game.white.member || `(${game.white.browser})`
        const playerBlack = game.black.member || `(${game.black.browser})`
        const playersString = `White: ${playerWhite}. Black: ${playerBlack}.`

        const gameToLog = { // This is all the information I want to log. Everything else will be in the ICN.
            id: game.id,
            publicity: game.publicity,
            timerWhite: game.timerWhite,
            timerBlack: game.timerBlack
        }
        const stringifiedGame = JSON.stringify(gameToLog);

        // Second line of log is the ICN...

        // To get this, we need to prime the gamefile for the format converter...

        /** What values do we need?
         * 
         * metadata
         * turn
         * enpassant
         * moveRule
         * fullMove
         * startingPosition (can pass in shortformat string instead)
         * specialRights
         * moves
         * gameRules
         */
        const { victor, condition } = wincondition1.getVictorAndConditionFromGameConclusion(game.gameConclusion)
        const Date = math1.getUTCDateTime(game.timeCreated)
        const positionStuff = variant1.getStartingPositionOfVariant({ Variant: game.variant, Date }); // 3 properties: position, positionString, and specialRights.
        const metadata = {
            Variant: game.variant,
            White: getDisplayNameOfPlayer(game.white),
            Black: getDisplayNameOfPlayer(game.black),
            Clock: clockweb.isClockValueInfinite(game.clock) ? "Infinite" : game.clock,
            Date,
            Result: victor === 'white' ? '1-0' : victor === 'black' ? '0-1' : '0.5-0.5',
            Condition: math1.capitalizeFirstLetter(condition),
            Rated: game.rated
        }
        const gameRules = variant1.getGameRulesOfVariant(metadata, positionStuff.position)
        delete gameRules.moveRule;
        const primedGamefile = {
            metadata,
            turn: variant1.isVariantAVariantWhereBlackStarts(game.variant) ? 'black' : 'white',
            moveRule: variant1.isVariantAVariantWhereBlackStarts(game.variant) ? undefined : "0/100",
            fullMove: 1,
            startingPosition: positionStuff.positionString, // Technically not needed, as we set `specifyPosition` to false
            moves: game.moves,
            gameRules
        }

        let logText = `Players: ${playersString} Game: ${stringifiedGame}`

        let ICN = 'ICN UNAVAILABLE';
        try {
            ICN = formatconverter1.LongToShort_Format(primedGamefile, { compact_moves: 1, make_new_lines: false, specifyPosition: false });
        } catch (e) {
            const errText = `Error when logging game and converting to ICN! The primed gamefile:\n${JSON.stringify(primedGamefile)}\n${e.stack}`
            await logEvents(errText, 'errLog.txt', { print: true })
            await logEvents(errText, 'hackLog.txt', { print: true })
        }
    
        logText += `\n${ICN}`
        await logEvents(logText, 'gameLog.txt');
    }

    /**
     * Assigns which player is what color, depending on the `color` property of the invite.
     * @param {string} color - The color property of the invite. "Random" / "White" / "Black"
     * @param {Object} player1 - An object with either the `member` or `browser` property.
     * @param {Object} player2 - An object with either the `member` or `browser` property.
     * @returns {Object} An object with 4 properties:
     * - `white`: An object with either the `member` or `browser` property.
     * - `black`: An object with either the `member` or `browser` property.
     * - `player1Color`: The color of player1, the invite owner. "white" / "black"
     * - `player2Color`: The color of player2, the invite accepter. "white" / "black"
     */
    function assignWhiteBlackPlayersFromInvite(color, player1, player2) { // { id, owner, variant, clock, color, rated, publicity }
        let white;
        let black;
        let player1Color; // Invite owner
        let player2Color; // Invite acceptor
        if (color === "White") {
            white = player1;
            black = player2;
            player1Color = 'white';
            player2Color = 'black';
        } else if (color === "Black") {
            white = player2;
            black = player1;
            player1Color = 'black';
            player2Color = 'white';
        } else { // Random
            if (Math.random() > 0.5) {
                white = player1;
                black = player2;
                player1Color = 'white';
                player2Color = 'black';
            } else {
                white = player2;
                black = player1;
                player1Color = 'black';
                player2Color = 'white';
            }
        }
        return { white, black, player1Color, player2Color }
    }

    /**
     * Links their socket to this game, modifies their metadata.subscriptions, and sends them the game info.
     * @param {Game} game - The game they are a part of.
     * @param {Object} playerSocket - Their websocket.
     * @param {string} playerColor - What color they are playing in this game. "white" / "black"
     * @param {Object} options - An object that may contain the option `sendGameInfo`, that when *true* won't send the game information over. Default: *true*
     */
    function subscribeClientToGame(game, playerSocket, playerColor, { sendGameInfo = true } = {}) {
        if (!playerSocket) return console.error(`Cannot subscribe client to game when they don't have an open socket! ${game[playerColor]}`)
        if (!playerColor) return console.error(`Cannot subscribe client to game without a color!`)

        // 1. Attach their socket to the game for receiving updates
        if (playerColor === 'white') {
            // Tell the currently connected window that another window opened
            if (game.whiteSocket) {
                game.whiteSocket.metadata.sendmessage(game.whiteSocket, 'game','leavegame')
                unsubClientFromGame(game.whiteSocket, { sendMessage: false })
            }
            game.whiteSocket = playerSocket
        } else { // 'black'
            // Tell the currently connected window that another window opened
            if (game.blackSocket) {
                game.blackSocket.metadata.sendmessage(game.blackSocket, 'game','leavegame')
                unsubClientFromGame(game.blackSocket, { sendMessage: false })
            }
            game.blackSocket = playerSocket
        }

        // 2. Modify their socket metadata to add the 'game', subscription,
        // and indicate what game the belong in and what color they are!
        playerSocket.metadata.subscriptions.game = {
            id: game.id,
            color: playerColor
        }

        // 3. Send the game information, unless this is a reconnection,
        // at which point we verify if they are in sync
        if (sendGameInfo) sendGameInfoToPlayer(game, playerSocket, playerColor);
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
        if (isGameOver(game)) return;

        const color = doesSocketBelongToGame_ReturnColor(game, ws);

        if (closureNotByChoice) {
            // Their connection/internet dropped. Give them 5 seconds
            // before flagging them as disconnected, informing their opponent
            // they lost connection, and starting a 60s auto resign timer.
            console.log("Waiting 5 seconds before starting disconnection timer.")
            game.disconnect.startTimer[color] = setTimeout(startDisconnectTimer, timeToGiveDisconnectedBeforeStartingAutoResignTimer, game, color, closureNotByChoice)
        } else {
            // Closed the tab manually. Immediately flag them
            // as disconnected, start a 20s auto resign timer.
            startDisconnectTimer(game, color, closureNotByChoice)
        }
    }

    /**
     * 
     * @param {Game} game - The game
     * @param {string} color - The color to start the auto-resign timer for
     * @param {boolean} closureNotByChoice - True if the player didn't close the connection on purpose.
     */
    function startDisconnectTimer(game, color, closureNotByChoice) {
        // console.log(`Starting disconnect timer to auto resign player ${color}.`)

        const now = Date.now();
        const resignable = movesscript1.isGameResignable(game);

        // let timeBeforeAutoResign = resignable || !closureNotByChoice ? 20000 : 60000;
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
        sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentdisconnect', value)
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
    function cancelDisconnectTimer(game, color, { dontNotifyOpponent = false } = {}) {
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
        sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentdisconnectreturn')
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

        if (isGameOver(game)) return console.error("We should have cancelled the auto-loss-by-disconnection timer when the game ended!")

        const resignable = movesscript1.isGameResignable(game)

        if (resignable) {
            console.log("Someone has lost by disconnection!")
            setGameConclusion(game, `${winner} disconnect`)
        } else {
            console.log("Game aborted from disconnection.")
            setGameConclusion(game, 'aborted')
        }

        sendGameUpdateToBothPlayers(game)
    }

    /**
     * Unsubscribes a websocket from the game their connected to.
     * Detaches their socket from the game, updates their metadata.subscriptions.
     * @param {Socket} ws - Their websocket.
     */
    function unsubClientFromGame(ws, { sendMessage = true } = {}) {
        const gameID = ws.metadata.subscriptions.game?.id;
        if (gameID == null) return console.error("Cannot unsub client from game when it's not subscribed to one.")

        const game = getGameByID(gameID)
        if (!game) return console.log(`Cannot unsub client from game when game doesn't exist! Metadata: ${wsfunctions.stringifySocketMetadata(ws)}`)

        // 1. Detach their socket from the game so we no longer send updates
        removePlayerSocketFromGame(game, ws.metadata.subscriptions.game.color)

        // 2. Remove the game key-value pair from the sockets metadata subscription list.
        delete ws.metadata.subscriptions.game;

        // Let their opponent know they have disconnected.
        // Start an auto-resign timer IF the disconnection wasn't by choice
        // ...

        // console.log(`Unsubbed client from game ${game.id}. Metadata: ${wsfunctions.stringifySocketMetadata(ws)}`)
        // console.log("Game:")
        // printGame(game)

        // Tell the client to unsub on their end, IF the socket isn't closing.
        if (sendMessage && ws.readyState === WebSocket.OPEN) ws.metadata.sendmessage(ws, 'game', 'unsub')
    }

    /**
     * Reconnects a client to the game there in, if they left the page and came back.
     * If they're not in one, this sends nothing.
     * @param {Socket} ws - Their new websocket
     */
    function reconnectClientToGameAfterPageRefresh(ws) {
        // Is the client in a game?
        const game = getGameBySocket(ws);
        if (!game) return; // They don't belong in a game

        const colorPlayingAs = doesSocketBelongToGame_ReturnColor(game, ws);

        // Cancel the timer that auto loses them by AFK,
        // IF IT is their turn
        if (game.whosTurn === colorPlayingAs) {
             // Alert opponent, if this player was afk, that they are not afk no more
            if (game.autoAFKResignTime != null) {
                const opponentColor = math1.getOppositeColor(colorPlayingAs);
                sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentafkreturn')
            }
            cancelAutoAFKResignTimer(game);
        }

        cancelDisconnectTimer(game, colorPlayingAs)
        subscribeClientToGame(game, ws, colorPlayingAs)
        reinformPlayerAboutDrawOffers(game, ws)
    }

    /**
     * Removes the player's websocket from the game.
     * Call this when their websocket closes.
     * @param {Game} game - The game they are a part of.
     * @param {string} color - The color they are playing. "white" / "black"
     */
    function removePlayerSocketFromGame(game, color) {
        if      (color === 'white') game.whiteSocket = undefined;
        else if (color === 'black') game.blackSocket = undefined;
        else console.log(`Cannot remove player socket from game when their color is ${color}.`)
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
        const player = getMemberOrBrowserFromSocket(ws);
        // Allow a member to still join a new game, even if they're browser may be connected to one already.
        if (player.member) {
            if (membersInActiveGames[player.member]) return true;
            return false;
        } else if (player.browser && browsersInActiveGames[player.browser]) return true;
        
        return false;
    }

    /**
     * Sends the game info to the player, the info they need to load the online game.
     * @param {Game} activeGame - The game they're in.
     * @param {Object} playerSocket - Their websocket
     * @param {string} playerColor - The color the are. "white" / "black"
     */
    function sendGameInfoToPlayer(activeGame, playerSocket, playerColor) {
        // Removes sensitive information from the provided game
        // DO NOT MODIFY the returned version for it will modify the original game!!!!
        const safeGameInfo = getGameInfoSafe(activeGame, playerColor);
        // Contains the properties:
        // id, publicity, variant, moves, playerWhite, playerBlack,
        // youAreColor, moves, clock, timerWhite, timerBlack, gameConclusion

        const gameOptions = {
            metadata: {
                Variant: safeGameInfo.variant,
                White: safeGameInfo.playerWhite,
                Black: safeGameInfo.playerBlack,
                Clock: clockweb.isClockValueInfinite(safeGameInfo.clock) ? "Infinite" : safeGameInfo.clock,
                Date: math1.getUTCDateTime(safeGameInfo.timeCreated),
                Rated: safeGameInfo.rated
            },
            id: safeGameInfo.id,
            clock: safeGameInfo.clock,
            publicity: safeGameInfo.publicity,
            youAreColor: safeGameInfo.youAreColor,
            moves: safeGameInfo.moves,
            timerWhite: safeGameInfo.timerWhite,
            timerBlack: safeGameInfo.timerBlack,
            timeNextPlayerLosesAt: safeGameInfo.timeNextPlayerLosesAt,
            gameConclusion: safeGameInfo.gameConclusion
        }

        // If true, we know it's their opponent that's afk, because this client
        // just refreshed the page and would have cancelled the timer if they were the ones afk.
        if (activeGame.autoAFKResignTime != null) gameOptions.autoAFKResignTime = activeGame.autoAFKResignTime

        // If their opponent has disconnected, send them that info too.
        const opponentColor = math1.getOppositeColor(playerColor)
        if (activeGame.disconnect.autoResign[opponentColor].timeToAutoLoss != null) {
            gameOptions.disconnect = {
                autoDisconnectResignTime: activeGame.disconnect.autoResign[opponentColor].timeToAutoLoss,
                wasByChoice: activeGame.disconnect.autoResign[opponentColor].wasByChoice
            }
        }

        // If the server is restarting, include the time too.
        if (serverRestartingAt !== false) gameOptions.serverRestartingAt = serverRestartingAt;

        playerSocket.metadata.sendmessage(playerSocket, 'game', 'joingame', gameOptions)
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
            console.log(`Game of id ${gameID} not found for socket ${wsfunctions.stringifySocketMetadata(ws)}`)
            return ws.metadata.sendmessage(ws, 'game', 'nogame')
        }
                
        colorPlayingAs = ws.metadata.subscriptions.game?.color || doesSocketBelongToGame_ReturnColor(game, ws);
        if (!colorPlayingAs) return ws.metadata.sendmessage(ws, 'game', 'login')

        // If their socket isn't subscribed, connect them to the game!
        if (!ws.metadata.subscriptions.game) subscribeClientToGame(game, ws, colorPlayingAs, { sendGameInfo: false })

        cancelDisconnectTimer(game, colorPlayingAs)

        // This function ALREADY sends all the information the client needs to resync!
        sendGameUpdateToColor(game, colorPlayingAs, { replyTo: replyToMessageID });
    }

    /**
     * Called when a client tries to abort a game.
     * @param {Socket} ws - The websocket
     */
    function abortGame(ws) {
        const game = getGameBySocket(ws)
        if (!game) return console.error("Can't abort a game when player isn't in one.")
        const colorPlayingAs = doesSocketBelongToGame_ReturnColor(game, ws);

        // Is it legal?...

        if (game.gameConclusion === 'aborted') return; // Opponent aborted first.
        else if (isGameOver(game)) { // Resync them to the game because they did not see the game conclusion.
            console.error("Player tried to abort game when the game is already over!")
            ws.metadata.sendmessage(ws, 'general', 'notify', { text: "ws-no_abort_game_over" })
            subscribeClientToGame(game, ws, colorPlayingAs);
            return;
        };

        if (movesscript1.isGameResignable(game)) {
            console.error("Player tried to abort game when there's been atleast 2 moves played!")
            ws.metadata.sendmessage(ws, 'general', 'notify', { text: "ws-no_abort_after_moves" })
            subscribeClientToGame(game, ws, colorPlayingAs);
            return;
        }
    
        setGameConclusion(game, 'aborted')

        const ourColor = ws.metadata.subscriptions.game?.color || doesSocketBelongToGame_ReturnColor(game, ws);
        const opponentColor = math1.getOppositeColor(ourColor)

        onRequestRemovalFromPlayersInActiveGames(ws);
        unsubClientFromGame(ws, { sendMessage: false });
        sendGameUpdateToColor(game, opponentColor);
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

        const ourColor = ws.metadata.subscriptions.game?.color || doesSocketBelongToGame_ReturnColor(game, ws);
        const opponentColor = math1.getOppositeColor(ourColor)

        if (game.publicity === 'private') {
            const errString = `Player tried to report cheating in a private game! Report message: ${JSON.stringify(messageContents)}. Reporter color: ${ourColor}.\nThe game: ${getSimplifiedGameString(game)}`
            logEvents(errString, 'hackLog.txt', { print: true })
            sendMessageToSocketOfColor(game, ourColor, 'general', 'printerror', 'Cannot report your friend for cheating in a private match!')
            return;
        }

        const perpetratingMoveIndex = game.moves.length - 1;
        const colorThatPlayedPerpetratingMove = movesscript1.getColorThatPlayedMoveIndex(perpetratingMoveIndex, game.blackGoesFirst)
        if (colorThatPlayedPerpetratingMove === ourColor) {
            const errString = `Silly goose player tried to report themselves for cheating. Report message: ${JSON.stringify(messageContents)}. Reporter color: ${ourColor}.\nThe game: ${getSimplifiedGameString(game)}`
            logEvents(errString, 'hackLog.txt', { print: true })
            sendMessageToSocketOfColor(game, ourColor, 'general', 'printerror', "Silly goose. You can't report yourself for cheating! You played that move!")
            return;
        }

        // Remove the last move played.
        const perpetratingMove = game.moves.pop();
        
        const reason = messageContents?.reason;
        const opponentsMoveNumber = messageContents?.opponentsMoveNumber;

        const errText = `Cheating reported! Perpetrating move: ${perpetratingMove}. Move number: ${opponentsMoveNumber}. The report description: ${reason}. Color who reported: ${ourColor}. Probably cheater: ${JSON.stringify(game[opponentColor])}. Their color: ${opponentColor}.\nThe game: ${getSimplifiedGameString(game)}`;
        console.error(errText);
        logEvents(errText, 'hackLog.txt')
        
        setGameConclusion(game, 'aborted')

        sendGameUpdateToBothPlayers(game);
        sendMessageToSocketOfColor(game, 'white', 'general', 'notify', { text: "ws-game_aborted_cheating" })
        sendMessageToSocketOfColor(game, 'black', 'general', 'notify', { text: "ws-game_aborted_cheating" })
    }

    /**
     * Called when a client tries to resign a game.
     * @param {Socket} ws - The websocket
     */
    function resignGame(ws) {
        const game = getGameBySocket(ws)

        if (!game) return console.error("Can't resign a game when player isn't in one.")

        // Is it legal?...

        if (isGameOver(game)) { // Resync them to the game because they did not see the game conclusion.
            console.error("Player tried to resign game when the game is already over!")
            ws.metadata.sendmessage(ws, 'general', 'notify', { text: "ws-cannot_resign_finished_game" })
            const colorPlayingAs = doesSocketBelongToGame_ReturnColor(game, ws);
            subscribeClientToGame(game, ws, colorPlayingAs);
            return;
        }

        const ourColor = ws.metadata.subscriptions.game?.color || doesSocketBelongToGame_ReturnColor(game, ws);
        const opponentColor = math1.getOppositeColor(ourColor)

        if (movesscript1.isGameResignable(game)) { // Resign
            const gameConclusion = `${opponentColor} resignation`
            setGameConclusion(game, gameConclusion)
        } else { // Abort instead
            console.error("Player tried to resign game when there's less than 2 moves played! Aborting instead..")
            setGameConclusion(game, 'aborted')
        }
    
        onRequestRemovalFromPlayersInActiveGames(ws);
        unsubClientFromGame(ws, { sendMessage: false });
        sendGameUpdateToColor(game, opponentColor);
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
        const color = doesSocketBelongToGame_ReturnColor(game, ws);

        if (isGameOver(game)) return console.error("Client offered a draw when the game is already over. Ignoring.");

        if (hasGameDrawOffer(game)) return console.error("Client offered a draw when the game has a draw offer");

        if (game.moves.length <= game.drawOfferMove) return console.error("Client trying to offer a draw twice on the same move")
        
        if (game.moves.length < 2) return console.error("Client trying to offer a draw on the first 2 moves")
        
        // Update the status of game
        if (color === 'white') {
            game.whiteDrawOffer = 'offered'
            game.blackDrawOffer = 'unconfirmed'
        } else if (color === 'black') {
            game.blackDrawOffer = 'offered'
            game.whiteDrawOffer = 'unconfirmed'
        }

        game.drawOfferMove = game.moves.length

        // Alert their opponent
        const opponentColor = math1.getOppositeColor(color);
        const value = { offererColor: color }
        sendMessageToSocketOfColor(game, opponentColor, 'game', 'drawoffer', value)
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
        const color = doesSocketBelongToGame_ReturnColor(game, ws);
        const opponentColor = math1.getOppositeColor(color);

        if (isGameOver(game)) return console.error("Client accepted a draw when the game is already over. Ignoring.");
        
        // Update the status of game
        if (color === 'white') {
            if (!hasGameDrawOffer(game)) return console.error("Client accepted a draw when there wasn't a draw offer")
            game.whiteDrawOffer = 'confirmed'
        } else if (color === 'black') {
            if (!hasGameDrawOffer(game)) return console.error("Client accepted a draw when there wasn't a draw offer")
            game.blackDrawOffer = 'confirmed'
        }
        setGameConclusion(game, "draw agreement")

        // End the game
        onRequestRemovalFromPlayersInActiveGames(ws);
        unsubClientFromGame(ws, { sendMessage: false });
        sendGameUpdateToColor(game, opponentColor);
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
        const color = doesSocketBelongToGame_ReturnColor(game, ws);
        const opponentColor = math1.getOppositeColor(color);

        if (isGameOver(game)) return console.error("Client declined a draw when the game is already over. Ignoring.");
        
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
        sendMessageToSocketOfColor(game, opponentColor, 'game', 'declinedraw')
    }

    /**
     * Reinforms the player about draw offers after page refresh
     * @param {Game} game The game in which the player is
     * @param {WebSocket} ws The websocket to inform
     */
    function reinformPlayerAboutDrawOffers(game, ws) {
        const color = doesSocketBelongToGame_ReturnColor(game, ws);
        if (hasGameDrawOffer(game)) {
            if (color == 'white') {
                if (game.blackDrawOffer == 'offered') {
                    const value = { offererColor: 'black' }
                    sendMessageToSocketOfColor(game, color, 'game', 'drawoffer', value)
                }
            } else if (color == 'black') {
                if (game.whiteDrawOffer == 'offered') {
                    const value = { offererColor: 'white' }
                    sendMessageToSocketOfColor(game, color, 'game', 'drawoffer', value)
                }
            }

        }
    }

    /**
     * Called when a client alerts us they have gone AFK.
     * Alerts their opponent, and starts a timer to auto-resign.
     * @param {Socket} ws - The socket
     */
    function onAFK(ws) {
        // console.log("Client alerted us they are AFK.")

        const game = getGameBySocket(ws);
        if (!game) return console.error("Client submitted they are afk when they don't belong in a game.")
        const color = doesSocketBelongToGame_ReturnColor(game, ws);

        if (isGameOver(game)) return console.error("Client submitted they are afk when the game is already over. Ignoring.")

        // Verify it's their turn (can't lose by afk if not)
        if (game.whosTurn !== color) return console.error("Client submitted they are afk when it's not their turn. Ignoring.")
        
        if (game.disconnect.startTimer[color] != null || game.disconnect.autoResign[color].timeToAutoLoss != null) return console.error("Player's disconnect timer should have been cancelled before starting their afk timer!")

        // Start a 20s timer to auto terminate the game by abandonment.
        game.autoAFKResignTimeoutID = setTimeout(onPlayerLostByAbandonment, 20000, game, color)
        game.autoAFKResignTime = Date.now() + 20000;

        // Alert their opponent
        const opponentColor = math1.getOppositeColor(color);
        const value = { autoAFKResignTime: game.autoAFKResignTime }
        sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentafk', value)
    }

    function sendMessageToSocketOfColor(game, color, sub, action, value) {
        if (!game || !color || !action) return console.log("Missing game or color or action")
        const playerSocket = color === 'white' ? game.whiteSocket : game.blackSocket;
        if (!playerSocket) return; // They are not connected, can't send message
        playerSocket.metadata.sendmessage(playerSocket, sub, action, value)
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
        const color = doesSocketBelongToGame_ReturnColor(game, ws);

        if (isGameOver(game)) return console.error("Client submitted they are back from being afk when the game is already over. Ignoring.")

        // Verify it's their turn (can't lose by afk if not)
        if (game.whosTurn !== color) return console.error("Client submitted they are back from being afk when it's not their turn. Ignoring.")

        cancelAutoAFKResignTimer(game);

        // Alert their opponent
        const opponentColor = math1.getOppositeColor(color);
        sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentafkreturn')
    }

    function cancelAutoAFKResignTimer(game) {
        if (!game) return console.error("Cannot cancel AFK resign timer without game")
        clearTimeout(game.autoAFKResignTimeoutID)
        game.autoAFKResignTimeoutID = undefined;
        game.autoAFKResignTime = undefined;
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

        sendGameUpdateToBothPlayers(game);
    }

    /**
     * Strips the game of potentially doxing info, making it safe to send to the players.
     * 
     * DO NOT MODIFY the return value, because it will modify the original game!
     * @param {Game} game - The game
     * @param {string} youAreColor - The value to set the `youAreColor` property.
     * @returns {Object} The game, stripped of unsafe info.
     */
    function getGameInfoSafe(game, youAreColor) { // color: white/black
        const safeGame = {
            id: game.id,
            timeCreated: game.timeCreated,
            publicity: game.publicity,
            rated: game.rated,
            variant: game.variant,
            moves: game.moves,
            playerWhite: getDisplayNameOfPlayer(game.white),
            playerBlack: getDisplayNameOfPlayer(game.black),
            youAreColor,
            moves: game.moves,
            clock: game.clock,
            gameConclusion: game.gameConclusion
        }
        if (!clockweb.isClockValueInfinite(game.clock)) {
            safeGame.timerWhite = game.timerWhite;
            safeGame.timerBlack = game.timerBlack;
            safeGame.timeNextPlayerLosesAt = game.timeNextPlayerLosesAt;
        }
        return safeGame;
    }

    /**
     * Returns the display name of the player, removing doxing information such as their `browser-id` cookie.
     * If they aren't signed in, their display name will be "(Guest)"
     * @param {Object} player - An object containing either the `member` or `browser` property.
     * @returns {string} The display name of the player.
     */
    function getDisplayNameOfPlayer(player) { // { member/browser }
        return player.member ? getUsernameCaseSensitive(player.member) : "(Guest)"
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
        const player = getMemberOrBrowserFromSocket(ws)
        if (player.member == null && player.browser == null) return console.error(`Cannot get game by socket when they don't have authentication! We should not have allowed this socket creation. Socket: ${wsfunctions.stringifySocketMetadata(ws)}`);

        return getGameByPlayer(player);
    }

    /**
     * Tests if the given player belongs in the game. If so, it returns the color they are.
     * @param {Game} game - The game
     * @param {Object} player - The player object with one of 2 properties: `member` or `browser`, depending on if they are signed in.
     * @returns {string | false} The color they are, if they belong, otherwise *false*.
     */
    function doesPlayerBelongToGame_ReturnColor(game, player) {
        if (player.member && game.white.member === player.member || player.browser && game.white.browser === player.browser) return 'white';
        if (player.member && game.black.member === player.member || player.browser && game.black.browser === player.browser) return 'black';
        return false;
    }

    /**
     * Tests if the given socket belongs in the game. If so, it returns the color they are.
     * @param {Game} game - The game
     * @param {Socket} ws - The websocket
     * @returns {string | false} The color they are, if they belong, otherwise *false*.
     */
    function doesSocketBelongToGame_ReturnColor(game, ws) {
        const player = getMemberOrBrowserFromSocket(ws);
        return doesPlayerBelongToGame_ReturnColor(game, player);
    }

    /**
     * Safely prints a game to the console. Temporarily stringifies the player sockets to remove self-referencing.
     * @param {Game} game - The game
     */
    function printGame(game) {
        const whiteSocket = game.whiteSocket;
        const blackSocket = game.blackSocket;
        const originalAutoTimeLossTimeoutID = game.autoTimeLossTimeoutID;
        const originalAutoAFKResignTimeoutID = game.autoAFKResignTimeoutID
        const originalDeleteTimeoutID = game.deleteTimeoutID;
        const originalDisconnect = game.disconnect;

        // We can't print normal websockets because they contain self-referencing.
        if (whiteSocket) game.whiteSocket = wsfunctions.stringifySocketMetadata(whiteSocket);
        if (blackSocket) game.blackSocket = wsfunctions.stringifySocketMetadata(blackSocket);
        delete game.autoTimeLossTimeoutID;
        delete game.disconnect;
        delete game.autoAFKResignTimeoutID;
        delete game.deleteTimeoutID;

        console.log(game);

        if (whiteSocket) game.whiteSocket = whiteSocket;
        if (blackSocket) game.blackSocket = blackSocket;
        game.autoTimeLossTimeoutID = originalAutoTimeLossTimeoutID;
        game.autoAFKResignTimeoutID = originalAutoAFKResignTimeoutID;
        game.deleteTimeoutID = originalDeleteTimeoutID;
        game.disconnect = originalDisconnect;
    }

    /**
     * 
     * @param {Game} game - The game
     */
    function getSimplifiedGameString(game) {
        const whiteSocket = game.whiteSocket;
        const blackSocket = game.blackSocket;
        const originalAutoTimeLossTimeoutID = game.autoTimeLossTimeoutID;
        const originalAutoAFKResignTimeoutID = game.autoAFKResignTimeoutID
        const originalDeleteTimeoutID = game.deleteTimeoutID;
        const originalDisconnect = game.disconnect;

        // We can't print normal websockets because they contain self-referencing.
        if (whiteSocket) game.whiteSocket = wsfunctions.stringifySocketMetadata(whiteSocket);
        if (blackSocket) game.blackSocket = wsfunctions.stringifySocketMetadata(blackSocket);
        delete game.autoTimeLossTimeoutID;
        delete game.disconnect;
        delete game.autoAFKResignTimeoutID;
        delete game.deleteTimeoutID;

        const stringifiedGame = ensureJSONString(game, 'There was an error when stringifying game.');

        if (whiteSocket) game.whiteSocket = whiteSocket;
        if (blackSocket) game.blackSocket = blackSocket;
        game.autoTimeLossTimeoutID = originalAutoTimeLossTimeoutID;
        game.autoAFKResignTimeoutID = originalAutoAFKResignTimeoutID;
        game.deleteTimeoutID = originalDeleteTimeoutID;
        game.disconnect = originalDisconnect;

        return stringifiedGame;
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
     * Returns *true* if the provided game has ended.
     * Games that are over are retained for a short period of time
     * to allow disconnected players to reconnect to see the results.
     * @param {Game} game - The game
     * @returns {boolean}
     */
    function isGameOver(game) { return game.gameConclusion !== false; }

    /**

     * Returns *true* if the provided game has a draw offer.
     * Games that have a draw offer can't make moves, until draw is accepted or declined.
     * @param {Game} game - The game
     * @returns {boolean}
     */
    function hasGameDrawOffer(game) {
        const isOffering = (game.blackDrawOffer === 'offered' || game.whiteDrawOffer === 'offered')
        return isOffering
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
                reconnectClientToGameAfterPageRefresh(ws);
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
        if (isGameOver(game)) return; 

        // Make sure the move number matches up. If not, they're out of sync, resync them!
        const expectedMoveNumber = game.moves.length + 1;
        if (messageContents.moveNumber !== expectedMoveNumber) {
            const errString = `Client submitted a move with incorrect move number! Expected: ${expectedMoveNumber}   Message: ${JSON.stringify(messageContents)}. Socket: ${wsfunctions.stringifySocketMetadata(ws)}`
            logEvents(errString, 'hackLog.txt', { print: true })
            return resyncToGame(ws, game);
        }

        // Make sure it's their turn
        if (game.whosTurn !== color) return ws.metadata.sendmessage(ws, "general", "printerror", "Cannot submit a move when it's not your turn.");

        // Legality checks...
        if (!doesMoveCheckOut(messageContents.move)) {
            const errString = `Player sent a message that doesn't check out! Invalid format. The message: ${JSON.stringify(messageContents)}. Socket: ${wsfunctions.stringifySocketMetadata(ws)}`
            console.error(errString)
            logEvents(errString, 'hackLog.txt')
            return ws.metadata.sendmessage(ws, "general", "printerror", "Invalid move format.")
        }
        if (!doesGameConclusionCheckOut(game, messageContents.gameConclusion, color)) {
            const errString = `Player sent a conclusion that doesn't check out! Invalid. The message: ${JSON.stringify(messageContents)}. Socket: ${wsfunctions.stringifySocketMetadata(ws)}`
            console.error(errString)
            logEvents(errString, 'hackLog.txt')
            return ws.metadata.sendmessage(ws, "general", "printerror", "Invalid game conclusion.");
        }
        
        game.moves.push(messageContents.move); // Add the move to the list!
        pushGameClock(game); // Flip whos turn and adjust the game properties
        setGameConclusion(game, messageContents.gameConclusion)

        // Cancel the timer that auto loses this player by AFK, just in case
        cancelAutoAFKResignTimer(game);

        // console.log(`Accepted a move! Their websocket message data:`)
        // console.log(messageContents)
        // console.log("New move list:")
        // console.log(game.moves);

        if (isGameOver(game)) sendGameUpdateToColor(game, color)
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
        if (isGameUntimed(game)) return; // Don't send clock values in an untimed game

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
     * Returns true if the game is untimed. Internally, the clock value will be `0`.
     * @param {Game} game - The game
     * @returns {boolean} *true* if the game is untimed.
     */
    function isGameUntimed(game) { return clockweb.isClockValueInfinite(game.clock); }

    /**
     * Pushes the game clock, adding increment. Resets the timer
     * to auto terminate the game when a player loses on time.
     * @param {Game} game - The game
     */
    function pushGameClock(game) {
        // if (!game.whosTurn) return; // Game is over
        const colorWhoJustMoved = game.whosTurn; // white/black
        game.whosTurn = math1.getOppositeColor(game.whosTurn);
        if (isGameUntimed(game)) return; // Don't adjust the times if the game isn't timed.

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
        if (isGameUntimed(game)) return;

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
        if (isGameOver(game)) return; // Don't set the timer if the game is over
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

        sendGameUpdateToBothPlayers(game);
    }

    /**
     * Alerts both players in the game of the game conclusion if it has ended,
     * and the current moves list and timers.
     * @param {Game} game - The game
     */
    function sendGameUpdateToBothPlayers(game) {
        sendGameUpdateToColor(game, 'white')
        sendGameUpdateToColor(game, 'black')
    }

    /**
     * Alerts the player of the specified color of the game conclusion if it has ended,
     * and the current moves list and timers.
     * @param {Game} game - The game
     * @param {string} color - The color of the player
     */
    function sendGameUpdateToColor(game, color, { replyTo } = {}) {
        const messageContents = {
            gameConclusion: game.gameConclusion,
            timerWhite: game.timerWhite,
            timerBlack: game.timerBlack,
            timeNextPlayerLosesAt: game.timeNextPlayerLosesAt,
            moves: game.moves, // Send the final move list so they can make sure they're in sync.
            autoAFKResignTime: game.autoAFKResignTime
        }
        // If their opponent has disconnected, send them that info too.
        const opponentColor = math1.getOppositeColor(color)
        if (game.disconnect.autoResign[opponentColor].timeToAutoLoss != null) {
            messageContents.disconnect = {
                autoDisconnectResignTime: game.disconnect.autoResign[opponentColor].timeToAutoLoss,
                wasByChoice: game.disconnect.autoResign[opponentColor].wasByChoice
            }
        }
        // Also send the time the server is restarting, if it is
        if (serverRestartingAt !== false) messageContents.serverRestartingAt = serverRestartingAt;

        const playerSocket = color === 'white' ? game.whiteSocket : game.blackSocket;
        if (!playerSocket) return; // Not connected, cant send message
        playerSocket.metadata.sendmessage(playerSocket, "game", "gameupdate", messageContents, replyTo)
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
     * Returns an object containing the users authentication information.
     * @param {Socket} ws - The websocket
     * @returns {Object} An object with either the `member` or `browser` property.
     */
    function getMemberOrBrowserFromSocket(ws) {
        return { member: ws.metadata.user, browser: ws.metadata['browser-id'] }
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
        const user = getMemberOrBrowserFromSocket(ws); // { member/browser }
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
     * @param {number} timeToRestart - The time the server will restart.
     */
    function broadCastGameRestarting(timeToRestart) {
        serverRestartingAt = timeToRestart;
        for (const gameID in activeGames) {
            const game = activeGames[gameID]
            sendMessageToSocketOfColor(game, 'white', 'game', 'serverrestart', timeToRestart)
            sendMessageToSocketOfColor(game, 'black', 'game', 'serverrestart', timeToRestart)
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
            if (!isGameOver(game)) {
                // Abort the game
                setGameConclusion(game, 'aborted')
                // Report conclusion to players
                sendGameUpdateToBothPlayers(game)
            }
            // Immediately log the game and update statistics.
            clearTimeout(game.deleteTimeoutID); // Cancel first, in case it's already scheduled to be deleted.
            await deleteGame(gameID)
        }
    }

    return Object.freeze({
        createGame,
        onSocketClosure,
        unsubClientFromGame,
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
