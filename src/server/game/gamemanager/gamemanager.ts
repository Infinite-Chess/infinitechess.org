
/**
 * The script keeps track of all our active online games.
 */

// System imports
import WebSocket from 'ws';

// @ts-ignore
import { executeSafely_async } from '../../utility/errorGuard.js';
// @ts-ignore
import { incrementActiveGameCount, decrementActiveGameCount, printActiveGameCount } from './gamecount.js';
// @ts-ignore
import { closeDrawOffer } from './drawoffers.js';
// @ts-ignore
import { getTimeServerRestarting } from '../timeServerRestarts.js';
import gameutility from './gameutility.js';
import socketUtility from '../../socket/socketUtility.js';
import statlogger from '../statlogger.js';
import gamelogger from './gamelogger.js';
import { cancelAutoAFKResignTimer, startDisconnectTimer, cancelDisconnectTimers, getDisconnectionForgivenessDuration } from './afkdisconnect.js';
import { addUserToActiveGames, removeUserFromActiveGame, getIDOfGamePlayerIsIn, hasColorInGameSeenConclusion } from './activeplayers.js';
import typeutil from '../../../client/scripts/esm/chess/util/typeutil.js';
import { genUniqueGameID } from '../../database/gamesManager.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import ratingabuse from './ratingabuse.js';

import type { Game, PlayerData } from './gameutility.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { Invite } from '../invitesmanager/inviteutility.js';
import type { AuthMemberInfo } from '../../../types.js';
import type { Player } from '../../../client/scripts/esm/chess/util/typeutil.js';

//--------------------------------------------------------------------------------------------------------

/**
 * The object containing all currently active games. Each game's id is the key: `{ id: Game }` 
 * This may temporarily include games that are over, but not yet deleted/logged.
 * 
 * The game's ids are the same id they will receive in the database! For this reason they must
 * be unique across the games table, and all other live games.
 */
const activeGames: Record<number, Game> = {};

/**
 * The cushion time, before the game is deleted, if one player
 * has disconnected and has not yet seen the game conclusion.
 * This gives them a little bit of time to reconnect and see the results.
 */
const timeBeforeGameDeletionMillis = 1000 * 8; // Default: 15

//--------------------------------------------------------------------------------------------------------

/**
 * Creates a new game when an invite is accepted.
 * Auto-subscribes the players to receive game updates.
 * @param invite - The invite with the properties `id`, `owner`, `variant`, `clock`, `color`, `rated`, `publicity`.
 * @param player1Socket - Player 1 (the invite owner)'s websocket. This may not always be defined.
 * @param player2Socket  - Player 2 (the invite accepter)'s websocket. This will **always** be defined.
 * @param replyto - The ID of the incoming socket message of player 2, accepting the invite. This is used for the `replyto` property on our response.
 */
function createGame(invite: Invite, player1Socket: CustomWebSocket | undefined, player2Socket: CustomWebSocket, replyto?: number) { // Player 1 is the invite owner.
	const gameID = issueUniqueGameId();
	const game = gameutility.newGame(invite, gameID, player1Socket, player2Socket, replyto);
	if (!player1Socket) {
		// Player 1 (invite owner)'s socket closed before their invite was deleted.
		// Immediately start the auto-resign by disconnection timer
		const player2Color = gameutility.doesSocketBelongToGame_ReturnColor(game, player2Socket)!;
		const player1Color = typeutil.invertPlayer(player2Color);
		startDisconnectTimer(game, player1Color, false, onPlayerLostByDisconnect);
	}
	for (const data of Object.values(game.players)) {
		addUserToActiveGames((data as PlayerData).identifier, game.id);
	}

	addGameToActiveGames(game);

	console.log("Starting new game:");
	gameutility.printGame(game);
	printActiveGameCount();
}

/**
 * Returns an id that is unique across BOTH the games table
 * AND the live games inside {@link activeGames}.
 * 
 * The game will receive this same id in the database when it is logged.
 */
function issueUniqueGameId() {
	let id: number;
	do {
		id = genUniqueGameID(); // This is already unique against all game_ids in the table.
	} while (activeGames[id] !== undefined); // Repeat until we have an id unique against all active games.
	// console.log(`Issued game_id (${id})!`);
	return id;
}

/**
 * Adds a game to the active games list and increments the active game count.
 * @param game - The game
 */
function addGameToActiveGames(game: Game) {
	activeGames[game.id] = game;
	incrementActiveGameCount();
}

/**
 * Checks if member with a given username is currently listed as being in some active game
 * @param username - username of some member
 * @returns true if member is currently in active game, otherwise false
 */
function isMemberInSomeActiveGame(username: string): boolean {
	for (const game of Object.values(activeGames)) {
		for (const player of Object.values(game.players)) {
			if (!player.identifier.signedIn) continue;
			if (player.identifier.username === username) return true;
		}
	}
	return false;
}

/**
 * Unsubscribes a websocket from the game their connected to after a socket closure.
 * Detaches their socket from the game, updates their metadata.subscriptions.
 * @param ws - Their websocket.
 * @param options - Additional options.
 * @param [unsubNotByChoice] When true, we will give them a 5-second cushion to re-sub before we start an auto-resignation timer. Set to false if we call this due to them closing the tab.
 */
function unsubClientFromGameBySocket(ws: CustomWebSocket, { unsubNotByChoice = true } = {}) {
	const gameID = ws.metadata.subscriptions.game?.id;
	if (gameID === undefined) return console.error("Cannot unsub client from game when it's not subscribed to one.");

	const game = getGameByID(gameID);
	if (!game) return console.log(`Cannot unsub client from game when game doesn't exist! Metadata: ${socketUtility.stringifySocketMetadata(ws)}`);

	gameutility.unsubClientFromGame(game, ws); // Don't tell the client to unsub because their socket is CLOSING

	// Let their OPPONENT know they've disconnected though...

	if (gameutility.isGameOver(game)) return; // It's fine if players unsub/disconnect after the game has ended.

	const color = gameutility.doesSocketBelongToGame_ReturnColor(game, ws)! as Player;
	if (unsubNotByChoice) { // Internet interruption. Give them 5 seconds before starting auto-resign timer.
		console.log("Waiting 5 seconds before starting disconnection timer.");
		const forgivenessDurationMillis = getDisconnectionForgivenessDuration();
		game.players[color]!.disconnect.startID = setTimeout(() => startDisconnectTimer(game, color, unsubNotByChoice, onPlayerLostByDisconnect), forgivenessDurationMillis);
	} else { // Closed tab manually. Immediately start auto-resign timer.
		startDisconnectTimer(game, color, unsubNotByChoice, onPlayerLostByDisconnect);
	}
}

/**
 * Returns the game with the specified id.
 * @param id - The id of the game to pull.
 * @returns The game
 */
function getGameByID(id: number): Game | undefined { return activeGames[id]; }

/**
 * Gets a game by player.
 * @param player - The player object with one of 2 properties: `member` or `browser`, depending on if they are signed in.
 * @returns The game they are in, if they belong in one, otherwise undefined..
 */
function getGameByPlayer(player: AuthMemberInfo) {
	const gameID = getIDOfGamePlayerIsIn(player);
	if (gameID === undefined) return; // Not in a game;
	return getGameByID(gameID);
}

/**
 * Gets a game by socket, first checking if they are subscribed to a game,
 * if not then it checks if they are in the players in active games list.
 * @param ws - Their websocket
 * @returns The game they are in, if they belong in one, otherwise undefined.
 */
function getGameBySocket(ws: CustomWebSocket): Game | undefined {
	const gameID = ws.metadata.subscriptions.game?.id;
	if (gameID) return getGameByID(gameID); 
    
	// The socket is not subscribed to any game. Perhaps this is a resync/refresh?

	// Is the client in a game? What's their username/browser-id?
	const player = ws.metadata.memberInfo;
	return getGameByPlayer(player);
}

/**
 * Called when the client sees the game conclusion. Tries to remove them from the players
 * in active games list, which then allows them to join a new game.
 * 
 * THIS SHOULD ALSO be the point when the server knows this player
 * agrees with the resulting game conclusion (no cheating detected),
 * and the server may change the players elos once both players send this.
 * @param ws - Their websocket
 * @param game - The game they belong in, if they belong in one.
 */
function onRequestRemovalFromPlayersInActiveGames(ws: CustomWebSocket): void {
	const game = getGameBySocket(ws);
	if (!game) return;
	const user = ws.metadata.memberInfo;
	removeUserFromActiveGame(user, game.id);
    
	// If both players have requested this (i.e. have seen the game conclusion),
	// and the game is scheduled to be deleted, just delete it now!
    
	if (game.deleteTimeoutID === undefined) return; // Not scheduled to be deleted
	// Is the opponent still in the players in active games list? (has not seen the game results)
	const color = ws.metadata.subscriptions.game?.color || gameutility.doesSocketBelongToGame_ReturnColor(game, ws)!;
	const opponentColor = typeutil.invertPlayer(color);
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
 * @param game - The game
 * @returns The new time (in ms) of the player that just moved after increment is added.
 */
function pushGameClock(game: Game) {
	const colorWhoJustMoved = game.whosTurn!; // white/black
	game.whosTurn = game.gameRules.turnOrder[(game.moves.length) % game.gameRules.turnOrder.length];

	const curPlayerdata = game.players[game.whosTurn!]!;
	const prevPlayerdata = game.players[colorWhoJustMoved]!;

	if (game.untimed) return; // Don't adjust the times if the game isn't timed.

	const now = Date.now();

	if (!gameutility.isGameResignable(game)) return prevPlayerdata.timer; // 0-1 moves played. Just return their time

	if (game.moves.length > 2) {
		// Subtract the time spent from their clock, and add increment
		const timeSpent = now - game.timeAtTurnStart!;
		prevPlayerdata.timer = game.timeRemainAtTurnStart! - timeSpent + game.incrementMillis!;
	}

	// Start the timer for the next person
	game.timeAtTurnStart = now;
	game.timeRemainAtTurnStart = curPlayerdata.timer;

	// Reset the timer that will auto terminate the game when one player loses on time.
	if (!gameutility.isGameOver(game)) {
		// Cancel previous auto loss timer if it exists
		clearTimeout(game.autoTimeLossTimeoutID);
		// Set the next one
		const timeUntilLoseOnTime = Math.max(game.timeRemainAtTurnStart!, 0);
		game.autoTimeLossTimeoutID = setTimeout(() => onPlayerLostOnTime(game), timeUntilLoseOnTime);
	}

	return prevPlayerdata.timer;
}

/**
 * Stops the game clocks, updates both players clock time one last time.
 * Sets whosTurn to undefined
 * @param game - The game
 */
function stopGameClock(game: Game) {
	if (game.untimed) return;
	if (game.whosTurn === undefined) return; // Clocks already stopped (can reach this point after a cheat report and the game conclusion changes.)

	if (!gameutility.isGameResignable(game)) {
		game.whosTurn = undefined;
		return;
	}

	const timeSpent = Date.now() - game.timeAtTurnStart!;
	let newTime = game.timeRemainAtTurnStart! - timeSpent;
	if (newTime < 0) newTime = 0;

	game.players[game.whosTurn]!.timer = newTime;

	game.whosTurn = undefined;

	game.timeAtTurnStart = undefined;
	game.timeRemainAtTurnStart = undefined;
}

/**
 * Sets the new conclusion for the game.
 * If truthy, it will fire {@link onGameConclusion()}.
 * @param game - The game
 * @param conclusion - The new game conclusion
 */
function setGameConclusion(game: Game, conclusion: string | undefined) {
	const dontDecrementActiveGames = game.gameConclusion !== undefined; // Game already over, active game count already decremented.
	game.gameConclusion = conclusion;
	if (conclusion !== undefined) onGameConclusion(game, { dontDecrementActiveGames });
}

/**
 * Fire whenever a game's `gameConclusion` property is set.
 * Stops the game clock, cancels all running timers, closes any draw
 * offer, sets a timer to delete the game and updates players' ELOs.
 * @param game - The game object representing the current game.
 * @param [options] - Optional parameters.
 * @param [options.dontDecrementActiveGames=false] - If true, prevents decrementing the active game count.
 */
function onGameConclusion(game: Game, { dontDecrementActiveGames = false } = {}) {
	if (!dontDecrementActiveGames) decrementActiveGameCount();

	const players: Record<string, any> = {};
	for (const [c, data] of Object.entries(game.players)) {
		players[c] = {id: data.identifier.signedIn ? data.identifier.username : data.identifier.browser_id, s: data.identifier.signedIn};
	}
	console.log(`Game ${game.id} over. Players: ${JSON.stringify(players)}. Conclusion: ${game.gameConclusion}. Moves: ${game.moves.length}.`);
	printActiveGameCount();

	stopGameClock(game);
	// Cancel the timer that will auto terminate
	// the game when the next player runs out of time
	clearTimeout(game.autoTimeLossTimeoutID);
	// Also cancel the one that auto loses by AFK
	cancelAutoAFKResignTimer(game);
	cancelDisconnectTimers(game);
	closeDrawOffer(game);

	// The ending time of the game is set, if it is undefined
	if (game.timeEnded === undefined) game.timeEnded = Date.now();

	// Set a 5-second timer to delete it and change elos,
	// to give the other client time to oppose the conclusion if they want.
	gameutility.cancelDeleteGameTimer(game); // Cancel first, in case a hacking report just ocurred.
	game.deleteTimeoutID = setTimeout(() => deleteGame(game), timeBeforeGameDeletionMillis);
}

/**
 * Called when a player in the game loses on time.
 * Sets the gameConclusion, notifies both players.
 * Sets a 5 second timer to delete the game in case
 * one of them was disconnected when this happened.
 * @param game - The game
 */
function onPlayerLostOnTime(game: Game) {
	console.log("Someone has lost on time!");

	// Who lost on time?
	const loser = game.whosTurn!;
	const winner = typeutil.invertPlayer(loser);

	setGameConclusion(game, `${winner} time`);

	// Sometimes they're clock can have 1ms left. Just make that zero.
	// This needs to be done AFTER setting game conclusion, because that
	// stops the clocks and changes their values.
	game.players[loser]!.timer = 0;

	gameutility.sendGameUpdateToBothPlayers(game);
}

/**
 * Called when a player in the game loses by disconnection.
 * Sets the gameConclusion, notifies the opponent.
 * @param game - The game
 * @param colorWon - The color that won by opponent disconnection
 */
function onPlayerLostByDisconnect(game: Game, colorWon: Player) {
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
 * @param game - The game
 * @param colorWon - The color that won by opponent abandonment (AFK)
 */
function onPlayerLostByAbandonment(game: Game, colorWon: Player) {
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
 * @param game
 */
async function deleteGame(game: Game) {
	// If the pastedGame flag is present, skip logging to the database.
	// We don't know the starting position.
	if (game.positionPasted) console.log('Skipping logging custom game.');
	else {
		// The gamelogger logs the completed game information into the database tables "games", "player_stats" and "ratings"
		// The ratings are calculated during the logging of the game into the database
		const ratingdata = await gamelogger.logGame(game);

		// Mostly deprecated:
		// The statlogger logs games with at least 2 moves played (resignable) into /database/stats.json for stat collection
		await executeSafely_async(statlogger.logGame, `statlogger unable to log game! ${gameutility.getSimplifiedGameString(game)}`, game);

		// Send rating changes to all players of game, if relevant
		if (ratingdata !== undefined) gameutility.sendRatingChangeToAllPlayers(game, ratingdata);
	}

	// Unsubscribe both players' sockets from the game if they still are connected.
	// If the socket is undefined, they will have already been auto-unsubscribed.
	// And remove them from the list of users in active games to allow them to join a new game.
	for (const data of Object.values(game.players)) {
		removeUserFromActiveGame(data.identifier, game.id);
		if (!data.socket) continue; // They don't have a socket connected.
		// We inform their opponent they have disconnected inside js when we call this method.
		// Tell the client to unsub on their end, IF the socket isn't closing.
		if (data.socket.readyState === WebSocket.OPEN) sendSocketMessage(data.socket, 'game', 'unsub');
		gameutility.unsubClientFromGame(game, data.socket);
	}

	// Monitor suspicion levels for all players who participated in the game
	// Doesn't have to be in the same transaction as the game logging,
	// as the rating abuse table's data does not reference other tables.
	await ratingabuse.measureRatingAbuseAfterGame(game);

	delete activeGames[game.id]; // Delete the game from the activeGames list

	console.log(`Deleted game ${game.id}.`);
}

/**
 * Call when server's about to restart.
 * Aborts all active games, sends the conclusions to the players.
 * Immediately logs all games and updates statistics.
 */
async function logAllGames() {
	for (const gameID in activeGames) {
		const game = activeGames[gameID]!;
		if (!gameutility.isGameOver(game)) {
			// Abort the game
			setGameConclusion(game, 'aborted');
			// Report conclusion to players
			gameutility.sendGameUpdateToBothPlayers(game);
		}
		// Immediately log the game and update statistics.
		gameutility.cancelDeleteGameTimer(game); // Cancel first, in case it's already scheduled to be deleted.
		await deleteGame(game);
	}
}

/**
 * Send a message to all sockets in a game saying the server will restart soon.
 * Every reconnection from now on should re-send the time the server will restart.
 */
function broadCastGameRestarting() {
	const timeToRestart = getTimeServerRestarting() as number;
	for (const game of Object.values(activeGames)) {
		for (const color in game.players) {
			gameutility.sendMessageToSocketOfColor(game, Number(color) as Player, 'game', 'serverrestart', timeToRestart);
		}
	}
	const minutesTillRestart = Math.ceil((timeToRestart - Date.now()) / (1000 * 60));
	console.log(`Alerted all clients in a game that the server is restarting in ${minutesTillRestart} minutes!`);
}

//--------------------------------------------------------------------------------------------------------

export {
	createGame,
	isMemberInSomeActiveGame,
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