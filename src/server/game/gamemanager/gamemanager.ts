// src/server/game/gamemanager/gamemanager.ts

/**
 * The script keeps track of all our active online games.
 */

import type { AuthMemberInfo } from '../../types.js';
import type { GameConclusion } from '../../../shared/chess/util/winconutil.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type { EngineGamePageInfo, StaticGameState } from '../../../shared/domain.js';
import type { GameSetup, PlayerRatingResult, ServerGame } from './gameutility.js';

import clock from '../../../shared/chess/logic/clock.js';
import moveutil from '../../../shared/chess/util/moveutil.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import gamefile from '../../../shared/chess/logic/gamefile.js';

import statlogger from '../statlogger.js';
import gamelogger from './gamelogger.js';
import gameutility from './gameutility.js';
import ratingabuse from './ratingabuse.js';
import liveGameValues from './liveGameValues.js';
import { memberInfoEq } from '../../utility/memberInfoUtil.js';
import { executeSafely } from '../../utility/errorGuard.js';
import { closeDrawOffer } from './drawoffers.js';
import { genUniqueGameID } from '../../database/gamesManager.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { sendSocketMessage } from '../../socket/socketSend.js';
import { restoreAllLiveGames } from './liveGameRestore.js';
import { timeBeforeFinalizeMillis } from './gameutility.js';
import { produceDeadStaticGameState } from './deadgamestate.js';
import { broadcastMemberInGameStatus } from '../seeksmanager/lobbymanager.js';
import { RatingData, UNCERTAIN_LEADERBOARD_RD } from './ratingcalculation.js';
import {
	addUserToActiveGames,
	removeUserFromActiveGame,
	getIDOfGamePlayerIsIn,
} from './activeplayers.js';
import {
	cancelDisconnectTimers,
	startDisconnectClaimTimer,
	startDisconnectCushionTimer,
	timeToGiveDisconnectedBeforeOpeningClaimWindowMillis,
} from './disconnect.js';

// Constants ----------------------------------------------------------------------------------

/**
 * How long to keep a game alive when BOTH players are disconnected
 * before auto-concluding by abandonment/abort if neither reconnects.
 */
const timeBeforeBothDisconnectedAutoConclusionMillis = 1000 * 60 * 5; // 5 minutes

/** Whether to log all new and ending games to the console. */
const PRINT_GAMES = true;

// State --------------------------------------------------------------------------------------

/**
 * The object containing all currently active games. Each game's id is the key: `{ id: Game }`
 * This may temporarily include games that are over, but not yet finalized or evicted.
 *
 * The game's ids are the same id they will receive in the database! For this reason they must
 * be unique across the games table, and all other live games.
 */
const activeGames: Record<number, ServerGame> = {};

// Functions -----------------------------------------------------------------------------------

/**
 * Creates and persists the `ServerGame`, then signals each requesting socket to navigate to
 * the game page (where they re-subscribe to the live game), arming a silent disconnect cushion
 * in the meantime. A player with no socket is told on their next lobby subscribe instead.
 * @param setup - The variant, time control, and rated flag of the game to start.
 * @param assignments - The color each player has, and their socket if connected.
 * @returns The id of the newly created game.
 * @throws If a database error occurs.
 */
function createGame(
	setup: GameSetup,
	assignments: PlayerGroup<{ identifier: AuthMemberInfo; socket?: CustomWebSocket }>,
): number {
	// Joining a new game counts as leaving any concluded game still lingering for a rematch.
	for (const { identifier } of Object.values(assignments)) forceLeaveLingeringGame(identifier);

	const gameID = issueUniqueGameId();
	const dateTimestamp = Date.now();
	const construction = gameutility.resolveGameConstruction(
		setup.variant,
		dateTimestamp,
		setup.modifiers?.find((m) => m.kind === 'slide-limit')?.value,
		setup.engineParticipant !== undefined,
	);

	const game = gamefile.initGame(setup.time, dateTimestamp, construction.gameRules);
	const match = gameutility.initMatch(setup, gameID, assignments);

	const servergame: ServerGame = gameutility.initServerGame(game, construction, match);
	for (const [strcolor, { identifier, socket }] of Object.entries(assignments)) {
		// A player with no socket to push to is owed the navigate notice on their next lobby subscribe.
		addUserToActiveGames(
			identifier,
			servergame.match.id,
			Number(strcolor) as Player,
			socket === undefined,
		);
	}

	activeGames[servergame.match.id] = servergame;

	// Persist the new game to the database for restoration after server restart.
	// Must precede the per-player cushion below, which persists disconnect
	// state and therefore requires the game row to already exist.
	liveGameValues.onGameCreated(servergame);

	for (const [strcolor, { identifier, socket }] of Object.entries(assignments)) {
		const player = Number(strcolor) as Player;
		// Alert all their lobby-subscribed clients they are in a game. Only the socket that
		// asked for this game is taken into it; their other tabs get the rejoin banner.
		broadcastMemberInGameStatus(identifier, socket);
		// Give them 5 seconds to navigate to the game page and re-connect
		// before they're considered disconnected.
		startDisconnectCushionTimer(servergame, player);
	}

	if (PRINT_GAMES) {
		console.log('Starting new game:');
		gameutility.printGame(servergame);
	}

	return gameID;
}

/**
 * Returns an id that is unique across BOTH the games table
 * AND the live games inside {@link activeGames}.
 *
 * The game will receive this same id in the database when it is logged.
 * @throws If a database error occurs.
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
 * When a player joins a new game: force them to leave their previous concluded game
 * still lingering for a rematch. Their old opponent's rematch option is withdrawn.
 */
function forceLeaveLingeringGame(identifier: AuthMemberInfo): void {
	for (const servergame of Object.values(activeGames)) {
		if (!gameutility.isGameOver(servergame)) continue; // Only concluded games linger for a rematch.
		for (const [c, data] of Object.entries(servergame.match.playerData)) {
			if (!memberInfoEq(data.identifier, identifier)) continue;
			if (data.socket) {
				sendSocketMessage(data.socket, 'game', 'unsub', undefined); // Unsub the game on their old tab.
				gameutility.detatchSocketFromGame(servergame.match, data.socket);
			}
			onPostGameLeave(servergame, Number(c) as Player, false);
			return; // A player can only be a participant of one lingering game.
		}
	}
}

/**
 * Handles a throw from {@link createGame}: logs it, then tells each connected
 * participant a server error prevented their game from starting.
 * @param error - The error thrown.
 * @param sockets - Every socket awaiting the game, undefined entries skipped.
 */
function onGameCreationError(error: unknown, sockets: (CustomWebSocket | undefined)[]): void {
	// The stack, not just the message — these are unexpected internal failures.
	const details = error instanceof Error ? (error.stack ?? error.message) : String(error);
	logEventsAndPrint(`Error creating game: ${details}`, 'errLog');
	for (const ws of sockets) {
		if (ws) sendSocketMessage(ws, 'general', 'notifyerror', ws.t.responses.errors.server_error);
	}
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
 * Unsubscribes a websocket from the game their connected to.
 * Entry points: Socket closure, or explicitly requested by the client.
 * @param involuntary - Whether we should give them a 5-second cushion to re-sub before we
 * start a disconnect claim timer. Set to false if we call this due to them closing the tab.
 */
function unsubSocketParticipantFromGame(ws: CustomWebSocket, involuntary: boolean): void {
	const gameID = ws.metadata.subscriptions.game?.id;
	if (gameID === undefined) return; // Not subscribed to any game

	const servergame = getGameByID(gameID)!;

	const role = gameutility.getSocketRoleInGame(servergame, ws)!;
	gameutility.detatchSocketFromGame(servergame.match, ws);

	if (!gameutility.isGameOver(servergame)) {
		// Game is ongoing: inform the opponent they disconnected.
		if (involuntary) {
			// Internet interruption. Give them 5 seconds before opening the opponent's claim window.
			startDisconnectCushionTimer(servergame, role);
			// The tab lives on and its engine keeps searching, so its clock keeps ticking.
		} else {
			// Immediately open the opponent's claim window.
			startDisconnectClaimTimer(servergame, role, involuntary);
			// Closed tab manually: the page is gone, taking the engine's worker with it.
			freezeEngineClock(servergame);
		}

		// If this leaves BOTH players disconnected, start the timer that concludes the
		// game if neither returns (no one is present to claim victory/draw).
		maybeStartBothDisconnectedTimer(servergame);
	} else {
		// Post-conclusion: the game only lingers for the rematch handshake — no claim window applies.
		onPostGameLeave(servergame, role, involuntary);
	}
}

/**
 * Game is concluded: Handles a player leaving a concluded game's rematch window.
 * Withdraws their rematch offer and informs the opponent, then memory-evicts
 * either now or after a short cushion timer if it was involuntary.
 * Entry points: Socket close, client choice, or joined new game.
 */
function onPostGameLeave(servergame: ServerGame, role: Player, involuntary: boolean): void {
	const match = servergame.match;

	// Withdraw their rematch offer, if any, and tell the opponent they've left (disable + unglow).
	match.rematchOffers.delete(role);
	gameutility.sendMessageToColor(match, typeutil.invertPlayer(role), 'game', 'opponentleft', undefined); // prettier-ignore

	const playerdata = match.playerData[role]!;
	clearTimeout(playerdata.disconnect.startID);
	delete playerdata.disconnect.startID;

	if (!involuntary) {
		// Gone immediately.
		delete playerdata.disconnect.startTime;
		evictIfBothLeft(servergame);
	} else {
		// Network drop — give them the reconnection cushion before considering them gone.
		playerdata.disconnect.startID = setTimeout(() => {
			delete playerdata.disconnect.startTime;
			evictIfBothLeft(servergame);
		}, timeToGiveDisconnectedBeforeOpeningClaimWindowMillis);
		playerdata.disconnect.startTime =
			Date.now() + timeToGiveDisconnectedBeforeOpeningClaimWindowMillis;
	}
}

/**
 * Unsubscribes a spectator's websocket from the game their spectating.
 * Unlike participants, spectators have no disconnect timers or opponent to notify.
 * Entry points: Socket closure, or explicitly requested by the client.
 */
function unsubSocketSpectatorFromGame(ws: CustomWebSocket): void {
	const gameID = ws.metadata.subscriptions.spectating?.id;
	if (gameID === undefined) return; // Not spectating any game
	gameutility.detachSpectatorFromGame(getGameByID(gameID)!, ws);
}

/** Returns the live game with the specified id, if it exists. */
function getGameByID(id: number): ServerGame | undefined {
	return activeGames[id];
}

/**
 * Resolves a game id's {@link StaticGameState} — live (in memory) or dead (in the DB) —
 * plus its ply count and liveness, for the SSR game page. `undefined` if no such game.
 * @throws If a database error occurs.
 */
function produceStaticGameState(id: number):
	| {
			state: StaticGameState;
			moveCount: number;
			game?: ServerGame;
			engineGame?: EngineGamePageInfo;
			ratingChanges?: PlayerGroup<number>;
	  }
	| undefined {
	const game = getGameByID(id); // Defined if live
	if (game !== undefined)
		return {
			game,
			state: gameutility.buildStaticGameState(game),
			moveCount: game.moves.length,
			...(game.match.engineParticipant && {
				engineGame: {
					engine: game.match.engineParticipant.engine,
					strengthLevel: game.match.engineParticipant.strengthLevel,
				},
			}),
			ratingChanges: gameutility.getRatingChanges(game),
		};

	return produceDeadStaticGameState(id); // undefined if the game doesn't exist
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

	armAutoTimeLoss(servergame);

	return data;
}

/** Arms a timer that auto-concludes the game when the player whose turn it is runs out of time. */
function armAutoTimeLoss(servergame: ServerGame): void {
	if (
		servergame.untimed ||
		gameutility.isGameOver(servergame) ||
		!moveutil.isGameResignable(servergame) ||
		servergame.clocks.colorTicking === undefined
	)
		return;

	// Cancel previous auto loss timer if it exists
	clearTimeout(servergame.match.autoTimeLossTimeoutID);
	servergame.match.autoTimeLossTimeoutID = setTimeout(
		() => onPlayerLostOnTime(servergame),
		Math.max(servergame.clocks.timeRemainAtTurnStart, 0),
	);
}

/** A player has lost on time: set the game conclusion. */
function onPlayerLostOnTime(servergame: ServerGame): void {
	const winner = typeutil.invertPlayer(servergame.whosTurn);
	onGameConclusion(servergame, { victor: winner, condition: 'time' });
}

/** If it's an engine game: Pauses the engine's clock, rewinding its turn. */
function freezeEngineClock(servergame: ServerGame): void {
	const engine = servergame.match.engineParticipant;
	if (
		engine === undefined || // Not an engine game
		servergame.untimed || // No clocks
		servergame.clocks.colorTicking === undefined || // Already frozen
		servergame.whosTurn !== engine.color || // Not the engine's turn
		gameutility.isGameOver(servergame)
	)
		return;

	servergame.clocks.currentTime[engine.color] = servergame.clocks.timeRemainAtTurnStart;
	clock.endGame(servergame);
	clearTimeout(servergame.match.autoTimeLossTimeoutID);
	liveGameValues.onEngineClockChanged(servergame);

	const clockValues = gameutility.getGameClockValues(servergame);
	gameutility.broadcastToSpectators(servergame, 'clock', clockValues);
}

/** Restarts the engine's frozen clock: a client has attached to think for it. */
function resumeEngineClock(servergame: ServerGame): void {
	const engine = servergame.match.engineParticipant;
	if (
		engine === undefined || // Not an engine game
		servergame.untimed || // No clocks
		servergame.clocks.colorTicking !== undefined || // Already ticking
		servergame.whosTurn !== engine.color || // Not the engine's turn
		gameutility.isGameOver(servergame) ||
		!moveutil.isGameResignable(servergame)
	)
		return;

	const remaining = servergame.clocks.currentTime[engine.color]!;
	clock.edit(servergame.clocks, {
		clocks: { ...servergame.clocks.currentTime },
		colorTicking: engine.color,
		timeColorTickingLosesAt: Date.now() + remaining,
	});
	armAutoTimeLoss(servergame);
	liveGameValues.onEngineClockChanged(servergame);

	const clockValues = gameutility.getGameClockValues(servergame);
	gameutility.broadcastToSpectators(servergame, 'clock', clockValues);
}

// Game Life Cycle -----------------------------------------------------------------------

/**
 * Sets the game conclusion, broadcasts it to all clients, frees -> finalizes -> evicts game.
 * Typically called for non-move-triggered conclusions (e.g. resignation, time loss...).
 */
function onGameConclusion(servergame: ServerGame, conclusion: GameConclusion): void {
	applyConclusion(servergame, conclusion);

	// The player whos turn it is gets the full game state,
	// as they may have had an in-flight move to reconcile against.
	gameutility.sendGameStateToColor(servergame, servergame.whosTurn, false);

	// All other players and spectators get the conclusion message, as they can't desync.
	const conclusionMessage = gameutility.buildGameConclusionMessage(servergame);
	const opponentColor = typeutil.invertPlayer(servergame.whosTurn);
	gameutility.sendMessageToColor(servergame.match, opponentColor, 'game', 'gameconclusion', conclusionMessage); // prettier-ignore
	gameutility.broadcastToSpectators(servergame, 'gameconclusion', conclusionMessage);

	freeGame(servergame);
}

/** Sets the game conclusion, stops clocks, resets state, records end time. */
function applyConclusion(servergame: ServerGame, conclusion: GameConclusion): void {
	servergame.gameConclusion = conclusion;

	consoleLogGameOver(servergame); // Debug

	clock.stop(servergame);

	// Cancel timers
	clearTimeout(servergame.match.autoTimeLossTimeoutID);
	cancelDisconnectTimers(servergame.match);
	closeDrawOffer(servergame.match);

	// Set end time
	if (servergame.match.timeEnded === undefined) servergame.match.timeEnded = Date.now();

	// The game now lingers for the rematch handshake. Sent from here, ahead of every
	// conclusion message, so participants hold the overlay before the button is revealed.
	gameutility.sendRematchStateToParticipants(servergame);
}

/** Game has ended: console log the result for debugging. */
function consoleLogGameOver(servergame: ServerGame): void {
	if (!PRINT_GAMES) return;

	const players: Record<string, any> = {};
	for (const [c, data] of Object.entries(servergame.match.playerData)) {
		players[c] = {
			id: data.identifier.signedIn ? data.identifier.username : data.identifier.browser_id,
			s: data.identifier.signedIn,
		};
	}
	console.log(`Game ${servergame.match.id} over & logged. Players: ${JSON.stringify(players)}. Conclusion: ${JSON.stringify(servergame.gameConclusion)}. Moves: ${servergame.moves.length}.`); // prettier-ignore
}

/**
 * The game has concluded (but not yet finalized): Release both players to join a new game,
 * finalize the game and db-log it (or set a timer to do so), further evict the game if
 * both players have left, otherwise linger in memory to host rematch handshake. Idempotent.
 */
function freeGame(servergame: ServerGame): void {
	if (servergame.match.freed) return; // Already freed
	servergame.match.freed = true;

	// Free the participants
	for (const data of Object.values(servergame.match.playerData)) {
		removeUserFromActiveGame(data.identifier, servergame.match.id);
		// Their lobby-subscribed clients may now hide their "in game" banner, if shown.
		broadcastMemberInGameStatus(data.identifier);
	}

	// Log the game into the database the instant it concludes.
	// Not final yet, as cheat reports can still update the record.
	logConcludedGame(servergame);

	if (servergame.validateMoves) {
		// Server validated every move — cheating is impossible. Lock in the result now.
		finalizeGame(servergame);
	} else {
		// No server-side validation (e.g. large variant, or custom position). Give the opponent
		// a cushion to overturn the conclusion with a cheat report before locking it in.
		servergame.match.finalizeTimeoutID = setTimeout(() => {
			finalizeGame(servergame);
			evictIfBothLeft(servergame);
		}, timeBeforeFinalizeMillis);
	}

	// If both players were already gone at conclusion (e.g. abandonment), evict right away.
	evictIfBothLeft(servergame);
}

/**
 * Logs a concluded game into the permanent database (computing rating changes for rated games)
 * and drops its live-game persistence row. Runs once, at conclusion, from {@link freeGame}.
 * A non-validated game's result may still be overturned by a cheat report until it finalizes,
 * in which case the logged record is updated in place.
 */
function logConcludedGame(servergame: ServerGame): void {
	// Mostly deprecated:
	// The statlogger logs games with at least 2 moves played (resignable) into /database/stats.json for stat collection
	executeSafely(
		() => statlogger.logGame(servergame),
		`statlogger unable to log game! ${gameutility.getSimplifiedGameString(servergame)}`,
	);

	// The gamelogger logs the completed game information into the database tables "games", "player_stats" and "ratings".
	// The ratings are calculated during the logging of the game into the database.
	try {
		const ratingdata = gamelogger.logGame(servergame);

		if (ratingdata !== undefined) {
			// Retain the rating results on the game so a client that resyncs after this (but
			// before the game is memory-evicted) still gets the deltas via its `gamestate`.
			servergame.ratingResults = buildRatingResults(ratingdata);
			// Broadcast the deltas to everyone currently connected.
			const ratingChanges = gameutility.getRatingChanges(servergame)!;
			gameutility.broadcastToEveryone(servergame, 'gameratingchange', ratingChanges);
		}
	} catch {
		// Log failure already logged.
		const message =
			"A server error occurred while logging this game. It won't be available in your game history.";
		gameutility.broadcastToParticipants(servergame, 'general', 'notifyerror', message);
	}

	// The result now lives in the permanent tables — drop the live game row so a restart doesn't
	// restore (and re-log) it. The in-memory game may still linger for the rematch handshake.
	liveGameValues.onGameLogged(servergame);
}

/** Bundles each player's rating outcome (at-game rating + delta) from the rated game's results. */
function buildRatingResults(ratingdata: RatingData): PlayerGroup<PlayerRatingResult> {
	const ratingResults: PlayerGroup<PlayerRatingResult> = {};
	for (const [playerStr, playerRating] of Object.entries(ratingdata)) {
		ratingResults[Number(playerStr) as Player] = {
			ratingAtGame: {
				value: playerRating.elo_at_game,
				confident: playerRating.rating_deviation_at_game <= UNCERTAIN_LEADERBOARD_RD,
			},
			change: playerRating.elo_change_from_game!,
		};
	}

	return ratingResults;
}

/**
 * Starts the both-disconnected timer if BOTH players are currently disconnected and it
 * isn't already running. When it fires (neither having reconnected), the game concludes
 * as a draw by abandonment, or is aborted if not yet resignable.
 * @param explicitEndTime - On restart, the persisted deadline to revive exactly. Omit to start fresh.
 */
function maybeStartBothDisconnectedTimer(servergame: ServerGame, explicitEndTime?: number): void {
	const match = servergame.match;
	if (match.bothDisconnectedTimeoutID !== undefined) return; // Already running.

	const bothDisconnected = Object.keys(match.playerData).every((c) =>
		gameutility.isColorDisconnected(match, Number(c) as Player),
	);
	if (!bothDisconnected) return;

	const endTime = explicitEndTime ?? Date.now() + timeBeforeBothDisconnectedAutoConclusionMillis;
	const remaining = endTime - Date.now();
	if (remaining <= 0) return onBothPlayersDisconnected(servergame); // Already elapsed (restart).

	match.bothDisconnectedEndTime = endTime;
	match.bothDisconnectedTimeoutID = setTimeout(
		() => onBothPlayersDisconnected(servergame),
		remaining,
	);
	liveGameValues.onBothDisconnectedTimerChanged(servergame); // Persist the state to the db
}

/**
 * Called when both players have been disconnected too long for either to claim.
 * Concludes as abandonment (an engine wins its game), or aborts if not yet resignable.
 */
function onBothPlayersDisconnected(servergame: ServerGame): void {
	servergame.match.bothDisconnectedTimeoutID = undefined;
	servergame.match.bothDisconnectedEndTime = undefined;

	if (gameutility.isGameOver(servergame)) return;

	if (!moveutil.isGameResignable(servergame)) {
		onGameConclusion(servergame, { condition: 'aborted' });
	} else {
		const engine = servergame.match.engineParticipant;
		const conclusion: GameConclusion = engine
			? { victor: engine.color, condition: 'disconnect' }
			: { victor: null, condition: 'abandonment' };
		onGameConclusion(servergame, conclusion);
	}
}

/**
 * Finalizes a concluded game: locks in its result permanently. Afterward, cheat reports are
 * no longer accepted. Game is ALREADY logged into the db at conclusion. This only flips
 * the flag, measures rating abuse, and tells clients the result can no longer change.
 * Indempotent. Finalized !== evicted: the game may linger in memory for the rematch handshake.
 */
function finalizeGame(servergame: ServerGame): void {
	if (servergame.match.finalized) return; // Already finalized
	servergame.match.finalized = true;

	// Monitor suspicion levels for all players who participated in the game.
	ratingabuse.measureRatingAbuseAfterGame(servergame);

	// Tell any connected participants/spectators the result is now locked in, so their client knows it can
	// never change — future reconnects fetch only rematch state (`subscriberematch`), not a full resync.
	gameutility.broadcastToEveryone(servergame, 'finalized', undefined);

	if (PRINT_GAMES) console.log(`Finalized game ${servergame.match.id}.`);
}

/**
 * Evicts a concluded, lingering game from memory once both players have left. Finalizes the
 * result first (in case both left before the finalize cushion elapsed), then removes it from
 * the active games list. Idempotent against a double eviction.
 * @param servergame - The game to evict
 */
function evictGame(servergame: ServerGame): void {
	if (activeGames[servergame.match.id] === undefined) return; // Already evicted.

	finalizeGame(servergame); // Lock in the result now if both players left before the finalize cushion elapsed.

	gameutility.cancelFinalizeTimer(servergame.match);
	delete activeGames[servergame.match.id];

	// Both players have already left, but a spectator (or a stray old-tab socket)
	// may still be attached — tell any remaining socket to unsubscribe.
	for (const data of Object.values(servergame.match.playerData)) {
		if (!data.socket) continue;
		sendSocketMessage(data.socket, 'game', 'unsub', undefined);
		gameutility.detatchSocketFromGame(servergame.match, data.socket);
	}
	for (const ws of servergame.spectators) {
		sendSocketMessage(ws, 'game', 'unsub', undefined);
		gameutility.detachSpectatorFromGame(servergame, ws);
	}

	if (PRINT_GAMES) console.log(`Evicted game ${servergame.match.id}.`);
}

/** Evicts a concluded lingering game if BOTH players have now left its rematch window. */
function evictIfBothLeft(servergame: ServerGame): void {
	if (!gameutility.isGameOver(servergame)) return; // Live game — the abandonment path handles it.
	const bothLeft = Object.keys(servergame.match.playerData).every((c) => {
		// Whether they left the game's rematch window: their socket
		// is detached and they aren't within the reconnection cushion.
		const data = servergame.match.playerData[Number(c) as Player]!;
		return data.socket === undefined && data.disconnect.startID === undefined;
	});
	if (bothLeft) evictGame(servergame);
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
		cancelDisconnectTimers(servergame.match);
		gameutility.cancelFinalizeTimer(servergame.match);

		// Unsubscribe all sockets (we will resub them when they reconnect)
		for (const data of Object.values(servergame.match.playerData)) {
			if (!data.socket) continue;
			gameutility.detatchSocketFromGame(servergame.match, data.socket);
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

		// Only ongoing games are ever restored: a game's live row is dropped the instant it
		// concludes (its result then lives permanently in the games table), so a concluded game
		// is never persisted to restore. Register its players in the active-players list (blocks
		// them from joining a second game, and shows their lobby in-game banner).
		for (const [strcolor, data] of Object.entries(servergame.match.playerData)) {
			// No navigate notice owed — the game predates the restart, so they already know of it.
			addUserToActiveGames(
				data.identifier,
				servergame.match.id,
				Number(strcolor) as Player,
				false,
			);
		}

		// Start timers

		// 1. Auto time loss timer (for timed games)
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

		// 2. Per-player disconnect state (claim windows).
		// An already-elapsed window simply restores as already-claimable.
		for (const [playerStr, timerState] of Object.entries(pendingTimers.disconnectTimers)) {
			const player = Number(playerStr) as Player;

			if (timerState.type === 'timer') {
				// The opponent's claim window was already open. Restore the timestamp; nothing
				// fires. If it's now in the past, the window is simply already claimable.
				const playerdata = servergame.match.playerData[player]!;
				playerdata.disconnect.startTime = undefined;
				playerdata.disconnect.timeOpponentMayClaim = Date.now() + timerState.remainingMs;
				playerdata.disconnect.voluntary = timerState.voluntary;
			} else if (timerState.type === 'cushion') {
				// Still in the 5-second cushion period
				if (timerState.remainingMs <= 0) {
					// Cushion has elapsed, open the claim window immediately and persist that state.
					startDisconnectClaimTimer(servergame, player, !timerState.voluntary);
				} else {
					// Revive the cushion timer for the remaining duration
					servergame.match.playerData[player]!.disconnect.startID = setTimeout(
						() => startDisconnectClaimTimer(servergame, player, !timerState.voluntary),
						timerState.remainingMs,
					);
					servergame.match.playerData[player]!.disconnect.startTime =
						Date.now() + timerState.remainingMs;
				}
			} else {
				// Fresh: was connected before restart, now disconnected due to server restart.
				// Give them the same 5-second cushion as a normal internet interruption.
				startDisconnectCushionTimer(servergame, player);
			}
		}

		// 3. Both-disconnected timer. If both players ended up disconnected, revive the
		//    persisted deadline (fires immediately if elapsed), or start fresh if the
		//    restart itself disconnected both (no deadline was persisted).
		maybeStartBothDisconnectedTimer(servergame, pendingTimers.bothDisconnectedEndTime);
	}
}

//--------------------------------------------------------------------------------------------------------

export {
	activeGames,
	createGame,
	onGameCreationError,
	isMemberInSomeActiveGame,
	unsubSocketParticipantFromGame,
	unsubSocketSpectatorFromGame,
	getGameBySocket,
	onGameConclusion,
	applyConclusion,
	freeGame,
	evictGame,
	pushGameClock,
	freezeEngineClock,
	resumeEngineClock,
	getGameByID,
	produceStaticGameState,
	// Shutdown Preparation & Startup Restoration
	prepGamesForShutdown,
	restoreLiveGames,
};
