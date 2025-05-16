
/**
 * This script contains our Game constructor for the server-side,
 * and contains many utility methods for working with them!
 * 
 * At most this ever handles a single game, not multiple.
 */

// System imports
import WebSocket from 'ws';

// Middleware & other imports
import { logEvents } from '../../middleware/logEvents.js';
import { getTranslation } from '../../utility/translate.js';

// Custom imports
import clockweb from '../clockweb.js';
import formatconverter from '../../../client/scripts/esm/chess/logic/formatconverter.js';

import { getTimeServerRestarting } from '../timeServerRestarts.js';
import { doesColorHaveExtendedDrawOffer, getLastDrawOfferPlyOfColor } from './drawoffers.js';
import timeutil from '../../../client/scripts/esm/util/timeutil.js';
import typeutil from '../../../client/scripts/esm/chess/util/typeutil.js';
import variant from '../../../client/scripts/esm/chess/variants/variant.js';
import jsutil from '../../../client/scripts/esm/util/jsutil.js';
import winconutil from '../../../client/scripts/esm/chess/util/winconutil.js';
import { getMemberDataByCriteria, getUserIdByUsername } from '../../database/memberManager.js';
import uuid from '../../../client/scripts/esm/util/uuid.js';
import { sendNotify, sendNotifyError, sendSocketMessage } from '../../socket/sendSocketMessage.js';
import socketUtility from '../../socket/socketUtility.js';
import metadata from '../../../client/scripts/esm/chess/util/metadata.js';

import { players } from '../../../client/scripts/esm/chess/util/typeutil.js';
// Type Definitions...

/**
 * @typedef {import('../TypeDefinitions.js').Game} Game
 * @typedef {import('../../../client/scripts/esm/chess/variants/gamerules.js').GameRules} GameRules
 * @typedef {import('../../../client/scripts/esm/chess/logic/clock.js').ClockValues} ClockValues
 * @typedef {import('../../../client/scripts/esm/chess/util/typeutil.js').Player} Player
 * @typedef {import('../../../client/scripts/esm/chess/util/metadata.js').MetaData} MetaData
 */

/** @typedef {import("../../socket/socketUtility.js").CustomWebSocket} CustomWebSocket */

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
 * @param {CustomWebSocket} player2Socket - Player 2 (the invite accepter)'s websocket. This will **always** be defined.
 * @param {number} replyto - The ID of the incoming socket message of player 2, accepting the invite. This is used for the `replyto` property on our response.
 * @returns {Game} The new game.
 */
function newGame(inviteOptions, id, player1Socket, player2Socket, replyto) {
	/** @type {Game} */
	const newGame = {
		id,
		timeCreated: Date.now(),
		players: {
			[players.WHITE]: {
				disconnect: {}
			},
			[players.BLACK]: {
				disconnect: {}
			}
		},
		publicity: inviteOptions.publicity,
		variant: inviteOptions.variant,
		clock: inviteOptions.clock,
		untimed: clockweb.isClockValueInfinite(inviteOptions.clock),
		startTimeMillis: null,
		incrementMillis: null,
		rated: inviteOptions.rated === "rated",
		moves: [],
		gameRules: variant.getGameRulesOfVariant({ Variant: inviteOptions.variant }),
		gameConclusion: false,
		positionPasted: false,
	};

	if (!newGame.untimed) { // Set the start time and increment properties
		const { minutes, increment } = clockweb.getMinutesAndIncrementFromClock(inviteOptions.clock);
		newGame.startTimeMillis = timeutil.minutesToMillis(minutes);
		newGame.incrementMillis = timeutil.secondsToMillis(increment);
		// Set the clocks
		newGame.players[players.WHITE].timer = newGame.startTimeMillis;
		newGame.players[players.BLACK].timer = newGame.startTimeMillis;
	}

	// Set the colors
	const player1 = inviteOptions.owner; // { member/browser }  The invite owner
	const player2 = socketUtility.getOwnerFromSocket(player2Socket); // { member/browser }  The invite accepter
	const { white, black, player1Color, player2Color } = assignWhiteBlackPlayersFromInvite(inviteOptions.color, player1, player2);
	newGame.players[players.WHITE].identifier = white;
	newGame.players[players.BLACK].identifier = black;

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
 * - `player1Color`: The color of player1, the invite owner.
 * - `player2Color`: The color of player2, the invite accepter.
 */
function assignWhiteBlackPlayersFromInvite(color, player1, player2) { // { id, owner, variant, clock, color, rated, publicity }
	let white;
	let black;
	let player1Color; // Invite owner
	let player2Color; // Invite acceptor
	if (color === players.WHITE) {
		white = player1;
		black = player2;
		player1Color = players.WHITE;
		player2Color = players.BLACK;
	} else if (color === players.BLACK) {
		white = player2;
		black = player1;
		player1Color = players.BLACK;
		player2Color = players.WHITE;
	} else if (color === players.NEUTRAL) { // Random
		if (Math.random() > 0.5) {
			white = player1;
			black = player2;
			player1Color = players.WHITE;
			player2Color = players.BLACK;
		} else {
			white = player2;
			black = player1;
			player1Color = players.BLACK;
			player2Color = players.WHITE;
		}
	} else throw Error(`Unsupported color ${color} when assigning players to game.`);
	return { white, black, player1Color, player2Color };
}

/**
 * Links their socket to this game, modifies their metadata.subscriptions, and sends them the game info.
 * @param {Game} game - The game they are a part of.
 * @param {Object} playerSocket - Their websocket.
 * @param {Player} playerColor - What color they are playing in this game. p.NEU
 * @param {Object} options - An object that may contain the option `sendGameInfo`, that when *true* won't send the game information over. Default: *true*
 * @param {boolean} options.sendGameInfo
 * @param {number} options.replyto - The ID of the incoming socket message. This is used for the `replyto` property on our response.
 */
function subscribeClientToGame(game, playerSocket, playerColor, { sendGameInfo = true, replyto } = {}) {
	if (!playerSocket) return console.error(`Cannot subscribe client to game when they don't have an open socket! ${game[playerColor]}`);
	if (!playerColor) return console.error(`Cannot subscribe client to game without a color!`);

	// 1. Attach their socket to the game for receiving updates
	const playerData = game.players[playerColor];
	if (playerData === undefined) return console.error(`Cannot subscribe client to game when game does not expect color ${playerColor} to be present`);
	if (playerData.socket) {
		sendSocketMessage(playerData.socket, 'game','leavegame');
		unsubClientFromGame(game, playerData.socket, { sendMessage: false });
	}
	playerData.socket = playerSocket;

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
 * @param {CustomWebSocket} ws - Their websocket.
 * @param {Object} options - Additional options.
 * @param {Object} options.sendMessage - Whether to inform the client to unsub from the game. Default: true. This should be false if we're unsubbing because the socket is closing.
 */
function unsubClientFromGame(game, ws, { sendMessage = true } = {}) {
	if (!ws) return; // Socket undefined, can't unsub.
	if (ws.metadata.subscriptions.game === undefined) return; // Already unsubbed (they aborted)

	// 1. Detach their socket from the game so we no longer send updates
	delete game.players[ws.metadata.subscriptions.game.color]?.socket;

	// 2. Remove the game key-value pair from the sockets metadata subscription list.
	delete ws.metadata.subscriptions.game;

	// We inform their opponent they have disconnected inside js when we call this method.

	// Tell the client to unsub on their end, IF the socket isn't closing.
	if (sendMessage && ws.readyState === WebSocket.OPEN) sendSocketMessage(ws, 'game', 'unsub');
}

/**
 * Sends the game info to the player, the info they need to load the online game.
 * 
 * Makes sure not to send sensitive info, such as player's browser-id cookies.
 * @param {Game} game - The game they're in.
 * @param {CustomWebSocket} playerSocket - Their websocket
 * @param {Player} playerColor - The color they are.
 * @param {number} replyto - The ID of the incoming socket message. This is used for the `replyto` property on our response.
 */
function sendGameInfoToPlayer(game, playerSocket, playerColor, replyto) {
	const metadata = getMetadataOfGame(game);
	const opponentColor = typeutil.invertPlayer(playerColor);
	const gameOptions = {
		metadata,
		id: game.id,
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

	const now = Date.now();

	// If true, we know it's their opponent that's afk, because this client
	// just refreshed the page and would have cancelled the timer if they were the ones afk.
	if (isAFKTimerActive(game)) {
		const millisLeftUntilAutoAFKResign = game.autoAFKResignTime - now;
		gameOptions.millisUntilAutoAFKResign = millisLeftUntilAutoAFKResign;
	}

	const opponentData = game.players[opponentColor];

	// If their opponent has disconnected, send them that info too.
	if (opponentData.disconnect.timeToAutoLoss !== undefined) {
		gameOptions.disconnect = {
			millisUntilAutoDisconnectResign: opponentData.disconnect.timeToAutoLoss - now,
			wasByChoice: opponentData.disconnect.wasByChoice
		};
	}

	// If the server is restarting, include the time too.
	const timeServerRestarting = getTimeServerRestarting();
	if (timeServerRestarting !== false) gameOptions.serverRestartingAt = timeServerRestarting;

	sendSocketMessage(playerSocket, 'game', 'joingame', gameOptions, replyto);
}

/**
 * Generates metadata for a game including event details, player information, and timestamps.
 * @param {Game} game - The game object containing details about the game.
 * @returns {MetaData} - An object containing metadata for the game including event name, players, time control, and UTC timestamps.
 */
function getMetadataOfGame(game) {
	const RatedOrCasual = game.rated ? "Rated" : "Casual";
	const { UTCDate, UTCTime } = timeutil.convertTimestampToUTCDateUTCTime(game.timeCreated);
	const white = game.players[players.WHITE].identifier;
	const black = game.players[players.BLACK].identifier;
	const gameMetadata = {
		Event: `${RatedOrCasual} ${getTranslation(`play.play-menu.${game.variant}`)} infinite chess game`,
		Site: "https://www.infinitechess.org/",
		Round: "-",
		Variant: game.variant,
		White: white.member || "(Guest)", // Protect browser's browser-id cookie
		Black: black.member || "(Guest)", // Protect browser's browser-id cookie
		TimeControl: game.clock,
		UTCDate,
		UTCTime,
	};
	if (white.member !== undefined) {
		const base62 = uuid.base10ToBase62(white.user_id);
		gameMetadata.WhiteID = base62;
	}
	if (black.member !== undefined) {
		const base62 = uuid.base10ToBase62(black.user_id);
		gameMetadata.BlackID = base62;
	}

	if (isGameOver(game)) { // Add on the Result and Termination metadata
		const { victor, condition } = winconutil.getVictorAndConditionFromGameConclusion(game.gameConclusion);
		gameMetadata.Result = metadata.getResultFromVictor(victor);
		gameMetadata.Termination = getTerminationInEnglish(game.gameRules, condition);
	}

	return gameMetadata;
}

/**
 * Resyncs a client's websocket to a game. The client already
 * knows the game id and much other information. We only need to send
 * them the current move list, player timers, and game conclusion.
 * @param {CustomWebSocket} ws - Their websocket
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
	for (const player in game.players) {
		sendGameUpdateToColor(game, Number(player));
	}
}

/**
 * Alerts the player of the specified color of the game conclusion if it has ended,
 * and the current moves list and timers.
 * @param {Game} game - The game
 * @param {Player} color - The color of the player
 * @param {Object} options - Additional options
 * @param {number} [options.replyTo] - If specified, the id of the incoming socket message this update will be the reply to
 */
function sendGameUpdateToColor(game, color, { replyTo } = {}) {
	const playerdata = game.players[color];
	if (playerdata.socket === undefined) return; // Not connected, can't send message

	const opponentColor = typeutil.invertPlayer(color);
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

	const now = Date.now();

	// Include other relevant stuff if defined
	if (isAFKTimerActive(game)) {
		const millisLeftUntilAutoAFKResign = game.autoAFKResignTime - now;
		messageContents.millisUntilAutoAFKResign = millisLeftUntilAutoAFKResign;
	}

	const opponentData = game.players[opponentColor];

	// If their opponent has disconnected, send them that info too.
	if (opponentData.disconnect.timeToAutoLoss !== undefined) {
		messageContents.disconnect = {
			millisUntilAutoDisconnectResign: opponentData.disconnect.timeToAutoLoss - now,
			wasByChoice: opponentData.disconnect.wasByChoice
		};
	}

	// Also send the time the server is restarting, if it is
	const timeServerRestarting = getTimeServerRestarting();
	if (timeServerRestarting !== false) messageContents.serverRestartingAt = timeServerRestarting;

	sendSocketMessage(playerdata.socket, "game", "gameupdate", messageContents, replyTo);
}

/**
 * Tests if the given socket belongs in the game. If so, it returns the color they are.
 * @param {Game} game - The game
 * @param {CustomWebSocket} ws - The websocket
 * @returns {string | false} The color they are, if they belong, otherwise *false*.
 */
function doesSocketBelongToGame_ReturnColor(game, ws) {
	if (game.id === ws.metadata.subscriptions.game?.id) return ws.metadata.subscriptions.game?.color;
	// Color isn't provided in their subscriptions, perhaps this is a resync/refresh?
	const player = socketUtility.getOwnerFromSocket(ws);
	return doesPlayerBelongToGame_ReturnColor(game, player);
}

/**
 * Tests if the given player belongs in the game. If so, it returns the color they are.
 * @param {Game} game - The game
 * @param {Object} player - The player object with one of 2 properties: `member` or `browser`, depending on if they are signed in.
 * @returns {string | false} The color they are, if they belong, otherwise *false*.
 */
function doesPlayerBelongToGame_ReturnColor(game, player) {
	for (const [splayer, data] of Object.entries(game.players)) {
		const playercolor = Number(splayer);
		if (player.member && data.identifier.member === player.member) return playercolor;
		if (player.browser && data.identifier.browser === player.browser) return playercolor;
	}
	return false;
}

/**
 * Sends a websocket message to the specified color in the game.
 * @param {Game} game - The game
 * @param {Player} color - The color of the player in this game to send the message to
 * @param {string} sub - Where this message should be routed to, client side.
 * @param {string} action - The action the client should perform. If sub is "general" and action is "notify" or "notifyerror", then this needs to be the key of the message in the TOML, and we will auto-translate it!
 * @param {*} value - The value to send to the client.
 */
function sendMessageToSocketOfColor(game, color, sub, action, value) {
	const data = game.players[color];
	if (data === undefined) return logEvents(`Tried to send a message to player ${color} when there isn't one in game!`, 'errLog.txt', { print: true });
	const ws = data.socket;
	if (!ws) return; // They are not connected, can't send message
	if (sub === 'general') {
		if (action === 'notify') return sendNotify(ws, value); // The value needs translating
		if (action === 'notifyerror') return sendNotifyError(ws, value); // The value needs translating
	}
	sendSocketMessage(ws, sub, action, value); // Value doesn't need translating, send normally.
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

	// Only transfer interesting information.
	const simplifiedGame = {
		id: game.id,
		timeCreated: timeutil.timestampToSqlite(game.timeCreated),
		variant: game.variant,
		clock: game.clock,
		rated: game.rated,
	};
	if (game.moves.length > 0) simplifiedGame.moves = game.moves;
	simplifiedGame.players = {};
	for (const [c, data] of Object.entries(game.players)) {
		simplifiedGame.players[c] = data.identifier;
	}

	return JSON.stringify(simplifiedGame);
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
	return game.players[color].disconnect.startID !== undefined || game.players[color].disconnect.timeToAutoLoss !== undefined;
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
	return game.players[color].disconnect.timeToAutoLoss !== undefined;
}

/**
 * Sends the current clock values to the player who just moved.
 * @param {Game} game - The game
 */
function sendUpdatedClockToColor(game, color) {
	if (color !== players.BLACK && color !== players.WHITE) return logEvents(`Color must be white or black when sending clock to color! Got: ${color}`, 'errLog.txt', { print: true });
	if (game.untimed) return; // Don't send clock values in an untimed game

	const message = getGameClockValues(game);
	const playerSocket = game.players[color].socket;
	if (!playerSocket) return; // They are not connected, can't send message
	sendSocketMessage(playerSocket, "game", "clock", message);
}

/**
 * Return the clock values of the game that can be sent to a client.
 * It also includes who's clock is currently counting down, if one is.
 * This also updates the clocks, as the players current time should not be the same as when their turn firs started.
 * @param {Game} game - The game
 * @returns {ClockValues}
 */
function getGameClockValues(game) {
	updateClockValues(game);
	const clockValues = {
		clocks: {
			[players.WHITE]: game.players[players.WHITE].timer,
			[players.BLACK]: game.players[players.BLACK].timer,
		}
	};
		
	// Let the client know which clock is ticking so that they can immediately adjust for ping.
	// * If less than 2 moves have been played, no color is considered ticking.
	// * If the game is over, no color is considered ticking.
	if (isGameResignable(game) && !isGameOver(game)) clockValues.colorTicking = game.whosTurn;

	return clockValues;
}

/**
 * Update the games clock values. This is NOT called after the clocks are pushed,
 * This is called right before we send clock information to the client,
 *  so that it's as accurate as possible.
 * @param {Game} game - The game
 */
function updateClockValues(game) {
	const now = Date.now();
	if (game.untimed || !isGameResignable(game) || isGameOver(game)) return;
	if (game.timeAtTurnStart === undefined) throw new Error("cannot update clock values when timeAtTurnStart is not defined!");

	const timeElapsedSinceTurnStart = now - game.timeAtTurnStart;
	const newTime = game.timeRemainAtTurnStart - timeElapsedSinceTurnStart;
	const playerdata = game.players[game.whosTurn];
	if (playerdata === undefined) return logEvents(`Cannot update games clock values when whose turn is neither white nor black! "${game.whosTurn}"`, 'errLog.txt', { print: true });
	playerdata.timer = newTime;
}

/**
 * Sends the most recent played move to the player who's turn it is now.
 * @param {Game} game - The game
 * @param {string} color - The color of the player to send the latest move to
 */
function sendMoveToColor(game, color) {
	if (!(color in game.players)) return logEvents(`Color to send move to must be white or black! ${color}`, 'errLog.txt', { print: true });
    
	const message = {
		move: getLastMove(game),
		gameConclusion: game.gameConclusion,
		moveNumber: game.moves.length,
	};
	if (!game.untimed) message.clockValues = getGameClockValues(game);
	const sendToSocket = game.players[color].socket;
	if (!sendToSocket) return; // They are not connected, can't send message
	sendSocketMessage(sendToSocket, "game", "move", message);
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
 * @returns {Player} - The color that played the moveIndex
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
	getMetadataOfGame,
	sendGameUpdateToBothPlayers,
	sendGameUpdateToColor,
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
	cancelDeleteGameTimer,
	isGameResignable,
	getColorThatPlayedMoveIndex,
};