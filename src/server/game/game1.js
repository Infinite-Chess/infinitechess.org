
/**
 * This script contains our Game constructor for the server-side,
 * and contains many utility methods for working with them!
 * 
 * At most this ever handles a single game, not multiple.
 */

// System imports
const WebSocket = require('ws');

// Middleware & other imports
const { getUsernameCaseSensitive } = require('../controllers/members');
const { logEvents } = require('../middleware/logEvents');
const { getTranslation } = require('../config/setupTranslations');
const { ensureJSONString } = require('../utility/JSONUtils');

// Custom imports
const { Socket, WebsocketMessage, Game } = require('./TypeDefinitions')
const variant1 = require('./variant1');
const math1 = require('./math1');
const clockweb = require('./clockweb');
const wsutility = require('./wsutility');
const sendNotify = wsutility.sendNotify;
const sendNotifyError = wsutility.sendNotifyError;
const wincondition1 = require('./wincondition1');
const formatconverter1 = require('./formatconverter1');
const movesscript1 = require('./movesscript1');

const { getTimeServerRestarting } = require('./serverrestart');

const game1 = (function() {

    /**
     * Game constructor. Descriptions for each property can be found in the {@link Game} type definition.
     * @param {Object} inviteOptions - The invite options that contain various settings for the game.
     * @param {string} inviteOptions.variant - The game variant to be played.
     * @param {string} inviteOptions.publicity - The publicity setting of the game. Can be "public" or "private".
     * @param {string} inviteOptions.clock - The clock format for the game, in the form "s+s" or "-" for no clock.
     * @param {string} inviteOptions.rated - The rating type of the game. Can be "casual" or "rated".
     * @param {Object} player1Socket - Player 1 (the invite owner)'s websocket. This may not always be defined.
     * @param {Object} player2Socket - Player 2 (the invite accepter)'s websocket. This will **always** be defined.
     * @returns {Game} The new game.
     */
    function newGame(inviteOptions, id, player1Socket, player2Socket) {
        /** @type {Game} */
        const newGame = {
            id,
            timeCreated: Date.now(),
            publicity: inviteOptions.publicity,
            variant: inviteOptions.variant,
            clock: inviteOptions.clock,
            rated: inviteOptions.rated === "Rated",
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

        newGame.startTimeMillis = null;
        newGame.incrementMillis = null;

        const minutesAndIncrement = clockweb.getMinutesAndIncrementFromClock(inviteOptions.clock);
        if (minutesAndIncrement !== null) {
            newGame.startTimeMillis = math1.minutesToMillis(minutesAndIncrement.minutes);
            newGame.incrementMillis = math1.secondsToMillis(minutesAndIncrement.increment);
        }

        const player1 = inviteOptions.owner; // { member/browser }  The invite owner
        const player2 = wsutility.getOwnerFromSocket(player2Socket); // { member/browser }  The invite accepter
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

        return newGame;
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
     * Unsubscribes a websocket from the game their connected to.
     * Detaches their socket from the game, updates their metadata.subscriptions.
     * @param {Game} game
     * @param {Socket} ws - Their websocket.
     * @param {Object} options - Additional options. This may contain `sendMessage`, which will inform the client to unsub from the game. Default: true
     */
    function unsubClientFromGame(game, ws, { sendMessage = true } = {}) {
        // 1. Detach their socket from the game so we no longer send updates
        removePlayerSocketFromGame(game, ws.metadata.subscriptions.game.color)

        // 2. Remove the game key-value pair from the sockets metadata subscription list.
        delete ws.metadata.subscriptions.game;

        // Let their opponent know they have disconnected.
        // Start an auto-resign timer IF the disconnection wasn't by choice
        // ...

        // console.log(`Unsubbed client from game ${game.id}. Metadata: ${wsutility.stringifySocketMetadata(ws)}`)
        // console.log("Game:")
        // printGame(game)

        // Tell the client to unsub on their end, IF the socket isn't closing.
        if (sendMessage && ws.readyState === WebSocket.OPEN) ws.metadata.sendmessage(ws, 'game', 'unsub')
    }

    /**
     * Removes the player's websocket from the game.
     * Call this when their websocket closes and we're unsubbing them from game updates.
     * @param {Game} game - The game they are a part of.
     * @param {string} color - The color they are playing. "white" / "black"
     */
    function removePlayerSocketFromGame(game, color) {
        if      (color === 'white') game.whiteSocket = undefined;
        else if (color === 'black') game.blackSocket = undefined;
        else console.error(`Cannot remove player socket from game when their color is ${color}.`)
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

        const { UTCDate, UTCTime } = math1.convertTimestampToUTCDateUTCTime(safeGameInfo.timeCreated)

        const RatedOrCasual = safeGameInfo.rated ? "Rated" : "Casual";
        const gameOptions = {
            metadata: {
                Event: `${RatedOrCasual} ${getTranslation(`play.play-menu.${safeGameInfo.variant}`)} infinite chess game`,
                Site: "https://www.infinitechess.org/",
                Round: "-",
                Variant: safeGameInfo.variant,
                White: safeGameInfo.playerWhite,
                Black: safeGameInfo.playerBlack,
                TimeControl: safeGameInfo.clock,
                UTCDate,
                UTCTime,
            },
            id: safeGameInfo.id,
            clock: safeGameInfo.clock,
            publicity: safeGameInfo.publicity,
            youAreColor: safeGameInfo.youAreColor,
            moves: safeGameInfo.moves,
            timerWhite: safeGameInfo.timerWhite,
            timerBlack: safeGameInfo.timerBlack,
            timeNextPlayerLosesAt: safeGameInfo.timeNextPlayerLosesAt,
            gameConclusion: safeGameInfo.gameConclusion,
            whiteDrawOfferMove: safeGameInfo.whiteDrawOfferMove,
            blackDrawOfferMove: safeGameInfo.blackDrawOfferMove
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
        const timeServerRestarting = getTimeServerRestarting()
        if (timeServerRestarting !== false) gameOptions.serverRestartingAt = timeServerRestarting;

        playerSocket.metadata.sendmessage(playerSocket, 'game', 'joingame', gameOptions)
    }

    /**
     * Resyncs a client's websocket to a game. The client already
     * knows the game id and much other information. We only need to send
     * them the current move list, player timers, and game conclusion.
     * @param {Socket} ws - Their websocket
     * @param {Game} [game] The game, if already known. If not specified we will find it.
     * @param {string} colorPlayingAs
     */
    function resyncToGame(ws, game, colorPlayingAs, replyToMessageID) {
        // If their socket isn't subscribed, connect them to the game!
        if (!ws.metadata.subscriptions.game) subscribeClientToGame(game, ws, colorPlayingAs, { sendGameInfo: false })

        // This function ALREADY sends all the information the client needs to resync!
        sendGameUpdateToColor(game, colorPlayingAs, { replyTo: replyToMessageID });
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
            autoAFKResignTime: game.autoAFKResignTime,
            whiteDrawOfferMove: game.whiteDrawOfferMove,
            blackDrawOfferMove: game.blackDrawOfferMove
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
        const timeServerRestarting = getTimeServerRestarting()
        if (timeServerRestarting !== false) messageContents.serverRestartingAt = timeServerRestarting;

        const playerSocket = color === 'white' ? game.whiteSocket : game.blackSocket;
        if (!playerSocket) return; // Not connected, cant send message
        playerSocket.metadata.sendmessage(playerSocket, "game", "gameupdate", messageContents, replyTo)
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
            gameConclusion: game.gameConclusion,
            whiteDrawOfferMove: game.whiteDrawOfferMove,
            blackDrawOfferMove: game.blackDrawOfferMove
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
     * Logs the game to the gameLog.txt.
     * Only call after the game ends, and when it's being deleted.
     * 
     * Async so that the server can wait for logs to finish when
     * the server is restarting/closing.
     * @param {Game} game - The game to log
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
        const { UTCDate, UTCTime } = math1.convertTimestampToUTCDateUTCTime(game.timeCreated)
        const positionStuff = variant1.getStartingPositionOfVariant({ Variant: game.variant, Date }); // 3 properties: position, positionString, and specialRights.
        const RatedOrCasual = game.rated ? "Rated" : "Casual";
        const metadata = {
            Event: `${RatedOrCasual} ${getTranslation(`play.play-menu.${game.variant}`)} infinite chess game`,
            Site: "https://www.infinitechess.org/",
            Round: "-",
            Variant: game.variant,
            White: getDisplayNameOfPlayer(game.white),
            Black: getDisplayNameOfPlayer(game.black),
            TimeControl: game.clock,
            UTCDate,
            UTCTime,
            Result: victor === 'white' ? '1-0' : victor === 'black' ? '0-1' : victor === 'draw' ? '1/2-1/2' : '0-0',
            Termination: wincondition1.getTerminationInEnglish(condition)
        }
        const gameRules = variant1.getGameRulesOfVariant(metadata, positionStuff.position)
        delete gameRules.moveRule;
        metadata.Variant = getTranslation(`play.play-menu.${game.variant}`); // Only now translate it after variant1 has gotten the game rules.
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
     * Sends the client all information they need to load the game.
     * This contains more info than {@link sendGameUpdateToColor}.
     * This also informs their opponent they have returned, if they were afk.
     * @param {Game} game 
     * @param {string} color - The color they are playing as
     * @param {Socket} ws - Their websocket
     */
    function reconnectClientToGameAfterPageRefresh(game, color, ws) {
        // Alert opponent, if this player was afk, that they are not afk no more
        if (game.whosTurn === color && game.autoAFKResignTime != null) {
            const opponentColor = math1.getOppositeColor(color);
            sendMessageToSocketOfColor(game, opponentColor, 'game', 'opponentafkreturn')
        }

        subscribeClientToGame(game, ws, color)
    }

    /**
     * Tests if the given socket belongs in the game. If so, it returns the color they are.
     * @param {Game} game - The game
     * @param {Socket} ws - The websocket
     * @returns {string | false} The color they are, if they belong, otherwise *false*.
     */
    function doesSocketBelongToGame_ReturnColor(game, ws) {
        const player = wsutility.getOwnerFromSocket(ws);
        return doesPlayerBelongToGame_ReturnColor(game, player);
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
     * Sends a websocket message to the specified color in the game.
     * @param {Game} game - The game
     * @param {string} color - The color of the player in this game to send the message to
     * @param {string} sub - Where this message should be routed to, client side.
     * @param {string} action - The action the client should perform. If sub is "general" and action is "notify" or "notifyerror", then this needs to be the key of the message in the TOML, and we will auto translate it!
     * @param {*} value - The value to send to the client.
     */
    function sendMessageToSocketOfColor(game, color, sub, action, value) {
        if (!game || !color || !action) return console.log("Missing game or color or action")
        const ws = color === 'white' ? game.whiteSocket : game.blackSocket;
        if (!ws) return; // They are not connected, can't send message
        if (sub === 'general') {
            if (action === 'notify') return sendNotify(ws, value) // The value needs translating
            if (action === 'notifyerror') return sendNotifyError(ws, value) // The value needs translating
        }
        ws.metadata.sendmessage(ws, sub, action, value) // Value doesn't need translating, send normally.
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
        if (whiteSocket) game.whiteSocket = wsutility.stringifySocketMetadata(whiteSocket);
        if (blackSocket) game.blackSocket = wsutility.stringifySocketMetadata(blackSocket);
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
     * Stringifies a game, by removing any recursion or Node timers from within, so it's JSON.stringify()'able.
     * @param {Game} game - The game
     * @returns {string} - The simplified game string
     */
    function getSimplifiedGameString(game) {
        const whiteSocket = game.whiteSocket;
        const blackSocket = game.blackSocket;
        const originalAutoTimeLossTimeoutID = game.autoTimeLossTimeoutID;
        const originalAutoAFKResignTimeoutID = game.autoAFKResignTimeoutID
        const originalDeleteTimeoutID = game.deleteTimeoutID;
        const originalDisconnect = game.disconnect;

        // We can't print normal websockets because they contain self-referencing.
        if (whiteSocket) game.whiteSocket = wsutility.stringifySocketMetadata(whiteSocket);
        if (blackSocket) game.blackSocket = wsutility.stringifySocketMetadata(blackSocket);
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

    /**
     * Returns *true* if the provided game has ended.
     * Games that are over are retained for a short period of time
     * to allow disconnected players to reconnect to see the results.
     * @param {Game} game - The game
     * @returns {boolean}
     */
    function isGameOver(game) { return game.gameConclusion !== false; }

    /**
     * Returns true if the game is untimed. Internally, the clock value will be `0`.
     * @param {Game} game - The game
     * @returns {boolean} *true* if the game is untimed.
     */
    function isGameUntimed(game) { return clockweb.isClockValueInfinite(game.clock); }

    return Object.freeze({
        newGame,
        subscribeClientToGame,
        unsubClientFromGame,
        reconnectClientToGameAfterPageRefresh,
        resyncToGame,
        sendGameUpdateToBothPlayers,
        sendGameUpdateToColor,
        logGame,
        doesSocketBelongToGame_ReturnColor,
        sendMessageToSocketOfColor,
        printGame,
        getSimplifiedGameString,
        isGameOver,
        isGameUntimed,
    })

})()

module.exports = game1;