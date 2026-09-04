// src/server/game/gamemanager/gameLifecycle.ts

/**
 * How a live game ends, in four stages, plus the two endings the server itself starts:
 * both players abandoning the game, and a participant deleting their account.
 *
 * 1. **Concluded** — the result is set and broadcast, and the clocks stop.
 * 2. **Freed** — both players may join a new game, and the game is logged to the database.
 * 3. **Finalized** — the result is locked in; cheat reports are no longer accepted.
 * 4. **Evicted** — both players have left the rematch window, so it drops out of memory.
 */

import type { RatingData } from '../../utility/ratingCalculation.js';
import type { GameConclusion } from '../../../shared/chess/util/typeschemas.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type { PlayerRatingResult, ServerGame } from './serverGameTypes.js';

import clock from '../../../shared/chess/logic/clock.js';
import moveutil from '../../../shared/chess/logic/moveutil.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import gamefileutility from '../../../shared/chess/logic/gamefileutility.js';

import chat from './chat.js';
import drawOffers from './drawOffers.js';
import disconnect from './disconnect.js';
import gameLogger from './gameLogger.js';
import gameSockets from './gameSockets.js';
import ratingAbuse from '../ratingabuse/ratingAbuse.js';
import activeGames from './activeGames.js';
import lobbyManager from '../seeksmanager/lobbyManager.js';
import gamesManager from '../../database/gamesManager.js';
import activePlayers from './activePlayers.js';
import liveGameValues from './liveGameValues.js';
import gameStateBuilder from './gameStateBuilder.js';
import ratingCalculation from '../../utility/ratingCalculation.js';
import chatEntriesManager from '../../database/chatEntriesManager.js';

// Constants -------------------------------------------------------------------

/**
 * The cushion time, after a non-server-validated game concludes, before its result is locked in
 * (finalized). This gives the opponent a little time to overturn the conclusion with a cheat report
 * — which updates the already-logged database record. This only delays the finalized (locked) flag.
 */
const FINALIZE_CUSHION_MS = 1000 * 8;

/** When a game nobody is connected to auto-concludes, and how often we look for one. */
const ABANDONMENT = {
	/** How long a game stays alive with nobody connected to it before it concludes. */
	TIMEOUT_MS: 1000 * 60 * 5, // 5 minutes
	/** How often to scan for them. The margin of error on {@link ABANDONMENT.TIMEOUT_MS}. */
	SWEEP_INTERVAL_MS: 1000 * 30, // 30 seconds
};

// 1. Conclusion ---------------------------------------------------------------

/**
 * Sets the game conclusion, broadcasts it to all clients, frees -> finalizes -> evicts game.
 * Typically called for non-move-triggered conclusions (e.g. resignation, time loss...).
 */
function conclude(servergame: ServerGame, conclusion: GameConclusion): void {
	applyConclusion(servergame, conclusion);

	// The player whos turn it is gets the full game state,
	// as they may have had an in-flight move to reconcile against.
	gameSockets.sendGameState(servergame, servergame.whosTurn, 'full', false);

	// All other players and spectators get the conclusion message, as they can't desync.
	const opponentColor = typeutil.invertPlayer(servergame.whosTurn);
	const opponentMessage = gameStateBuilder.buildConclusionMessage(servergame, opponentColor);
	const spectatorMessage = gameStateBuilder.buildConclusionMessage(servergame);
	gameSockets.sendToColor(servergame.match, opponentColor, 'game', 'gameconclusion', opponentMessage); // prettier-ignore
	gameSockets.broadcastToSpectators(servergame, 'gameconclusion', spectatorMessage);

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

	announceAnyoneAlreadyGone(servergame); // BEFORE the timers below, which erase what it reads.

	// Cancel timers
	clearTimeout(servergame.match.autoTimeLossTimeoutID);
	disconnect.cancelAllTimers(servergame.match);
	drawOffers.close(servergame.match);

	// Set end time
	if (servergame.match.timeEnded === undefined) servergame.match.timeEnded = Date.now();

	// The game now lingers for the rematch handshake.
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

/**
 * Writes the "Opponent left." chat notice for a player whose departure was never announced
 * — they dropped inside the reconnection cushion, which stays silent until it elapses.
 */
function announceAnyoneAlreadyGone(servergame: ServerGame): void {
	// A cheat report concludes the game a SECOND time (`timeEnded` marks the first). By then every
	// cushion below was started by leaveRematchWindow, which writes this notice itself — so skip.
	if (servergame.match.timeEnded !== undefined) return;

	for (const [color, data] of Object.entries(servergame.match.playerData)) {
		// A pending cushion implies their socket is gone: it starts only on a detach, and a
		// reconnect cancels it. Once it elapses, startClaimTimer clears this and announces them.
		if (data.disconnect.cushion === undefined) continue;
		chat.appendNotice(servergame, Number(color) as Player, 'postgame-left');
	}
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
			// Nothing evicts here: leaveRematchWindow does it as the last player leaves.
		}, FINALIZE_CUSHION_MS);
	}

	// Load-bearing: the leave path only evicts a CONCLUDED game, so departures while this one
	// was live checked nothing. Both already gone (e.g. abandonment) is evicted only here.
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
		gameSockets.broadcastToParticipants(servergame, 'general', 'toast-error', message);
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
 * no longer accepted. Game is ALREADY logged into the db at conclusion. This only flips the
 * flag, measures rating abuse, and tells clients the result can no
 * longer change. Idempotent. Finalized !== evicted: the game may linger for the rematch handshake.
 */
function finalize(servergame: ServerGame): void {
	if (servergame.match.finalized) return; // Already finalized
	servergame.match.finalized = true;

	clearTimeout(servergame.match.finalizeTimeoutID);

	// Monitor suspicion levels for all players who participated in the game.
	ratingAbuse.measureAfterGame(servergame);

	// Tell any connected participants/spectators the result is now locked in, so their client knows it can
	// never change — future reconnects fetch only rematch state (`subscriberematch`), not a full resync.
	gameSockets.broadcastToEveryone(servergame, 'finalized', undefined);

	if (activeGames.PRINT_GAMES) console.log(`Finalized game ${servergame.match.id}.`);
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

	activeGames.remove(servergame.match.id);

	// Both players have already left, but a spectator (or a stray old-tab socket)
	// may still be attached — tell any remaining socket it is detached.
	gameSockets.broadcastToEveryone(servergame, 'detached', undefined);
	gameSockets.detachEveryone(servergame);

	// An unlogged game's page 404s, so nothing can render its chat again. No earlier than here:
	// until now the game still took messages, and deleting rows renumbers what clients render by.
	try {
		if (!gamesManager.isLogged(servergame.match.id))
			chatEntriesManager.removeOfGame(servergame.match.id);
	} catch {
		// Already logged. Swallowed so it can't crash the timers eviction runs from.
	}

	if (activeGames.PRINT_GAMES) console.log(`Evicted game ${servergame.match.id}.`);
}

/** Evicts a concluded lingering game if BOTH players have now left its rematch window. */
function evictIfBothLeft(servergame: ServerGame): void {
	if (!gamefileutility.isGameOver(servergame)) return; // Live game — the abandonment path handles it.
	const bothLeft = Object.keys(servergame.match.playerData).every((c) => {
		// Whether they left the game's rematch window: their socket
		// is detached and they aren't within the reconnection cushion.
		const data = servergame.match.playerData[Number(c) as Player]!;
		return data.socket === undefined && data.disconnect.cushion === undefined;
	});
	if (bothLeft) evict(servergame);
}

// Empty-Game Abandonment ------------------------------------------------------

/** Begins auto-concluding games that nobody returns to. */
function startPeriodicAbandonmentSweep(): void {
	setInterval(() => sweepAbandonedGames(), ABANDONMENT.SWEEP_INTERVAL_MS);
}

/**
 * Stamps every live game nobody is connected to with the moment it was
 * found empty, and concludes the ones empty for longer than the timeout.
 */
function sweepAbandonedGames(): void {
	const now = Date.now();
	for (const servergame of activeGames.getAll()) {
		if (gamefileutility.isGameOver(servergame)) continue; // Concluded games leave by eviction.
		const match = servergame.match;
		const empty = Object.values(match.playerData).every((d) => d.socket === undefined);
		if (!empty) continue; // Attaching a socket clears the stamp itself, via cancelTimer.

		if (match.emptySince === undefined) {
			match.emptySince = now;
			liveGameValues.onEmptySinceChanged(servergame); // Persist the state to the db
		} else if (now - match.emptySince >= ABANDONMENT.TIMEOUT_MS) {
			concludeAbandoned(servergame); // Drops the live row; nothing left to persist.
		}
	}
}

/**
 * Concludes a game nobody returned to: a draw by abandonment (an engine
 * wins its game), or an abort if too few moves were played to resign.
 */
function concludeAbandoned(servergame: ServerGame): void {
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

// Account Deletion ------------------------------------------------------------

/**
 * Ends and finalizes the user's un-logged game, if they're in one, so nothing needing their
 * `player_stats` or `leaderboards` rows is left pending when the cascade takes them.
 * @param voluntary - Their own deletion, which resigns them. An admin's aborts instead to
 * not shuffle ratings on an ending they didn't choose.
 */
function concludeForAccountDeletion(user_id: number, voluntary: boolean): void {
	const entry = activePlayers.getEntryOfUser(user_id);
	if (entry === undefined) return; // Not in a game that has yet to be logged.
	const { gameID, role } = entry;
	const servergame = activeGames.getByID(gameID)!; // Guaranteed: the user wouldn't have an entry if the game was freed/evicted.

	// Ahead of the conclusion, so it lands in the log the conclusion's states carry.
	chat.appendNotice(servergame, role, voluntary ? 'account-closed' : 'account-terminated');

	const conclusion: GameConclusion =
		voluntary && moveutil.isGameResignable(servergame)
			? { victor: typeutil.invertPlayer(role), condition: 'resignation' }
			: { condition: 'aborted' };
	conclude(servergame, conclusion);
	// Lock the result in NOW to not risk a cheat report not just overturning
	// it, but throwing when reversing `player_stats` for both players.
	finalize(servergame);
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
	// 4. Eviction
	evict,
	evictIfBothLeft,
	// Empty-Game Abandonment
	startPeriodicAbandonmentSweep,
	// Account Deletion
	concludeForAccountDeletion,
};
