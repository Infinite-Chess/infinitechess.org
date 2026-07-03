// src/server/game/gamemanager/gamemanager.ts

/**
 * The script keeps track of all our active online games.
 */

import type { AuthMemberInfo } from '../../types.js';
import type { GameConclusion } from '../../../shared/chess/util/winconutil.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type { GameSetup, ServerGame } from './gameutility.js';
import type { GameConclusionMessage, StaticGameState } from '../../../shared/types.js';

import clock from '../../../shared/chess/logic/clock.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import winconutil from '../../../shared/chess/util/winconutil.js';
import variantcache from '../../../shared/chess/variants/variantcache.js';
import gamefile, { LoadedVariant } from '../../../shared/chess/logic/gamefile.js';
import { doesVariantSupportServerValidation } from '../../../shared/chess/variants/servervalidation.js';

import statlogger from '../statlogger.js';
import gamelogger from './gamelogger.js';
import gameutility from './gameutility.js';
import ratingabuse from './ratingabuse.js';
import liveGameValues from './liveGameValues.js';
import { memberInfoEq } from '../../utility/memberInfoUtil.js';
import { executeSafely } from '../../utility/errorGuard.js';
import { closeDrawOffer } from './drawoffers.js';
import { genUniqueGameID } from '../../database/gamesManager.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { restoreAllLiveGames } from './liveGameRestore.js';
import { timeBeforeFinalizeMillis } from './gameutility.js';
import { produceDeadStaticGameState } from './deadgamestate.js';
import { broadcastMemberInGameStatus } from '../seeksmanager/lobbymanager.js';
import {
	addUserToActiveGames,
	removeUserFromActiveGame,
	getIDOfGamePlayerIsIn,
} from './activeplayers.js';
import {
	setOpponentClaimWindow,
	cancelDisconnectTimers,
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
 * Creates and persists the `ServerGame`, then signals each connected player's lobby
 * client to navigate to the game page (where they re-subscribe to the live game),
 * arming a silent disconnect cushion in the meantime.
 * @param setup - The variant, time control, and rated flag of the game to start.
 * @param assignments - The color each player has, and their socket if connected.
 * @returns The id of the newly created game.
 * @throws If a database error occurs (from {@link liveGameValues.onGameCreated}).
 */
function createGame(
	setup: GameSetup,
	assignments: PlayerGroup<{ identifier: AuthMemberInfo; socket?: CustomWebSocket }>,
): number {
	if (setup.variant.kind !== 'preset') {
		const errText = 'Custom variant game starting is not yet implemented.';
		console.error(errText);
		throw new Error(errText);
	}

	const variantCode = setup.variant.code;

	// Joining a new game counts as leaving any concluded game still lingering for a rematch.
	for (const { identifier } of Object.values(assignments)) forceLeaveLingeringGame(identifier);

	const gameID = issueUniqueGameId();
	const dateTimestamp = Date.now();
	const variant: LoadedVariant = {
		code: variantCode,
		mod: variantcache.getModule(variantCode),
		dateTimestamp,
	};
	const gameWithRules = gamefile.initGame(setup.time, dateTimestamp, variant);
	const match = gameutility.initMatch(setup, gameID, assignments);
	const validateMoves = doesVariantSupportServerValidation(variant);

	const servergame: ServerGame = gameutility.initServerGame(
		gameWithRules,
		match,
		validateMoves,
		variant,
	);
	for (const data of Object.values(match.playerData)) {
		addUserToActiveGames(data.identifier, servergame.match.id);
	}

	activeGames[servergame.match.id] = servergame;

	// Persist the new game to the database for restoration after server restart.
	// Must precede the per-player cushion below, which persists disconnect
	// state and therefore requires the game row to already exist.
	liveGameValues.onGameCreated(servergame);

	for (const [strcolor, { identifier }] of Object.entries(assignments)) {
		const player = Number(strcolor) as Player;
		// Tell ALL of this member's lobby tabs they're now in a game; the tab that
		// initiated navigates to the game page (re-subscribing to the live game),
		// while any other open lobby tabs show the in-game banner.
		broadcastMemberInGameStatus(identifier);
		// Arm the silent disconnect cushion up front: the re-subscribe cancels it,
		// while a no-show (e.g. tab close) opens the opponent's claim window after the cushion.
		startDisconnectCushionTimerAndPersist(servergame, player);
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
 * their opponent's claim window is opened.
 * Also persists the cushion state to the database.
 * @param servergame - The game
 * @param color - The player who disconnected
 */
function startDisconnectCushionTimerAndPersist(servergame: ServerGame, color: Player): void {
	servergame.match.playerData[color]!.disconnect.startID = setTimeout(
		() => setClaimWindowAndPersist(servergame, color, true),
		timeToGiveDisconnectedBeforeOpeningClaimWindowMillis,
	);
	servergame.match.playerData[color]!.disconnect.startTime =
		Date.now() + timeToGiveDisconnectedBeforeOpeningClaimWindowMillis;
	liveGameValues.onPlayerDisconnected(servergame, color);
}

/** Records the opponent's claim window against a disconnected player and persists the new state. */
function setClaimWindowAndPersist(
	servergame: ServerGame,
	color: Player,
	closureNotByChoice: boolean,
): void {
	setOpponentClaimWindow(servergame, color, closureNotByChoice);
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
	if (gameID === undefined) {
		// In the past, this appeared in non-instantly-deleted games when both players clicked
		// "Main Menu" around the same time; the second click triggered early game deletion,
		// clearing subscriptions.game before the trailing unsub message was processed.
		logEventsAndPrint(
			"Cannot unsub client from game when it's not subscribed to one.",
			'errLog',
		);
		return;
	}

	const servergame = getGameByID(gameID)!;

	const color = gameutility.getSocketRoleInGame(servergame, ws)!;
	gameutility.unsubClientFromGame(servergame.match, ws); // Don't tell the client to unsub because their socket is CLOSING

	// Post-conclusion the game only lingers for the rematch handshake — no claim window applies.
	if (gameutility.isGameOver(servergame)) {
		onPostGameLeave(servergame, color, !unsubNotByChoice);
		return;
	}

	// Let their OPPONENT know they've disconnected though...

	if (unsubNotByChoice) {
		// Internet interruption. Give them 5 seconds before opening the opponent's claim window.
		startDisconnectCushionTimerAndPersist(servergame, color);
	} else {
		// Closed tab manually. Immediately open the opponent's claim window.
		setClaimWindowAndPersist(servergame, color, unsubNotByChoice);
	}

	// If this leaves BOTH players disconnected, start the timer that concludes the
	// game if neither returns (no one is present to claim victory/draw).
	maybeStartBothDisconnectedTimer(servergame);
}

/**
 * Removes a spectator's websocket from the game it's spectating (explicit unsub or socket close).
 * Unlike participants, spectators have no disconnect timers or opponent to notify.
 */
function unsubSpectatorFromGameBySocket(ws: CustomWebSocket): void {
	const gameID = ws.metadata.subscriptions.spectating?.id;
	if (gameID === undefined) return; // Not spectating any game
	delete ws.metadata.subscriptions.spectating;
	getGameByID(gameID)!.spectators.delete(ws);
}

/** Returns the live game with the specified id, if it exists. */
function getGameByID(id: number): ServerGame | undefined {
	return activeGames[id];
}

/**
 * Resolves a game id's {@link StaticGameState} — live (in memory) or dead (in the DB) —
 * plus its liveness, for the SSR game page. `undefined` if no such game.
 * @throws If a database error occurs.
 */
function produceStaticGameState(
	id: number,
): { state: StaticGameState; game?: ServerGame } | undefined {
	const game = getGameByID(id); // Defined if live
	if (game !== undefined) return { game, state: gameutility.buildStaticGameState(game) };

	const deadState = produceDeadStaticGameState(id);
	if (deadState === undefined) return undefined; // Game doesn't exist
	return { state: deadState };
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
	servergame.gameConclusion = conclusion;

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
	cancelDisconnectTimers(servergame.match);
	closeDrawOffer(servergame.match);

	// The ending time of the game is set, if it is undefined
	if (servergame.match.timeEnded === undefined) servergame.match.timeEnded = Date.now();

	// Persist the final game state to the database.
	liveGameValues.onGameConcluded(servergame);
}

/**
 * Executes game teardown: broadcasts the final game state to clients if the conclusion
 * was not move-triggered, then locks in (permanently logs) the result — immediately for
 * server-validated games, or after a cheat-report cushion otherwise. The game then LINGERS
 * in memory to host the rematch handshake until both players leave (see {@link evictGame}).
 * Must be called after {@link finalizeConclusion}.
 * @param servergame - The game (basegame.gameConclusion must already be set)
 */
function teardownGame(servergame: ServerGame): void {
	const conclusion = servergame.gameConclusion!;
	console.log('Tear down');

	// The game is over — free both players to join a new game (even in another tab), even
	// though it may still linger in memory for the rematch handshake (and, for non-validated
	// games, hasn't been finalized yet). Reconnecting to this game is done by id via 'subscribe',
	// so it doesn't rely on this list.
	for (const data of Object.values(servergame.match.playerData)) {
		removeUserFromActiveGame(data.identifier, servergame.match.id);
		broadcastMemberInGameStatus(data.identifier); // Their clients may now hide their lobby in-game banner, if shown
	}

	// Move-triggered conclusions already send the gameConclusion in the move response.
	if (!winconutil.isConclusionMoveTriggered(conclusion.condition)) {
		gameutility.broadcastParticipantGameUpdate(servergame);
		// Spectators are read-only and can't desync (except for hard socket close), so they
		// only need the conclusion plus the frozen final clocks — not a full-state re-send.
		const conclusionMessage: GameConclusionMessage = { gameConclusion: conclusion };
		if (!servergame.untimed) {
			conclusionMessage.clockValues = gameutility.getGameClockValues(servergame);
		}
		gameutility.broadcastToSpectators(servergame, 'gameconclusion', conclusionMessage);
	}

	gameutility.cancelFinalizeTimer(servergame.match); // Cancel first, in case a hacking report just re-concluded.
	if (servergame.validateMoves) {
		// Server validated every move — cheating is impossible. Lock in the result now.
		finalizeGame(servergame);
	} else {
		// No server-side validation (e.g. large variant, or pasted position).
		// Give the opponent time to oppose the conclusion with a cheat report first.
		servergame.match.finalizeTimeoutID = setTimeout(() => {
			finalizeGame(servergame);
			evictIfBothLeft(servergame);
		}, timeBeforeFinalizeMillis);
	}

	// If both players were already gone at conclusion (e.g. abandonment), evict right away.
	evictIfBothLeft(servergame);
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
	liveGameValues.onBothDisconnectedTimerChanged(servergame);
}

/**
 * Called when both players have been disconnected too long for either to claim.
 * Concludes the game as a draw by abandonment, or aborts it if not yet resignable.
 */
function onBothPlayersDisconnected(servergame: ServerGame): void {
	servergame.match.bothDisconnectedTimeoutID = undefined;
	servergame.match.bothDisconnectedEndTime = undefined;

	if (gameutility.isGameOver(servergame)) return;

	if (gameutility.isGameResignable(servergame)) {
		setGameConclusion(servergame, { victor: null, condition: 'abandonment' });
	} else {
		setGameConclusion(servergame, { condition: 'aborted' });
	}
}

/**
 * Finalizes a concluded game: locks in its result permanently by logging it to the database
 * (computing + committing rating changes) and recording suspicion levels. Idempotent —
 * subsequent calls no-op once {@link MatchInfo.finalized} is set.
 *
 * After this, the game state can no longer change (cheat reports are rejected), but the
 * game may still LINGER in memory to host the rematch handshake until both players leave.
 * Note: players are freed to join a new game at conclusion ({@link teardownGame}), not here —
 * for non-validated games this runs a cheat-report cushion later.
 * @param servergame - The concluded game
 */
function finalizeGame(servergame: ServerGame): void {
	if (servergame.match.finalized) return; // Already finalized.
	servergame.match.finalized = true;

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
			gameutility.sendRatingChangeToAllPlayers(servergame, ratingdata);
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

	// Monitor suspicion levels for all players who participated in the game
	// Doesn't have to be in the same transaction as the game logging,
	// as the rating abuse table's data does not reference other tables.
	ratingabuse.measureRatingAbuseAfterGame(servergame);

	// The result now lives in the permanent tables — drop the live game row so a restart
	// doesn't restore (and re-log) it. The in-memory game may still linger for the rematch.
	liveGameValues.onGameFinalized(servergame);

	// Tell any connected participants the result is now locked in, so their client knows it can
	// never change — future reconnects fetch only rematch state (`resyncrematch`), not a full resync.
	gameutility.broadcastToParticipants(servergame, 'finalized', undefined);

	if (PRINT_GAMES) console.log(`Logged game ${servergame.match.id}.`);
}

/**
 * Evicts a concluded, lingering game from memory once both players have left. Finalizes the
 * result first (in case both left before it was finalized) — which also removes it from the
 * persistence database — then removes it from the active games list. Idempotent against a
 * double eviction.
 * @param servergame - The game to evict
 */
function evictGame(servergame: ServerGame): void {
	if (activeGames[servergame.match.id] === undefined) return; // Already evicted.

	finalizeGame(servergame); // Finalizes the result (if both left before it was finalized) and removes the persisted row.

	gameutility.cancelFinalizeTimer(servergame.match);
	delete activeGames[servergame.match.id];

	// Both players have already left, but a spectator (or a stray old-tab socket) may still
	// be attached — tell any remaining socket to unsubscribe.
	for (const data of Object.values(servergame.match.playerData)) {
		if (!data.socket) continue;
		sendSocketMessage(data.socket, 'game', 'unsub');
		gameutility.unsubClientFromGame(servergame.match, data.socket);
	}
	for (const ws of servergame.spectators) {
		sendSocketMessage(ws, 'game', 'unsub');
		delete ws.metadata.subscriptions.spectating;
	}
	servergame.spectators.clear();

	if (PRINT_GAMES) console.log(`Evicted game ${servergame.match.id}.`);
}

/**
 * Returns true if a player has left a concluded game's rematch window: their socket is
 * detached and they aren't within the reconnection cushion (so they can't return).
 */
function hasPlayerLeftPostGame(servergame: ServerGame, color: Player): boolean {
	const data = servergame.match.playerData[color]!;
	if (data.socket !== undefined) return false; // Still connected.
	if (data.disconnect.startID !== undefined) return false; // In the reconnection cushion.
	return true;
}

/** Evicts a concluded lingering game if BOTH players have now left its rematch window. */
function evictIfBothLeft(servergame: ServerGame): void {
	if (!gameutility.isGameOver(servergame)) return; // Live game — the abandonment path handles it.
	const bothLeft = Object.keys(servergame.match.playerData).every((c) =>
		hasPlayerLeftPostGame(servergame, Number(c) as Player),
	);
	if (bothLeft) evictGame(servergame);
}

/**
 * Handles a player leaving a concluded game's rematch window (socket close, or joining
 * another game). Withdraws their rematch offer and tells the opponent, then either evicts
 * the game (both now gone) or, for a network interruption, waits out the reconnection
 * cushion first so a brief blip doesn't end the window.
 * @param byChoice - True if they left deliberately (tab close / joined elsewhere); false for a network drop.
 */
function onPostGameLeave(servergame: ServerGame, color: Player, byChoice: boolean): void {
	const match = servergame.match;

	// Withdraw their rematch offer, if any, and tell the opponent they've left (disable + unglow).
	match.rematchOffers.delete(color);
	gameutility.sendMessageToSocketOfColor(match, typeutil.invertPlayer(color), 'game', 'opponentleft'); // prettier-ignore

	const playerdata = match.playerData[color]!;
	clearTimeout(playerdata.disconnect.startID);

	if (byChoice) {
		// Gone immediately.
		playerdata.disconnect.startID = undefined;
		playerdata.disconnect.startTime = undefined;
		evictIfBothLeft(servergame);
	} else {
		// Network drop — give them the reconnection cushion before considering them gone.
		playerdata.disconnect.startID = setTimeout(() => {
			playerdata.disconnect.startID = undefined;
			playerdata.disconnect.startTime = undefined;
			evictIfBothLeft(servergame);
		}, timeToGiveDisconnectedBeforeOpeningClaimWindowMillis);
		playerdata.disconnect.startTime =
			Date.now() + timeToGiveDisconnectedBeforeOpeningClaimWindowMillis;
	}
}

/**
 * Creates a rematch of a concluded game: same variant/time/rated, players swapped to the
 * opposite colors. Tears down the old game, starts the fresh one, and navigates both still-
 * connected players to it. Silently aborts if either player is already in another game.
 * @param oldGame - The concluded game both players have offered a rematch of.
 */
function createRematchGame(oldGame: ServerGame): void {
	const oldMatch = oldGame.match;

	// A rematch can't start if either player has meanwhile joined a DIFFERENT game. A concluded
	// game frees its players from the active-players list, so a lingering participant reads as
	// `undefined` here; only a genuine new game they've joined (a different id) blocks the rematch.
	for (const data of Object.values(oldMatch.playerData)) {
		const inGameID = getIDOfGamePlayerIsIn(data.identifier);
		if (inGameID !== undefined && inGameID !== oldMatch.id) return; // Buttons just stay disabled.
	}

	// Capture identities (swapped colors) and connected sockets before tearing down the old game.
	const swapped: PlayerGroup<{ identifier: AuthMemberInfo }> = {};
	const socketsToNavigate: CustomWebSocket[] = [];
	for (const [c, data] of Object.entries(oldMatch.playerData)) {
		swapped[typeutil.invertPlayer(Number(c) as Player)] = { identifier: data.identifier };
		if (data.socket) socketsToNavigate.push(data.socket);
	}

	const setup: GameSetup = {
		variant: { kind: 'preset', code: oldMatch.variant },
		time: oldMatch.clock,
		rated: oldMatch.rated,
	};

	evictGame(oldGame); // Removes the old game from memory (and unsubscribes its sockets).
	const newGameID = createGame(setup, swapped);

	// Navigate both still-connected players to the new game (client converts the id to its URL).
	for (const socket of socketsToNavigate) sendSocketMessage(socket, 'game', 'ingame', newGameID);
}

/**
 * When a player joins a new game, force them to leave any concluded game still lingering
 * for a rematch (a player can only be in one game). Detaches their old-tab socket and runs
 * the standard post-game leave, so their old opponent's rematch option is withdrawn.
 */
function forceLeaveLingeringGame(identifier: AuthMemberInfo): void {
	for (const servergame of Object.values(activeGames)) {
		if (!gameutility.isGameOver(servergame)) continue; // Only concluded games linger for a rematch.
		for (const [c, data] of Object.entries(servergame.match.playerData)) {
			if (!memberInfoEq(data.identifier, identifier)) continue;
			if (data.socket) {
				sendSocketMessage(data.socket, 'game', 'leavegame'); // Unload the old game on their old tab.
				gameutility.unsubClientFromGame(servergame.match, data.socket);
			}
			onPostGameLeave(servergame, Number(c) as Player, true);
			return; // A player can only be a participant of one lingering game.
		}
	}
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

		// Start timers

		// 1. Concluded games are always not-yet-finalized here (a finalized game's row is removed
		//    when it's logged, so it's never restored). Resume the finalize deadline. They are NOT
		//    registered in the active-players list — a concluded game no longer occupies its
		//    players (they reconnect by id via 'subscribe' regardless).
		if (gameutility.isGameOver(servergame)) {
			if (pendingTimers.finalizeTimerMs !== undefined && pendingTimers.finalizeTimerMs > 0) {
				servergame.match.finalizeTimeoutID = setTimeout(() => {
					finalizeGame(servergame);
					evictIfBothLeft(servergame);
				}, pendingTimers.finalizeTimerMs);
			} else {
				// Deadline already elapsed (or none persisted): finalize now, evicting if both are gone.
				finalizeGame(servergame);
				evictIfBothLeft(servergame);
			}
			continue; // Skip the live-game timers below.
		}

		// Ongoing game: register its players in the active-players list (blocks them from
		// joining a second game, and shows their lobby in-game banner).
		for (const data of Object.values(servergame.match.playerData)) {
			addUserToActiveGames(data.identifier, servergame.match.id);
		}

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

		// 3. Per-player disconnect state (claim windows).
		// An already-elapsed window simply restores as already-claimable.
		for (const [playerStr, timerState] of Object.entries(pendingTimers.disconnectTimers)) {
			const player = Number(playerStr) as Player;

			if (timerState.type === 'timer') {
				// The opponent's claim window was already open. Restore the timestamp; nothing
				// fires. If it's now in the past, the window is simply already claimable.
				const playerdata = servergame.match.playerData[player]!;
				playerdata.disconnect.startTime = undefined;
				playerdata.disconnect.timeOpponentMayClaim = Date.now() + timerState.remainingMs;
				playerdata.disconnect.wasByChoice = timerState.byChoice;
			} else if (timerState.type === 'cushion') {
				// Still in the 5-second cushion period
				if (timerState.remainingMs <= 0) {
					// Cushion has elapsed, open the claim window immediately and persist that state.
					setClaimWindowAndPersist(servergame, player, !timerState.byChoice);
				} else {
					// Revive the cushion timer for the remaining duration
					servergame.match.playerData[player]!.disconnect.startID = setTimeout(
						() => setClaimWindowAndPersist(servergame, player, !timerState.byChoice),
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

		// 4. Both-disconnected timer. If both players ended up disconnected, revive the
		//    persisted deadline (fires immediately if elapsed), or start fresh if the
		//    restart itself disconnected both (no deadline was persisted).
		maybeStartBothDisconnectedTimer(servergame, pendingTimers.bothDisconnectedEndTime);
	}
}

//--------------------------------------------------------------------------------------------------------

export {
	activeGames,
	createGame,
	isMemberInSomeActiveGame,
	unsubClientFromGameBySocket,
	unsubSpectatorFromGameBySocket,
	getGameBySocket,
	createRematchGame,
	setGameConclusion,
	finalizeConclusion,
	teardownGame,
	pushGameClock,
	getGameByID,
	produceStaticGameState,
	// Shutdown Preparation & Startup Restoration
	prepGamesForShutdown,
	restoreLiveGames,
};
