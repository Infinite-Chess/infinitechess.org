// src/server/game/seeksmanager/seekutility.ts

/*
 * This script stores utility methods for working
 * with single seeks, not multiple
 */

import type { AuthMemberInfo } from '../../types.js';
import type {
	AuthSeekVariant,
	BaseSeek,
	OutSeek,
	OutSeekVariant,
	Rating,
	ServerUsernameContainer,
} from '../../../shared/domain.js';

import metadatautil from '../../../shared/chess/util/metadatautil.js';

// Type Definitions

/** A lobby game seek, WITH the owner's sensitive information. */
export interface AuthSeek extends BaseSeek {
	/** Contains the identifier of the owner of the seek, whether a member or browser. */
	owner: AuthMemberInfo;
	variant: AuthSeekVariant;
}

//-------------------------------------------------------------------------------------------

/**
 * Projects a seek into the form broadcast to lobby viewers, dropping the owner's
 * sensitive data such as their browser-id, and stripping ICN content from
 * the variant so the full position text isn't sent to every lobby viewer.
 *
 * The result is serialized straight to the wire and never mutated, so
 * nested values are shared with the source seek instead of copied.
 */
function makeSeekSafe(seek: AuthSeek): OutSeek {
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

/**
 * Builds the public {@link ServerUsernameContainer} for a player from their auth identity.
 * Guests get the generic ICN guest name. Never exposes `browser_id`.
 */
function buildServerUsernameContainer(
	identifier: AuthMemberInfo,
	rating?: Rating,
): ServerUsernameContainer {
	return {
		type: identifier.signedIn ? 'player' : 'guest',
		username: identifier.signedIn ? identifier.username : metadatautil.GUEST_NAME_ICN_METADATA,
		rating,
	};
}

//-------------------------------------------------------------------------------------------

export { makeSeekSafe, buildServerUsernameContainer };
