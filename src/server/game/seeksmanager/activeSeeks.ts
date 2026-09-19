// src/server/game/seeksmanager/activeSeeks.ts

/**
 * This script owns the collection of open seeks — public lobby seeks and private challenges —
 * their lookups, and the live seek list sent to lobby viewers.
 *
 * The seeksmanager counterpart of `activeGames.ts`. Every mutation is a complete operation
 * that broadcasts the lobby list once, if it changed.
 *
 * Each private seek owns its page subscriptions and expiry timer, so deleting it also
 * detaches its viewers and stops its timer.
 */

import type { OutSeek } from '../../../shared/transport/domain.js';
import type { AuthSeek } from './seekUtility.js';
import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';

import socketSend from '../../socket/socketSend.js';
import seekUtility from './seekUtility.js';
import memberInfoUtil from '../../auth/memberInfoUtil.js';
import lobbySubscribers from './lobbySubscribers.js';

// State -----------------------------------------------------------------------

/** The list of all active seeks. */
const seeks: AuthSeek[] = [];

// Membership ------------------------------------------------------------------

/** Adds a newly created seek, replacing any the owner already had — they hold one at a time. */
function add(seek: AuthSeek): void {
	const replacedPublic = removeOfOwner(seek.owner, false);

	seeks.push(seek);

	if (replacedPublic || !seek.private) broadcast();
}

/** Deletes the seek of the given id, typically when its owner cancels it, or it expires. */
function deleteByID(id: number): void {
	if (removeByID(id, false)) broadcast();
}

/**
 * Deletes every seek owned by the given user, whether a member or a browser.
 * @param sparePrivate - Keeps their private seek, which outlives their leaving the lobby.
 */
function deleteOfOwner(info: AuthMemberInfo, sparePrivate = false): void {
	if (removeOfOwner(info, sparePrivate)) broadcast();
}

/** Deletes any open seek owned by the given user, even if they're offline. */
function deleteOfUser(user_id: number): void {
	const seek = seeks.find((seek) => seek.owner.signedIn && seek.owner.user_id === user_id);
	if (seek) deleteOfOwner(seek.owner);
}

/**
 * Deletes the seek that just became a live game under its own id,
 * along with every participant's other seek.
 * @param owners - The new game's players.
 */
function deleteForGame(gameID: number, owners: AuthMemberInfo[]): void {
	let listChanged = removeByID(gameID, true);
	for (const owner of owners) {
		if (removeOfOwner(owner, false)) listChanged = true;
	}
	if (listChanged) broadcast();
}

/**
 * Removes a seek by id, silently.
 * @param becomingGame - States that the seek isn't dying, but graduating into a live game
 * under its own id, suppressing the `gone` push to its viewers.
 * @returns Whether the lobby's list changed: false if no seek, or only a private one, was removed.
 */
function removeByID(id: number, becomingGame: boolean): boolean {
	const index = seeks.findIndex((seek) => seek.id === id);
	if (index === -1) return false; // No seek change

	const seek = seeks.splice(index, 1)[0]!; // Delete the seek
	releasePrivate(seek, becomingGame);

	return !seek.private;
}

/**
 * Removes every seek owned by the given user, silently.
 * @param sparePrivate - See {@link deleteOfOwner}.
 * @returns Whether the lobby's list changed: false if no seek, or only a private one, was removed.
 */
function removeOfOwner(info: AuthMemberInfo, sparePrivate: boolean): boolean {
	let listChanged = false;
	for (let i = seeks.length - 1; i >= 0; i--) {
		const seek = seeks[i]!;
		if (!memberInfoUtil.eq(info, seek.owner)) continue;
		if (sparePrivate && seek.private) continue;
		// Match! Delete
		seeks.splice(i, 1); // Delete the seek
		releasePrivate(seek, false);
		if (!seek.private) listChanged = true;
	}

	return listChanged;
}

/**
 * Stops a removed seek's expiry timer and detaches its viewers.
 * @param becomingGame - If true, suppresses the `gone` notification because the seek became a game.
 */
function releasePrivate(seek: AuthSeek, becomingGame: boolean): void {
	if (!seek.private) return;
	clearTimeout(seek.private.ownerAway?.expiry);
	for (const ws of seek.private.subscribers) {
		delete ws.metadata.subscriptions.challenge;
		if (!becomingGame) socketSend.send(ws, 'challenge', 'challengestate', { kind: 'gone' });
	}
}

// Lookups ---------------------------------------------------------------------

/** Finds the seek with the given ID, public or private, if it exists. */
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
function* getAllChallengeSockets(): Iterable<CustomWebSocket> {
	for (const seek of seeks) if (seek.private) yield* seek.private.subscribers;
}

// Broadcasts ------------------------------------------------------------------

/**
 * Broadcasts a live seek list update to all subbed clients, each told which seek is theirs.
 * Call whenever a public seek is added or deleted.
 */
function broadcast(): void {
	const seekslist = getAllSafe();
	for (const subbedSocket of lobbySubscribers.getAll()) {
		socketSend.send(subbedSocket, 'lobby', 'seekslist', {
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
	deleteForGame,
	// Lookups
	getByID,
	getIDOfUser,
	getAllSafe,
	getAllChallengeSockets,
};
