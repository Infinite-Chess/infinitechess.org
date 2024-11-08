
/**
 * This script contains our Game constructor for the server-side,
 * and contains many utility methods for working with them!
 * 
 * At most this ever handles a single game, not multiple.
 */

// System imports
import WebSocket from 'ws';

// Middleware & other imports
import { getUsernameCaseSensitive } from '../../controllers/members.js';
import { logEvents } from '../../middleware/logEvents.js';
import { getTranslation } from '../../utility/translate.js';
import { ensureJSONString } from '../../utility/JSONUtils.js';

// Custom imports
import clockweb from '../clockweb.js';
import wsutility from '../wsutility.js';
const { sendNotify, sendNotifyError } = wsutility;
import formatconverter from '../../../client/scripts/game/chess/formatconverter.js';

import { getTimeServerRestarting } from '../timeServerRestarts.js';
import { doesColorHaveExtendedDrawOffer, getLastDrawOfferPlyOfColor } from './drawoffers.js';
import timeutil from '../../../client/scripts/game/misc/timeutil.js';
import colorutil from '../../../client/scripts/game/misc/colorutil.js';
import variant from '../../../client/scripts/game/variants/variant.js';
import jsutil from '../../../client/scripts/game/misc/jsutil.js';
import winconutil from '../../../client/scripts/game/misc/winconutil.js';

// Type Definitions...

/**
 * @typedef {import('../TypeDefinitions.js').Socket} Socket
 * @typedef {import('../TypeDefinitions.js').Game} Game
 */
/* eslint-disable no-unused-vars */
import { GameRules } from '../../../client/scripts/game/variants/gamerules.js';
/* eslint-enable no-unused-vars */

/**
 * Construct a new online game from the invite options,
 * and subscribe the players to the game for receiving updates.
 * 
 * Descriptions for each property can be found in the {@link Game} type definition.
 * @param {Object} inviteOptions - The invite options that contain various settings for the game.
 * @param {string} inviteOptions.variant - The game variant to be played.
 * @param {string} inviteOptions.publicity - The publicity setting of the game. Can be "public" or "private".
 * @param {string} inviteOptions.clock - The clock format for the game, in the form "s+s" or "-" for no clock.
 * @param {string} inviteOptions.rated - The rating type of the game. Can be "casual" or "rated".
 * @param {string} id - The unique identifier to give this game.
 * @param {Socket | undefined} player1Socket - Player 1 (the invite owner)'s websocket. This may not always be defined.
 * @param {Socket} player2Socket - Player 2 (the invite accepter)'s websocket. This will **always** be defined.
 * @param {number} replyto - The ID of the incoming socket message of player 2, accepting the invite. This is used for the `replyto` property on our response.
 * @returns {Game} The new game.
 */
function newGame(inviteOptions, id, player1Socket, player2Socket, replyto) {
	/** @type {Game} */
	const newGame = {
		id,
		timeCreated: Date.now(),
		publicity: inviteOptions.publicity,
		variant: inviteOptions.variant,
		clock: inviteOptions.clock,
		untimed: clockweb.isClockValueInfinite(inviteOptions.clock),
		startTimeMillis: null,
		incrementMillis: null,
		rated: inviteOptions.rated === "Rated",
		moves: [],
		gameRules: variant.getGameRulesOfVariant({ Variant: inviteOptions.variant }),
		gameConclusion: false,
		disconnect: {
			startTimer: {},
			autoResign: {
				white: {},
				black: {}
			}
		},
		drawOffers: { lastOfferPly: {} },
	};

	if (!newGame.untimed) { // Set the start time and increment properties
		const { minutes, increment } = clockweb.getMinutesAndIncrementFromClock(inviteOptions.clock);
		newGame.startTimeMillis = timeutil.minutesToMillis(minutes);
		newGame.incrementMillis = timeutil.secondsToMillis(increment);
		// Set the clocks
		newGame.timerWhite = newGame.startTimeMillis;
		newGame.timerBlack = newGame.startTimeMillis;
	}

	// Set the colors
	const player1 = inviteOptions.owner; // { member/browser }  The invite owner
	const player2 = wsutility.getOwnerFromSocket(player2Socket); // { member/browser }  The invite accepter
	const { white, black, player1Color, player2Color } = assignWhiteBlackPlayersFromInvite(inviteOptions.color, player1, player2);
	newGame.white = white;
	newGame.black = black;

	// Set whos turn
	newGame.whosTurn = newGame.gameRules.turnOrder[0];

	// Auto-subscribe the players to this game!
	// This will link their socket to this game, modify their
	// metadata.subscriptions, and send them the game info!
	subscribeClientToGame(newGame, player2Socket, player2Color, { replyto });
	// Occasionally, player 1's (invite owner) socket will be closed.
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
	return { white, black, player1Color, player2Color };
}

/**
 * Links their socket to this game, modifies their metadata.subscriptions, and sends them the game info.
 * @param {Game} game - The game they are a part of.
 * @param {Object} playerSocket - Their websocket.
 * @param {string} playerColor - What color they are playing in this game. "white" / "black"
 * @param {Object} options - An object that may contain the option `sendGameInfo`, that when *true* won't send the game information over. Default: *true*
 * @param {boolean} options.sendGameInfo
 * @param {number} options.replyto - The ID of the incoming socket message. This is used for the `replyto` property on our response.
 */
function subscribeClientToGame(game, playerSocket, playerColor, { sendGameInfo = true, replyto } = {}) {
	if (!playerSocket) return console.error(`Cannot subscribe client to game when they don't have an open socket! ${game[playerColor]}`);
	if (!playerColor) return console.error(`Cannot subscribe client to game without a color!`);

	// 1. Attach their socket to the game for receiving updates
	if (playerColor === 'white') {
		// Tell the currently connected window that another window opened
		if (game.whiteSocket) {
			game.whiteSocket.metadata.sendmessage(game.whiteSocket, 'game','leavegame');
			unsubClientFromGame(game, game.whiteSocket, { sendMessage: false });
		}
		game.whiteSocket = playerSocket;
	} else { // 'black'
		// Tell the currently connected window that another window opened
		if (game.blackSocket) {
			game.blackSocket.metadata.sendmessage(game.blackSocket, 'game','leavegame');
			unsubClientFromGame(game, game.blackSocket, { sendMessage: false });
		}
		game.blackSocket = playerSocket;
	}

	// 2. Modify their socket metadata to add the 'game', subscription,
	// and indicate what game the belong in and what color they are!
	playerSocket.metadata.subscriptions.game = {
		id: game.id,
		color: playerColor
	};

	// 3. Send the game information, unless this is a reconnection,
	// at which point we verify if they are in sync
	if (sendGameInfo) sendGameInfoToPlayer(game, playerSocket, playerColor, replyto);
}

/**
 * Unsubscribes a websocket from the game their connected to.
 * Detaches their socket from the game, updates their metadata.subscriptions.
 * @param {Game} game
 * @param {Socket} ws - Their websocket.
 * @param {Object} options - Additional options.
 * @param {Object} options.sendMessage - Whether to inform the client to unsub from the game. Default: true. This should be false if we're unsubbing because the socket is closing.
 */
function unsubClientFromGame(game, ws, { sendMessage = true } = {}) {
	if (!ws) return; // Socket undefined, can't unsub.

	// 1. Detach their socket from the game so we no longer send updates
	removePlayerSocketFromGame(game, ws.metadata.subscriptions.game.color);

	// 2. Remove the game key-value pair from the sockets metadata subscription list.
	delete ws.metadata.subscriptions.game;

	// We inform their opponent they have disconnected inside js when we call this method.

	// Tell the client to unsub on their end, IF the socket isn't closing.
	if (sendMessage && ws.readyState === WebSocket.OPEN) ws.metadata.sendmessage(ws, 'game', 'unsub');
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
	else console.error(`Cannot remove player socket from game when their color is ${color}.`);
}

/**
 * Sends the game info to the player, the info they need to load the online game.
 * 
 * Makes sure not to send sensitive info, such as player's browser-id cookies.
 * @param {Game} game - The game they're in.
 * @param {Socket} playerSocket - Their websocket
 * @param {string} playerColor - The color the are. "white" / "black"
 * @param {number} replyto - The ID of the incoming socket message. This is used for the `replyto` property on our response.
 */
function sendGameInfoToPlayer(game, playerSocket, playerColor, replyto) {
	const { UTCDate, UTCTime } = timeutil.convertTimestampToUTCDateUTCTime(game.timeCreated);

	const RatedOrCasual = game.rated ? "Rated" : "Casual";
	const opponentColor = colorutil.getOppositeColor(playerColor);
	const gameOptions = {
		metadata: {
			Event: `${RatedOrCasual} ${getTranslation(`play.play-menu.${game.variant}`)} infinite chess game`,
			Site: "https://www.infinitechess.org/",
			Round: "-",
			Variant: game.variant,
			White: getDisplayNameOfPlayer(game.white), // Protect browser's browser-id cookie
			Black: getDisplayNameOfPlayer(game.black), // Protect browser's browser-id cookie
			TimeControl: game.clock,
			UTCDate,
			UTCTime,
		},
		id: game.id,
		clock: game.clock,
		publicity: game.publicity,
		youAreColor: playerColor,
		moves: game.moves,
		gameConclusion: game.gameConclusion,
		drawOffer: {
			unconfirmed: doesColorHaveExtendedDrawOffer(game, opponentColor), // True if our opponent has extended a draw offer we haven't yet confirmed/denied
			lastOfferPly: getLastDrawOfferPlyOfColor(game, playerColor) // The move ply WE HAVE last offered a draw, if we have, otherwise undefined.
		}
	};
	// Include additional stuff if relevant
	if (!game.untimed) gameOptions.clockValues = getGameClockValues(game);

	// If true, we know it's their opponent that's afk, because this client
	// just refreshed the page and would have cancelled the timer if they were the ones afk.
	if (isAFKTimerActive(game)) gameOptions.autoAFKResignTime = game.autoAFKResignTime;

	// If their opponent has disconnected, send them that info too.
	if (game.disconnect.autoResign[opponentColor].timeToAutoLoss !== undefined) {
		gameOptions.disconnect = {
			autoDisconnectResignTime: game.disconnect.autoResign[opponentColor].timeToAutoLoss,
			wasByChoice: game.disconnect.autoResign[opponentColor].wasByChoice
		};
	}

	// If the server is restarting, include the time too.
	const timeServerRestarting = getTimeServerRestarting();
	if (timeServerRestarting !== false) gameOptions.serverRestartingAt = timeServerRestarting;

	playerSocket.metadata.sendmessage(playerSocket, 'game', 'joingame', gameOptions, replyto);
}

/**
 * Resyncs a client's websocket to a game. The client already
 * knows the game id and much other information. We only need to send
 * them the current move list, player timers, and game conclusion.
 * @param {Socket} ws - Their websocket
 * @param {Game} game - The game
 * @param {string} colorPlayingAs - Their color
 * @param {number} [replyToMessageID] - If specified, the id of the incoming socket message this update will be the reply to
 */
function resyncToGame(ws, game, colorPlayingAs, replyToMessageID) {
	// If their socket isn't subscribed, connect them to the game!
	if (!ws.metadata.subscriptions.game) subscribeClientToGame(game, ws, colorPlayingAs, { sendGameInfo: false });

	// This function ALREADY sends all the information the client needs to resync!
	sendGameUpdateToColor(game, colorPlayingAs, { replyTo: replyToMessageID });
}

/**
 * Alerts both players in the game of the game conclusion if it has ended,
 * and the current moves list and timers.
 * @param {Game} game - The game
 */
function sendGameUpdateToBothPlayers(game) {
	sendGameUpdateToColor(game, 'white');
	sendGameUpdateToColor(game, 'black');
}

/**
 * Alerts the player of the specified color of the game conclusion if it has ended,
 * and the current moves list and timers.
 * @param {Game} game - The game
 * @param {string} color - The color of the player
 * @param {Object} options - Additional options
 * @param {number} [options.replyTo] - If specified, the id of the incoming socket message this update will be the reply to
 */
function sendGameUpdateToColor(game, color, { replyTo } = {}) {
	const playerSocket = color === 'white' ? game.whiteSocket : game.blackSocket;
	if (!playerSocket) return; // Not connected, cant send message

	const opponentColor = colorutil.getOppositeColor(color);
	const messageContents = {
		gameConclusion: game.gameConclusion,
		moves: game.moves, // Send the final move list so they can make sure they're in sync.
		drawOffer: {
			unconfirmed: doesColorHaveExtendedDrawOffer(game, opponentColor), // True if our opponent has extended a draw offer we haven't yet confirmed/denied
			lastOfferPly: getLastDrawOfferPlyOfColor(game, color) // The move ply WE HAVE last offered a draw, if we have, otherwise undefined.
		}
	};
	// Include timer info if it's timed
	if (!game.untimed) messageContents.clockValues = getGameClockValues(game);
	// Include other relevant stuff if defined
	if (isAFKTimerActive(game)) messageContents.autoAFKResignTime = game.autoAFKResignTime;

	// If their opponent has disconnected, send them that info too.
	if (game.disconnect.autoResign[opponentColor].timeToAutoLoss !== undefined) {
		messageContents.disconnect = {
			autoDisconnectResignTime: game.disconnect.autoResign[opponentColor].timeToAutoLoss,
			wasByChoice: game.disconnect.autoResign[opponentColor].wasByChoice
		};
	}

	// Also send the time the server is restarting, if it is
	const timeServerRestarting = getTimeServerRestarting();
	if (timeServerRestarting !== false) messageContents.serverRestartingAt = timeServerRestarting;

	playerSocket.metadata.sendmessage(playerSocket, "game", "gameupdate", messageContents, replyTo);
}

/**
 * Returns the display name of the player, removing doxing information such as their `browser-id` cookie.
 * If they aren't signed in, their display name will be "(Guest)"
 * @param {Object} player - An object containing either the `member` or `browser` property.
 * @returns {string} The display name of the player.
 */
function getDisplayNameOfPlayer(player) { // { member/browser }
	return player.member ? getUsernameCaseSensitive(player.member) : "(Guest)";
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
	if (game.moves.length === 0) return; // Don't log games with zero moves

	// First line of log...

	const playerWhite = game.white.member || `(${game.white.browser})`;
	const playerBlack = game.black.member || `(${game.black.browser})`;
	const playersString = `White: ${playerWhite}. Black: ${playerBlack}.`;

	const gameToLog = { // This is all the information I want to log. Everything else will be in the ICN.
		id: game.id,
		publicity: game.publicity,
		timerWhite: game.timerWhite,
		timerBlack: game.timerBlack
	};
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
	const { victor, condition } = winconutil.getVictorAndConditionFromGameConclusion(game.gameConclusion);
	const { UTCDate, UTCTime } = timeutil.convertTimestampToUTCDateUTCTime(game.timeCreated);
	const RatedOrCasual = game.rated ? "Rated" : "Casual";
	const gameRules = jsutil.deepCopyObject(game.gameRules);
	const metadata = {
		Event: `${RatedOrCasual} ${getTranslation(`play.play-menu.${game.variant}`)} infinite chess game`,
		Site: "https://www.infinitechess.org/",
		Round: "-",
		Variant: game.variant, // Don't translate yet, as variant.js needs the variant code to fetch gamerules.
		White: getDisplayNameOfPlayer(game.white),
		Black: getDisplayNameOfPlayer(game.black),
		TimeControl: game.clock,
		UTCDate,
		UTCTime,
		Result: winconutil.getResultFromVictor(victor),
		Termination: getTerminationInEnglish(gameRules, condition)
	};
	const moveRule = gameRules.moveRule ? `0/${gameRules.moveRule}` : undefined;
	delete gameRules.moveRule;
	metadata.Variant = getTranslation(`play.play-menu.${game.variant}`); // Only now translate it after variant.js has gotten the game rules.
	const primedGamefile = {
		metadata,
		moveRule,
		fullMove: 1,
		moves: game.moves,
		gameRules
	};

	let logText = `Players: ${playersString} Game: ${stringifiedGame}`; // First line

	let ICN = 'ICN UNAVAILABLE';
	try {
		ICN = formatconverter.LongToShort_Format(primedGamefile, { compact_moves: 1, make_new_lines: false, specifyPosition: false });
	} catch (e) {
		const errText = `Error when logging game and converting to ICN! The primed gamefile:\n${JSON.stringify(primedGamefile)}\n${e.stack}`;
		await logEvents(errText, 'errLog.txt', { print: true });
		await logEvents(errText, 'hackLog.txt', { print: true });
	}

	logText += `\n${ICN}`; // Add line 2
	await logEvents(logText, 'gameLog.txt');
}

/**
 * Tests if the given socket belongs in the game. If so, it returns the color they are.
 * @param {Game} game - The game
 * @param {Socket} ws - The websocket
 * @returns {string | false} The color they are, if they belong, otherwise *false*.
 */
function doesSocketBelongToGame_ReturnColor(game, ws) {
	if (game.id === ws.metadata.subscriptions.game?.id) return ws.metadata.subscriptions.game?.color;
	// Color isn't provided in their subscriptions, perhaps this is a resync/refresh?
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
 * @param {string} action - The action the client should perform. If sub is "general" and action is "notify" or "notifyerror", then this needs to be the key of the message in the TOML, and we will auto-translate it!
 * @param {*} value - The value to send to the client.
 */
function sendMessageToSocketOfColor(game, color, sub, action, value) {
	const ws = color === 'white' ? game.whiteSocket : game.blackSocket;
	if (!ws) return; // They are not connected, can't send message
	if (sub === 'general') {
		if (action === 'notify') return sendNotify(ws, value); // The value needs translating
		if (action === 'notifyerror') return sendNotifyError(ws, value); // The value needs translating
	}
	ws.metadata.sendmessage(ws, sub, action, value); // Value doesn't need translating, send normally.
}

/**
 * Safely prints a game to the console. Temporarily stringifies the
 * player sockets to remove self-referencing, and removes Node timers.
 * @param {Game} game - The game
 */
function printGame(game) {
	const stringifiedGame = getSimplifiedGameString(game);
	console.log(JSON.parse(stringifiedGame)); // Turning it back into an object gives it a special formatting in the console, instead of just printing a string.
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
	const originalAutoAFKResignTimeoutID = game.autoAFKResignTimeoutID;
	const originalDeleteTimeoutID = game.deleteTimeoutID;
	const originalDisconnect = game.disconnect;
	const originalDrawOffers = game.drawOffers;

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
	game.drawOffers = originalDrawOffers;

	return stringifiedGame;
}

/**
 * Returns *true* if the provided game has ended (gameConclusion truthy).
 * Games that are over are retained for a short period of time
 * to allow disconnected players to reconnect to see the results.
 * @param {Game} game - The game
 * @returns {boolean} - true if the game is over (gameConclusion truthy)
 */
function isGameOver(game) { return game.gameConclusion !== false; }

/**
 * Returns true if the color whos turn it is has an AFK
 * timer running to auto-resign them from being AFK for too long.
 * @param {Game} game - The game
 */
function isAFKTimerActive(game) {
	// If this is defined, then the timer is defined.
	return game.autoAFKResignTime !== undefined;
}

/**
 * Returns true if the provided color has a disconnect
 * timer to auto-resign them from being gone for too long,
 * OR THE TIMER to start that timer!
 * @param {Game} game - The game they're in
 * @param {string} color - The color they are in this game
 */
function isDisconnectTimerActiveForColor(game, color) {
	// If these are defined, then the timer is defined.
	return game.disconnect.startTimer[color] !== undefined || game.disconnect.autoResign[color].timeToAutoLoss !== undefined;
}

/**
 * Returns true if the provided color has an actively running
 * auto-resign timer. This differs from {@link isDisconnectTimerActiveForColor}
 * because this returns true only if the timer has started and the opponent has
 * been notified, NOT if the 5s cushion timer to START the auto-resign timer has started.
 * @param {Game} game - The game they're in
 * @param {string} color - The color they are in this game
 */
function isAutoResignDisconnectTimerActiveForColor(game, color) {
	// If these are defined, then the timer is defined.
	return game.disconnect.autoResign[color].timeToAutoLoss !== undefined;
}

/**
 * Sends the current clock values to the player who just moved.
 * @param {Game} game - The game
 */
function sendUpdatedClockToColor(game, color) {
	if (color !== 'white' && color !== 'black') return console.error(`color must be white or black! ${color}`);
	if (game.untimed) return; // Don't send clock values in an untimed game

	const message = {
		clockValues: getGameClockValues(game),
	};
	const playerSocket = color === 'white' ? game.whiteSocket : game.blackSocket;
	if (!playerSocket) return; // They are not connected, can't send message
	playerSocket.metadata.sendmessage(playerSocket, "game", "clock", message);
}

/**
 * Return the clock values of the game that can be sent to a client
 * @param {Game} game - The game
 */
function getGameClockValues(game) {
	return {
		timerWhite: game.timerWhite,
		timerBlack: game.timerBlack,
		timeNextPlayerLosesAt: game.timeNextPlayerLosesAt,
	};
}

/**
 * Sends the most recent played move to the player who's turn it is now.
 * @param {Game} game - The game
 * @param {string} color - The color of the player to send the latest move to
 */
function sendMoveToColor(game, color) {
	if (color !== 'white' && color !== 'black') return console.error(`colorJustMoved must be white or black! ${color}`);
    
	const message = {
		move: getLastMove(game),
		gameConclusion: game.gameConclusion,
		moveNumber: game.moves.length,
		clockValues: getGameClockValues(game),
	};
	const sendToSocket = color === 'white' ? game.whiteSocket : game.blackSocket;
	if (!sendToSocket) return; // They are not connected, can't send message
	sendToSocket.metadata.sendmessage(sendToSocket, "game", "move", message);
}

/**
 * Cancel the timer to delete a game after it has ended if it is currently running.
 * @param {Game} game 
 */
function cancelDeleteGameTimer(game) {
	clearTimeout(game.deleteTimeoutID);
}

/**
 * Tests if the game is resignable (atleast 2 moves have been played).
 * If not, then the game is abortable.
 * @param {Game} game - The game
 * @returns {boolean} *true* if the game is resignable.
 */
function isGameResignable(game) { return game.moves.length > 1; }

/**
 * Returns the last, or most recent, move in the provided game's move list, or undefined if there isn't one.
 * @param {Game} game - The moves list, with the moves in most compact notation: `1,2>3,4N`
 * @returns {string | undefined} The move, in most compact notation, or undefined if there isn't one.
 */
function getLastMove(game) {
	const moves = game.moves;
	if (moves.length === 0) return;
	return moves[moves.length - 1];
}

/**
 * Returns the color of the player that played that moveIndex within the moves list.
 * Returns error if index -1
 * @param {Game} game
 * @param {number} i - The moveIndex
 * @returns {string} - The color that played the moveIndex
 */
function getColorThatPlayedMoveIndex(game, i) {
	if (i === -1) return console.error("Cannot get color that played move index when move index is -1.");
	const turnOrder = game.gameRules.turnOrder;
	return turnOrder[i % turnOrder.length];
}

/**
 * Returns the termination of the game in english language.
 * @param {GameRules} gameRules
 * @param {string} condition - The 2nd half of the gameConclusion: checkmate/stalemate/repetition/moverule/insuffmat/allpiecescaptured/royalcapture/allroyalscaptured/resignation/time/aborted/disconnect
 */
function getTerminationInEnglish(gameRules, condition) {
	if (condition === 'moverule') { // One exception
		const numbWholeMovesUntilAutoDraw = gameRules.moveRule / 2;
		return `${getTranslation('play.javascript.termination.moverule.0')}${numbWholeMovesUntilAutoDraw}${getTranslation('play.javascript.termination.moverule.1')}`;
	}
	return getTranslation(`play.javascript.termination.${condition}`);
}

export default {
	newGame,
	subscribeClientToGame,
	unsubClientFromGame,
	resyncToGame,
	sendGameUpdateToBothPlayers,
	sendGameUpdateToColor,
	logGame,
	doesSocketBelongToGame_ReturnColor,
	sendMessageToSocketOfColor,
	printGame,
	getSimplifiedGameString,
	isGameOver,
	isAFKTimerActive,
	isDisconnectTimerActiveForColor,
	isAutoResignDisconnectTimerActiveForColor,
	sendUpdatedClockToColor,
	sendMoveToColor,
	getDisplayNameOfPlayer,
	cancelDeleteGameTimer,
	isGameResignable,
	getColorThatPlayedMoveIndex,
};