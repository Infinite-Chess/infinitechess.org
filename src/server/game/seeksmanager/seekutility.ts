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
} from '../../../shared/types.js';

import jsutil from '../../../shared/util/jsutil.js';
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
 * Removes sensitive data such as their browser-id.
 * Returns a deep copy of the original seek.
 * Also strips ICN content from the variant so the full position text is not
 * broadcast to every lobby viewer.
 */
function makeSeekSafe(seek: AuthSeek): OutSeek {
	const variant: OutSeekVariant =
		seek.variant.kind === 'preset' ? seek.variant : { kind: 'custom' };

	return {
		id: seek.id,
		player: jsutil.deepCopyObject(seek.player),
		tag: seek.tag,
		variant,
		time: seek.time,
		color: seek.color,
		mode: seek.mode,
		modifiers: jsutil.deepCopyObject(seek.modifiers),
	};
}

/**
 * Makes a deep copy of provided seek, and
 * removes sensitive data such as their browser-id.
 */
function safelyCopySeek(seek: AuthSeek): OutSeek {
	const seekDeepCopy = jsutil.deepCopyObject(seek);
	return makeSeekSafe(seekDeepCopy);
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

export { safelyCopySeek, buildServerUsernameContainer };
