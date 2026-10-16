// src/server/game/featured/featuredGames.ts

/**
 * The live games featured beneath the lobby, the same for every viewer: which games hold the
 * slots, kept current as games are created, played and concluded, and broadcast to the lobby.
 *
 * `featuredSelection.ts` decides which games those are. This module holds them and tells the lobby.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { Contender } from './featuredSelection.js';
import type { ServerGame } from '../gamemanager/serverGameTypes.js';
import type { FeaturedGame, OpponentsMoveMessage } from '../../../shared/transport/clientbound.js';

import gamefileutility from '../../../shared/chess/logic/gamefileutility.js';

import gameUtility from '../gamemanager/gameUtility.js';
import activeGames from '../gamemanager/activeGames.js';
import gameStateBuilder from '../gamemanager/gameStateBuilder.js';
import lobbySubscribers from '../seeksmanager/lobbySubscribers.js';
import featuredSelection from './featuredSelection.js';

// Constants -------------------------------------------------------------------

/** How often the slots are re-decided, for the changes only time brings: staleness, and a finished game's release. */
const RESELECT_INTERVAL_MS = 1000;

// State -----------------------------------------------------------------------

/**
 * The featured games, left to right. Held by reference: a finished game may be evicted
 * from memory during its hold, and must still show until it's released.
 */
let slots: ServerGame[] = [];

// Events ----------------------------------------------------------------------

/** Starts re-deciding the slots on a timer. */
function start(): void {
	setInterval(() => reselect(), RESELECT_INTERVAL_MS);
}

/**
 * A game was just created. A rematch takes its predecessor's slot at once, even mid-hold.
 * @param rematchOf - The concluded game this one is a rematch of, if it is.
 */
function onGameCreated(servergame: ServerGame, rematchOf?: ServerGame): void {
	const previousKey = getSlotKey();
	const index = rematchOf === undefined ? -1 : slots.indexOf(rematchOf);
	if (index !== -1) slots[index] = servergame;
	reselect(previousKey);
}

/** A move was accepted: the game's viewers receive it, then the slots are re-decided, as it may have ended the game. */
function onMove(servergame: ServerGame, moveMessage: OpponentsMoveMessage): void {
	if (slots.includes(servergame))
		lobbySubscribers.broadcastToAll('featuredmove', {
			id: servergame.match.id,
			...moveMessage,
		});
	reselect();
}

/** A game concluded other than by a move. If it's still shown afterward, its viewers receive the result. */
function onConclusion(servergame: ServerGame): void {
	reselect(); // An aborted game is released at once, and has no result to show.
	if (!slots.includes(servergame)) return;
	lobbySubscribers.broadcastToAll('featuredconclusion', {
		id: servergame.match.id,
		gameConclusion: servergame.gameConclusion!,
		clockValues: servergame.untimed ? undefined : gameUtility.getClockValues(servergame),
	});
}

/** A game's clocks changed without a move: an engine's was frozen or resumed. */
function onClock(servergame: ServerGame & { untimed: false }): void {
	if (!slots.includes(servergame)) return;
	const clockValues = gameUtility.getClockValues(servergame);
	lobbySubscribers.broadcastToAll('featuredclock', { id: servergame.match.id, clockValues });
}

// Selection -------------------------------------------------------------------

/**
 * Re-decides which games hold the slots, broadcasting the snapshot if that changed them.
 * @param previousKey - The slots to compare against, if they were already changed before this call.
 */
function reselect(previousKey = getSlotKey()): void {
	const now = Date.now();
	const shown = slots.map((g) => toContender(g, now));
	const waiting = activeGames
		.getAll()
		.filter((g) => !gamefileutility.isGameOver(g) && !slots.includes(g))
		.map((g) => toContender(g, now));

	const ids = featuredSelection.select(shown, waiting);
	// A newly featured game came from the waiting games, all of which are in activeGames.
	slots = ids.map((id) => slots.find((g) => g.match.id === id) ?? activeGames.getByID(id)!);

	if (getSlotKey() !== previousKey) lobbySubscribers.broadcastToAll('featured', getSnapshot());
}

/** What the selection needs to know about a game, right now. */
function toContender(servergame: ServerGame, now: number): Contender {
	const { match, gameConclusion } = servergame;
	const seatRatings = Object.keys(match.playerData).map(
		(c) => servergame.ratings[Number(c) as Player]?.rating.value,
	);
	return {
		id: match.id,
		score: featuredSelection.score(seatRatings),
		moveCount: servergame.moves.length,
		stale:
			gameConclusion === undefined &&
			now - match.timeLastMove > featuredSelection.staleLimitMs(match.clock),
		released:
			gameConclusion !== undefined &&
			// timeEnded is set alongside the conclusion, by gameLifecycle.applyConclusion.
			now >= featuredSelection.releaseTime(gameConclusion, match.timeEnded!),
	};
}

/** Identifies the slots' games and their order, to tell whether they changed. */
function getSlotKey(): string {
	return slots.map((g) => g.match.id).join();
}

// Snapshot --------------------------------------------------------------------

/** Every featured game, left to right, as lobby viewers receive them. */
function getSnapshot(): FeaturedGame[] {
	return slots.map((g) => buildFeaturedGame(g));
}

/** One featured game as lobby viewers receive it. */
function buildFeaturedGame(servergame: ServerGame): FeaturedGame {
	const { match } = servergame;
	const { moves, clockValues, gameConclusion } = gameStateBuilder.buildFullState(servergame);
	return {
		id: match.id,
		variant: match.variant,
		timeControl: match.clock,
		timeCreated: match.timeCreated,
		modifiers: match.modifiers,
		players: gameStateBuilder.buildParticipants(servergame),
		moves,
		clockValues,
		gameConclusion,
	};
}

// Exports ---------------------------------------------------------------------

export default {
	// Events
	start,
	onGameCreated,
	onMove,
	onConclusion,
	onClock,
	// Snapshot
	getSnapshot,
};
