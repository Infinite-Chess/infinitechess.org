// src/server/game/gamemanager/activeGames.ts

/**
 * This script owns the collection of games currently held in memory,
 * and every way of looking one up — by id, by player, or by socket.
 *
 * The sibling of `activePlayers.ts`, which owns the reverse index (user -> game id).
 * Adding to and removing from this collection is driven by `gameManager.ts`.
 */

import type { ServerGame } from './serverGameTypes.js';
import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';

import gamesManager from '../../database/gamesManager.js';
import activePlayers from './activePlayers.js';

// Constants -------------------------------------------------------------------

/** Whether to log games to the console as they enter and leave this collection. */
const PRINT_GAMES = true;

// State -----------------------------------------------------------------------

/**
 * The object containing all currently active games. Each game's id is the key: `{ id: Game }`
 * This may temporarily include games that are over, but not yet finalized or evicted.
 *
 * The game's ids are the same id they will receive in the database!
 * For this reason they must be unique across the games table, and all other live games.
 */
const activeGames: Record<number, ServerGame> = {};

// Membership ------------------------------------------------------------------

/**
 * Returns an id that is unique across BOTH the games table AND the live games in memory.
 * The game will receive this same id in the database when it is logged.
 * @throws If a database error occurs.
 */
function issueUniqueId(): number {
	let id: number;
	do {
		id = gamesManager.genUniqueID(); // This is already unique against all game_ids in the table.
	} while (activeGames[id] !== undefined); // Repeat until we have an id unique against all active games.
	return id;
}

/** Adds a newly created (or restored) game to the collection. */
function add(servergame: ServerGame): void {
	activeGames[servergame.match.id] = servergame;
}

/** Removes a game from the collection, so it is no longer reachable by any lookup. */
function remove(id: number): void {
	delete activeGames[id];
}

// Lookups ---------------------------------------------------------------------

/** Returns the live game with the specified id, if it exists. */
function getByID(id: number): ServerGame | undefined {
	return activeGames[id];
}

/** The game the given user is a participant of, if they are in one. */
function getByPlayer(player: AuthMemberInfo): ServerGame | undefined {
	const gameID = activePlayers.getGameID(player);
	if (gameID === undefined) return; // Not in a game;
	return getByID(gameID);
}

/**
 * The game a socket belongs to: by its game subscription, falling
 * back to its identity when it isn't subscribed (resync/refresh).
 */
function getBySocket(ws: CustomWebSocket): ServerGame | undefined {
	const gameID = ws.metadata.subscriptions.game?.id;
	if (gameID) return getByID(gameID);

	// The socket is not subscribed to any game. Perhaps this is a resync/refresh?

	// Is the client in a game? What's their username/browser-id?
	const player = ws.metadata.memberInfo;
	return getByPlayer(player);
}

/** A snapshot of every game currently in memory, safe to remove from while iterating. */
function getAll(): ServerGame[] {
	return Object.values(activeGames);
}

/** Whether the signed-in member is a participant of any game currently in memory. */
function hasMember(username: string): boolean {
	for (const servergame of getAll()) {
		for (const player of Object.values(servergame.match.playerData)) {
			if (!player.identifier.signedIn) continue;
			if (player.identifier.username === username) return true;
		}
	}
	return false;
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	PRINT_GAMES,
	// Membership
	issueUniqueId,
	add,
	remove,
	// Lookups
	getByID,
	getByPlayer,
	getBySocket,
	getAll,
	hasMember,
};
