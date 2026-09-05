// src/server/game/gamemanager/activeGames.ts

/**
 * This script owns the collection of games currently held in memory.
 *
 * The sibling of `activePlayers.ts`, which owns the reverse index (user -> game id).
 * Adding to and removing from this collection is driven by `gameManager.ts`.
 */

import type { ServerGame } from './serverGameTypes.js';

import gamesManager from '../../database/gamesManager.js';
import chatEntriesManager from '../../database/chatEntriesManager.js';

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
 * Returns an id that is unique across the games table, the
 * live games in memory, and any chat entries still holding it.
 * The game will receive this same id in the database when it is logged.
 * @throws If a database error occurs.
 */
function issueUniqueId(): number {
	let id: number;
	do {
		id = gamesManager.genUniqueID(); // This is already unique against all game_ids in the table.
	} while (activeGames[id] !== undefined || chatEntriesManager.countOfGame(id) > 0); // Repeat until we have an id unique against all claimed ids.
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

/** A snapshot of every game currently in memory, safe to remove from while iterating. */
function getAll(): ServerGame[] {
	return Object.values(activeGames);
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
	getAll,
};
