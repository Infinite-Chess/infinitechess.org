// src/server/game/seeksmanager/activeseeks.ts

/**
 * Owns the collection of open lobby seeks, every way of looking one up — by id,
 * or by the user who owns it — and the broadcast that pushes the live list out.
 *
 * The seeksmanager counterpart of `activegames.ts` — but unlike it, mutating this
 * collection broadcasts by default: a stale lobby list is visible to every viewer.
 * `lobbymanager.ts` sends every other lobby-bound message.
 */

import type { AuthSeek } from './seekutility.js';
import type { AuthMemberInfo } from '../../types.js';
import type { OutSeek, SeekId } from '../../../shared/transport/domain.js';

import socketsend from '../../socket/socketSend.js';
import seekutility from './seekutility.js';
import memberinfoutil from '../../auth/memberinfoutil.js';
import lobbysubscribers from './lobbysubscribers.js';

// Constants -------------------------------------------------------------------

/** Whether to log new seek creations/deletions to the console */
const PRINT_SEEK_CHANGES = true;

// State -----------------------------------------------------------------------

/** The list of all active seeks. */
const seeks: AuthSeek[] = [];

// Membership ------------------------------------------------------------------

/** Adds a newly created seek to the collection, and broadcasts the new list. */
function add(seek: AuthSeek): void {
	seeks.push(seek);

	broadcast();

	if (PRINT_SEEK_CHANGES) console.log(`Created seek for user ${JSON.stringify(seek.owner)}`);
}

/**
 * Deletes a seek from the collection by its id, typically when it is cancelled or accepted.
 * @param options.dontBroadcast - If true, prevents broadcasting the changes to all clients. [false]
 * @returns Whether a seek was deleted.
 */
function deleteByID(
	id: string,
	{ dontBroadcast = false }: { dontBroadcast?: boolean } = {},
): boolean {
	const index = seeks.findIndex((seek) => seek.id === id);
	if (index === -1) return false; // No seek change

	const seek = seeks.splice(index, 1)[0]!; // Delete the seek

	if (!dontBroadcast) broadcast();

	if (PRINT_SEEK_CHANGES) console.log(`Deleted seek for user ${JSON.stringify(seek.owner)}`);

	return true;
}

/**
 * Deletes every seek owned by the given user, whether a member or a browser.
 * @param options.dontBroadcast - If true, prevents broadcasting the changes to all clients. [false]
 * @returns Whether any seek was deleted.
 */
function deleteOfUser(info: AuthMemberInfo, { dontBroadcast = false } = {}): boolean {
	let deletedSeek = false;
	for (let i = seeks.length - 1; i >= 0; i--) {
		const seek = seeks[i]!;
		if (!memberinfoutil.eq(info, seek.owner)) continue;
		// Match! Delete
		seeks.splice(i, 1); // Delete the seek
		deletedSeek = true;
		if (PRINT_SEEK_CHANGES)
			console.log(`${info.signedIn ? `Deleted member's seek. Username: ${info.username}` : `Deleted browser's seek. Browser: ${info.browser_id}`}`); // prettier-ignore
	}

	if (deletedSeek && !dontBroadcast) broadcast(); // Broadcast the change if an seek was deleted
	return deletedSeek;
}

// Lookups ---------------------------------------------------------------------

/**
 * Tests if any active seek already has the ID provided.
 * This is used during generation of a unique seek id.
 * @returns true if the ID is already in use, false if it's available
 */
function hasID(id: string): boolean {
	return getByID(id) !== undefined;
}

/** Finds the seek with the given ID, if it exists. */
function getByID(id: string): AuthSeek | undefined {
	return seeks.find((seek) => seek.id === id);
}

/**
 * Returns the id of the user's open seek, if they have one. A user
 * holds at most one at a time — creating one replaces any existing.
 */
function getIDOfUser(info: AuthMemberInfo): SeekId | undefined {
	return seeks.find((seek) => memberinfoutil.eq(info, seek.owner))?.id;
}

/** The collection projected into the form lobby viewers receive, sensitive data removed. */
function getAllSafe(): OutSeek[] {
	return seeks.map((seek) => seekutility.makeSafe(seek));
}

// Broadcasts ------------------------------------------------------------------

/**
 * Broadcasts a live seek list update to all subbed clients, each told which seek is theirs.
 * Call whenever a seek is added or deleted.
 */
function broadcast(): void {
	const seekslist = getAllSafe();
	for (const subbedSocket of lobbysubscribers.getAll()) {
		socketsend.send(subbedSocket, 'lobby', 'seekslist', {
			seekslist,
			ourseekid: getIDOfUser(subbedSocket.metadata.memberInfo),
		});
	}
}

// Exports ---------------------------------------------------------------------

export default {
	// Membership
	add,
	deleteByID,
	deleteOfUser,
	// Lookups
	hasID,
	getByID,
	getIDOfUser,
	getAllSafe,
	// Broadcasts
	broadcast,
};
