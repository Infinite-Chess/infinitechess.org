// src/server/game/gamemanager/gameLifecycle.ts

/**
 * How a live game ends, in four stages:
 *
 * 1. **Concluded** — the result is set and broadcast, and the clocks stop.
 * 2. **Freed** — both players may join a new game, and the game is logged to the database.
 * 3. **Finalized** — the result is locked in; cheat reports are no longer accepted.
 * 4. **Evicted** — both players have left the rematch window, so it drops out of memory.
 */

import type { RatingData } from '../../utility/ratingCalculation.js';
import type { GameConclusion } from '../../../shared/chess/util/typeschemas.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type { MatchInfo, PlayerRatingResult, ServerGame } from './serverGameTypes.js';

import clock from '../../../shared/chess/logic/clock.js';
import moveutil from '../../../shared/chess/logic/moveutil.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import gamefileutility from '../../../shared/chess/logic/gamefileutility.js';

import drawOffers from './drawOffers.js';
import disconnect from './disconnect.js';
import gameLogger from './gameLogger.js';
import gameSockets from './gameSockets.js';
import gameUtility from './gameUtility.js';
import ratingAbuse from '../ratingabuse/ratingAbuse.js';
import activeGames from './activeGames.js';
import lobbyManager from '../seeksmanager/lobbyManager.js';
import activePlayers from './activePlayers.js';
import liveGameValues from './liveGameValues.js';
import gameStateBuilder from './gameStateBuilder.js';
import ratingCalculation from '../../utility/ratingCalculation.js';

// Constants -------------------------------------------------------------------

/**
 * The cushion time, after a non-server-validated game concludes, before its result is locked in
 * (finalized). This gives the opponent a little time to overturn the conclusion with a cheat report
 * — which updates the already-logged database record. This only delays the finalized (locked) flag.
 */
const FINALIZE_CUSHION_MS = 1000 * 8;

/**
 * How long to keep a game alive when BOTH players are disconnected
 * before auto-concluding by abandonment/abort if neither reconnects.
 */
const BOTH_DISCONNECTED_TIMEOUT_MS = 1000 * 60 * 5; // 5 minutes

// 1. Conclusion ---------------------------------------------------------------

/**
 * Sets the game conclusion, broadcasts it to all clients, frees -> finalizes -> evicts game.
 * Typically called for non-move-triggered conclusions (e.g. resignation, time loss...).
 */
function conclude(servergame: ServerGame, conclusion: GameConclusion): void {
	applyConclusion(servergame, conclusion);

	// The player whos turn it is gets the full game state,
	// as they may have had an in-flight move to reconcile against.
	gameSockets.sendGameState(servergame, servergame.whosTurn, false);

	// All other players and spectators get the conclusion message, as they can't desync.
	const conclusionMessage = gameStateBuilder.buildConclusionMessage(servergame);
	const opponentColor = typeutil.invertPlayer(servergame.whosTurn);
	gameSockets.sendToColor(servergame.match, opponentColor, 'game', 'gameconclusion', conclusionMessage); // prettier-ignore
	gameSockets.broadcastToSpectators(servergame, 'gameconclusion', conclusionMessage);

	free(servergame);
}

/** A player has lost on time: set the game conclusion. */
function concludeOnTime(servergame: ServerGame): void {
	const winner = typeutil.invertPlayer(servergame.whosTurn);
	conclude(servergame, { victor: winner, condition: 'time' });
}

/** Sets the game conclusion, stops clocks, resets state, records end time. */
function applyConclusion(servergame: ServerGame, conclusion: GameConclusion): void {
	servergame.gameConclusion = conclusion;

	consoleLogGameOver(servergame); // Debug

	clock.stop(servergame);

	// Cancel timers
	clearTimeout(servergame.match.autoTimeLossTimeoutID);
	disconnect.cancelAllTimers(servergame.match);
	drawOffers.close(servergame.match);

	// Set end time
	if (servergame.match.timeEnded === undefined) servergame.match.timeEnded = Date.now();

	// The game now lingers for the rematch handshake. Sent from here, ahead of every
	// conclusion message, so participants hold the overlay before the button is revealed.
	gameSockets.sendRematchState(servergame);
}

/** [DEBUG] Game has ended: console log the result. */
function consoleLogGameOver(servergame: ServerGame): void {
	if (!activeGames.PRINT_GAMES) return;

	const players: Record<string, { id: string | number; s: boolean }> = {};
	for (const [c, data] of Object.entries(servergame.match.playerData)) {
		players[c] = {
			id: data.identifier.signedIn ? data.identifier.username : data.identifier.browser_id,
			s: data.identifier.signedIn,
		};
	}
	console.log(`Game ${servergame.match.id} over & logged. Players: ${JSON.stringify(players)}. Conclusion: ${JSON.stringify(servergame.gameConclusion)}. Moves: ${servergame.moves.length}.`); // prettier-ignore
}

// 2. Freeing ------------------------------------------------------------------

/**
 * The game has concluded (but not yet finalized): Release both players to join a new game,
 * finalize the game and db-log it (or set a timer to do so), further evict the game if
 * both players have left, otherwise linger in memory to host rematch handshake. Idempotent.
 */
function free(servergame: ServerGame): void {
	if (servergame.match.freed) return; // Already freed
	servergame.match.freed = true;

	// Free the participants
	for (const data of Object.values(servergame.match.playerData)) {
		activePlayers.remove(data.identifier, servergame.match.id);
		// Their lobby-subscribed clients may now hide their "in game" banner, if shown.
		lobbyManager.broadcastMemberInGameStatus(data.identifier);
	}

	// Log the game into the database the instant it concludes.
	// Not final yet, as cheat reports can still update the record.
	logConcludedGame(servergame);

	if (servergame.validateMoves) {
		// Server validated every move — cheating is impossible. Lock in the result now.
		finalize(servergame);
	} else {
		// No server-side validation (e.g. large variant, or custom position). Give the opponent
		// a cushion to overturn the conclusion with a cheat report before locking it in.
		servergame.match.finalizeTimeoutID = setTimeout(() => {
			finalize(servergame);
			evictIfBothLeft(servergame);
		}, FINALIZE_CUSHION_MS);
	}

	// If both players were already gone at conclusion (e.g. abandonment), evict right away.
	evictIfBothLeft(servergame);
}

/**
 * Logs a concluded game into the permanent database (computing rating changes for rated games)
 * and drops its live-game persistence row. Runs once, at conclusion, from {@link free}.
 * A non-validated game's result may still be overturned by a cheat report until it finalizes,
 * in which case the logged record is updated in place.
 */
function logConcludedGame(servergame: ServerGame): void {
	try {
		// The ratings are calculated during the logging of the game into the database.
		const ratingdata = gameLogger.log(servergame); // Also drops its live-game row.

		if (ratingdata !== undefined) {
			// Retain the rating results on the game so a client that resyncs after this (but
			// before the game is memory-evicted) still gets the deltas via its `gamestate`.
			servergame.ratingResults = buildRatingResults(ratingdata);
			// Broadcast the deltas to everyone currently connected.
			const ratingChanges = gameStateBuilder.getRatingChanges(servergame)!;
			gameSockets.broadcastToEveryone(servergame, 'gameratingchange', ratingChanges);
		}
	} catch {
		// Log failure already logged. The live game row is dropped either way.
		const message =
			"A server error occurred while logging this game. It won't be available in your game history.";
		gameSockets.broadcastToParticipants(servergame, 'general', 'notifyerror', message);
	}
}

/** Bundles each player's rating outcome (at-game rating + delta) from the rated game's results. */
function buildRatingResults(ratingdata: RatingData): PlayerGroup<PlayerRatingResult> {
	const ratingResults: PlayerGroup<PlayerRatingResult> = {};
	for (const [playerStr, playerRating] of Object.entries(ratingdata)) {
		ratingResults[Number(playerStr) as Player] = {
			ratingAtGame: {
				value: playerRating.elo_at_game,
				confident: ratingCalculation.isRatingConfident(
					playerRating.rating_deviation_at_game,
				),
			},
			change: playerRating.elo_change_from_game!,
		};
	}

	return ratingResults;
}

// 3. Finalizing ---------------------------------------------------------------

/**
 * Finalizes a concluded game: locks in its result permanently. Afterward, cheat reports are
 * no longer accepted. Game is ALREADY logged into the db at conclusion. This only flips
 * the flag, measures rating abuse, and tells clients the result can no longer change.
 * Idempotent. Finalized !== evicted: the game may linger in memory for the rematch handshake.
 */
function finalize(servergame: ServerGame): void {
	if (servergame.match.finalized) return; // Already finalized
	servergame.match.finalized = true;

	// Monitor suspicion levels for all players who participated in the game.
	ratingAbuse.measureAfterGame(servergame);

	// Tell any connected participants/spectators the result is now locked in, so their client knows it can
	// never change — future reconnects fetch only rematch state (`subscriberematch`), not a full resync.
	gameSockets.broadcastToEveryone(servergame, 'finalized', undefined);

	if (activeGames.PRINT_GAMES) console.log(`Finalized game ${servergame.match.id}.`);
}

/**
 * Cancel the timer that finalizes a concluded game, if it is currently running.
 */
function cancelFinalizeTimer(match: MatchInfo): void {
	clearTimeout(match.finalizeTimeoutID);
}

// 4. Eviction -----------------------------------------------------------------

/**
 * Evicts a concluded, lingering game from memory once both players have left. Finalizes the
 * result first (in case both left before the finalize cushion elapsed), then removes it from
 * the active games list. Idempotent against a double eviction.
 */
function evict(servergame: ServerGame): void {
	if (activeGames.getByID(servergame.match.id) === undefined) return; // Already evicted.

	finalize(servergame); // Lock in the result now if both players left before the finalize cushion elapsed.

	cancelFinalizeTimer(servergame.match);
	activeGames.remove(servergame.match.id);

	// Both players have already left, but a spectator (or a stray old-tab socket)
	// may still be attached — tell any remaining socket to unsubscribe.
	gameSockets.broadcastToEveryone(servergame, 'unsub', undefined);
	for (const data of Object.values(servergame.match.playerData)) {
		if (data.socket) gameSockets.detachParticipant(servergame.match, data.socket);
	}
	for (const ws of servergame.spectators) gameSockets.detachSpectator(servergame, ws);

	if (activeGames.PRINT_GAMES) console.log(`Evicted game ${servergame.match.id}.`);
}

/** Evicts a concluded lingering game if BOTH players have now left its rematch window. */
function evictIfBothLeft(servergame: ServerGame): void {
	if (!gamefileutility.isGameOver(servergame)) return; // Live game — the abandonment path handles it.
	const bothLeft = Object.keys(servergame.match.playerData).every((c) => {
		// Whether they left the game's rematch window: their socket
		// is detached and they aren't within the reconnection cushion.
		const data = servergame.match.playerData[Number(c) as Player]!;
		return data.socket === undefined && data.disconnect.startID === undefined;
	});
	if (bothLeft) evict(servergame);
}

// Both-Disconnected Abandonment -----------------------------------------------

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
		gameUtility.isColorDisconnected(match, Number(c) as Player),
	);
	if (!bothDisconnected) return;

	const endTime = explicitEndTime ?? Date.now() + BOTH_DISCONNECTED_TIMEOUT_MS;
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

	if (gamefileutility.isGameOver(servergame)) return;

	if (!moveutil.isGameResignable(servergame)) {
		conclude(servergame, { condition: 'aborted' });
	} else {
		const engine = servergame.match.engineParticipant;
		const conclusion: GameConclusion = engine
			? { victor: engine.color, condition: 'disconnect' }
			: { victor: null, condition: 'abandonment' };
		conclude(servergame, conclusion);
	}
}

// Exports ---------------------------------------------------------------------

export default {
	// 1. Conclusion
	conclude,
	concludeOnTime,
	applyConclusion,
	// 2. Freeing
	free,
	// 3. Finalizing
	finalize,
	cancelFinalizeTimer,
	// 4. Eviction
	evict,
	evictIfBothLeft,
	// Both-Disconnected Abandonment
	maybeStartBothDisconnectedTimer,
};
