
/**
 * The script keeps track of all our active online games.
 */

// Custom imports

import gameutility from './gameutility.js';
import socketUtility from '../../socket/socketUtility.js';
import statlogger from '../statlogger.js';
import { executeSafely_async } from '../../utility/errorGuard.js';

import { getTimeServerRestarting } from '../timeServerRestarts.js';
import { cancelAutoAFKResignTimer, startDisconnectTimer, cancelDisconnectTimers, getDisconnectionForgivenessDuration } from './afkdisconnect.js';
import { incrementActiveGameCount, decrementActiveGameCount, printActiveGameCount } from './gamecount.js';
import { closeDrawOffer } from './drawoffers.js';
import { addUserToActiveGames, removeUserFromActiveGame, getIDOfGamePlayerIsIn, hasColorInGameSeenConclusion } from './activeplayers.js';
import uuid from '../../../client/scripts/esm/util/uuid.js';
import typeutil from '../../../client/scripts/esm/chess/util/typeutil.js';

/**
 * Type Definitions
 * @typedef {import('../TypeDefinitions.js').Game} Game
 */

/** @typedef {import("../../socket/socketUtility.js").CustomWebSocket} CustomWebSocket */

//--------------------------------------------------------------------------------------------------------

/**
 * The object containing all currently active games. Each game's id is the key: `{ id: Game }` 
 * This may temporarily include games that are over, but not yet deleted/logged.
 * */
const activeGames = {};

/**
 * The cushion time, before the game is deleted, if one player
 * has disconnected and has not yet seen the game conclusion.
 * This gives them a little bit of time to reconnect and see the results.
 */
const timeBeforeGameDeletionMillis = 1000 * 15; // 15 seconds

//--------------------------------------------------------------------------------------------------------

/**
 * Creates a new game when an invite is accepted.
 * Auto-subscribes the players to receive game updates.
 * @param {Object} invite - The invite with the properties `id`, `owner`, `variant`, `clock`, `color`, `rated`, `publicity`.
 * @param {Socket | undefined} player1Socket - Player 1 (the invite owner)'s websocket. This may not always be defined.
 * @param {CustomWebSocket} player2Socket  - Player 2 (the invite accepter)'s websocket. This will **always** be defined.
 * @param {number} replyto - The ID of the incoming socket message of player 2, accepting the invite. This is used for the `replyto` property on our response.
 */
function createGame(invite, player1Socket, player2Socket, replyto) { // Player 1 is the invite owner.
	const gameID = uuid.genUniqueID(5, activeGames);
	const game = gameutility.newGame(invite, gameID, player1Socket, player2Socket, replyto);
	if (!player1Socket) {
		// Player 1 (invite owner)'s socket closed before their invite was deleted.
		// Immediately start the auto-resign by disconnection timer
		const player2Color = gameutility.doesSocketBelongToGame_ReturnColor(game, player2Socket);
		const player1Color = typeutil.invertPlayer(player2Color);
		startDisconnectTimer(game, player1Color, false, onPlayerLostByDisconnect);
	}
	for (const data of Object.values(game.players)) {
		addUserToActiveGames(data.identifier, game.id);
	}

	addGameToActiveGames(game);

	console.log("Starting new game:");
	gameutility.printGame(game);
	printActiveGameCount();
}

/**
 * Adds a game to the active games list and increments the active game count.
 * @param {Game} game - The game
 */
function addGameToActiveGames(game) {
	if (!game) return console.error("Can't add an undefined game to the active games list.");
	activeGames[game.id] = game;
	incrementActiveGameCount();
}

/**
 * Unsubscribes a websocket from the game their connected to after a socket closure.
 * Detaches their socket from the game, updates their metadata.subscriptions.
 * @param {CustomWebSocket} ws - Their websocket.
 * @param {Object} options - Additional options.
 * @param {boolean} [unsubNotByChoice] When true, we will give them a 5-second cushion to re-sub before we start an auto-resignation timer. Set to false if we call this due to them closing the tab.
 */
function unsubClientFromGameBySocket(ws, { unsubNotByChoice = true } = {}) {
	const gameID = ws.metadata.subscriptions.game?.id;
	if (gameID === undefined) return console.error("Cannot unsub client from game when it's not subscribed to one.");

	const game = getGameByID(gameID);
	if (!game) return console.log(`Cannot unsub client from game when game doesn't exist! Metadata: ${socketUtility.stringifySocketMetadata(ws)}`);

	gameutility.unsubClientFromGame(game, ws, { sendMessage: false }); // Don't tell the client to unsub because their socket is CLOSING

	// Let their OPPONENT know they've disconnected though...

	if (gameutility.isGameOver(game)) return; // It's fine if players unsub/disconnect after the game has ended.

	const color = gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
	if (unsubNotByChoice) { // Internet interruption. Give them 5 seconds before starting auto-resign timer.
		console.log("Waiting 5 seconds before starting disconnection timer.");
		const forgivenessDurationMillis = getDisconnectionForgivenessDuration();
		game.players[color].disconnect.startID = setTimeout(startDisconnectTimer, forgivenessDurationMillis, game, color, unsubNotByChoice, onPlayerLostByDisconnect);
	} else { // Closed tab manually. Immediately start auto-resign timer.
		startDisconnectTimer(game, color, unsubNotByChoice, onPlayerLostByDisconnect);
	}
}

/**
 * Returns the game with the specified id.
 * @param {string} id - The id of the game to pull.
 * @returns {Game} The game
 */
function getGameByID(id) { return activeGames[id]; }

/**
 * Gets a game by player.
 * @param {Object} player - The player object with one of 2 properties: `member` or `browser`, depending on if they are signed in.
 * @returns {Game | undefined} - The game they are in, if they belong in one, otherwise undefined..
 */
function getGameByPlayer(player) {
	const gameID = getIDOfGamePlayerIsIn(player);
	if (!gameID) return; // Not in a game;
	return getGameByID(gameID);
}

/**
 * Gets a game by socket, first checking if they are subscribed to a game,
 * if not then it checks if they are in the players in active games list.
 * @param {CustomWebSocket} ws - Their websocket
 * @returns {Game | undefined} - The game they are in, if they belong in one, otherwise undefined.
 */
function getGameBySocket(ws) {
	const gameID = ws.metadata.subscriptions.game?.id;
	if (gameID) return getGameByID(gameID); 
    
	// The socket is not subscribed to any game. Perhaps this is a resync/refresh?

	// Is the client in a game? What's their username/browser-id?
	const player = socketUtility.getOwnerFromSocket(ws);
	if (player.member === undefined && player.browser === undefined) return console.error(`Cannot get game by socket when they don't have authentication! We should not have allowed this socket creation. Socket: ${socketUtility.stringifySocketMetadata(ws)}`);

	return getGameByPlayer(player);
}

/**
 * Called when the client sees the game conclusion. Tries to remove them from the players
 * in active games list, which then allows them to join a new game.
 * 
 * THIS SHOULD ALSO be the point when the server knows this player
 * agrees with the resulting game conclusion (no cheating detected),
 * and the server may change the players elos once both players send this.
 * @param {CustomWebSocket} ws - Their websocket
 * @param {Game | undefined} game - The game they belong in, if they belong in one.
 */
function onRequestRemovalFromPlayersInActiveGames(ws, game) {
	const user = socketUtility.getOwnerFromSocket(ws); // { member/browser }
	if (!game) return console.error("Can't remove player from players in active games list when they don't belong in a game");
	removeUserFromActiveGame(user, game.id);
    
	// If both players have requested this (i.e. have seen the game conclusion),
	// and the game is scheduled to be deleted, just delete it now!
    
	if (game.deleteTimeoutID === undefined) return; // Not scheduled to be deleted
	// Is the opponent still in the players in active games list? (has not seen the game results)
	const color = ws.metadata.subscriptions.game?.color || gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
	const opponentColor = (color);
	if (!hasColorInGameSeenConclusion(game, opponentColor)) return; // They are still in the active games list because they have not seen the game conclusion yet.

	// console.log("Deleting game immediately, instead of waiting 15 seconds, because both players have seen the game conclusion and requested to be removed from the players in active games list.")

	// Both players have seen the game conclusion and requested to be removed
	// from the players in active games list, just delete the game now!
	gameutility.cancelDeleteGameTimer(game);
	deleteGame(game);
}

/**
 * Pushes the game clock, adding increment. Resets the timer
 * to auto terminate the game when a player loses on time.
 * @param {Game} game - The game
 */
function pushGameClock(game) {
	// if (!game.whosTurn) return; // Game is over
	const colorWhoJustMoved = game.whosTurn; // white/black
	game.whosTurn = game.gameRules.turnOrder[(game.moves.length) % game.gameRules.turnOrder.length];
	if (game.untimed) return; // Don't adjust the times if the game isn't timed.

	if (!gameutility.isGameResignable(game)) return;

	// Atleast 2 moves played

	const now = Date.now();
	const timeSpent = now - game.timeAtTurnStart;
	let newTime = game.timeRemainAtTurnStart - timeSpent;
	game.timeAtTurnStart = now;

	const curPlayerdata = game.players[game.whosTurn];
	const prevPlayerdata = game.players[colorWhoJustMoved];

	game.timeRemainAtTurnStart = curPlayerdata.timer;

	// Start the timer that will auto-terminate the player when they lose on time
	setAutoTimeLossTimer(game);

	if (game.moves.length < 3) return; //////////////////////////////////////// Atleast 3 moves played

	newTime += game.incrementMillis; // Increment
	
	prevPlayerdata.timer = newTime;
}

/**
 * Stops the game clocks, updates both players clock time one last time.
 * Sets whosTurn to undefined
 * @param {Game} game - The game
 */
function stopGameClock(game) {
	if (game.untimed) return;

	if (!gameutility.isGameResignable(game)) {
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
	game.timeRemainAtTurnStart = undefined;
}

/**
 * Sets the new conclusion for the game. May be *false*.
 * If truthy, it will fire {@link onGameConclusion()}.
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
 * Stops the game clock, cancels all running timers, closes any draw
 * offer, sets a timer to delete the game and updates players' ELOs.
 * @param {Game} game - The game object representing the current game.
 * @param {Object} [options] - Optional parameters.
 * @param {boolean} [options.dontDecrementActiveGames=false] - If true, prevents decrementing the active game count.
 */
function onGameConclusion(game, { dontDecrementActiveGames } = {}) {
	if (!dontDecrementActiveGames) decrementActiveGameCount();

	console.log(`Game ${game.id} over. White: ${JSON.stringify(game.white)}. Black: ${JSON.stringify(game.black)}. Conclusion: ${game.gameConclusion}`);
	printActiveGameCount();

	stopGameClock(game);
	// Cancel the timer that will auto terminate
	// the game when the next player runs out of time
	clearTimeout(game.autoTimeLossTimeoutID);
	// Also cancel the one that auto loses by AFK
	cancelAutoAFKResignTimer(game);
	cancelDisconnectTimers(game);
	closeDrawOffer(game);

	// Set a 5-second timer to delete it and change elos,
	// to give the other client time to oppose the conclusion if they want.
	gameutility.cancelDeleteGameTimer(game); // Cancel first, in case a hacking report just ocurred.
	game.deleteTimeoutID = setTimeout(deleteGame, timeBeforeGameDeletionMillis, game);
}

/**
 * Reset the timer that will auto terminate the game when one player loses on time.
 * @param {Game} game - The game
 */
function setAutoTimeLossTimer(game) {
	if (gameutility.isGameOver(game)) return; // Don't set the timer if the game is over
	// Cancel previous auto loss timer if it exists
	clearTimeout(game.autoTimeLossTimeoutID);
	// Set the next one
	const timeUntilLoseOnTime = game.timeRemainAtTurnStart;
	game.autoTimeLossTimeoutID = setTimeout(onPlayerLostOnTime, timeUntilLoseOnTime, game);
}

/**
 * Called when a player in the game loses on time.
 * Sets the gameConclusion, notifies both players.
 * Sets a 5 second timer to delete the game in case
 * one of them was disconnected when this happened.
 * @param {Game} game - The game
 */
function onPlayerLostOnTime(game) {
	console.log("Someone has lost on time!");

	// Who lost on time?
	const loser = game.whosTurn;
	const winner = typeutil.invertPlayer(loser);

	setGameConclusion(game, `${winner} time`);

	// Sometimes they're clock can have 1ms left. Just make that zero.
	// This needs to be done AFTER setting game conclusion, because that
	// stops the clocks and changes their values.
	if (loser === 'white') game.timerWhite = 0;
	else                   game.timerBlack = 0;

	gameutility.sendGameUpdateToBothPlayers(game);
}

/**
 * Called when a player in the game loses by disconnection.
 * Sets the gameConclusion, notifies the opponent.
 * @param {Game} game - The game
 * @param {string} colorWon - The color that won by opponent disconnection
 */
function onPlayerLostByDisconnect(game, colorWon) {
	if (!colorWon) return console.log("Cannot lose player by disconnection when colorWon is undefined");

	if (gameutility.isGameOver(game)) return console.error("We should have cancelled the auto-loss-by-disconnection timer when the game ended!");

	if (gameutility.isGameResignable(game)) {
		console.log("Someone has lost by disconnection!");
		setGameConclusion(game, `${colorWon} disconnect`);
	} else {
		console.log("Game aborted from disconnection.");
		setGameConclusion(game, 'aborted');
	}

	gameutility.sendGameUpdateToBothPlayers(game);
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
	if (!colorWon) return console.log("Cannot lose player by abandonment when colorWon is undefined");

	if (gameutility.isGameResignable(game)) {
		console.log("Someone has lost by abandonment!");
		setGameConclusion(game, `${colorWon} disconnect`);
	} else {
		console.log("Game aborted from abandonment.");
		setGameConclusion(game, 'aborted');
	}

	gameutility.sendGameUpdateToBothPlayers(game);
}

/**
 * Deletes the game. Prints the active game count.
 * This should not be called until after both clients have had a chance
 * to see the game result, or after 15 seconds after the game ends
 * to give players time to cheat report.
 * @param {Game} game
 */
async function deleteGame(game) {
	if (!game) return console.error(`Unable to delete an undefined game!`);

	const gameConclusion = game.gameConclusion;

	// THIS IS WHERE WE MODIFY ELO based on who won!!!
	// ...

	// Unsubscribe both players' sockets from the game if they still are connected.
	// If the socket is undefined, they will have already been auto-unsubscribed.

	// Remove them from the list of users in active games to allow them to join a new game.
	for (const data of Object.values(game.players)) {
		gameutility.unsubClientFromGame(game, data.socket);
		removeUserFromActiveGame(data.identifier, game.id);
	}

	delete activeGames[game.id]; // Delete the game

	console.log(`Deleted game ${game.id}.`);

	await executeSafely_async(gameutility.logGame, `Unable to log game! ${gameutility.getSimplifiedGameString(game)}`, game); // The game log will only log games with at least 1 move played
	await statlogger.logGame(game); // The statlogger will only log games with atleast 2 moves played (resignable)
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
			setGameConclusion(game, 'aborted');
			// Report conclusion to players
			gameutility.sendGameUpdateToBothPlayers(game);
		}
		// Immediately log the game and update statistics.
		clearTimeout(game.deleteTimeoutID); // Cancel first, in case it's already scheduled to be deleted.
		await deleteGame(game);
	}
}

/**
 * Send a message to all sockets in a game saying the server will restart soon.
 * Every reconnection from now on should re-send the time the server will restart.
 */
function broadCastGameRestarting() {
	const timeToRestart = getTimeServerRestarting();
	for (const gameID in activeGames) {
		const game = activeGames[gameID];
		for (const color in game.players) {
			gameutility.sendMessageToSocketOfColor(game, color, 'game', 'serverrestart', timeToRestart);
		}
	}
	const minutesTillRestart = Math.ceil((timeToRestart - Date.now()) / (1000 * 60));
	console.log(`Alerted all clients in a game that the server is restarting in ${minutesTillRestart} minutes!`);
}

//--------------------------------------------------------------------------------------------------------

export {
	createGame,
	unsubClientFromGameBySocket,
	onPlayerLostByAbandonment,
	broadCastGameRestarting,
	logAllGames,
	getGameBySocket,
	onRequestRemovalFromPlayersInActiveGames,
	setGameConclusion,
	pushGameClock,
	getGameByID,
};