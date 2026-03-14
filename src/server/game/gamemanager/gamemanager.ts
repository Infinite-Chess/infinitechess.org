// src/server/game/gamemanager/gamemanager.ts

/**
 * The script keeps track of all our active online games.
 */

import type { Invite } from '../invitesmanager/inviteutility.js';
import type { Rating } from '../../database/leaderboardsManager.js';
import type { ServerGame } from './gameutility.js';
import type { AuthMemberInfo } from '../../types.js';
import type { GameConclusion } from '../../../shared/chess/logic/gamefile.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';

import WebSocket from 'ws';

import clock from '../../../shared/chess/logic/clock.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import gamefile from '../../../shared/chess/logic/gamefile.js';
import { Leaderboards } from '../../../shared/chess/variants/validleaderboard.js';
import { doesVariantSupportServerValidation } from '../../../shared/chess/variants/servervalidation.js';

import statlogger from '../statlogger.js';
import gamelogger from './gamelogger.js';
import gameutility from './gameutility.js';
import ratingabuse from './ratingabuse.js';
import socketUtility from '../../socket/socketUtility.js';
import liveGameValues from './liveGameValues.js';
import { closeDrawOffer } from './drawoffers.js';
import { genUniqueGameID } from '../../database/gamesManager.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { executeSafely_async } from '../../utility/errorGuard.js';
import { restoreAllLiveGames } from './liveGameRestore.js';
import { getTimeServerRestarting } from '../timeServerRestarts.js';
import { getEloOfPlayerInLeaderboard } from '../../database/leaderboardsManager.js';
import {
	incrementActiveGameCount,
	decrementActiveGameCount,
	printActiveGameCount,
} from './gamecount.js';
import {
	addUserToActiveGames,
	removeUserFromActiveGame,
	getIDOfGamePlayerIsIn,
	hasColorInGameSeenConclusion,
} from './activeplayers.js';
import {
	cancelAutoAFKResignTimer,
	startDisconnectTimer,
	cancelDisconnectTimers,
	getDisconnectionForgivenessDuration,
} from './afkdisconnect.js';

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
	actingPlayer: Player,
	replyto?: number,
): void {
	const ratinginfo: typeof assignments & PlayerGroup<{ rating?: Rating }> = {};
	for (const [color, data] of Object.entries(assignments)) {
		const player: Player = Number(color) as Player;

		ratinginfo[player] = data;

		if (data.identifier.signedIn) {
			ratinginfo[player].rating = getEloOfPlayerInLeaderboard(
				data.identifier.user_id,
				Leaderboards.INFINITY,
			);
		}
	}

	const gameID = issueUniqueGameId();
	const metadata = gameutility.constructMetadataOfGame(
		invite.rated === 'rated',
		invite.variant,
		invite.clock,
		ratinginfo,
	);
	const basegame = gamefile.initGame(metadata);
	const match = gameutility.initMatch(invite, gameID, assignments);

	// If the variant is small, construct the board for server-side move legality validation.
	const boardsim = doesVariantSupportServerValidation(metadata)
		? gamefile.initBoard(basegame.gameRules, metadata)
		: undefined;

	const servergame: ServerGame = { basegame, match, boardsim };
	for (const [strcolor, { socket }] of Object.entries(assignments)) {
		const player = Number(strcolor) as Player;
		if (socket)
			gameutility.subscribeClientToGame(
				servergame,
				socket,
				player,
				actingPlayer === player ? { replyto } : {},
			);
		else startDisconnectTimer(servergame, player, false, onPlayerLostByDisconnect);
	}

	for (const data of Object.values(match.playerData)) {
		addUserToActiveGames(data.identifier, servergame.match.id);
	}

	addGameToActiveGames(servergame);

	// Persist the new game to the database for restoration after server restart.
	liveGameValues.onGameCreated(servergame);

	console.log('Starting new game:');
	gameutility.printGame(servergame);
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
 * @param servergame - The game
 */
function addGameToActiveGames(servergame: ServerGame): void {
	activeGames[servergame.match.id] = servergame;
	incrementActiveGameCount();
}

/**
 * Checks if member with a given username is currently listed as being in some active game
 * @param username - username of some member
 * @returns true if member is currently in active game, otherwise false
 */
function isMemberInSomeActiveGame(username: string): boolean {
	for (const servergame of Object.values(activeGames)) {
		for (const player of Object.values(servergame.match.playerData)) {
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

	const servergame = getGameByID(gameID);
	if (!servergame)
		return console.log(
			`Cannot unsub client from game when game doesn't exist! Metadata: ${socketUtility.stringifySocketMetadata(ws)}`,
		);

	gameutility.unsubClientFromGame(servergame.match, ws); // Don't tell the client to unsub because their socket is CLOSING

	// Let their OPPONENT know they've disconnected though...

	if (gameutility.isGameOver(servergame.basegame)) return; // It's fine if players unsub/disconnect after the game has ended.

	const color = gameutility.doesSocketBelongToGame_ReturnColor(servergame.match, ws)! as Player;
	if (unsubNotByChoice) {
		// Internet interruption. Give them 5 seconds before starting auto-resign timer.
		console.log('Waiting 5 seconds before starting disconnection timer.');
		const forgivenessDurationMillis = getDisconnectionForgivenessDuration();
		servergame.match.playerData[color]!.disconnect.startID = setTimeout(
			() =>
				startDisconnectTimer(servergame, color, unsubNotByChoice, onPlayerLostByDisconnect),
			forgivenessDurationMillis,
		);
		servergame.match.playerData[color]!.disconnect.startTime =
			Date.now() + forgivenessDurationMillis;
		liveGameValues.onPlayerDisconnected(servergame, color);
	} else {
		// Closed tab manually. Immediately start auto-resign timer.
		startDisconnectTimer(servergame, color, unsubNotByChoice, onPlayerLostByDisconnect);
		liveGameValues.onPlayerDisconnected(servergame, color);
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
 * @param servergame - The game they are in.
 */
function onRequestRemovalFromPlayersInActiveGames(
	ws: CustomWebSocket,
	servergame: ServerGame,
): void {
	if (!gameutility.isGameOver(servergame.basegame)) return; // Game is still going, can't let them join a new game.

	const user = ws.metadata.memberInfo;
	removeUserFromActiveGame(user, servergame.match.id);

	// If both players have requested this (i.e. have seen the game conclusion),
	// and the game is scheduled to be deleted, just delete it now!

	// Is the opponent still in the players in active games list? (has not seen the game results)
	const color =
		ws.metadata.subscriptions.game?.color ||
		gameutility.doesSocketBelongToGame_ReturnColor(servergame.match, ws)!;
	const opponentColor = typeutil.invertPlayer(color);
	if (!hasColorInGameSeenConclusion(servergame.match, opponentColor)) return; // They are still in the active games list because they have not seen the game conclusion yet.

	// console.log("Deleting game immediately, instead of waiting 15 seconds, because both players have seen the game conclusion and requested to be removed from the players in active games list.")

	// Both players have seen the game conclusion and requested to be removed
	// from the players in active games list, just delete the game now!
	gameutility.cancelDeleteGameTimer(servergame.match);
	deleteGame(servergame);
}

/**
 * Pushes the game clock, adding increment. Resets the timer
 * to auto terminate the game when a player loses on time.
 * @param servergame - The game
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
 * @param servergame - The game
 * @param conclusion - The new game conclusion
 */
function setGameConclusion(servergame: ServerGame, conclusion: GameConclusion | undefined): void {
	const dontDecrementActiveGames = servergame.basegame.gameConclusion !== undefined; // Game already over, active game count already decremented.
	gameutility.setConclusion(servergame.basegame, conclusion);
	if (conclusion !== undefined) onGameConclusion(servergame, { dontDecrementActiveGames });
}

/**
 * Fire whenever a game's `gameConclusion` property is set.
 * Stops the game clock, cancels all running timers, closes any draw
 * offer, sets a timer to delete the game and updates players' ELOs.
 * @param servergame - The game object representing the current game.
 * @param [options] - Optional parameters.
 * @param [options.dontDecrementActiveGames=false] - If true, prevents decrementing the active game count.
 */
function onGameConclusion(servergame: ServerGame, { dontDecrementActiveGames = false } = {}): void {
	if (!dontDecrementActiveGames) decrementActiveGameCount();

	const players: Record<string, any> = {};
	for (const [c, data] of Object.entries(servergame.match.playerData)) {
		players[c] = {
			id: data.identifier.signedIn ? data.identifier.username : data.identifier.browser_id,
			s: data.identifier.signedIn,
		};
	}
	console.log(
		`Game ${servergame.match.id} over. Players: ${JSON.stringify(players)}. Conclusion: ${JSON.stringify(servergame.basegame.gameConclusion)}. Moves: ${servergame.basegame.moves.length}.`,
	);
	printActiveGameCount();

	clock.stop(servergame.basegame);
	// Cancel the timer that will auto terminate
	// the game when the next player runs out of time
	clearTimeout(servergame.match.autoTimeLossTimeoutID);
	// Also cancel the one that auto loses by AFK
	cancelAutoAFKResignTimer(servergame);
	cancelDisconnectTimers(servergame.match);
	closeDrawOffer(servergame.match);

	// The ending time of the game is set, if it is undefined
	if (servergame.match.timeEnded === undefined) servergame.match.timeEnded = Date.now();

	// Set a 5-second timer to delete it and change elos,
	// to give the other client time to oppose the conclusion if they want.
	gameutility.cancelDeleteGameTimer(servergame.match); // Cancel first, in case a hacking report just ocurred.
	servergame.match.deleteTimeoutID = setTimeout(
		() => deleteGame(servergame),
		timeBeforeGameDeletionMillis,
	);

	// Persist the game conclusion to the database.
	liveGameValues.onGameConcluded(servergame);
}

/**
 * Called when a player in the game loses on time.
 * Sets the gameConclusion, notifies both players.
 * Sets a 5 second timer to delete the game in case
 * one of them was disconnected when this happened.
 * @param servergame - The game
 */
function onPlayerLostOnTime(servergame: ServerGame): void {
	console.log('Someone has lost on time!');

	// Who lost on time?
	const loser = servergame.basegame.whosTurn!;
	const winner = typeutil.invertPlayer(loser);

	setGameConclusion(servergame, { victor: winner, condition: 'time' });

	// Sometimes they're clock can have 1ms left. Just make that zero.
	// This needs to be done AFTER setting game conclusion, because that
	// stops the clocks and changes their values.
	servergame.basegame.clocks!.currentTime[loser]! = 0;

	gameutility.broadcastGameUpdate(servergame);
}

/**
 * Called when a player in the game loses by disconnection.
 * Sets the gameConclusion, notifies the opponent.
 * @param servergame - The game
 * @param colorWon - The color that won by opponent disconnection
 */
function onPlayerLostByDisconnect(servergame: ServerGame, colorWon: Player): void {
	if (gameutility.isGameOver(servergame.basegame))
		return console.error(
			'We should have cancelled the auto-loss-by-disconnection timer when the game ended!',
		);

	if (gameutility.isGameResignable(servergame.basegame)) {
		console.log('Someone has lost by disconnection!');
		setGameConclusion(servergame, { victor: colorWon, condition: 'disconnect' });
	} else {
		console.log('Game aborted from disconnection.');
		setGameConclusion(servergame, { condition: 'aborted' });
	}

	gameutility.broadcastGameUpdate(servergame);
}

/**
 * Called when a player in the game loses by abandonment (AFK).
 * Sets the gameConclusion, notifies both players.
 * Sets a 5 second timer to delete the game in case
 * one of them was disconnected when this happened.
 * @param servergame - The game
 * @param colorWon - The color that won by opponent abandonment (AFK)
 */
function onPlayerLostByAbandonment(servergame: ServerGame, colorWon: Player): void {
	if (gameutility.isGameResignable(servergame.basegame)) {
		console.log('Someone has lost by abandonment!');
		setGameConclusion(servergame, { victor: colorWon, condition: 'disconnect' });
	} else {
		console.log('Game aborted from abandonment.');
		setGameConclusion(servergame, { condition: 'aborted' });
	}

	gameutility.broadcastGameUpdate(servergame);
}

/**
 * Deletes the game. Prints the active game count.
 * This should not be called until after both clients have had a chance
 * to see the game result, or after 15 seconds after the game ends
 * to give players time to cheat report.
 * @param servergame
 */
async function deleteGame(servergame: ServerGame): Promise<void> {
	// Delete is BEFORE logging, since the user may still send us game actions like "removefromplayersinactivegames"
	// and because of async stuff below, the game isn't actually deleted yet, which may trigger a second deleteGame() call.
	delete activeGames[servergame.match.id]; // Delete the game from the activeGames list

	// Remove the live game from the persistence database.
	liveGameValues.onGameDeleted(servergame.match.id);

	// If the pastedGame flag is present, skip logging to the database.
	// We don't know the starting position.
	if (servergame.match.positionPasted) console.log('Skipping logging custom game.');
	else {
		// The gamelogger logs the completed game information into the database tables "games", "player_stats" and "ratings"
		// The ratings are calculated during the logging of the game into the database
		const ratingdata = await gamelogger.logGame(servergame);

		// Mostly deprecated:
		// The statlogger logs games with at least 2 moves played (resignable) into /database/stats.json for stat collection
		await executeSafely_async(
			() => statlogger.logGame(servergame.basegame),
			`statlogger unable to log game! ${gameutility.getSimplifiedGameString(servergame)}`,
		);

		// Send rating changes to all players of game, if relevant
		if (ratingdata !== undefined)
			gameutility.sendRatingChangeToAllPlayers(servergame.match, ratingdata);
	}

	// Unsubscribe both players' sockets from the game if they still are connected.
	// If the socket is undefined, they will have already been auto-unsubscribed.
	// And remove them from the list of users in active games to allow them to join a new game.
	for (const data of Object.values(servergame.match.playerData)) {
		removeUserFromActiveGame(data.identifier, servergame.match.id);
		if (!data.socket) continue; // They don't have a socket connected.
		// We inform their opponent they have disconnected inside js when we call this method.
		// Tell the client to unsub on their end, IF the socket isn't closing.
		if (data.socket.readyState === WebSocket.OPEN)
			sendSocketMessage(data.socket, 'game', 'unsub');
		gameutility.unsubClientFromGame(servergame.match, data.socket);
	}

	// Monitor suspicion levels for all players who participated in the game
	// Doesn't have to be in the same transaction as the game logging,
	// as the rating abuse table's data does not reference other tables.
	await ratingabuse.measureRatingAbuseAfterGame(servergame);

	console.log(`Deleted game ${servergame.match.id}.`);
}

/**
 * Call when server's about to restart.
 * Now that games are persisted to the database, we no longer abort them.
 * Instead, we stop all runtime timers and close sockets gracefully.
 * The games will be restored from the database on the next startup.
 */
async function logAllGames(): Promise<void> {
	for (const gameID in activeGames) {
		const servergame = activeGames[gameID]!;

		// Cancel all runtime timers
		clearTimeout(servergame.match.autoTimeLossTimeoutID);
		cancelAutoAFKResignTimer(servergame);
		cancelDisconnectTimers(servergame.match);
		gameutility.cancelDeleteGameTimer(servergame.match);

		// Unsubscribe all sockets
		for (const data of Object.values(servergame.match.playerData)) {
			if (!data.socket) continue;
			if (data.socket.readyState === WebSocket.OPEN)
				sendSocketMessage(data.socket, 'game', 'unsub');
			gameutility.unsubClientFromGame(servergame.match, data.socket);
		}

		delete activeGames[gameID];
	}
}

/**
 * Restores all live games from the database on server startup.
 * Should be called after initDatabase() and before accepting client connections.
 */
function restoreLiveGames(): void {
	const restoredGames = restoreAllLiveGames();

	for (const { servergame, pendingTimers } of restoredGames) {
		// Add the game to the active games list
		addGameToActiveGames(servergame);

		// Register players in the active players list
		for (const data of Object.values(servergame.match.playerData)) {
			addUserToActiveGames(data.identifier, servergame.match.id);
		}

		// Start timers

		// 1. Delete timer (for concluded games)
		if (pendingTimers.deleteTimerMs !== undefined) {
			if (pendingTimers.deleteTimerMs <= 0) {
				// Timer already expired, delete immediately
				deleteGame(servergame);
				continue; // Skip to next game since this one is being deleted
			}
			servergame.match.deleteTimeoutID = setTimeout(
				() => deleteGame(servergame),
				pendingTimers.deleteTimerMs,
			);
		}

		// Skip remaining timers for concluded games
		if (gameutility.isGameOver(servergame.basegame)) continue;

		// 2. Auto time loss timer (for timed games)
		if (pendingTimers.autoTimeLossMs !== undefined) {
			if (pendingTimers.autoTimeLossMs <= 0) {
				// Clock already expired during downtime
				onPlayerLostOnTime(servergame);
				continue;
			}
			servergame.match.autoTimeLossTimeoutID = setTimeout(
				() => onPlayerLostOnTime(servergame),
				pendingTimers.autoTimeLossMs,
			);
		}

		// 3. AFK resign timer
		if (pendingTimers.afkResignTimerMs !== undefined) {
			if (pendingTimers.afkResignTimerMs <= 0) {
				// AFK timer already expired during downtime
				const afkLoser = servergame.basegame.whosTurn!;
				const afkWinner = typeutil.invertPlayer(afkLoser);
				onPlayerLostByAbandonment(servergame, afkWinner);
				continue;
			}
			const opponentColor = typeutil.invertPlayer(servergame.basegame.whosTurn!);
			servergame.match.autoAFKResignTimeoutID = setTimeout(
				() => onPlayerLostByAbandonment(servergame, opponentColor),
				pendingTimers.afkResignTimerMs,
			);
		}

		// 4. Per-player disconnect timers
		for (const [playerStr, timerState] of Object.entries(pendingTimers.disconnectTimers)) {
			const player = Number(playerStr) as Player;

			if (timerState.type === 'timer') {
				// Disconnect auto-resign timer was active
				if (timerState.remainingMs <= 0) {
					// Timer already expired, immediately resign
					const winner = typeutil.invertPlayer(player);
					onPlayerLostByDisconnect(servergame, winner);
					break; // Game is over
				}
				startDisconnectTimer(
					servergame,
					player,
					!timerState.byChoice,
					onPlayerLostByDisconnect,
				);
			} else if (timerState.type === 'cushion') {
				// Still in the 5-second cushion period
				if (timerState.remainingMs <= 0) {
					// Cushion has elapsed, start the disconnect timer immediately
					startDisconnectTimer(
						servergame,
						player,
						!timerState.byChoice,
						onPlayerLostByDisconnect,
					);
				} else {
					// Revive the cushion timer for the remaining duration
					servergame.match.playerData[player]!.disconnect.startID = setTimeout(
						() =>
							startDisconnectTimer(
								servergame,
								player,
								!timerState.byChoice,
								onPlayerLostByDisconnect,
							),
						timerState.remainingMs,
					);
					servergame.match.playerData[player]!.disconnect.startTime =
						Date.now() + timerState.remainingMs;
				}
			} else {
				// Fresh: was connected before restart, now disconnected due to server restart.
				// Start a fresh disconnect timer with closureNotByChoice = true (60s).
				startDisconnectTimer(
					servergame,
					player,
					true, // not by choice (server restart)
					onPlayerLostByDisconnect,
				);
			}
		}
	}

	if (restoredGames.length > 0) printActiveGameCount();
}

/**
 * Send a message to all sockets in a servergame saying the server will restart soon.
 * Every reconnection from now on should re-send the time the server will restart.
 */
function broadCastGameRestarting(): void {
	const timeToRestart = getTimeServerRestarting() as number;
	for (const servergame of Object.values(activeGames)) {
		for (const color in servergame.match.playerData) {
			gameutility.sendMessageToSocketOfColor(
				servergame.match,
				Number(color) as Player,
				'servergame',
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
	restoreLiveGames,
	getGameBySocket,
	onRequestRemovalFromPlayersInActiveGames,
	setGameConclusion,
	pushGameClock,
	getGameByID,
};
