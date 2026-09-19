// src/server/game/seeksmanager/seekUtility.ts

/**
 * Defines the server's public and private seek types, identifies private challenges,
 * and projects seeks into lobby data without sensitive owner details or full positions.
 *
 * Stateless types and transformations: `activeSeeks.ts` owns the collection and its
 * lifecycle, while this module defines the data it holds and exposes to clients.
 */

import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { BaseSeek, OutSeek } from '../../../shared/transport/domain.js';
import type { SeekVariant, OutSeekVariant } from '../../../shared/chess/util/variantselection.js';

// Types -----------------------------------------------------------------------

/** An open public or private seek, including the owner's identity. */
export interface AuthSeek extends BaseSeek {
	/** Contains the identifier of the owner of the seek, whether a member or browser. */
	owner: AuthMemberInfo;
	/**
	 * The tab that created the seek, remembered so it's the one taken into
	 * the game when the seek is accepted, rather than another of theirs.
	 */
	ownerTab: string;
	variant: SeekVariant;
	/**
	 * Whether the seek is private, created through the "Challenge a friend" flow.
	 * Absent from the lobby, reachable only by its URL.
	 */
	private?: PrivateSeekState;
}

/** The live state of a private seek: who's watching its page, and the clock that ends it. */
interface PrivateSeekState {
	/** The sockets currently viewing this challenge's page. */
	subscribers: Set<CustomWebSocket>;
	/** Present exactly while the owner has no challenge page open. */
	ownerAway?: {
		/** Deletes the seek once they've been away too long. */
		expiry: NodeJS.Timeout;
		/** Whether they closed their last page by choice, rather than dropping offline. */
		leftVoluntarily: boolean;
	};
}

/** A seek known to be a "Challenge a friend" invite. */
export interface PrivateSeek extends AuthSeek {
	private: PrivateSeekState;
}

// Functions -------------------------------------------------------------------

/** Whether the seek is a "Challenge a friend" invite, narrowing its type to `PrivateSeek`. */
function isPrivate(seek: AuthSeek): seek is PrivateSeek {
	return seek.private !== undefined;
}

/**
 * Projects a seek into the form broadcast to lobby viewers, dropping the owner's
 * sensitive data such as their browser-id, and stripping ICN content from
 * the variant so the full position text isn't sent to every lobby viewer.
 *
 * The result is serialized straight to the wire and never mutated, so
 * nested values are shared with the source seek instead of copied.
 */
function makeSafe(seek: AuthSeek): OutSeek {
	const variant: OutSeekVariant =
		seek.variant.kind === 'preset' ? seek.variant : { kind: 'custom' };

	return {
		id: seek.id,
		player: seek.player,
		variant,
		time: seek.time,
		color: seek.color,
		mode: seek.mode,
		modifiers: seek.modifiers,
	};
}

// Exports ---------------------------------------------------------------------

export default { isPrivate, makeSafe };
