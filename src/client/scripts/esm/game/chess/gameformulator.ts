// src/client/scripts/esm/game/chess/gameformulator.ts

/**
 * This script takes an ICN, or a compressed abridged gamefile, and constructs a full gamefile from them.
 */

import type { FullGame } from '../../../../../shared/chess/logic/gamefile.js';
import type { MovePacket } from '../../../../../shared/types.js';
import type { VariantOptions } from '../../../../../shared/chess/logic/initvariant.js';
import type {
	MovePreprint,
	LongFormatIn,
} from '../../../../../shared/chess/logic/icn/icnconverter.js';

import variant from '../../../../../shared/chess/variants/variant.js';
import gamefile from '../../../../../shared/chess/logic/gamefile.js';

import clientmetadatautil from './clientmetadatautil.js';

/**
 * Formulates a whole gamefile from a smaller simpler abridged one.
 * @param longformIn - The return value of gamecompressor.compressGamefile()
 * @param validateMoves - Optional flag to validate move legality during formulation, throwing an error if any move is illegal.
 */
function formulateGame(longformIn: LongFormatIn, validateMoves?: true): FullGame {
	if (longformIn.position === undefined || longformIn.state_global.specialRights === undefined) {
		throw Error(
			'Invalid longformIn when formulating game: Missing position or special rights.',
		);
	}

	/** String array of the moves in their most compact notation (e.g. "4,7>4,8Q") */
	const moves: MovePacket[] =
		longformIn.moves?.map((m: MovePreprint) => {
			const move: MovePacket = { token: m.token };
			if (m.clockStamp !== undefined) move.clockStamp = m.clockStamp;
			return move;
		}) ?? [];

	const variantOptions: VariantOptions = {
		fullMove: longformIn.fullMove,
		gameRules: longformIn.gameRules,
		position: longformIn.position!,
		state_global: {
			specialRights: longformIn.state_global.specialRights,
			enpassant: longformIn.state_global.enpassant,
			moveRuleState: longformIn.state_global.moveRuleState,
		},
	};

	const resolvedTimestamp = clientmetadatautil.resolveTimestampFromMetadata(
		longformIn.metadata.UTCDate,
		longformIn.metadata.UTCTime,
	);
	const resolvedVariant = variant.resolveVariantCode(longformIn.metadata.Variant);

	return gamefile.initFullGame(
		longformIn.metadata,
		resolvedTimestamp,
		resolvedVariant,
		{ variantOptions, moves },
		validateMoves,
	);
}

export default {
	formulateGame,
};
