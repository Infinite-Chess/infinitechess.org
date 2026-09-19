// src/server/socket/socketLookups.ts

/**
 * Finds a user's sockets within a set of subscribed sockets.
 */

import type { AuthMemberInfo } from '../types.js';
import type { CustomWebSocket } from './socketTypes.js';

import memberInfoUtil from '../auth/memberInfoUtil.js';

// Functions -------------------------------------------------------------------

/**
 * Finds the socket that belongs to the given user's tab, falling back to their most recently subscribed tab.
 * @param sockets - Iterated in subscription order.
 * @param ownerTab - The tab to prefer.
 * @returns The socket, if the user has any in the set.
 */
function findOfOwner(
	sockets: Iterable<CustomWebSocket>,
	owner: AuthMemberInfo,
	ownerTab: string,
): CustomWebSocket | undefined {
	let newest: CustomWebSocket | undefined;
	for (const ws of sockets) {
		if (!memberInfoUtil.eq(owner, ws.metadata.memberInfo)) continue;
		if (ws.metadata.tabId === ownerTab) return ws;
		newest = ws; // Iterated in subscription order, so the last match is the newest.
	}
	return newest;
}

/** Whether a member or browser has at least one socket in the set. */
function hasUser(sockets: Iterable<CustomWebSocket>, info: AuthMemberInfo): boolean {
	for (const ws of sockets) {
		if (memberInfoUtil.eq(ws.metadata.memberInfo, info)) return true;
	}
	return false;
}

// Exports ---------------------------------------------------------------------

export default {
	findOfOwner,
	hasUser,
};
