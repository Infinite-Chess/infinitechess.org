// src/server/game/seeksmanager/seekutility.ts

/**
 * The shape of a seek as the server holds it, and the projection that strips
 * it of sensitive data for the wire.
 *
 * Pure vocabulary — no state, no side effects. `createseek.ts` builds these,
 * and `activeseeks.ts` owns the collection of them.
 */

import type { AuthMemberInfo } from '../../types.js';
import type { SeekVariant, BaseSeek, OutSeek, OutSeekVariant } from '../../../shared/domain.js';

// Type Definitions ------------------------------------------------------------------------------

/** A lobby game seek, WITH the owner's sensitive information. */
export interface AuthSeek extends BaseSeek {
	/** Contains the identifier of the owner of the seek, whether a member or browser. */
	owner: AuthMemberInfo;
	variant: SeekVariant;
}

// Functions -------------------------------------------------------------------------------------

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

// Exports ---------------------------------------------------------------------------------------

export default {
	makeSafe,
};
