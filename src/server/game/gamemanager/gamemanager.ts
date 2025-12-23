/**
 * The script keeps track of all our active online games.
 */

// System imports
import WebSocket from 'ws';

// @ts-ignore
import { executeSafely_async } from '../../utility/errorGuard.js';
// @ts-ignore
import {
	incrementActiveGameCount,
	decrementActiveGameCount,
	printActiveGameCount,
} from './gamecount.js';
// @ts-ignore
import { closeDrawOffer } from './drawoffers.js';
// @ts-ignore
import { getTimeServerRestarting } from '../timeServerRestarts.js';
import gameutility from './gameutility.js';
import socketUtility from '../../socket/socketUtility.js';
import statlogger from '../statlogger.js';
import gamelogger from './gamelogger.js';
import {
	cancelAutoAFKResignTimer,
	startDisconnectTimer,
	cancelDisconnectTimers,
	getDisconnectionForgivenessDuration,
} from './afkdisconnect.js';
import {
	addUserToActiveGames,
	removeUserFromActiveGame,
	getIDOfGamePlayerIsIn,
	hasColorInGameSeenConclusion,
} from './activeplayers.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import { genUniqueGameID } from '../../database/gamesManager.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import ratingabuse from './ratingabuse.js';
import clock from '../../../shared/chess/logic/clock.js';
import gamefile from '../../../shared/chess/logic/gamefile.js';
import { getEloOfPlayerInLeaderboard } from '../../database/leaderboardsManager.js';

import type { ServerGame, PlayerData } from './gameutility.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { Invite } from '../invitesmanager/inviteutility.js';
import type { AuthMemberInfo } from '../../types.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type { Rating } from '../../database/leaderboardsManager.js';

//--------------------------------------------------------------------------------------------------------

/**
 * The object containing all currently active games. Each game's id is the key: `{ id: Game }`
 * This may temporarily include games that are over, but not yet deleted/logged.
 *
 * The game's ids are the same id they will receive in the database! For this reason they must
 * be unique across the games table, and all other live games.
 */
const activeGames: Record<number, ServerGame> = {};

/**
 * The cushion time, before the game is deleted, if one player
 * has disconnected and has not yet seen the game conclusion.
 * This gives them a little bit of time to reconnect and see the results.
 */
const timeBeforeGameDeletionMillis = 1000 * 8; // Default: 15

//--------------------------------------------------------------------------------------------------------

/**
 * Creates the `ServerGame` object and subscibes each player to the game
 * Auto-subscribes the players to receive game updates.
 * @param invite - The invite with the properties `id`, `owner`, `variant`, `clock`, `color`, `rated`, `publicity`.
 * @param assignments - The color each player has
 * @param actingPlayer - The color of the player that started the game and sent the socket message
 * @param replyto - The ID of the incoming socket message of the player that started the game. This is used for the `replyto` property on our response.
 */
function createGame(
	invite: Invite,
	assignments: PlayerGroup<{ identifier: AuthMemberInfo; socket?: CustomWebSocket }>,
	actingPlayer?: Player,
	replyto?: number,
): void {
	const ratinginfo = assignments as typeof assignments & PlayerGroup<{ rating: Rating }>;
	for (const [color, data] of Object.entries(assignments)) {
		if (data.identifier.signedIn) {
			ratinginfo[Number(color) as Player]!.rating = getEloOfPlayerInLeaderboard(
				data.identifier.user_id,
				0,
			);
		}
	}

	const gameID = issueUniqueGameId();
	const metadata = gameutility.constructMetadataOfGame(
		invite.rated === 'rated',
		invite.variant,
		(invite.clock as any) ?? '-',
		ratinginfo,
	);
	const basegame = gamefile.initGame(metadata);
	const match = gameutility.initMatch(invite, gameID, assignments);

	const game = { basegame, match };
	for (const [strcolor, { socket }] of Object.entries(assignments)) {
		const player = Number(strcolor) as Player;
		if (socket)
			gameutility.subscribeClientToGame(
				game,
				socket,
				player,
				actingPlayer === player ? { replyto } : {},
			);
		else startDisconnectTimer(game, player, false, onPlayerLostByDisconnect);
	}

	for (const data of Object.values(match.playerData)) {
		addUserToActiveGames((data as PlayerData).identifier, game.match.id);
	}

	addGameToActiveGames(game);

	console.log('Starting new game:');
	gameutility.printGame(game);
	printActiveGameCount();
}

/**
 * Returns an id that is unique across BOTH the games table
 * AND the live games inside {@link activeGames}.
 *
 * The game will receive this same id in the database when it is logged.
 */
function issueUniqueGameId(): number {
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
function addGameToActiveGames(game: ServerGame): void {
	activeGames[game.match.id] = game;
	incrementActiveGameCount();
}

/**
 * Checks if member with a given username is currently listed as being in some active game
 * @param username - username of some member
 * @returns true if member is currently in active game, otherwise false
 */
function isMemberInSomeActiveGame(username: string): boolean {
	for (const game of Object.values(activeGames)) {
		for (const player of Object.values(game.match.playerData)) {
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
function unsubClientFromGameBySocket(ws: CustomWebSocket, { unsubNotByChoice = true } = {}): void {
	const gameID = ws.metadata.subscriptions.game?.id;
	if (gameID === undefined)
		return console.error("Cannot unsub client from game when it's not subscribed to one.");

	const game = getGameByID(gameID);
	if (!game)
		return console.log(
			`Cannot unsub client from game when game doesn't exist! Metadata: ${socketUtility.stringifySocketMetadata(ws)}`,
		);

	gameutility.unsubClientFromGame(game.match, ws); // Don't tell the client to unsub because their socket is CLOSING

	// Let their OPPONENT know they've disconnected though...

	if (gameutility.isGameOver(game.basegame)) return; // It's fine if players unsub/disconnect after the game has ended.

	const color = gameutility.doesSocketBelongToGame_ReturnColor(game.match, ws)! as Player;
	if (unsubNotByChoice) {
		// Internet interruption. Give them 5 seconds before starting auto-resign timer.
		console.log('Waiting 5 seconds before starting disconnection timer.');
		const forgivenessDurationMillis = getDisconnectionForgivenessDuration();
		game.match.playerData[color]!.disconnect.startID = setTimeout(
			() => startDisconnectTimer(game, color, unsubNotByChoice, onPlayerLostByDisconnect),
			forgivenessDurationMillis,
		);
	} else {
		// Closed tab manually. Immediately start auto-resign timer.
		startDisconnectTimer(game, color, unsubNotByChoice, onPlayerLostByDisconnect);
	}
}

/**
 * Returns the game with the specified id.
 * @param id - The id of the game to pull.
 * @returns The game
 */
function getGameByID(id: number): ServerGame | undefined {
	return activeGames[id];
}

/**
 * Gets a game by player.
 * @param player - The player object with one of 2 properties: `member` or `browser`, depending on if they are signed in.
 * @returns The game they are in, if they belong in one, otherwise undefined..
 */
function getGameByPlayer(player: AuthMemberInfo): ServerGame | undefined {
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
function getGameBySocket(ws: CustomWebSocket): ServerGame | undefined {
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
 * @param game - The game they are in.
 */
function onRequestRemovalFromPlayersInActiveGames(ws: CustomWebSocket, game: ServerGame): void {
	if (!gameutility.isGameOver(game.basegame)) return; // Game is still going, can't let them join a new game.

	const user = ws.metadata.memberInfo;
	removeUserFromActiveGame(user, game.match.id);

	// If both players have requested this (i.e. have seen the game conclusion),
	// and the game is scheduled to be deleted, just delete it now!

	// Is the opponent still in the players in active games list? (has not seen the game results)
	const color =
		ws.metadata.subscriptions.game?.color ||
		gameutility.doesSocketBelongToGame_ReturnColor(game.match, ws)!;
	const opponentColor = typeutil.invertPlayer(color);
	if (!hasColorInGameSeenConclusion(game.match, opponentColor)) return; // They are still in the active games list because they have not seen the game conclusion yet.

	// console.log("Deleting game immediately, instead of waiting 15 seconds, because both players have seen the game conclusion and requested to be removed from the players in active games list.")

	// Both players have seen the game conclusion and requested to be removed
	// from the players in active games list, just delete the game now!
	gameutility.cancelDeleteGameTimer(game.match);
	deleteGame(game);
}

/**
 * Pushes the game clock, adding increment. Resets the timer
 * to auto terminate the game when a player loses on time.
 * @param game - The game
 * @returns The new time (in ms) of the player that just moved after increment is added.
 */
function pushGameClock({ basegame, match }: ServerGame): number | undefined {
	basegame.whosTurn =
		basegame.gameRules.turnOrder[basegame.moves.length % basegame.gameRules.turnOrder.length]!;

	if (basegame.untimed) return; // Don't adjust the times if the game isn't timed.

	const data = clock.push(basegame, basegame.clocks);

	// Reset the timer that will auto terminate the game when one player loses on time.
	if (!gameutility.isGameOver(basegame) && gameutility.isGameResignable(basegame)) {
		// Cancel previous auto loss timer if it exists
		clearTimeout(match.autoTimeLossTimeoutID);
		// Set the next one
		const timeUntilLoseOnTime = Math.max(basegame.clocks.timeRemainAtTurnStart!, 0);
		match.autoTimeLossTimeoutID = setTimeout(
			() => onPlayerLostOnTime({ basegame, match }),
			timeUntilLoseOnTime,
		);
	}

	return data;
}

/**
 * Sets the new conclusion for the game.
 * If truthy, it will fire {@link onGameConclusion()}.
 * @param game - The game
 * @param conclusion - The new game conclusion
 */
function setGameConclusion(game: ServerGame, conclusion: string | undefined): void {
	const dontDecrementActiveGames = game.basegame.gameConclusion !== undefined; // Game already over, active game count already decremented.
	gameutility.setConclusion(game.basegame, conclusion);
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
function onGameConclusion(game: ServerGame, { dontDecrementActiveGames = false } = {}): void {
	if (!dontDecrementActiveGames) decrementActiveGameCount();

	const players: Record<string, any> = {};
	for (const [c, data] of Object.entries(game.match.playerData)) {
		players[c] = {
			id: data.identifier.signedIn ? data.identifier.username : data.identifier.browser_id,
			s: data.identifier.signedIn,
		};
	}
	console.log(
		`Game ${game.match.id} over. Players: ${JSON.stringify(players)}. Conclusion: ${game.basegame.gameConclusion}. Moves: ${game.basegame.moves.length}.`,
	);
	printActiveGameCount();

	clock.stop(game.basegame);
	// Cancel the timer that will auto terminate
	// the game when the next player runs out of time
	clearTimeout(game.match.autoTimeLossTimeoutID);
	// Also cancel the one that auto loses by AFK
	cancelAutoAFKResignTimer(game.match);
	cancelDisconnectTimers(game.match);
	closeDrawOffer(game.match);

	// The ending time of the game is set, if it is undefined
	if (game.match.timeEnded === undefined) game.match.timeEnded = Date.now();

	// Set a 5-second timer to delete it and change elos,
	// to give the other client time to oppose the conclusion if they want.
	gameutility.cancelDeleteGameTimer(game.match); // Cancel first, in case a hacking report just ocurred.
	game.match.deleteTimeoutID = setTimeout(() => deleteGame(game), timeBeforeGameDeletionMillis);
}

/**
 * Called when a player in the game loses on time.
 * Sets the gameConclusion, notifies both players.
 * Sets a 5 second timer to delete the game in case
 * one of them was disconnected when this happened.
 * @param game - The game
 */
function onPlayerLostOnTime(game: ServerGame): void {
	console.log('Someone has lost on time!');

	// Who lost on time?
	const loser = game.basegame.whosTurn!;
	const winner = typeutil.invertPlayer(loser);

	setGameConclusion(game, `${winner} time`);

	// Sometimes they're clock can have 1ms left. Just make that zero.
	// This needs to be done AFTER setting game conclusion, because that
	// stops the clocks and changes their values.
	game.basegame.clocks!.currentTime[loser]! = 0;

	gameutility.broadcastGameUpdate(game);
}

/**
 * Called when a player in the game loses by disconnection.
 * Sets the gameConclusion, notifies the opponent.
 * @param game - The game
 * @param colorWon - The color that won by opponent disconnection
 */
function onPlayerLostByDisconnect(game: ServerGame, colorWon: Player): void {
	if (gameutility.isGameOver(game.basegame))
		return console.error(
			'We should have cancelled the auto-loss-by-disconnection timer when the game ended!',
		);

	if (gameutility.isGameResignable(game.basegame)) {
		console.log('Someone has lost by disconnection!');
		setGameConclusion(game, `${colorWon} disconnect`);
	} else {
		console.log('Game aborted from disconnection.');
		setGameConclusion(game, 'aborted');
	}

	gameutility.broadcastGameUpdate(game);
}

/**
 * Called when a player in the game loses by abandonment (AFK).
 * Sets the gameConclusion, notifies both players.
 * Sets a 5 second timer to delete the game in case
 * one of them was disconnected when this happened.
 * @param game - The game
 * @param colorWon - The color that won by opponent abandonment (AFK)
 */
function onPlayerLostByAbandonment(game: ServerGame, colorWon: Player): void {
	if (gameutility.isGameResignable(game.basegame)) {
		console.log('Someone has lost by abandonment!');
		setGameConclusion(game, `${colorWon} disconnect`);
	} else {
		console.log('Game aborted from abandonment.');
		setGameConclusion(game, 'aborted');
	}

	gameutility.broadcastGameUpdate(game);
}

/**
 * Deletes the game. Prints the active game count.
 * This should not be called until after both clients have had a chance
 * to see the game result, or after 15 seconds after the game ends
 * to give players time to cheat report.
 * @param game
 */
async function deleteGame(game: ServerGame): Promise<void> {
	// Delete is BEFORE logging, since the user may still send us game actions like "removefromplayersinactivegames"
	// and because of async stuff below, the game isn't actually deleted yet, which may trigger a second deleteGame() call.
	delete activeGames[game.match.id]; // Delete the game from the activeGames list

	// If the pastedGame flag is present, skip logging to the database.
	// We don't know the starting position.
	if (game.match.positionPasted) console.log('Skipping logging custom game.');
	else {
		// The gamelogger logs the completed game information into the database tables "games", "player_stats" and "ratings"
		// The ratings are calculated during the logging of the game into the database
		const ratingdata = await gamelogger.logGame(game);

		// Mostly deprecated:
		// The statlogger logs games with at least 2 moves played (resignable) into /database/stats.json for stat collection
		await executeSafely_async(
			statlogger.logGame,
			`statlogger unable to log game! ${gameutility.getSimplifiedGameString(game)}`,
			game.basegame,
		);

		// Send rating changes to all players of game, if relevant
		if (ratingdata !== undefined)
			gameutility.sendRatingChangeToAllPlayers(game.match, ratingdata);
	}

	// Unsubscribe both players' sockets from the game if they still are connected.
	// If the socket is undefined, they will have already been auto-unsubscribed.
	// And remove them from the list of users in active games to allow them to join a new game.
	for (const data of Object.values(game.match.playerData)) {
		removeUserFromActiveGame(data.identifier, game.match.id);
		if (!data.socket) continue; // They don't have a socket connected.
		// We inform their opponent they have disconnected inside js when we call this method.
		// Tell the client to unsub on their end, IF the socket isn't closing.
		if (data.socket.readyState === WebSocket.OPEN)
			sendSocketMessage(data.socket, 'game', 'unsub');
		gameutility.unsubClientFromGame(game.match, data.socket);
	}

	// Monitor suspicion levels for all players who participated in the game
	// Doesn't have to be in the same transaction as the game logging,
	// as the rating abuse table's data does not reference other tables.
	await ratingabuse.measureRatingAbuseAfterGame(game);

	console.log(`Deleted game ${game.match.id}.`);
}

/**
 * Call when server's about to restart.
 * Aborts all active games, sends the conclusions to the players.
 * Immediately logs all games and updates statistics.
 */
async function logAllGames(): Promise<void> {
	for (const gameID in activeGames) {
		const game = activeGames[gameID]!;
		if (!gameutility.isGameOver(game.basegame)) {
			// Abort the game
			setGameConclusion(game, 'aborted');
			// Report conclusion to players
			gameutility.broadcastGameUpdate(game);
		}
		// Immediately log the game and update statistics.
		gameutility.cancelDeleteGameTimer(game.match); // Cancel first, in case it's already scheduled to be deleted.
		await deleteGame(game);
	}
}

/**
 * Send a message to all sockets in a game saying the server will restart soon.
 * Every reconnection from now on should re-send the time the server will restart.
 */
function broadCastGameRestarting(): void {
	const timeToRestart = getTimeServerRestarting() as number;
	for (const game of Object.values(activeGames)) {
		for (const color in game.match.playerData) {
			gameutility.sendMessageToSocketOfColor(
				game.match,
				Number(color) as Player,
				'game',
				'serverrestart',
				timeToRestart,
			);
		}
	}
	const minutesTillRestart = Math.ceil((timeToRestart - Date.now()) / (1000 * 60));
	console.log(
		`Alerted all clients in a game that the server is restarting in ${minutesTillRestart} minutes!`,
	);
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
