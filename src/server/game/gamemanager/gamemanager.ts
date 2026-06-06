// src/server/game/gamemanager/gamemanager.ts

/**
 * The script keeps track of all our active online games.
 */

import type { Rating } from '../../../shared/types.js';
import type { AuthSeek } from '../seeksmanager/seekutility.js';
import type { ServerGame } from './gameutility.js';
import type { AuthMemberInfo } from '../../types.js';
import type { GameConclusion } from '../../../shared/chess/util/winconutil.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';

import clock from '../../../shared/chess/logic/clock.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import winconutil from '../../../shared/chess/util/winconutil.js';
import variantcache from '../../../shared/chess/variants/variantcache.js';
import gamefileutility from '../../../shared/chess/util/gamefileutility.js';
import { Leaderboards } from '../../../shared/chess/variants/validleaderboard.js';
import gamefile, { LoadedVariant } from '../../../shared/chess/logic/gamefile.js';
import { doesVariantSupportServerValidation } from '../../../shared/chess/variants/servervalidation.js';

import statlogger from '../statlogger.js';
import gamelogger from './gamelogger.js';
import gameutility from './gameutility.js';
import ratingabuse from './ratingabuse.js';
import socketUtility from '../../socket/socketUtility.js';
import liveGameValues from './liveGameValues.js';
import { executeSafely } from '../../utility/errorGuard.js';
import { closeDrawOffer } from './drawoffers.js';
import { genUniqueGameID } from '../../database/gamesManager.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { restoreAllLiveGames } from './liveGameRestore.js';
import { getEloOfPlayerInLeaderboard } from '../../database/leaderboardsManager.js';
import { timeBeforeGameDeletionMillis } from './gameutility.js';
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
	timeToGiveDisconnectedBeforeStartingAutoResignTimerMillis,
} from './afkdisconnect.js';

// Constants ----------------------------------------------------------------------------------

/** Whether to log all new and ending games to the console. */
const PRINT_GAMES = true;

// State --------------------------------------------------------------------------------------

/**
 * The object containing all currently active games. Each game's id is the key: `{ id: Game }`
 * This may temporarily include games that are over, but not yet deleted/logged.
 *
 * The game's ids are the same id they will receive in the database! For this reason they must
 * be unique across the games table, and all other live games.
 */
const activeGames: Record<number, ServerGame> = {};

// Functions -----------------------------------------------------------------------------------

/**
 * Creates the `ServerGame` object and subscibes each player to the game
 * Auto-subscribes the players to receive game updates.
 * @param seek - The seek with the properties `id`, `owner`, `variant`, `clock`, `color`, `rated`.
 * @param assignments - The color each player has
 * @throws If a database error occurs (from {@link getEloOfPlayerInLeaderboard} or {@link gameutility.subscribeClientToGame}).
 */
function createGame(
	seek: AuthSeek,
	assignments: PlayerGroup<{ identifier: AuthMemberInfo; socket?: CustomWebSocket }>,
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

	if (seek.variant.kind !== 'preset')
		throw new Error('Custom variant game starting is not yet implemented.');
	const variantCode = seek.variant.code;

	const gameID = issueUniqueGameId();
	const dateTimestamp = Date.now();
	const metadata = gameutility.constructMetadataOfGame(
		seek.mode === 'rated',
		variantCode,
		seek.time,
		dateTimestamp,
		ratinginfo,
	);
	const variant: LoadedVariant = {
		code: variantCode,
		mod: variantcache.getModule(variantCode),
		dateTimestamp,
	};
	const gameWithRules = gamefile.initGame(metadata, dateTimestamp, variant);
	const match = gameutility.initMatch(seek, gameID, assignments);
	const validateMoves = doesVariantSupportServerValidation(variant);

	const servergame: ServerGame = gameutility.initServerGame(
		gameWithRules,
		match,
		validateMoves,
		variant,
	);
	for (const [strcolor, { socket }] of Object.entries(assignments)) {
		const player = Number(strcolor) as Player;
		if (socket) gameutility.subscribeClientToGame(servergame, socket, player);
		else startDisconnectTimer(servergame, player, false, onPlayerLostByDisconnect);
	}

	for (const data of Object.values(match.playerData)) {
		addUserToActiveGames(data.identifier, servergame.match.id);
	}

	activeGames[servergame.match.id] = servergame;

	// Persist the new game to the database for restoration after server restart.
	liveGameValues.onGameCreated(servergame);

	if (PRINT_GAMES) {
		console.log('Starting new game:');
		gameutility.printGame(servergame);
	}
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
 * Starts the 5-second cushion timer for a player who disconnected not by their own choice
 * (network interruption). After the cushion elapses, if they have not yet reconnected,
 * the full disconnect auto-resign timer is started.
 * Also persists the cushion state to the database.
 * @param servergame - The game
 * @param color - The player who disconnected
 */
function startDisconnectCushionTimerAndPersist(servergame: ServerGame, color: Player): void {
	servergame.match.playerData[color]!.disconnect.startID = setTimeout(
		() => startDisconnectTimerAndPersist(servergame, color, true),
		timeToGiveDisconnectedBeforeStartingAutoResignTimerMillis,
	);
	servergame.match.playerData[color]!.disconnect.startTime =
		Date.now() + timeToGiveDisconnectedBeforeStartingAutoResignTimerMillis;
	liveGameValues.onPlayerDisconnected(servergame, color);
}

/** Starts the auto-resign disconnect timer and immediately persists the new disconnect state to the database. */
function startDisconnectTimerAndPersist(
	servergame: ServerGame,
	color: Player,
	closureNotByChoice: boolean,
): void {
	startDisconnectTimer(servergame, color, closureNotByChoice, onPlayerLostByDisconnect);
	liveGameValues.onPlayerDisconnected(servergame, color);
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

	if (gameutility.isGameOver(servergame)) return; // It's fine if players unsub/disconnect after the game has ended.

	const color = gameutility.doesSocketBelongToGame_ReturnColor(servergame.match, ws)! as Player;
	if (unsubNotByChoice) {
		// Internet interruption. Give them 5 seconds before starting auto-resign timer.
		// console.log('Waiting 5 seconds before starting disconnection timer.');
		startDisconnectCushionTimerAndPersist(servergame, color);
	} else {
		// Closed tab manually. Immediately start auto-resign timer.
		startDisconnectTimerAndPersist(servergame, color, unsubNotByChoice);
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
	if (!gameutility.isGameOver(servergame)) return; // Game is still going, can't let them join a new game.

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
function pushGameClock(servergame: ServerGame): number | undefined {
	servergame.whosTurn =
		servergame.gameRules.turnOrder[
			servergame.moves.length % servergame.gameRules.turnOrder.length
		]!;

	if (servergame.untimed) return; // Don't adjust the times if the game isn't timed.

	const data = clock.push(servergame);

	// Reset the timer that will auto terminate the game when one player loses on time.
	if (!gameutility.isGameOver(servergame) && gameutility.isGameResignable(servergame)) {
		// Cancel previous auto loss timer if it exists
		clearTimeout(servergame.match.autoTimeLossTimeoutID);
		// Set the next one
		const timeUntilLoseOnTime = Math.max(servergame.clocks.timeRemainAtTurnStart!, 0);
		servergame.match.autoTimeLossTimeoutID = setTimeout(
			() => onPlayerLostOnTime(servergame),
			timeUntilLoseOnTime,
		);
	}

	return data;
}

/**
 * Finalizes the game conclusion and immediately deletes and logs the game.
 * Use this for all conclusions not triggered by a move (time, disconnect, abort, resign, draw).
 * For move-triggered conclusions use {@link finalizeConclusion} and {@link teardownGame}
 * directly so messages can be sent between finalization and teardown.
 * @param servergame - The game
 * @param conclusion - The new game conclusion
 */
function setGameConclusion(servergame: ServerGame, conclusion: GameConclusion | undefined): void {
	finalizeConclusion(servergame, conclusion);
	if (conclusion !== undefined) teardownGame(servergame);
}

/**
 * Finalizes the game conclusion: sets basegame state and metadata, stops the clock,
 * cancels all timers, closes the draw offer, stamps the end time, and persists to the DB.
 * After this returns, the game state is final and consistent with what will be logged.
 * Does NOT broadcast to clients or touch socket/game-object teardown.
 * @param servergame - The game
 * @param conclusion - The new game conclusion
 */
function finalizeConclusion(servergame: ServerGame, conclusion: GameConclusion | undefined): void {
	gamefileutility.setConclusion(servergame, conclusion);

	if (conclusion === undefined) return;

	const players: Record<string, any> = {};
	for (const [c, data] of Object.entries(servergame.match.playerData)) {
		players[c] = {
			id: data.identifier.signedIn ? data.identifier.username : data.identifier.browser_id,
			s: data.identifier.signedIn,
		};
	}
	if (PRINT_GAMES)
		console.log(
			`Game ${servergame.match.id} over. Players: ${JSON.stringify(players)}. Conclusion: ${JSON.stringify(servergame.gameConclusion)}. Moves: ${servergame.moves.length}.`,
		);

	clock.stop(servergame);
	// Cancel the timer that will auto terminate
	// the game when the next player runs out of time
	clearTimeout(servergame.match.autoTimeLossTimeoutID);
	// Also cancel the one that auto loses by AFK
	cancelAutoAFKResignTimer(servergame);
	cancelDisconnectTimers(servergame.match);
	closeDrawOffer(servergame.match);

	// The ending time of the game is set, if it is undefined
	if (servergame.match.timeEnded === undefined) servergame.match.timeEnded = Date.now();

	// Persist the final game state to the database.
	liveGameValues.onGameConcluded(servergame);
}

/**
 * Executes game teardown: broadcasts the final game state to
 * clients if the conclusion was not move-triggered, then either
 * deletes the game immediately or schedules deletion after a short cushion.
 * Must be called after {@link finalizeConclusion}.
 * @param servergame - The game (basegame.gameConclusion must already be set)
 */
function teardownGame(servergame: ServerGame): void {
	const conclusion = servergame.gameConclusion!;

	// Move-triggered conclusions already send the gameConclusion in the move response.
	if (!winconutil.isConclusionMoveTriggered(conclusion.condition))
		gameutility.broadcastGameUpdate(servergame);

	gameutility.cancelDeleteGameTimer(servergame.match); // Cancel first, in case a hacking report just occurred.
	if (servergame.validateMoves) {
		// Server validated every move — cheating is impossible.
		// We can log and unsubscribe clients immediately.
		deleteGame(servergame);
	} else {
		// No server-side validation (e.g. large variant, or pasted position).
		// Give the opponent time to oppose the conclusion.
		servergame.match.deleteTimeoutID = setTimeout(
			() => deleteGame(servergame),
			timeBeforeGameDeletionMillis,
		);
	}
}

/**
 * Called when a player in the game loses on time.
 * Sets the gameConclusion, notifies both players.
 * Sets a 5 second timer to delete the game in case
 * one of them was disconnected when this happened.
 * @param servergame - The game
 */
function onPlayerLostOnTime(servergame: ServerGame): void {
	// console.log('Someone has lost on time!');

	// Who lost on time?
	const loser = servergame.whosTurn!;
	const winner = typeutil.invertPlayer(loser);

	clock.stop(servergame);
	// Sometimes their clock can have 1ms left. Just make that zero.
	if (servergame.clocks) servergame.clocks.currentTime[loser] = 0;

	setGameConclusion(servergame, { victor: winner, condition: 'time' });
}

/**
 * Called when a player in the game loses by disconnection.
 * Sets the gameConclusion, notifies the opponent.
 * @param servergame - The game
 * @param colorWon - The color that won by opponent disconnection
 */
function onPlayerLostByDisconnect(servergame: ServerGame, colorWon: Player): void {
	if (gameutility.isGameOver(servergame))
		return console.error(
			'We should have cancelled the auto-loss-by-disconnection timer when the game ended!',
		);

	if (gameutility.isGameResignable(servergame)) {
		// console.log('Someone has lost by disconnection!');
		setGameConclusion(servergame, { victor: colorWon, condition: 'disconnect' });
	} else {
		// console.log('Game aborted from disconnection.');
		setGameConclusion(servergame, { condition: 'aborted' });
	}
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
	if (gameutility.isGameResignable(servergame)) {
		// console.log('Someone has lost by abandonment!');
		setGameConclusion(servergame, { victor: colorWon, condition: 'disconnect' });
	} else {
		// console.log('Game aborted from abandonment.');
		setGameConclusion(servergame, { condition: 'aborted' });
	}
}

/**
 * Deletes the game. Prints the active game count.
 * This should not be called until after both clients have had a chance
 * to see the game result, or after 15 seconds after the game ends
 * to give players time to cheat report.
 * @param servergame
 */
function deleteGame(servergame: ServerGame): void {
	// Delete is BEFORE logging, since the user may still send us game actions like "removefromplayersinactivegames"
	// and because of async stuff below, the game isn't actually deleted yet, which may trigger a second deleteGame() call.
	delete activeGames[servergame.match.id]; // Delete the game from the activeGames list

	// Remove the live game from the persistence database.
	liveGameValues.onGameDeleted(servergame.match.id);

	// Mostly deprecated:
	// The statlogger logs games with at least 2 moves played (resignable) into /database/stats.json for stat collection
	executeSafely(
		() => statlogger.logGame(servergame),
		`statlogger unable to log game! ${gameutility.getSimplifiedGameString(servergame)}`,
	);

	// The gamelogger logs the completed game information into the database tables "games", "player_stats" and "ratings"
	// The ratings are calculated during the logging of the game into the database.
	try {
		const ratingdata = gamelogger.logGame(servergame);

		// Send rating changes to all players of game, if relevant
		if (ratingdata !== undefined)
			gameutility.sendRatingChangeToAllPlayers(servergame.match, ratingdata);
	} catch {
		// log failure already logged
		// Notify both players
		for (const { socket: ws } of Object.values(servergame.match.playerData)) {
			if (!ws) continue;
			sendSocketMessage(
				ws,
				'general',
				'notifyerror',
				"A server error occurred while logging this game. It won't be available in your game history.",
			);
		}
	}

	// Unsubscribe both players' sockets from the game if they still are connected.
	// If the socket is undefined, they will have already been auto-unsubscribed.
	// And remove them from the list of users in active games to allow them to join a new game.
	for (const data of Object.values(servergame.match.playerData)) {
		removeUserFromActiveGame(data.identifier, servergame.match.id);
		if (!data.socket) continue; // They don't have a socket connected.
		// We inform their opponent they have disconnected inside js when we call this method.
		// Tell the client to unsub on their end
		sendSocketMessage(data.socket, 'game', 'unsub');
		gameutility.unsubClientFromGame(servergame.match, data.socket);
	}

	// Monitor suspicion levels for all players who participated in the game
	// Doesn't have to be in the same transaction as the game logging,
	// as the rating abuse table's data does not reference other tables.
	ratingabuse.measureRatingAbuseAfterGame(servergame);

	if (PRINT_GAMES) console.log(`Deleted game ${servergame.match.id}.`);
}

// Shutdown Preparation & Startup Restoration ------------------------------------------------

/**
 * Call when server's about to restart.
 * Stop all runtime timers and close sockets gracefully.
 * The games will be restored from the database on the next startup.
 * Their state is already stored inside live_games and live_game_players tables.
 */
function prepGamesForShutdown(): void {
	for (const gameID in activeGames) {
		const servergame = activeGames[gameID]!;

		// Cancel all runtime timers
		clearTimeout(servergame.match.autoTimeLossTimeoutID);
		cancelAutoAFKResignTimer(servergame);
		cancelDisconnectTimers(servergame.match);
		gameutility.cancelDeleteGameTimer(servergame.match);

		// Unsubscribe all sockets (we will resub them when they reconnect)
		for (const data of Object.values(servergame.match.playerData)) {
			if (!data.socket) continue;
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
		activeGames[servergame.match.id] = servergame;

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
		if (gameutility.isGameOver(servergame)) continue;

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
			const opponentColor = typeutil.invertPlayer(servergame.whosTurn!);
			if (pendingTimers.afkResignTimerMs <= 0) {
				// AFK timer already expired during downtime
				onPlayerLostByAbandonment(servergame, opponentColor);
				continue;
			}
			servergame.match.autoAFKResignTimeoutID = setTimeout(
				() => onPlayerLostByAbandonment(servergame, opponentColor),
				pendingTimers.afkResignTimerMs,
			);
		}

		// 4. Per-player disconnect timers
		for (const [playerStr, timerState] of Object.entries(pendingTimers.disconnectTimers)) {
			const player = Number(playerStr) as Player;
			const opponentColor = typeutil.invertPlayer(player);

			if (timerState.type === 'timer') {
				// Disconnect auto-resign timer was active
				if (timerState.remainingMs <= 0) {
					// Timer already expired, immediately resign
					onPlayerLostByDisconnect(servergame, opponentColor);
					break; // Game is over
				}
				// Revive the timer for the remaining duration exactly.
				// No sockets are connected yet at startup, so skip the opponent notification.
				const playerdata = servergame.match.playerData[player]!;
				playerdata.disconnect.startTime = undefined;
				playerdata.disconnect.timeoutID = setTimeout(
					() => onPlayerLostByDisconnect(servergame, opponentColor),
					timerState.remainingMs,
				);
				playerdata.disconnect.timeToAutoLoss = Date.now() + timerState.remainingMs;
				playerdata.disconnect.wasByChoice = timerState.byChoice;
			} else if (timerState.type === 'cushion') {
				// Still in the 5-second cushion period
				if (timerState.remainingMs <= 0) {
					// Cushion has elapsed, start the disconnect timer immediately and persist that state.
					startDisconnectTimerAndPersist(servergame, player, !timerState.byChoice);
				} else {
					// Revive the cushion timer for the remaining duration
					servergame.match.playerData[player]!.disconnect.startID = setTimeout(
						() =>
							startDisconnectTimerAndPersist(
								servergame,
								player,
								!timerState.byChoice,
							),
						timerState.remainingMs,
					);
					servergame.match.playerData[player]!.disconnect.startTime =
						Date.now() + timerState.remainingMs;
				}
			} else {
				// Fresh: was connected before restart, now disconnected due to server restart.
				// Give them the same 5-second cushion as a normal internet interruption.
				startDisconnectCushionTimerAndPersist(servergame, player);
			}
		}
	}
}

//--------------------------------------------------------------------------------------------------------

export {
	activeGames,
	createGame,
	isMemberInSomeActiveGame,
	unsubClientFromGameBySocket,
	onPlayerLostByAbandonment,
	getGameBySocket,
	onRequestRemovalFromPlayersInActiveGames,
	setGameConclusion,
	finalizeConclusion,
	teardownGame,
	pushGameClock,
	getGameByID,
	// Shutdown Preparation & Startup Restoration
	prepGamesForShutdown,
	restoreLiveGames,
};
