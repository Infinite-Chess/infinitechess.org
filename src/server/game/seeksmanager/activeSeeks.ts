// src/server/game/seeksmanager/activeSeeks.ts

/**
 * Owns the collection of open seeks — the lobby's public ones and the private challenges —
 * every way of looking one up — by id, or by the user who owns it — and the broadcast
 * that pushes the live list out.
 *
 * The seeksmanager counterpart of `activeGames.ts` — but unlike it, mutating this
 * collection broadcasts by default: a stale lobby list is visible to every viewer.
 * `lobbyManager.ts` sends every other lobby-bound message.
 *
 * A private seek's page sockets live on the seek itself, so deleting one here is also
 * what detaches them, however it died.
 */

import type { OutSeek } from '../../../shared/transport/domain.js';
import type { AuthSeek } from './seekUtility.js';
import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';

import socketsend from '../../socket/socketSend.js';
import seekUtility from './seekUtility.js';
import memberInfoUtil from '../../auth/memberInfoUtil.js';
import lobbySubscribers from './lobbySubscribers.js';

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
 * @param options.becomingGame - States that the seek isn't dying, but graduating into a live game
 * under its own id. No `gone` push goes out to a private seek's page sockets —
 * `challengeManager.ts` tells them where to go once that game exists. [false]
 * @returns Whether a seek was deleted.
 */
function deleteByID(id: number, { dontBroadcast = false, becomingGame = false } = {}): boolean {
	const index = seeks.findIndex((seek) => seek.id === id);
	if (index === -1) return false; // No seek change

	const seek = seeks.splice(index, 1)[0]!; // Delete the seek
	releasePrivate(seek, becomingGame);

	if (!dontBroadcast) broadcast();

	if (PRINT_SEEK_CHANGES) console.log(`Deleted seek for user ${JSON.stringify(seek.owner)}`);

	return true;
}

/**
 * Deletes every seek owned by the given user, whether a member or a browser.
 * @param options.dontBroadcast - If true, prevents broadcasting the changes to all clients. [false]
 * @param options.sparePrivate - If true, keeps their private seek, which outlives their leaving the lobby. [false]
 * @returns Whether any seek was deleted.
 */
function deleteOfUser(
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
		if (PRINT_SEEK_CHANGES)
			console.log(`${info.signedIn ? `Deleted member's seek. Username: ${info.username}` : `Deleted browser's seek. Browser: ${info.browser_id}`}`); // prettier-ignore
	}

	if (deletedSeek && !dontBroadcast) broadcast(); // Broadcast the change if an seek was deleted
	return deletedSeek;
}

/**
 * Detaches a just-deleted private seek's page sockets, telling each it's gone unless the
 * seek is becoming a game, and stops its expiry timer — left armed, it would fire against
 * the freed id once reissued, deleting an innocent challenge.
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
	deleteOfUser,
	// Lookups
	getByID,
	getIDOfUser,
	getAllSafe,
	getAllChallengeSockets,
	// Broadcasts
	broadcast,
};
