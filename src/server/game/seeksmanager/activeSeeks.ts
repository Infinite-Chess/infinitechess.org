// src/server/game/seeksmanager/activeSeeks.ts

/**
 * This script owns the collection of open seeks — public lobby seeks and private challenges —
 * their lookups, and the live seek list sent to lobby viewers.
 *
 * The seeksmanager counterpart of `activeGames.ts`. Mutations broadcast the lobby list by
 * default; grouped deletions can suppress those updates and broadcast once when complete.
 *
 * Each private seek owns its page subscriptions and expiry timer, so deleting it also
 * detaches its viewers and stops its timer.
 */

import type { OutSeek } from '../../../shared/transport/domain.js';
import type { AuthSeek } from './seekUtility.js';
import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';

import socketsend from '../../socket/socketSend.js';
import seekUtility from './seekUtility.js';
import memberInfoUtil from '../../auth/memberInfoUtil.js';
import lobbySubscribers from './lobbySubscribers.js';

// State -----------------------------------------------------------------------

/** The list of all active seeks. */
const seeks: AuthSeek[] = [];

// Membership ------------------------------------------------------------------

/** Adds a newly created seek to the collection, and broadcasts the new list. */
function add(seek: AuthSeek): void {
	seeks.push(seek);

	broadcast();
}

/**
 * Deletes a seek from the collection by its id, typically when it is cancelled or accepted.
 * @param options.dontBroadcast - If true, prevents broadcasting the changes to all clients. [false]
 * @param options.becomingGame - States that the seek isn't dying, but graduating into a live game
 * under its own id, suppressing the `gone` push to its viewers.
 * @returns Whether a seek was deleted.
 */
function deleteByID(id: number, { dontBroadcast = false, becomingGame = false } = {}): boolean {
	const index = seeks.findIndex((seek) => seek.id === id);
	if (index === -1) return false; // No seek change

	const seek = seeks.splice(index, 1)[0]!; // Delete the seek
	releasePrivate(seek, becomingGame);

	if (!dontBroadcast) broadcast();

	return true;
}

/**
 * Deletes every seek owned by the given user, whether a member or a browser.
 * @param options.dontBroadcast - If true, prevents broadcasting the changes to all clients. [false]
 * @param options.sparePrivate - If true, keeps their private seek, which outlives their leaving the lobby. [false]
 * @returns Whether any seek was deleted.
 */
function deleteOfOwner(
	info: AuthMemberInfo,
	{ dontBroadcast = false, sparePrivate = false } = {},
): boolean {
	let deletedSeek = false;
	for (let i = seeks.length - 1; i >= 0; i--) {
		const seek = seeks[i]!;
		if (!memberInfoUtil.eq(info, seek.owner)) continue;
		if (sparePrivate && seek.private) continue;
		// Match! Delete
		seeks.splice(i, 1); // Delete the seek
		releasePrivate(seek, false);
		deletedSeek = true;
	}

	if (deletedSeek && !dontBroadcast) broadcast(); // Broadcast the change if an seek was deleted
	return deletedSeek;
}

/** Deletes any open seek owned by the given user, even if they're offline. */
function deleteOfUser(user_id: number): void {
	const seek = seeks.find((seek) => seek.owner.signedIn && seek.owner.user_id === user_id);
	if (seek) deleteOfOwner(seek.owner);
}

/**
 * Stops a deleted seek's expiry timer and detaches its viewers.
 * @param becomingGame - If true, suppresses the `gone` notification because the seek became a game.
 */
function releasePrivate(seek: AuthSeek, becomingGame: boolean): void {
	if (!seek.private) return;
	clearTimeout(seek.private.expiry);
	for (const ws of seek.private.subscribers) {
		delete ws.metadata.subscriptions.challenge;
		if (!becomingGame) socketsend.send(ws, 'challenge', 'challengestate', { kind: 'gone' });
	}
}

// Lookups ---------------------------------------------------------------------

/** Finds the seek with the given ID, if it exists. */
function getByID(id: number): AuthSeek | undefined {
	return seeks.find((seek) => seek.id === id);
}

/**
 * Returns the id of the user's open lobby seek, if they have one. A user
 * holds at most one at a time — creating one replaces any existing.
 */
function getIDOfUser(info: AuthMemberInfo): number | undefined {
	return seeks.find((seek) => !seek.private && memberInfoUtil.eq(info, seek.owner))?.id;
}

/** The lobby's seeks projected into the form its viewers receive, sensitive data removed. */
function getAllSafe(): OutSeek[] {
	return seeks.filter((seek) => !seek.private).map((seek) => seekUtility.makeSafe(seek));
}

/** Every socket currently viewing an open private seek's challenge page. */
function* getAllChallengeSockets(): Generator<CustomWebSocket> {
	for (const seek of seeks) if (seek.private) yield* seek.private.subscribers;
}

// Broadcasts ------------------------------------------------------------------

/**
 * Broadcasts a live seek list update to all subbed clients, each told which seek is theirs.
 * Call whenever a seek is added or deleted.
 */
function broadcast(): void {
	const seekslist = getAllSafe();
	for (const subbedSocket of lobbySubscribers.getAll()) {
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
	deleteOfOwner,
	deleteOfUser,
	// Lookups
	getByID,
	getIDOfUser,
	getAllSafe,
	getAllChallengeSockets,
	// Broadcasts
	broadcast,
};
